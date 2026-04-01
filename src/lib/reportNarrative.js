// src/lib/reportNarrative.js
// Narrative generation for recruiting reports.
// Adapted from CoachDashboard activity narration logic.
// Pure functions — no React, no side effects, no backend calls.

// ── Activity type sets ────────────────────────────────────────────────────────
const COMMIT_TYPES   = new Set(["commitment", "signed"]);
const OFFER_TYPES    = new Set(["offer", "offer_received", "offer_updated"]);
const CAMP_REG_TYPES = new Set(["camp_registered", "camp_attended"]);
const PERSONAL_TYPES = new Set(["dm_received","dm_sent","text_received","text_sent","post_camp_followup_sent","phone_call","personal_email"]);
const SOCIAL_TYPES   = new Set(["social_like", "social_follow"]);
const INVITE_TYPES   = new Set(["camp_invite","generic_camp_invite","personal_camp_invite"]);

// ── Priority ranking (lower = more significant) ───────────────────────────────
export function activityPriorityRank(act) {
  const t = act.activity_type || "";
  if (COMMIT_TYPES.has(t)) return 1;
  if (OFFER_TYPES.has(t))  return 2;
  if (["official_visit_requested","official_visit_completed"].includes(t))   return 3;
  if (["unofficial_visit_requested","unofficial_visit_completed"].includes(t)) return 4;
  if ((act._traction_level ?? 0) >= 2) return 5;
  if (CAMP_REG_TYPES.has(t)) return 6;
  if (PERSONAL_TYPES.has(t)) return 7;
  if (INVITE_TYPES.has(t))   return 8;
  if (SOCIAL_TYPES.has(t))   return 9;
  return 99;
}

// ── Human-readable event label ────────────────────────────────────────────────
export function activityEventLabel(act) {
  const t = act.activity_type || "";
  if (COMMIT_TYPES.has(t))  return "commitment";
  if (OFFER_TYPES.has(t))   return "scholarship offer";
  if (t === "official_visit_requested")    return "official visit request";
  if (t === "official_visit_completed")    return "official visit completed";
  if (t === "unofficial_visit_requested")  return "unofficial visit request";
  if (t === "unofficial_visit_completed")  return "unofficial visit completed";
  if ((act._traction_level ?? 0) >= 2)     return "direct personal contact";
  if (t === "camp_registered") return "camp registration";
  if (t === "camp_attended")   return "camp attendance";
  if (t === "phone_call")      return "phone call";
  if (t === "personal_email")  return "personal email";
  if (["dm_received","dm_sent"].includes(t)) return "direct message";
  if (["text_received","text_sent"].includes(t)) return "text message";
  if (t === "post_camp_followup_sent") return "post-camp follow-up";
  if (INVITE_TYPES.has(t)) return "camp invite";
  if (SOCIAL_TYPES.has(t)) return t === "social_follow" ? "social follow" : "social like";
  return "activity";
}

// ── Build a readable phrase for one contact event ─────────────────────────────
function buildPhrase(rank, evLabel, actType, school, coachName, coachTitle) {
  const cs = coachName
    ? (coachTitle ? `${coachName}, ${coachTitle}` : coachName)
    : null;
  if (rank === 1) return school ? `committed to ${school}` : "committed to a program";
  if (rank === 2) return cs && school ? `a scholarship offer from ${school}, extended by ${cs}`
    : school ? `a scholarship offer from ${school}` : "a scholarship offer";
  if (rank === 3) {
    const v = evLabel === "official visit completed" ? "an official visit completion" : "an official visit request";
    return school ? `${v} from ${school}` : v;
  }
  if (rank === 4) {
    const v = evLabel === "unofficial visit completed" ? "an unofficial visit completion" : "an unofficial visit request";
    return cs && school ? `${v} from ${school}, extended by ${cs}` : school ? `${v} from ${school}` : v;
  }
  if (rank === 5) return cs && school ? `direct contact from ${cs} at ${school}`
    : school ? `direct personal contact from ${school}` : "direct personal contact";
  if (rank === 6) {
    const v = evLabel === "camp attendance" ? "camp attendance at" : "a camp registration at";
    return school ? `${v} ${school}` : evLabel;
  }
  if (rank === 7) {
    const m = evLabel === "phone call" ? "a phone call"
      : evLabel === "personal email" ? "a personal email"
      : evLabel === "direct message" ? "a direct message"
      : evLabel === "text message" ? "a text message"
      : evLabel === "post-camp follow-up" ? "post-camp follow-up"
      : "direct outreach";
    return cs && school ? `${m} from ${cs} at ${school}` : school ? `${m} from ${school}` : m;
  }
  if (INVITE_TYPES.has(actType)) return school ? `a camp invite from ${school}` : "a camp invite";
  return null;
}

function joinN(arr) {
  if (!arr || arr.length === 0) return "";
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return arr.slice(0, -1).join(", ") + ", and " + arr[arr.length - 1];
}

// ── Recent Activity Narrative ─────────────────────────────────────────────────
// Generates a human-readable paragraph about a single athlete's activity.
// activities: already filtered to the relevant period.
// periodLabel: e.g. "over the last 30 days" or "over all recorded time".
export function buildRecentActivityNarrative(activities, athleteName, periodLabel) {
  const pStr = periodLabel || "in the selected period";
  const name = athleteName || "This athlete";

  if (!activities || activities.length === 0) {
    return `No recruiting activity is on record for ${name} ${pStr}.`;
  }

  const sorted = [...activities].sort((a, b) => activityPriorityRank(a) - activityPriorityRank(b));
  const seen = new Set();
  const contacts = [];
  const lightSchools = new Set();

  for (const act of sorted) {
    const school  = (act.school_name || "").trim() || null;
    const rank    = activityPriorityRank(act);
    const evLabel = activityEventLabel(act);
    const actType = act.activity_type || "";
    const key     = `${school}|${rank <= 8 ? evLabel : actType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (SOCIAL_TYPES.has(actType)) { if (school) lightSchools.add(school); continue; }
    const phrase = buildPhrase(rank, evLabel, actType, school,
      (act.coach_name || "").trim() || null, (act.coach_title || "").trim() || null);
    if (phrase !== null) contacts.push({ rank, phrase });
  }

  if (contacts.length === 0 && lightSchools.size === 0) {
    return `Limited meaningful activity was recorded for ${name} ${pStr}. Early-stage signals may be present but no substantive contact or outcomes have been logged.`;
  }

  const sentences = [];
  if (contacts.length > 0) {
    const first = contacts[0];
    sentences.push(first.rank === 1
      ? `${first.phrase.charAt(0).toUpperCase() + first.phrase.slice(1)}.`
      : `${name} received ${first.phrase}.`);
    if (contacts.length === 2) {
      sentences.push(`Also recorded: ${contacts[1].phrase}.`);
    } else if (contacts.length >= 3) {
      sentences.push(`Additional contact included ${joinN(contacts.slice(1).map(c => c.phrase))}.`);
    }
  }
  if (lightSchools.size > 0) {
    const sp = lightSchools.size === 1 ? [...lightSchools][0]
      : lightSchools.size <= 2 ? joinN([...lightSchools])
      : `${lightSchools.size} programs`;
    sentences.push(contacts.length === 0
      ? `Social engagement (likes, follows) from ${sp} was recorded ${pStr}.`
      : `Social engagement was also recorded from ${sp}.`);
  }

  return sentences.join(" ");
}

// ── Overall Recruiting Journey Narrative ──────────────────────────────────────
// Uses the full journey object (school_traction, major_outcome_counts, etc.).
// Summarizes the athlete's complete recruiting story regardless of period filter.
export function buildRecruitingJourneyNarrative(journey, athleteName) {
  const name = athleteName || "This athlete";
  if (!journey) {
    return `Limited recruiting activity is currently on record for ${name}. Existing signals suggest early-stage visibility, but no stronger traction or milestone activity has yet been logged.`;
  }

  const st = journey.school_traction || {};
  const allSchools = Object.values(st);
  const engaging = allSchools.filter(s => s.traction_level >= 1);
  const tractionSchools = allSchools.filter(s => s.true_traction);
  const hl = journey.highest_traction_level || 0;
  const totalActs = journey.activity_count || 0;
  const mc = journey.major_outcome_counts || {};
  const commitCount = mc.commitment || 0;
  const offerCount  = mc.offer || 0;
  const uvCount     = mc.unofficial_visit || 0;
  const ovCount     = mc.official_visit || 0;

  if (engaging.length === 0 && totalActs === 0) {
    return `Limited recruiting activity is currently on record for ${name}. No college engagement signals have been logged to date.`;
  }

  const sentences = [];

  // Opening outcome statement
  if (commitCount > 0) {
    sentences.push(`${name} has committed to a program, representing the top outcome across their recruiting journey.`);
  } else if (offerCount > 0 || ovCount > 0 || uvCount > 0) {
    const outcomes = [];
    if (offerCount > 0) outcomes.push(`${offerCount} scholarship offer${offerCount > 1 ? "s" : ""}`);
    if (ovCount > 0)    outcomes.push(`${ovCount} official visit${ovCount > 1 ? "s" : ""}`);
    if (uvCount > 0)    outcomes.push(`${uvCount} unofficial visit${uvCount > 1 ? "s" : ""}`);
    sentences.push(`${name}'s recruiting journey has produced major outcomes including ${joinN(outcomes)}.`);
  } else if (tractionSchools.length > 0) {
    sentences.push(`${name} has developed verified recruiting traction with ${tractionSchools.length} school${tractionSchools.length > 1 ? "s" : ""}, with consistent direct contact on record.`);
  } else if (engaging.length > 0) {
    sentences.push(`${name} has early-stage college interest on record from ${engaging.length} program${engaging.length > 1 ? "s" : ""}, though no direct personal contact or stronger traction has been confirmed.`);
  } else {
    sentences.push(`Recruiting activity for ${name} is early-stage. Signals are on record, but meaningful engagement has not yet developed.`);
  }

  // Top traction schools
  if (tractionSchools.length > 0) {
    const top = [...tractionSchools]
      .sort((a, b) => b.traction_level - a.traction_level)
      .slice(0, 3)
      .map(s => s.school_name || "Unknown")
      .filter(Boolean);
    if (top.length > 0) {
      sentences.push(`Schools with the strongest traction include ${joinN(top)}.`);
    }
  }

  // Activity breadth
  if (engaging.length > 0 && totalActs > 0) {
    sentences.push(`In total, ${totalActs} recruiting event${totalActs > 1 ? "s have" : " has"} been logged across ${engaging.length} school${engaging.length > 1 ? "s" : ""}.`);
  }

  // Progression note
  if (journey.player_progressing && journey.progression_reason) {
    sentences.push(journey.progression_reason);
  }

  return sentences.join(" ") ||
    `Limited recruiting activity is currently on record for ${name}. Existing signals suggest early-stage visibility, but no stronger traction or milestone activity has yet been logged.`;
}

// ── Program-level Narrative ───────────────────────────────────────────────────
export function buildProgramNarrative({ roster, athleteJourneys, programMetrics, programName }) {
  const name = programName || "This program";
  if (!roster || roster.length === 0) {
    return `No athlete data is currently on record for ${name}.`;
  }

  let withAnySignal = 0, withTrueTraction = 0;
  const collegeSeen = new Set();

  for (const r of roster) {
    const j = athleteJourneys?.[r.account_id];
    if (!j) continue;
    const st = j.school_traction || {};
    if (Object.values(st).some(s => s.traction_level >= 1)) withAnySignal++;
    if (Object.values(st).some(s => s.true_traction)) withTrueTraction++;
    for (const [key, s] of Object.entries(st)) {
      if (s.traction_level >= 1) collegeSeen.add((s.school_name || "").trim() || key);
    }
  }

  const totalColleges = collegeSeen.size;
  const totalAthletes = roster.length;
  const pm = programMetrics;
  const sentences = [];

  sentences.push(`${name} has ${totalAthletes} athlete${totalAthletes > 1 ? "s" : ""} on the recruiting roster.`);

  if (withAnySignal > 0) {
    sentences.push(`${withAnySignal} athlete${withAnySignal > 1 ? "s have" : " has"} college interest on record${totalColleges > 0 ? `, spanning ${totalColleges} program${totalColleges > 1 ? "s" : ""}` : ""}.`);
  }

  if (withTrueTraction > 0) {
    sentences.push(`${withTrueTraction} athlete${withTrueTraction > 1 ? "s have" : " has"} developed verified traction through direct coach contact.`);
  }

  if (pm) {
    const outcomes = [];
    if ((pm.offer_count || 0) > 0)            outcomes.push(`${pm.offer_count} offer${pm.offer_count > 1 ? "s" : ""}`);
    if ((pm.unofficial_visit_count || 0) > 0) outcomes.push(`${pm.unofficial_visit_count} unofficial visit${pm.unofficial_visit_count > 1 ? "s" : ""}`);
    if ((pm.official_visit_count || 0) > 0)   outcomes.push(`${pm.official_visit_count} official visit${pm.official_visit_count > 1 ? "s" : ""}`);
    if (outcomes.length > 0) {
      sentences.push(`Major outcomes on record include ${joinN(outcomes)}.`);
    }
  }

  if (withAnySignal === 0) {
    sentences.push("No recruiting signals have been logged yet. Athletes may benefit from increased camp activity and coach outreach.");
  }

  return sentences.join(" ");
}
