// src/lib/demoUserData.js
// Simulated user/athlete demo state for ?demo=user landing experience.
//
// Shows one athlete's journey: Marcus Johnson, 11th grade WR, class of 2026.
// Family from Suwanee, GA (competitive Atlanta suburb market).
//
// Favorites: 10 camps the family has tracked (SEC dreams + realistic D1/D2 targets)
// Registered: 3 camps already paid for (early-season dates, mix of reach + value)
//
// Camp IDs reference DEMO_CAMP_TEMPLATES in demoCampData.js — must stay in sync.

export const DEMO_SEASON_YEAR = 2025;

export function userDemoSeasonYear() {
  return DEMO_SEASON_YEAR;
}

// Shared home-location params for demo conflict detection.
// Spread into detectConflicts / useConflictDetection calls when isUserDemo=true
// so all pages produce identical conflict signals from the same camp data.
// (isPaid intentionally omitted — callers decide that based on their own logic.)
export const DEMO_CONFLICT_HOME = {
  homeCity: "Suwanee",
  homeState: "GA",
  homeLat: null,
  homeLng: null,
};

// Synthetic athlete snapshot — used to render the demo profile card
export const DEMO_ATHLETE = {
  athlete_name: "Marcus Johnson",
  first_name: "Marcus",
  last_name: "Johnson",
  position: "Wide Receiver",
  grad_year: 2026,
  state: "GA",
  home_city: "Suwanee",
  home_state: "GA",
  high_school: "North Gwinnett High School",
  height: "6'1\"",
  weight: "185 lbs",
  gpa: "3.6",
  target_division: "Division I",
  sport: "Football",
  parent_name: "David Johnson",
};

// 10 camps the family has saved (favorited) — realistic WR recruiting target list
// Ordered roughly by priority / realism
export const DEMO_FAVORITE_CAMP_IDS = [
  "dc-georgia-001",       // Georgia — home state, premier dream school
  "dc-tennessee-001",     // Tennessee — strong WR tradition, driveable
  "dc-auburn-001",        // Auburn — close drive from GA, SEC exposure
  "dc-florida-001",       // Florida — SEC reach, warm weather appeal
  "dc-alabama-001",       // Alabama — stretch goal, prestige
  "dc-wku-001",           // Western Kentucky — elite passing program, affordable
  "dc-latech-001",        // Louisiana Tech — realistic D1 target, air raid offense
  "dc-southalabama-001",  // South Alabama — solid D1, within drive distance
  "dc-valdosta-001",      // Valdosta State — Georgia D2 program, safety net
  "dc-michigan-001",      // Michigan — dream school reach; May 25 (day after South Alabama → ✈️ travel conflict)
];

// 3 camps already registered (paid, confirmed) — earlier season dates
export const DEMO_REGISTERED_CAMP_IDS = [
  "dc-wku-001",           // May 10 — earliest, affordable first camp
  "dc-tennessee-001",     // May 17 — first big SEC camp, already committed
  "dc-auburn-001",        // Jun 7 — close drive, confirmed registration
];

// Journey narrative — rendered in Workspace user demo panel
export const DEMO_JOURNEY = {
  athleteName: "Marcus Johnson",
  gradYear: 2026,
  position: "WR",
  school: "North Gwinnett HS",
  city: "Suwanee, GA",
  chapter: "11th Grade — Building Camp Momentum",
  summary:
    "Marcus finished 10th grade with solid film from 7-on-7 tournaments across North Georgia. This spring, your family found uRecruit HQ, built a camp plan from scratch, and already has registrations locked in. Three camps confirmed. Seven more schools on the radar. Senior season starts in August.",
  stats: {
    saved: DEMO_FAVORITE_CAMP_IDS.length,
    registered: DEMO_REGISTERED_CAMP_IDS.length,
  },
  milestones: [
    { label: "Profile built", detail: "Feb 2025", done: true },
    { label: "10 target camps saved", detail: "Mar 2025", done: true },
    { label: "Registered: WKU, Tennessee, Auburn", detail: "Mar–Apr 2025", done: true },
    { label: "Attend camps, collect coach feedback", detail: "May–Jun 2025", done: false },
    { label: "Update film reel after summer camps", detail: "Jul 2025", done: false },
    { label: "Senior season — pursue offers", detail: "Aug–Nov 2025", done: false },
  ],
};

const SEEDED_FLAG_PREFIX = "demo:user:seeded:";

/**
 * Seeds the demo user's localStorage state on first entry.
 * Idempotent — safe to call multiple times; skips if already seeded for this demoProfileId.
 */
export function initDemoUserState(demoProfileId, seasonYear) {
  if (!demoProfileId) return;
  const year = Number(seasonYear) || DEMO_SEASON_YEAR;
  const seededKey = `${SEEDED_FLAG_PREFIX}${demoProfileId}`;

  try {
    if (localStorage.getItem(seededKey)) return; // already seeded for this profile

    // Seed favorites — only if empty (don't overwrite user interactions)
    const favKey = `demo:favorites:${demoProfileId}:${year}`;
    let existingFavs = [];
    try { existingFavs = JSON.parse(localStorage.getItem(favKey) || "[]"); } catch {}
    if (!Array.isArray(existingFavs) || existingFavs.length === 0) {
      localStorage.setItem(favKey, JSON.stringify(DEMO_FAVORITE_CAMP_IDS));
    }

    // Seed registered — only if empty
    const regKey = `rm_demo_registered_${demoProfileId}`;
    let existingReg = {};
    try { existingReg = JSON.parse(localStorage.getItem(regKey) || "{}"); } catch {}
    if (typeof existingReg !== "object" || Object.keys(existingReg).length === 0) {
      const regObj = {};
      for (const id of DEMO_REGISTERED_CAMP_IDS) regObj[id] = 1;
      localStorage.setItem(regKey, JSON.stringify(regObj));
    }

    localStorage.setItem(seededKey, "1");
  } catch (e) {
    console.warn("[demoUserData] initDemoUserState failed:", e?.message);
  }
}

/**
 * Clears the seed flag for a demoProfileId — forces re-seed on next entry.
 * Useful for development/testing.
 */
export function clearDemoUserSeed(demoProfileId) {
  if (!demoProfileId) return;
  try { localStorage.removeItem(`${SEEDED_FLAG_PREFIX}${demoProfileId}`); } catch {}
}

// ── Demo Recruiting Journey ────────────────────────────────────────────────────
// Synthetic activity log for Marcus Johnson (WR, Class of 2026).
// Used exclusively in ?demo=user mode — never touches production data.
// No `id` field → edit/delete buttons are naturally hidden in the tracker UI.

export const DEMO_JOURNEY_ACTIVITIES = [
  {
    activity_type: "post_camp_personal_response",
    school_name: "Western Kentucky",
    coach_name: "Coach Hicks",
    coach_title: "Recruiting Coordinator",
    activity_date: "2025-05-12",
    notes: "Coach Hicks reached out the day after camp — said Marcus had one of the best route trees they'd seen all spring. Asked about visit availability for June.",
    _traction_level: 3,
  },
  {
    activity_type: "camp_attended",
    school_name: "Western Kentucky",
    coach_name: "Coach Hicks",
    coach_title: "Recruiting Coordinator",
    activity_date: "2025-05-10",
    notes: "Strong performance in 1-on-1s and route running drills. Had a 10-minute conversation with the WR coach after the session.",
    _traction_level: 1,
  },
  {
    activity_type: "phone_call",
    school_name: "Louisiana Tech",
    coach_name: "Coach Simmons",
    coach_title: "Wide Receivers Coach",
    activity_date: "2025-04-18",
    notes: "15-minute call. Coach Simmons said he'd been following Marcus's 7v7 film and wanted to connect before their June camp. Mentioned his release and separation as standouts.",
    _traction_level: 3,
  },
  {
    activity_type: "personal_camp_invite",
    school_name: "Auburn",
    coach_name: "Coach Taylor",
    coach_title: "Wide Receivers Coach",
    activity_date: "2025-04-15",
    notes: "Personal email from Coach Taylor referencing Marcus's spring 7v7 highlights specifically. Not a mass invite — mentioned his 6'1\" frame and route running.",
    _traction_level: 3,
  },
  {
    activity_type: "camp_registered",
    school_name: "Tennessee",
    activity_date: "2025-04-08",
    notes: "Registered for May 17 camp. $75 fee paid. Confirmation email received.",
    _traction_level: 1,
  },
  {
    activity_type: "camp_registered",
    school_name: "Western Kentucky",
    activity_date: "2025-04-05",
    notes: "Registered for May 10 camp. $65 fee paid. First camp of the season.",
    _traction_level: 1,
  },
  {
    activity_type: "phone_call",
    school_name: "Western Kentucky",
    coach_name: "Coach Hicks",
    coach_title: "Recruiting Coordinator",
    activity_date: "2025-03-28",
    notes: "20-minute call. Coach Hicks asked about Marcus's 40 time, vertical, and route tree. Said they're targeting 2–3 WRs in the 2026 class and Marcus is on their board.",
    _traction_level: 3,
  },
  {
    activity_type: "text_received",
    school_name: "Louisiana Tech",
    coach_name: "Coach Simmons",
    activity_date: "2025-03-20",
    notes: "Text after seeing Marcus's spring 7v7 highlights posted on Twitter. Back-and-forth exchange — athlete-specific.",
    is_two_way_engagement: true,
    is_athlete_specific: true,
    _traction_level: 2,
  },
  {
    activity_type: "personal_camp_invite",
    school_name: "Tennessee",
    coach_name: "Coach Williams",
    coach_title: "Wide Receivers Coach",
    activity_date: "2025-03-15",
    notes: "Email from Coach Williams with a direct reference to Marcus's film from the Rivals tournament. Not a form letter.",
    _traction_level: 3,
  },
  {
    activity_type: "personal_camp_invite",
    school_name: "Western Kentucky",
    coach_name: "Coach Hicks",
    coach_title: "Recruiting Coordinator",
    activity_date: "2025-03-10",
    notes: "First personal invite from WKU. Coach Hicks mentioned Marcus's 7v7 tape specifically and noted his frame at 6'1\".",
    _traction_level: 3,
  },
  {
    activity_type: "dm_received",
    school_name: "Western Kentucky",
    coach_name: "Coach Hicks",
    activity_date: "2025-03-05",
    notes: "First DM from WKU coaching staff. Two-way exchange — athlete-specific.",
    is_two_way_engagement: true,
    is_athlete_specific: true,
    _traction_level: 2,
  },
  {
    activity_type: "dm_received",
    school_name: "Auburn",
    activity_date: "2025-03-01",
    notes: "Generic DM from Auburn recruiting staff. No personal reference — appears to be mass outreach to area WRs.",
    is_two_way_engagement: false,
    is_athlete_specific: false,
    _traction_level: 1,
  },
  {
    activity_type: "social_follow",
    school_name: "South Alabama",
    activity_date: "2025-02-28",
    notes: "South Alabama WR coach followed Marcus on Twitter after he posted his spring 7v7 highlights reel.",
    _traction_level: 1,
  },
  {
    activity_type: "social_follow",
    school_name: "Tennessee",
    activity_date: "2025-02-24",
    notes: "Tennessee WR coach followed Marcus's account after the Rivals tournament highlight post.",
    _traction_level: 1,
  },
  {
    activity_type: "generic_camp_invite",
    school_name: "Florida",
    activity_date: "2025-02-20",
    notes: "Mass camp invite email from Florida's camp office. Not athlete-specific.",
    _traction_level: 1,
  },
  {
    activity_type: "generic_camp_invite",
    school_name: "Alabama",
    activity_date: "2025-02-18",
    notes: "Generic camp invite from Alabama football. Standard mass outreach.",
    _traction_level: 1,
  },
  {
    activity_type: "social_like",
    school_name: "Georgia",
    coach_name: "Coach Carter",
    coach_title: "Wide Receivers Coach",
    activity_date: "2025-02-15",
    notes: "Georgia WR coach liked Marcus's highlight clip tweet. First contact from a Power 4 program.",
    _traction_level: 1,
  },
];

// Traction snapshot metrics for the demo athlete
export const DEMO_JOURNEY_METRICS = {
  traction_stage_label: "Building Momentum",
  highest_traction_level: 3,
  true_traction_school_count: 3,
  activity_count_30d: 6,
  top_school_with_highest_traction: "Western Kentucky",
};

// Target school preferences for the demo athlete
export const DEMO_JOURNEY_PREFS = {
  fbs_1: "Georgia",
  fbs_2: "Tennessee",
  fbs_3: "Western Kentucky",
  fcs_1: "",
  fcs_2: "",
  fcs_3: "",
  d2_1: "Valdosta State",
  d2_2: "",
  d2_3: "",
  d3_1: "",
  d3_2: "",
  d3_3: "",
};
