// src/lib/demoUserData.js
// Simulated user/athlete demo state for ?demo=user landing experience.
//
// Shows one athlete's journey: Marcus Johnson, 11th grade WR, class of 2026.
// Family from Suwanee, GA (competitive Atlanta suburb market).
//
// Favorites: 9 camps the family has tracked (SEC dreams + realistic D1/D2 targets)
// Registered: 3 camps already paid for (early-season dates, mix of reach + value)
//
// Camp IDs reference DEMO_CAMP_TEMPLATES in demoCampData.js — must stay in sync.

export const DEMO_SEASON_YEAR = 2025;

export function userDemoSeasonYear() {
  return DEMO_SEASON_YEAR;
}

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

// 9 camps the family has saved (favorited) — realistic WR recruiting target list
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
    "Marcus finished 10th grade with solid film from 7-on-7 tournaments across North Georgia. This spring, your family found uRecruit HQ, built a camp plan from scratch, and already has registrations locked in. Three camps confirmed. Six more schools on the radar. Senior season starts in August.",
  stats: {
    saved: DEMO_FAVORITE_CAMP_IDS.length,
    registered: DEMO_REGISTERED_CAMP_IDS.length,
  },
  milestones: [
    { label: "Profile built", detail: "Feb 2025", done: true },
    { label: "9 target camps saved", detail: "Mar 2025", done: true },
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
