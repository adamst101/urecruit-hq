import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// ────────────────────────────────────────────────────────────────────────────
// TRACTION CLASSIFICATION
//
// Traction levels:
//   0 = no meaningful signal
//   1 = general signal  (awareness, generic/template interactions)
//   2 = verified personal contact (face-to-face meeting, confirmed personal exchange)
//   3 = direct recruiting action (personal invite, confirmed personal response)
//   4 = major outcome (visit request/completed, offer, commitment, signed)
//
// Conservative backfill rules for legacy records missing the boolean flags:
//   social_like / dm_received / camp_invite → level 1 (cannot confirm personal)
//   camp_meeting → level 2 (a meeting is personal by semantic definition)
//   offer        → level 4 (unambiguous major outcome)
// ────────────────────────────────────────────────────────────────────────────
function computeTractionLevel(a: any): number {
  const t: string = a.activity_type || "";

  // Level 4 — Major Outcomes
  if ([
    "offer", "offer_received", "offer_updated", "commitment", "signed",
    "unofficial_visit_requested", "unofficial_visit_completed",
    "official_visit_requested",   "official_visit_completed",
  ].includes(t)) return 4;

  // Level 3 — Direct Recruiting Action (personal, confirmed, high-signal)
  if (["personal_camp_invite", "post_camp_personal_response", "phone_call"].includes(t)) return 3;

  // Level 2 — Verified Personal Contact
  // Semantic: camp_meeting / personal_email = personal by definition
  if (t === "camp_meeting" || t === "personal_email") return 2;
  // For ambiguous types: require explicit verification flags
  if (
    a.is_two_way_engagement === true && a.is_athlete_specific === true &&
    ["dm_received", "dm_sent", "text_received", "text_sent", "post_camp_followup_sent"].includes(t)
  ) return 2;

  // Level 1 — General Signal
  if ([
    "social_like", "social_follow",
    "generic_email", "dm_received", "dm_sent", "text_received", "text_sent",
    "camp_invite", "generic_camp_invite", "camp_registered", "camp_attended",
    "post_camp_followup_sent",
  ].includes(t)) return 1;

  return 0;
}

// Build per-school traction aggregation from enriched activity list
function computeSchoolTraction(activities: any[]): Record<string, any> {
  const map: Record<string, any> = {};

  for (const a of activities) {
    const schoolId   = (a.school_id   || "").trim();
    const schoolName = (a.school_name || "").trim();
    const groupKey   = schoolId || schoolName;
    if (!groupKey) continue;
    const level: number = (a as any)._traction_level ?? 0;

    if (!map[groupKey]) {
      map[groupKey] = {
        school_name: schoolName,
        school_id:   schoolId || null,
        traction_level: 0,
        relationship_status: "no_signal",
        true_traction: false,
        activity_count: 0,
        last_activity_date: "",
        top_activity_type: "",
      };
    }
    // If this activity was picker-selected (has school_id), upgrade to canonical name
    if (schoolId && !map[groupKey].school_id) {
      map[groupKey].school_id   = schoolId;
      map[groupKey].school_name = schoolName;
    }
    const entry = map[groupKey];
    entry.activity_count++;

    if (level > entry.traction_level) {
      entry.traction_level = level;
      entry.top_activity_type = a.activity_type;
    }
    entry.true_traction = entry.traction_level >= 2;

    const d = (a.activity_date || a.created_at || "").slice(0, 10);
    if (!entry.last_activity_date || d > entry.last_activity_date) entry.last_activity_date = d;
  }

  // Assign relationship_status from traction_level + top_activity_type
  for (const entry of Object.values(map) as any[]) {
    const tl: number = entry.traction_level;
    const tt: string = entry.top_activity_type || "";
    if      (tl === 0) entry.relationship_status = "no_signal";
    else if (tl === 1) entry.relationship_status = "general_signal";
    else if (tl === 2) entry.relationship_status = "verified_contact";
    else if (tl === 3) entry.relationship_status = "invite";
    else if (tl === 4) {
      if (["unofficial_visit_requested","unofficial_visit_completed",
           "official_visit_requested",  "official_visit_completed"].includes(tt)) {
        entry.relationship_status = "visit";
      } else if (["commitment", "signed"].includes(tt)) {
        entry.relationship_status = "committed";
      } else {
        entry.relationship_status = "offer";
      }
    }
  }

  return map;
}

// Compute athlete-level aggregate metrics
function computeAthleteMetrics(activities: any[], schoolTraction: Record<string, any>): Record<string, any> {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const d60 = new Date(now.getTime() - 60 * 86400000).toISOString().slice(0, 10);

  let highestLevel = 0;
  let lastActivityDate = "";
  let count30d = 0;
  let count60d = 0;
  let tractionEventCount = 0;

  for (const a of activities) {
    const d = (a.activity_date || a.created_at || "").slice(0, 10);
    if (d && (!lastActivityDate || d > lastActivityDate)) lastActivityDate = d;
    if (d >= d30) count30d++;
    if (d >= d60) count60d++;
    const lvl: number = (a as any)._traction_level ?? 0;
    if (lvl > highestLevel) highestLevel = lvl;
    if (lvl >= 2) tractionEventCount++;
  }

  const tractionSchools = Object.values(schoolTraction).filter((s: any) => s.true_traction);
  const trueTractionSchoolCount = tractionSchools.length;
  const trueTractionFlag = trueTractionSchoolCount > 0;

  const hasOffer  = Object.values(schoolTraction).some((s: any) => ["offer","committed"].includes(s.relationship_status));
  const hasVisit  = Object.values(schoolTraction).some((s: any) => s.relationship_status === "visit");
  const hasCommit = Object.values(schoolTraction).some((s: any) => s.relationship_status === "committed");

  let stageLabel = "No Activity";
  if      (hasCommit)           stageLabel = "Committed";
  else if (hasOffer)            stageLabel = "Offer Received";
  else if (hasVisit)            stageLabel = "Visit Stage";
  else if (highestLevel >= 3)   stageLabel = "Active Traction";
  else if (highestLevel === 2)  stageLabel = "Verified Interest";
  else if (highestLevel === 1)  stageLabel = "Early Interest";

  const topSchool = Object.values(schoolTraction)
    .sort((a: any, b: any) => b.traction_level - a.traction_level || b.activity_count - a.activity_count)[0] as any;

  return {
    last_activity_date:           lastActivityDate || null,
    activity_count_30d:           count30d,
    activity_count_60d:           count60d,
    true_traction_flag:           trueTractionFlag,
    true_traction_school_count:   trueTractionSchoolCount,
    true_traction_event_count:    tractionEventCount,
    highest_traction_level:       highestLevel,
    traction_stage_label:         stageLabel,
    top_school_with_highest_traction: topSchool?.school_name || null,
    athlete_quiet_30d_flag:       trueTractionFlag && count30d === 0,
  };
}

// ────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let bodyAccountId = "";
  try {
    const body = await req.clone().json().catch(() => ({}));
    bodyAccountId = body?.accountId || "";
  } catch {}

  let accountId = "";
  try {
    const me = await base44.auth.me();
    accountId = me?.id || "";
  } catch {}

  if (!accountId && bodyAccountId) accountId = bodyAccountId;

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const [activities, preferences] = await Promise.all([
      base44.asServiceRole.entities.RecruitingActivity
        .filter({ account_id: accountId })
        .catch(() => []),
      base44.asServiceRole.entities.SchoolPreference
        .filter({ account_id: accountId })
        .catch(() => []),
    ]);

    const activityList = Array.isArray(activities) ? activities : [];

    // Enrich each activity with derived traction fields (not stored on entity)
    for (const a of activityList) {
      const level = computeTractionLevel(a);
      (a as any)._traction_level            = level;
      (a as any)._counts_as_general_signal  = level === 1;
      (a as any)._counts_as_true_traction   = level >= 2;
      (a as any)._counts_as_major_outcome   = level === 4;
    }

    // Sort newest first: prefer activity_date, fall back to created_at
    activityList.sort((a, b) => {
      const da = a.activity_date || a.created_at || "";
      const db = b.activity_date || b.created_at || "";
      return db.localeCompare(da);
    });

    const school_traction  = computeSchoolTraction(activityList);
    const athlete_metrics  = computeAthleteMetrics(activityList, school_traction);

    return Response.json({
      ok: true,
      activities:     activityList,
      preferences:    Array.isArray(preferences) && preferences.length > 0 ? preferences[0] : null,
      school_traction,
      athlete_metrics,
    });
  } catch (err) {
    console.error("getRecruitingJourney error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
