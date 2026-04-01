// src/lib/reportBuilder.js
// Aggregates coach, roster, journey, and camp data into structured report objects.
// Pure functions — no React, no side effects.

import {
  buildRecentActivityNarrative,
  buildRecruitingJourneyNarrative,
  buildProgramNarrative,
  activityPriorityRank,
  activityEventLabel,
} from "./reportNarrative.js";

// ── Period configuration ──────────────────────────────────────────────────────
export const REPORT_PERIODS = [
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "all", label: "All Time"     },
];

export function periodCutoffDate(period) {
  if (period === "30d") { const d = new Date(); d.setDate(d.getDate() - 30);  return d.toISOString().slice(0, 10); }
  if (period === "90d") { const d = new Date(); d.setDate(d.getDate() - 90);  return d.toISOString().slice(0, 10); }
  return null; // "all" — no cutoff
}

export function periodLabel(period) {
  return REPORT_PERIODS.find(p => p.value === period)?.label || "All Time";
}

function filterByPeriod(activities, period) {
  const cutoff = periodCutoffDate(period);
  if (!cutoff) return activities || [];
  return (activities || []).filter(a =>
    (a.activity_date || a.created_at || "").slice(0, 10) >= cutoff
  );
}

function periodNarrativePhrase(period) {
  if (period === "30d") return "over the last 30 days";
  if (period === "90d") return "over the last 90 days";
  return "over all recorded time";
}

function fmtDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00")
      .toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch { return dateStr; }
}

const RELATIONSHIP_LABEL = {
  no_signal: "No Signal", general_signal: "Signal", verified_contact: "Verified Contact",
  invite: "Camp Invite", visit: "Visit", offer: "Offer", committed: "Committed",
};

const ACTIVITY_LABEL = {
  social_like: "Social Like", social_follow: "Follow",
  dm_received: "DM Received", dm_sent: "DM Sent",
  text_received: "Text Received", text_sent: "Text Sent",
  phone_call: "Phone Call", generic_email: "Email", personal_email: "Personal Email",
  camp_invite: "Camp Invite", generic_camp_invite: "Camp Invite", personal_camp_invite: "Personal Invite",
  camp_registered: "Camp Registered", camp_attended: "Camp Attended",
  post_camp_followup_sent: "Post-Camp Follow-up", post_camp_personal_response: "Personal Response",
  unofficial_visit_requested: "Unofficial Visit", unofficial_visit_completed: "Unofficial Visit ✓",
  official_visit_requested: "Official Visit", official_visit_completed: "Official Visit ✓",
  offer: "Offer", offer_received: "Offer Received", offer_updated: "Offer Updated",
  commitment: "Commitment", signed: "Signed NLI",
};

// ── Interested Schools ────────────────────────────────────────────────────────
function buildInterestedSchools(journey, allActivities) {
  if (!journey) return [];
  const st = journey.school_traction || {};
  const rows = [];

  for (const [key, s] of Object.entries(st)) {
    if (s.traction_level < 1) continue;
    const schoolName = (s.school_name || "").trim() || key;

    // Derive coach contacts from activity records at this school
    const schoolActs = (allActivities || [])
      .filter(a => (a.school_name || "").trim() === schoolName)
      .sort((a, b) => (b.activity_date || b.created_at || "").localeCompare(a.activity_date || a.created_at || ""));

    const coachMap = {};
    for (const act of schoolActs) {
      const cn = (act.coach_name || "").trim();
      if (cn && !coachMap[cn]) {
        coachMap[cn] = { name: cn, title: (act.coach_title || "").trim() || null };
      }
    }
    const coaches = Object.values(coachMap);
    const topCoach = coaches[0] || null;

    rows.push({
      college:       schoolName,
      status:        RELATIONSHIP_LABEL[s.relationship_status] || s.relationship_status || "Signal",
      tractionLevel: s.traction_level,
      coachName:     topCoach?.name  || null,
      coachTitle:    topCoach?.title || null,
      contactMethod: s.top_activity_type ? (ACTIVITY_LABEL[s.top_activity_type] || s.top_activity_type) : null,
      lastDate:      fmtDate(s.last_activity_date),
      activityCount: s.activity_count || 0,
    });
  }

  return rows.sort((a, b) =>
    b.tractionLevel - a.tractionLevel ||
    (b.lastDate || "").localeCompare(a.lastDate || "")
  );
}

// ── Camps ─────────────────────────────────────────────────────────────────────
function buildCampsSection(camps) {
  if (!camps || camps.length === 0) return [];
  return [...camps]
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""))
    .map(c => ({
      school:   c.school_name || c.host_org || c.ryzer_program_name || c.camp_name || "Unknown",
      campName: c.camp_name || null,
      date:     fmtDate(c.start_date),
      division: c.school_division || null,
    }));
}

// ── Activity Log ──────────────────────────────────────────────────────────────
function buildActivityLog(activities, period) {
  const filtered = filterByPeriod(activities, period);
  return filtered
    .sort((a, b) =>
      (b.activity_date || b.created_at || "").localeCompare(a.activity_date || a.created_at || "")
    )
    .map(a => ({
      date:       fmtDate(a.activity_date || a.created_at),
      type:       ACTIVITY_LABEL[a.activity_type] || a.activity_type || "Activity",
      school:     (a.school_name || "").trim() || null,
      coach:      (a.coach_name  || "").trim() || null,
      coachTitle: (a.coach_title || "").trim() || null,
      notes:      (a.notes       || "").trim() || null,
      traction:   a._traction_level ?? null,
    }));
}

// ── Snapshot ──────────────────────────────────────────────────────────────────
function buildSnapshot(journey, camps) {
  if (!journey) {
    return { anyInterest: 0, trueTraction: 0, visitsOffers: 0, engagedColleges: 0, activityCount: 0, campCount: camps?.length || 0, lastActivityDate: null };
  }
  const st = journey.school_traction || {};
  const mc = journey.major_outcome_counts || {};
  const anyInterest  = Object.values(st).filter(s => s.traction_level >= 1).length;
  const trueTraction = Object.values(st).filter(s => s.true_traction).length;
  const visitsOffers = (mc.offer || 0) + (mc.unofficial_visit || 0) + (mc.official_visit || 0);
  return {
    anyInterest,
    trueTraction,
    visitsOffers,
    engagedColleges:  anyInterest,
    activityCount:    journey.activity_count || 0,
    campCount:        camps?.length || 0,
    lastActivityDate: fmtDate(journey.last_activity_date),
  };
}

// ── Single Player Report ──────────────────────────────────────────────────────
/**
 * Builds a structured data object for a single-athlete recruiting report.
 *
 * @param {object} opts
 * @param {object} opts.rosterEntry  - Roster row: { athlete_name, athlete_grad_year, account_id, position }
 * @param {object} opts.journey      - Journey data from athleteJourneys[accountId]
 * @param {Array}  opts.camps        - Camp array from campsByAccountId[accountId]
 * @param {string} opts.coachName    - Coach display name
 * @param {string} opts.programName  - Program / school name
 * @param {string} opts.period       - "30d" | "90d" | "all"
 */
export function buildPlayerRecruitingReportData({
  rosterEntry,
  journey,
  camps,
  coachName,
  programName,
  period = "all",
}) {
  const allActivities     = journey?.recent_activities || [];
  const periodActivities  = filterByPeriod(allActivities, period);
  const pPhrase           = periodNarrativePhrase(period);
  const athleteName       = rosterEntry?.athlete_name || "Unknown Athlete";

  return {
    meta: {
      athleteName,
      gradYear:    rosterEntry?.athlete_grad_year || null,
      position:    rosterEntry?.position || null,
      programName: programName || "Unknown Program",
      coachName:   coachName   || null,
      reportDate:  new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      period:      periodLabel(period),
    },
    recentActivityNarrative:  buildRecentActivityNarrative(periodActivities, athleteName, pPhrase),
    recruitingJourneyNarrative: buildRecruitingJourneyNarrative(journey, athleteName),
    snapshot:         buildSnapshot(journey, camps),
    interestedSchools: buildInterestedSchools(journey, allActivities),
    camps:             buildCampsSection(camps),
    activityLog:       buildActivityLog(allActivities, period),
  };
}

// ── Full Program Report ───────────────────────────────────────────────────────
/**
 * Builds a structured data object for a full program recruiting report.
 *
 * @param {object} opts
 * @param {object} opts.coach               - Coach entity
 * @param {Array}  opts.roster              - Array of roster entries
 * @param {object} opts.athleteJourneys     - Map of accountId → journey data
 * @param {object} opts.campsByAccountId    - Map of accountId → camp array
 * @param {object} opts.programMetrics      - Top-level program metrics from backend
 * @param {string} opts.period              - "30d" | "90d" | "all"
 */
export function buildProgramRecruitingReportData({
  coach,
  roster,
  athleteJourneys,
  campsByAccountId,
  programMetrics,
  period = "all",
}) {
  const programName = coach?.school_or_org || "Unknown Program";
  const coachName   = coach
    ? `${coach.first_name || ""} ${coach.last_name || ""}`.trim() || null
    : null;

  // Program-level aggregates
  const cutoff30d   = periodCutoffDate("30d");
  let totalCamps = 0, heatingUp = 0, needsAttention = 0;
  const collegeSeen = new Set();
  let aggregateVO = 0;

  for (const r of (roster || [])) {
    const j    = athleteJourneys?.[r.account_id];
    const crec = campsByAccountId?.[r.account_id] || [];
    totalCamps += crec.length;
    if (!j) continue;
    const st = j.school_traction || {};
    for (const [key, s] of Object.entries(st)) {
      if (s.traction_level >= 1) collegeSeen.add((s.school_name || "").trim() || key);
    }
    const mc = j.major_outcome_counts || {};
    aggregateVO += (mc.offer || 0) + (mc.unofficial_visit || 0) + (mc.official_visit || 0);
    const has30d = (j.recent_activities || []).some(a =>
      (a.activity_date || a.created_at || "").slice(0, 10) >= cutoff30d
    );
    if (has30d) heatingUp++;
    const hasTT   = Object.values(st).some(s => s.true_traction);
    const cnt30d  = (j.recent_activities || []).filter(a =>
      (a.activity_date || a.created_at || "").slice(0, 10) >= cutoff30d
    ).length;
    if (hasTT && cnt30d === 0) needsAttention++;
  }

  const pmVO = programMetrics
    ? (programMetrics.offer_count || 0) +
      (programMetrics.unofficial_visit_count || 0) +
      (programMetrics.official_visit_count || 0)
    : aggregateVO;

  // Per-athlete sections — sorted by traction strength descending
  const athletes = (roster || [])
    .map(r => buildPlayerRecruitingReportData({
      rosterEntry: r,
      journey:     athleteJourneys?.[r.account_id] || null,
      camps:       campsByAccountId?.[r.account_id] || [],
      coachName,
      programName,
      period,
    }))
    .sort((a, b) => {
      const aScore = a.snapshot.visitsOffers * 10 + a.snapshot.trueTraction * 3 + a.snapshot.anyInterest;
      const bScore = b.snapshot.visitsOffers * 10 + b.snapshot.trueTraction * 3 + b.snapshot.anyInterest;
      return bScore - aScore || a.meta.athleteName.localeCompare(b.meta.athleteName);
    });

  return {
    meta: {
      programName,
      coachName,
      reportDate: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      period:     periodLabel(period),
      sport:      coach?.sport || null,
    },
    programSummary: {
      totalAthletes:        roster?.length || 0,
      totalEngagedColleges: collegeSeen.size,
      totalVisitsOffers:    pmVO,
      totalCamps,
      heatingUp,
      needsAttention,
    },
    programNarrative: buildProgramNarrative({
      roster:         roster || [],
      athleteJourneys: athleteJourneys || {},
      programMetrics,
      programName,
    }),
    athletes,
  };
}
