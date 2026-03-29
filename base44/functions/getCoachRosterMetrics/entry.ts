import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

// ────────────────────────────────────────────────────────────────────────────
// TRACTION CLASSIFICATION  (mirrors getRecruitingJourney)
// ────────────────────────────────────────────────────────────────────────────
function computeTractionLevel(a: any): number {
  const t: string = a.activity_type || "";

  if ([
    "offer", "offer_received", "offer_updated", "commitment", "signed",
    "unofficial_visit_requested", "unofficial_visit_completed",
    "official_visit_requested",   "official_visit_completed",
  ].includes(t)) return 4;

  if (["personal_camp_invite", "post_camp_personal_response", "phone_call"].includes(t)) return 3;

  if (t === "camp_meeting" || t === "personal_email") return 2;
  if (
    (a.is_verified_personal === true || a.is_two_way_engagement === true) &&
    ["dm_received", "dm_sent", "text_received", "text_sent", "post_camp_followup_sent"].includes(t)
  ) return 2;

  if ([
    "social_like", "social_follow",
    "generic_email", "dm_received", "dm_sent", "text_received", "text_sent",
    "camp_invite", "generic_camp_invite", "camp_registered", "camp_attended",
    "post_camp_followup_sent",
  ].includes(t)) return 1;

  return 0;
}

function computeSchoolTraction(activities: any[]): Record<string, any> {
  const map: Record<string, any> = {};

  for (const a of activities) {
    const school = (a.school_name || "").trim();
    if (!school) continue;
    const level: number = (a as any)._traction_level ?? 0;

    if (!map[school]) {
      map[school] = {
        school_name: school,
        traction_level: 0,
        relationship_status: "no_signal",
        true_traction: false,
        activity_count: 0,
        traction_event_count: 0,   // NEW: activities at level ≥ 2 only
        last_activity_date: "",
        top_activity_type: "",
      };
    }
    const entry = map[school];
    entry.activity_count++;
    if (level >= 2) entry.traction_event_count++;  // NEW

    if (level > entry.traction_level) {
      entry.traction_level = level;
      entry.top_activity_type = a.activity_type;
    }
    entry.true_traction = entry.traction_level >= 2;

    const d = (a.activity_date || a.created_at || "").slice(0, 10);
    if (!entry.last_activity_date || d > entry.last_activity_date) entry.last_activity_date = d;
  }

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

// ────────────────────────────────────────────────────────────────────────────
// PROGRESSION DETECTION
// An athlete is "progressing" when evidence of upward traction movement exists
// at any school: the school has activities at a lower traction level alongside
// its current (higher) traction level, showing a journey from signal → traction.
// Conservative: requires positive evidence; no inference from incomplete data.
// ────────────────────────────────────────────────────────────────────────────
function detectProgression(
  activities: any[],
  schoolTraction: Record<string, any>,
): { flag: boolean; reason: string; date: string } {
  // Among schools with true traction, check if any lower-level activity also exists
  // at that school — that proves upward movement rather than a one-off high-level event.
  const candidates: Array<{ reason: string; date: string; level: number }> = [];

  for (const [school, sData] of Object.entries(schoolTraction) as [string, any][]) {
    if (!sData.true_traction) continue;

    const schoolActs = activities.filter(a => (a.school_name || "").trim() === school);
    const maxLevel = sData.traction_level;
    const hasLowerSignal = schoolActs.some(
      a => {
        const l = (a as any)._traction_level ?? 0;
        return l >= 1 && l < maxLevel;
      }
    );

    if (hasLowerSignal) {
      const reason =
        maxLevel === 4 ? `Progressed to visit/offer stage at ${school}` :
        maxLevel === 3 ? `Progressed to direct recruiting action at ${school}` :
                        `Progressed to verified personal contact at ${school}`;
      candidates.push({ reason, date: sData.last_activity_date || "", level: maxLevel });
    }
  }

  if (candidates.length === 0) return { flag: false, reason: "", date: "" };

  // Pick the candidate with the highest traction level (most significant progression)
  candidates.sort((a, b) => b.level - a.level);
  const best = candidates[0];
  return { flag: true, reason: best.reason, date: best.date };
}

// ────────────────────────────────────────────────────────────────────────────
// PER-ATHLETE PROCESSING
// ────────────────────────────────────────────────────────────────────────────
function processAthleteActivities(activities: any[]): {
  school_traction: Record<string, any>;
  highest_traction_level: number;
  last_activity_date: string | null;
  activity_count: number;
  traction_event_count: number;
  recent_activities: any[];
  major_outcome_counts: Record<string, number>;
  player_progressing: boolean;
  progression_reason: string;
  progression_date: string;
} {
  // Enrich with traction level
  for (const a of activities) {
    (a as any)._traction_level = computeTractionLevel(a);
  }

  // Sort newest first
  activities.sort((a, b) => {
    const da = a.activity_date || a.created_at || "";
    const db = b.activity_date || b.created_at || "";
    return db.localeCompare(da);
  });

  let highestLevel = 0;
  let lastActivityDate = "";
  let tractionEventCount = 0;

  for (const a of activities) {
    const d = (a.activity_date || a.created_at || "").slice(0, 10);
    if (d && (!lastActivityDate || d > lastActivityDate)) lastActivityDate = d;
    const lvl: number = (a as any)._traction_level ?? 0;
    if (lvl > highestLevel) highestLevel = lvl;
    if (lvl >= 2) tractionEventCount++;
  }

  // ── Major outcome counting — per-school deduplicated ─────────────────────
  // Counts unique athlete-school pairs that had each outcome type.
  // This prevents double-counting when both _requested and _completed are logged,
  // or when offer_updated is logged alongside an offer.
  //
  // offer_updated is intentionally excluded — it represents a change to an
  // existing offer, not a new offer.
  const schoolOutcomes: Record<string, {
    unofficial_visit: boolean;
    official_visit: boolean;
    offer: boolean;
    commitment: boolean;
  }> = {};

  for (const a of activities) {
    const school = (a.school_name || "").trim();
    if (!school) continue;
    if (!schoolOutcomes[school]) {
      schoolOutcomes[school] = { unofficial_visit: false, official_visit: false, offer: false, commitment: false };
    }
    const t: string = a.activity_type || "";
    // Offer: only "offer" (legacy) and "offer_received" — not "offer_updated" (mutation, not new offer)
    if (["offer", "offer_received"].includes(t)) schoolOutcomes[school].offer = true;
    if (["commitment", "signed"].includes(t)) schoolOutcomes[school].commitment = true;
    if (["unofficial_visit_requested", "unofficial_visit_completed"].includes(t)) schoolOutcomes[school].unofficial_visit = true;
    if (["official_visit_requested", "official_visit_completed"].includes(t)) schoolOutcomes[school].official_visit = true;
  }

  const majorOutcomeCounts = {
    offer:            Object.values(schoolOutcomes).filter(s => s.offer).length,
    commitment:       Object.values(schoolOutcomes).filter(s => s.commitment).length,
    unofficial_visit: Object.values(schoolOutcomes).filter(s => s.unofficial_visit).length,
    official_visit:   Object.values(schoolOutcomes).filter(s => s.official_visit).length,
  };

  const school_traction = computeSchoolTraction(activities);
  const { flag: player_progressing, reason: progression_reason, date: progression_date } =
    detectProgression(activities, school_traction);

  return {
    school_traction,
    highest_traction_level: highestLevel,
    last_activity_date: lastActivityDate || null,
    activity_count: activities.length,
    traction_event_count: tractionEventCount,
    recent_activities: activities.slice(0, 20),
    major_outcome_counts: majorOutcomeCounts,
    player_progressing,
    progression_reason,
    progression_date,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// PROGRAM-LEVEL AGGREGATION
// ────────────────────────────────────────────────────────────────────────────
function computeProgramMetrics(
  athleteJourneys: Record<string, any>,
  roster: any[],
): Record<string, any> {
  let playersWithTrueTraction = 0;
  let playersProgressing = 0;
  let unofficialVisitCount = 0;
  let officialVisitCount = 0;
  let offerCount = 0;
  let commitmentCount = 0;

  // Cross-roster school aggregation: school → { traction_level, athlete_count, athlete_names }
  const collegeMap: Record<string, any> = {};

  for (const entry of roster) {
    const accountId: string = entry.account_id || "";
    const journey = athleteJourneys[accountId];
    if (!journey) continue;

    const hasTrueTraction = Object.values(journey.school_traction || {}).some(
      (s: any) => s.true_traction
    );
    if (hasTrueTraction) playersWithTrueTraction++;
    if (journey.player_progressing) playersProgressing++;

    unofficialVisitCount  += journey.major_outcome_counts?.unofficial_visit ?? 0;
    officialVisitCount    += journey.major_outcome_counts?.official_visit   ?? 0;
    offerCount            += journey.major_outcome_counts?.offer            ?? 0;
    commitmentCount       += journey.major_outcome_counts?.commitment       ?? 0;

    // Aggregate per-school across roster
    for (const [schoolName, sData] of Object.entries(journey.school_traction || {}) as [string, any][]) {
      if (!sData.true_traction) continue;
      if (!collegeMap[schoolName]) {
        collegeMap[schoolName] = {
          school_name: schoolName,
          max_traction_level: 0,
          athlete_count: 0,
          athlete_names: [] as string[],
          relationship_status: sData.relationship_status,
          true_traction_event_count: 0,  // NEW: total level-≥2 events across all roster athletes
          last_activity_date: "",
        };
      }
      const col = collegeMap[schoolName];
      col.athlete_count++;
      if (entry.athlete_name) col.athlete_names.push(entry.athlete_name);
      col.true_traction_event_count += sData.traction_event_count || 0;
      if (sData.last_activity_date > col.last_activity_date) col.last_activity_date = sData.last_activity_date;
      if (sData.traction_level > col.max_traction_level) {
        col.max_traction_level = sData.traction_level;
        col.relationship_status = sData.relationship_status;
      }
    }
  }

  // Mark repeated-interest colleges:
  //   Criterion A: true traction with ≥ 2 athletes on the roster
  //   Criterion B: ≥ 3 true-traction events with any single athlete (sustained engagement)
  for (const col of Object.values(collegeMap) as any[]) {
    col.is_repeated_interest = col.athlete_count >= 2 || col.true_traction_event_count >= 3;
  }

  const collegesWithTrueInterest = Object.values(collegeMap).filter(
    (c: any) => c.athlete_count >= 1
  );
  const repeatedInterestColleges = Object.values(collegeMap).filter(
    (c: any) => (c as any).is_repeated_interest
  );

  // Sort by max traction level desc, then athlete_count desc, then event count desc
  collegesWithTrueInterest.sort(
    (a: any, b: any) =>
      b.max_traction_level - a.max_traction_level ||
      b.athlete_count - a.athlete_count ||
      b.true_traction_event_count - a.true_traction_event_count
  );
  repeatedInterestColleges.sort(
    (a: any, b: any) => b.athlete_count - a.athlete_count || b.true_traction_event_count - a.true_traction_event_count
  );

  return {
    total_roster_size: roster.length,
    players_with_true_traction: playersWithTrueTraction,
    players_progressing: playersProgressing,
    colleges_with_true_interest: collegesWithTrueInterest.length,
    repeated_interest_college_count: repeatedInterestColleges.length,
    unofficial_visit_count: unofficialVisitCount,
    official_visit_count: officialVisitCount,
    offer_count: offerCount,
    commitment_count: commitmentCount,
    colleges_detail: collegesWithTrueInterest,
    repeated_interest_colleges: repeatedInterestColleges,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// HANDLER
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
    // 1. Look up Coach profile
    const coaches = await base44.asServiceRole.entities.Coach
      .filter({ account_id: accountId })
      .catch(() => []);

    const coachList = Array.isArray(coaches) ? coaches : [];
    const coach = coachList.find((c: any) => c.status === "approved" && c.active !== false)
      || coachList[0]
      || null;

    if (!coach) {
      return Response.json({ ok: false, error: "No coach profile found for this account" }, { status: 404 });
    }

    const coachId: string = (coach as any).id;

    // 2. Get roster
    const rosterRaw = await base44.asServiceRole.entities.CoachRoster
      .filter({ coach_id: coachId })
      .catch(() => []);

    const roster: any[] = Array.isArray(rosterRaw) ? rosterRaw : [];

    if (roster.length === 0) {
      return Response.json({
        ok: true,
        athleteJourneys: {},
        program_metrics: {
          total_roster_size: 0,
          players_with_true_traction: 0,
          players_progressing: 0,
          colleges_with_true_interest: 0,
          repeated_interest_college_count: 0,
          unofficial_visit_count: 0,
          official_visit_count: 0,
          offer_count: 0,
          commitment_count: 0,
          colleges_detail: [],
          repeated_interest_colleges: [],
        },
        roster,
      });
    }

    // 3. Parallel-fetch activities for each athlete
    const activityResults = await Promise.all(
      roster.map((entry: any) =>
        base44.asServiceRole.entities.RecruitingActivity
          .filter({ account_id: entry.account_id })
          .catch(() => [])
      )
    );

    // 4. Build per-athlete journey map
    const athleteJourneys: Record<string, any> = {};
    for (let i = 0; i < roster.length; i++) {
      const entry = roster[i];
      const aid: string = entry.account_id || "";
      if (!aid) continue;
      const activities: any[] = Array.isArray(activityResults[i]) ? activityResults[i] : [];
      athleteJourneys[aid] = processAthleteActivities(activities);
    }

    // 5. Compute program-level metrics
    const program_metrics = computeProgramMetrics(athleteJourneys, roster);

    return Response.json({
      ok: true,
      athleteJourneys,
      program_metrics,
      roster,
    });
  } catch (err) {
    console.error("getCoachRosterMetrics error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
