// ── Demo Coach Data ──────────────────────────────────────────────────────────
// Fully synthetic data for the Coach HQ demo experience (?demo=coach).
// All athlete names, coach names, contact handles, and emails are fake.
// All college program names are real.
// Dates are computed relative to the current date so the demo always looks current.

const _now = new Date();
// d(n) → ISO date string n days ago
const d = (n) => new Date(_now.getTime() - n * 86400000).toISOString().slice(0, 10);
// ts(n, h) → ISO timestamp n days ago at hour h
const ts = (n, h = 10) => new Date(_now.getTime() - n * 86400000 + h * 3600000).toISOString();

// ── Fake college recruiting contacts ────────────────────────────────────────
// Names, titles, and handles are entirely synthetic.
const CONTACTS = {
  "Florida":         { name: "Ryan Caldwell",   title: "OL Recruiter",      twitter: "rcaldwell_gators" },
  "Auburn":          { name: "Mike Barnett",     title: "DB Recruiter",      twitter: "barnett_au_fb" },
  "Georgia":         { name: "Brandon Simms",    title: "LB Coach",          twitter: "bsimms_dawgs" },
  "Tennessee":       { name: "Chris Holloway",   title: "RB Coach",          twitter: "cholloway_vols" },
  "Penn State":      { name: "Tyler Marsh",      title: "QB Coach",          twitter: "tmarsh_psu" },
  "Michigan":        { name: "Kevin Price",      title: "DC / Recruiter",    twitter: "kprice_mgoblue" },
  "Ohio State":      { name: "James Edgerton",   title: "Area Recruiter",    twitter: "jedgerton_osu" },
  "LSU":             { name: "Andre Fontenot",   title: "LB / Recruiter",    twitter: "afontenot_lsu" },
  "Arkansas":        { name: "Scott Meyers",     title: "WR Coach",          twitter: "smeyers_hogs" },
  "Ole Miss":        { name: "James Calloway",   title: "OC / TE Coach",     twitter: "jcalloway_rebels" },
  "Michigan State":  { name: "Devon Clark",      title: "Area Recruiter",    twitter: "dclark_spartans" },
  "Louisiana Tech":  { name: "Matt Porter",      title: "Recruiting Coord.", twitter: "mporter_latech" },
  "Texas A&M":       { name: "Derek Williams",   title: "S&C / Recruiter",   twitter: "dwilliams_aggie" },
  "Western Kentucky":{ name: "Jake Durham",      title: "OL Coach",          twitter: "jdurham_wku" },
  "Miami":           { name: "Carlos Reyes",     title: "DB Coach",          twitter: "creyes_hurricanes" },
  "South Alabama":   { name: "Brian Holt",       title: "TE / Recruiter",    twitter: "bholt_jaguars_fb" },
  "Mississippi State":{ name: null,              title: null,                twitter: null },
};

const c = (school) => CONTACTS[school] || { name: null, title: null, twitter: null };

// ── Roster ───────────────────────────────────────────────────────────────────
const ROSTER = [
  { id: "demo-roster-001", account_id: "demo-ath-001", athlete_id: "demo-ap-001", athlete_name: "Jaylen Carter",    athlete_grad_year: 2026 },
  { id: "demo-roster-002", account_id: "demo-ath-002", athlete_id: "demo-ap-002", athlete_name: "Marcus Okafor",    athlete_grad_year: 2026 },
  { id: "demo-roster-003", account_id: "demo-ath-003", athlete_id: "demo-ap-003", athlete_name: "DeShawn Williams", athlete_grad_year: 2026 },
  { id: "demo-roster-004", account_id: "demo-ath-004", athlete_id: "demo-ap-004", athlete_name: "Caleb Harrison",   athlete_grad_year: 2027 },
  { id: "demo-roster-005", account_id: "demo-ath-005", athlete_id: "demo-ap-005", athlete_name: "Malik Thompson",   athlete_grad_year: 2026 },
  { id: "demo-roster-006", account_id: "demo-ath-006", athlete_id: "demo-ap-006", athlete_name: "Trevon Davis",     athlete_grad_year: 2027 },
  { id: "demo-roster-007", account_id: "demo-ath-007", athlete_id: "demo-ap-007", athlete_name: "Jordan Pierce",    athlete_grad_year: 2027 },
  { id: "demo-roster-008", account_id: "demo-ath-008", athlete_id: "demo-ap-008", athlete_name: "Xavier Bennett",   athlete_grad_year: 2027 },
  { id: "demo-roster-009", account_id: "demo-ath-009", athlete_id: "demo-ap-009", athlete_name: "Isaiah Williams",  athlete_grad_year: 2028 },
  { id: "demo-roster-010", account_id: "demo-ath-010", athlete_id: "demo-ap-010", athlete_name: "Tyler Brooks",     athlete_grad_year: 2028 },
];

// ── Helper: build an activity record ────────────────────────────────────────
let _actId = 0;
function act(type, daysAgo, school, tractionLevel, opts = {}) {
  _actId++;
  const contact = school ? c(school) : { name: null, title: null, twitter: null };
  return {
    id:             `demo-act-${String(_actId).padStart(3, "0")}`,
    activity_type:  type,
    activity_date:  d(daysAgo),
    school_name:    school || null,
    coach_name:     opts.coach_name  ?? contact.name,
    coach_title:    opts.coach_title ?? contact.title,
    coach_twitter:  opts.twitter     ?? contact.twitter,
    _traction_level: tractionLevel,
    created_at:     ts(daysAgo),
  };
}

// Helper: build a school_traction entry
function st(school, level, status, topType, actCount, tractCount, daysAgo) {
  return {
    school_name:          school,
    traction_level:       level,
    relationship_status:  status,
    true_traction:        level >= 2,
    activity_count:       actCount,
    traction_event_count: tractCount,
    last_activity_date:   d(daysAgo),
    top_activity_type:    topType,
  };
}

// ── Athlete journeys ─────────────────────────────────────────────────────────

// ── 1. Jaylen Carter (2026) — Committed to Florida, Auburn offer, Georgia visit
const JOURNEY_001 = {
  highest_traction_level: 4,
  last_activity_date: d(7),
  activity_count: 14,
  traction_event_count: 7,
  player_progressing: false,
  progression_reason: "Committed to Florida",
  progression_date: d(7),
  major_outcome_counts: { commitment: 1, offer: 2, unofficial_visit: 1, official_visit: 0 },
  school_traction: {
    "Florida":   st("Florida",   4, "committed",        "commitment",             4, 3, 7),
    "Auburn":    st("Auburn",    4, "offer",             "offer_received",         3, 2, 53),
    "Georgia":   st("Georgia",   3, "invite",            "unofficial_visit_completed", 3, 2, 68),
    "Tennessee": st("Tennessee", 2, "verified_contact",  "phone_call",             2, 1, 82),
  },
  recent_activities: [
    act("commitment",              7,  "Florida",   4),
    act("offer_received",         53,  "Auburn",    4),
    act("unofficial_visit_completed", 68, "Georgia", 3),
    act("phone_call",             82,  "Tennessee", 2),
    act("offer_received",         98,  "Florida",   4),
    act("social_follow",         112,  "Auburn",    1, { coach_name: null, coach_title: null, twitter: null }),
  ],
};

// ── 2. Marcus Okafor (2026) — Penn State offer, Michigan follow-up
const JOURNEY_002 = {
  highest_traction_level: 4,
  last_activity_date: d(18),
  activity_count: 11,
  traction_event_count: 5,
  player_progressing: true,
  progression_reason: "Received scholarship offer from Penn State",
  progression_date: d(18),
  major_outcome_counts: { commitment: 0, offer: 1, unofficial_visit: 1, official_visit: 0 },
  school_traction: {
    "Penn State": st("Penn State", 4, "offer",            "offer_received",               3, 2, 18),
    "Michigan":   st("Michigan",   3, "invite",           "post_camp_personal_response",  3, 2, 26),
    "Ohio State": st("Ohio State", 2, "verified_contact", "personal_email",               2, 1, 45),
    "LSU":        st("LSU",        2, "verified_contact", "phone_call",                   2, 1, 55),
  },
  recent_activities: [
    act("offer_received",               18, "Penn State", 4),
    act("post_camp_personal_response",  26, "Michigan",   3),
    act("personal_email",               45, "Ohio State", 2),
    act("phone_call",                   55, "LSU",        2),
    act("unofficial_visit_requested",   72, "Penn State", 3),
    act("social_follow",                88, "Michigan",   1, { coach_name: null, coach_title: null, twitter: null }),
  ],
};

// ── 3. DeShawn Williams (2026) — True traction at Penn State, Georgia, Auburn
const JOURNEY_003 = {
  highest_traction_level: 3,
  last_activity_date: d(8),
  activity_count: 9,
  traction_event_count: 4,
  player_progressing: true,
  progression_reason: "Unofficial visit requested by Georgia",
  progression_date: d(38),
  major_outcome_counts: { commitment: 0, offer: 0, unofficial_visit: 1, official_visit: 0 },
  school_traction: {
    "Penn State": st("Penn State", 2, "verified_contact", "dm_received",                  2, 1, 8),
    "Georgia":    st("Georgia",    3, "invite",           "unofficial_visit_requested",    3, 2, 23),
    "Auburn":     st("Auburn",     2, "verified_contact", "dm_received",                  2, 1, 58),
  },
  recent_activities: [
    act("dm_received",               8,  "Penn State", 2),
    act("personal_email",           23,  "Georgia",    2),
    act("unofficial_visit_requested", 38, "Georgia",   3),
    act("dm_received",              58,  "Auburn",     2),
    act("social_follow",            75,  "Auburn",     1, { coach_name: null, coach_title: null, twitter: null }),
  ],
};

// ── 4. Caleb Harrison (2027) — Three schools calling, heating up
const JOURNEY_004 = {
  highest_traction_level: 2,
  last_activity_date: d(16),
  activity_count: 8,
  traction_event_count: 3,
  player_progressing: true,
  progression_reason: "Phone calls from Texas A&M and Arkansas this month",
  progression_date: d(16),
  major_outcome_counts: { commitment: 0, offer: 0, unofficial_visit: 0, official_visit: 0 },
  school_traction: {
    "Texas A&M":       st("Texas A&M",       2, "verified_contact", "phone_call",         2, 1, 16),
    "Arkansas":        st("Arkansas",        2, "verified_contact", "phone_call",         2, 1, 21),
    "Louisiana Tech":  st("Louisiana Tech",  2, "verified_contact", "camp_attended",      2, 1, 38),
    "Mississippi State": st("Mississippi State", 1, "general_signal", "social_follow",   1, 0, 62),
  },
  recent_activities: [
    act("phone_call",    16, "Texas A&M",       2),
    act("phone_call",    21, "Arkansas",        2),
    act("camp_attended", 38, "Louisiana Tech",  2),
    act("social_follow", 62, "Mississippi State", 1, { coach_name: null, coach_title: null, twitter: null }),
  ],
};

// ── 5. Malik Thompson (2026) — Ole Miss follow-up, Michigan personal email
const JOURNEY_005 = {
  highest_traction_level: 3,
  last_activity_date: d(12),
  activity_count: 8,
  traction_event_count: 3,
  player_progressing: true,
  progression_reason: "Post-camp personal response from Ole Miss",
  progression_date: d(12),
  major_outcome_counts: { commitment: 0, offer: 0, unofficial_visit: 0, official_visit: 0 },
  school_traction: {
    "Ole Miss":         st("Ole Miss",         3, "invite",           "post_camp_personal_response", 3, 2, 12),
    "Michigan":         st("Michigan",         2, "verified_contact", "personal_email",              2, 1, 19),
    "Western Kentucky": st("Western Kentucky", 1, "general_signal",   "social_follow",              1, 0, 72),
  },
  recent_activities: [
    act("post_camp_personal_response", 12, "Ole Miss", 3),
    act("personal_email",              19, "Michigan", 2),
    act("camp_attended",               48, "Ole Miss", 2),
    act("social_follow",               72, "Western Kentucky", 1, { coach_name: null, coach_title: null, twitter: null }),
  ],
};

// ── 6. Trevon Davis (2027) — Arkansas text, South Alabama follow
const JOURNEY_006 = {
  highest_traction_level: 2,
  last_activity_date: d(20),
  activity_count: 4,
  traction_event_count: 1,
  player_progressing: true,
  progression_reason: "Text message from Arkansas coaching staff",
  progression_date: d(20),
  major_outcome_counts: { commitment: 0, offer: 0, unofficial_visit: 0, official_visit: 0 },
  school_traction: {
    "Arkansas":    st("Arkansas",    2, "verified_contact", "text_received", 2, 1, 20),
    "South Alabama": st("South Alabama", 1, "general_signal", "social_follow", 1, 0, 48),
  },
  recent_activities: [
    act("text_received", 20, "Arkansas",     2),
    act("social_follow", 48, "South Alabama", 1, { coach_name: null, coach_title: null, twitter: null }),
  ],
};

// ── 7. Jordan Pierce (2027) — Miami follow, Western Kentucky invite
const JOURNEY_007 = {
  highest_traction_level: 1,
  last_activity_date: d(45),
  activity_count: 3,
  traction_event_count: 0,
  player_progressing: false,
  progression_reason: null,
  progression_date: null,
  major_outcome_counts: { commitment: 0, offer: 0, unofficial_visit: 0, official_visit: 0 },
  school_traction: {
    "Miami":            st("Miami",            1, "general_signal", "social_follow",      1, 0, 45),
    "Western Kentucky": st("Western Kentucky", 1, "general_signal", "generic_camp_invite",1, 0, 68),
  },
  recent_activities: [
    act("social_follow",      45, "Miami",             1, { coach_name: null, coach_title: null, twitter: null }),
    act("generic_camp_invite", 68, "Western Kentucky", 1),
  ],
};

// ── 8. Xavier Bennett (2027) — Louisiana Tech generic email
const JOURNEY_008 = {
  highest_traction_level: 1,
  last_activity_date: d(14),
  activity_count: 2,
  traction_event_count: 0,
  player_progressing: false,
  progression_reason: null,
  progression_date: null,
  major_outcome_counts: { commitment: 0, offer: 0, unofficial_visit: 0, official_visit: 0 },
  school_traction: {
    "Louisiana Tech": st("Louisiana Tech", 1, "general_signal", "generic_email", 2, 0, 14),
  },
  recent_activities: [
    act("generic_email", 14, "Louisiana Tech", 1),
    act("generic_email", 62, "Louisiana Tech", 1, { coach_name: null, coach_title: null, twitter: null }),
  ],
};

// ── 9. Isaiah Williams (2028) — South Alabama social follow (very early)
const JOURNEY_009 = {
  highest_traction_level: 1,
  last_activity_date: d(10),
  activity_count: 1,
  traction_event_count: 0,
  player_progressing: false,
  progression_reason: null,
  progression_date: null,
  major_outcome_counts: { commitment: 0, offer: 0, unofficial_visit: 0, official_visit: 0 },
  school_traction: {
    "South Alabama": st("South Alabama", 1, "general_signal", "social_follow", 1, 0, 10),
  },
  recent_activities: [
    act("social_follow", 10, "South Alabama", 1, { coach_name: null, coach_title: null, twitter: null }),
  ],
};

// ── 10. Tyler Brooks (2028) — No activity yet
const JOURNEY_010 = {
  highest_traction_level: 0,
  last_activity_date: null,
  activity_count: 0,
  traction_event_count: 0,
  player_progressing: false,
  progression_reason: null,
  progression_date: null,
  major_outcome_counts: { commitment: 0, offer: 0, unofficial_visit: 0, official_visit: 0 },
  school_traction: {},
  recent_activities: [],
};

// ── Exports ──────────────────────────────────────────────────────────────────

export const DEMO_COACH_PROFILE = {
  coach: {
    id:            "demo-coach-001",
    account_id:    "demo-account-001",
    first_name:    "Marcus",
    last_name:     "Webb",
    email:         "m.webb@riversidehs-football.com",
    title:         "Head Football Coach",
    school_or_org: "Riverside High School",
    sport:         "Football",
    invite_code:   "RWEBB25",
    status:        "approved",
    active:        true,
    phone:         "555-204-1188",
  },

  roster: ROSTER,

  messages: [
    {
      id:             "demo-msg-001",
      subject:        "Spring Evaluation Update",
      message:        "Team — I want to make sure everyone is using the recruiting journal to log any contact you receive from college programs. Even social follows and DMs should be documented. If a program is reaching out, we want to track it.",
      sent_at:        ts(5),
      recipient_type: "all",
      recipient_id:   null,
    },
    {
      id:             "demo-msg-002",
      subject:        "Camp Season is Starting",
      message:        "As camp season approaches, please make sure your profiles are up to date. Several programs have started reaching out — keep logging those interactions so we have a complete picture heading into the summer.",
      sent_at:        ts(22),
      recipient_type: "all",
      recipient_id:   null,
    },
  ],

  campsByAccountId: {
    "demo-ath-002": [{
      id:               "demo-camp-001",
      school_name:      "Michigan",
      start_date:       d(26),
      camp_name:        "Michigan Football Spring Showcase",
      host_org:         "University of Michigan",
      ryzer_program_name: null,
    }],
    "demo-ath-004": [{
      id:               "demo-camp-002",
      school_name:      "Louisiana Tech",
      start_date:       d(38),
      camp_name:        "Louisiana Tech Football Camp",
      host_org:         "Louisiana Tech University",
      ryzer_program_name: null,
    }],
    "demo-ath-005": [{
      id:               "demo-camp-003",
      school_name:      "Ole Miss",
      start_date:       d(48),
      camp_name:        "Ole Miss Recruiting Showcase",
      host_org:         "University of Mississippi",
      ryzer_program_name: null,
    }],
  },
};

export const DEMO_JOURNEY_DATA = {
  athleteJourneys: {
    "demo-ath-001": JOURNEY_001,
    "demo-ath-002": JOURNEY_002,
    "demo-ath-003": JOURNEY_003,
    "demo-ath-004": JOURNEY_004,
    "demo-ath-005": JOURNEY_005,
    "demo-ath-006": JOURNEY_006,
    "demo-ath-007": JOURNEY_007,
    "demo-ath-008": JOURNEY_008,
    "demo-ath-009": JOURNEY_009,
    "demo-ath-010": JOURNEY_010,
  },

  programMetrics: {
    // Tile: Visits / Offers (offer_count + unofficial_visit_count + official_visit_count)
    offer_count:              2,   // Auburn (Jaylen), Penn State (Marcus)
    unofficial_visit_count:   2,   // Georgia (Jaylen), Georgia visit request (DeShawn)
    official_visit_count:     0,
    // Tile: True Traction (fallback)
    players_with_true_traction: 5, // Jaylen, Marcus, DeShawn, Caleb, Malik
    // Tile: Repeat Colleges
    repeated_interest_college_count: 8,
  },
};
