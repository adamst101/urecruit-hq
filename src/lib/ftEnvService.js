/**
 * ftEnvService.js
 * Functional Test Environment seed service.
 *
 * Exports:
 *   SEED_VERSION  — current topology version string
 *   SEED_PREFIX   — prefix used for all synthetic records ("__hc_ft_")
 *   FT_TOPOLOGY   — static definition (no IDs) of coaches, athletes, rosters, activities
 *   seedTopology(base44)   → { coaches, athletes, rosters, activities, meta }
 *   resetTopology(base44)  → same shape (delete-then-reseed)
 *   verifyTopology(base44) → { status, scenarios, notes, warnings, errors, counts }
 *   discoverSeeds(base44)  → { coaches, athletes, rosters, activities }
 *   deleteAllSeeds(base44) → { deleted, errors }
 *
 * IMPORTANT: base44 client is passed in by the caller — never imported here.
 * All synthetic records are identifiable by the __hc_ft_ prefix in name/id fields.
 */

export const SEED_VERSION = "1.1.0";
export const SEED_PREFIX = "__hc_ft_";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ISO date string offset by `daysAgo` from today */
function isoDateAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Static topology definition (no IDs — those come back after creation)
// ---------------------------------------------------------------------------

export const FT_TOPOLOGY = {
  coaches: [
    {
      _key: "coach1",
      first_name: "TestCoach",
      last_name: "Hayes",
      school_or_org: "Riverside High School (FT Seed)",
      sport: "Football",
      invite_code: "__hc_ft_HAYES-001",
      account_id: "__hc_ft_coach1_account",
      status: "approved",
      active: true,
    },
    {
      _key: "coach2",
      first_name: "TestCoach",
      last_name: "Rivera",
      school_or_org: "Lincoln Academy (FT Seed)",
      sport: "Football",
      invite_code: "__hc_ft_RIVERA-001",
      account_id: "__hc_ft_coach2_account",
      status: "approved",
      active: true,
    },
  ],

  athletes: [
    {
      _key: "athlete1",
      family: "family1",
      first_name: "Test",
      last_name: "Johnson",
      athlete_name: "__hc_ft_Test Johnson",
      account_id: "__hc_ft_family1",
      grad_year: 2026,
      sport_id: "football",
      position: "QB",
      active: true,
    },
    {
      _key: "athlete2",
      family: "family1",
      first_name: "Test",
      last_name: "Johnson",
      athlete_name: "__hc_ft_Test Johnson",
      account_id: "__hc_ft_family1",
      grad_year: 2027,
      sport_id: "football",
      position: "WR",
      active: true,
    },
    {
      _key: "athlete3",
      family: "family2",
      first_name: "Test",
      last_name: "Martinez",
      athlete_name: "__hc_ft_Test Martinez",
      account_id: "__hc_ft_family2",
      grad_year: 2026,
      sport_id: "football",
      position: "DB",
      active: true,
    },
    {
      _key: "athlete4",
      family: "family3",
      first_name: "Test",
      last_name: "Williams",
      athlete_name: "__hc_ft_Test Williams",
      account_id: "__hc_ft_family3",
      grad_year: 2026,
      sport_id: "football",
      position: "RB",
      active: true,
    },
    {
      _key: "athlete5",
      family: "family4",
      first_name: "Test",
      last_name: "Davis",
      athlete_name: "__hc_ft_Test Davis",
      account_id: "__hc_ft_family4",
      grad_year: 2027,
      sport_id: "football",
      position: "LB",
      active: true,
    },
    {
      _key: "athlete6",
      family: "family5",
      first_name: "Test",
      last_name: "Brown",
      athlete_name: "__hc_ft_Test Brown",
      account_id: "__hc_ft_family5",
      grad_year: 2028,
      sport_id: "football",
      position: "OL",
      active: true,
    },
  ],

  // Roster links — coachKey and athleteKey resolved after creation
  rosters: [
    { _coachKey: "coach1", _athleteKey: "athlete1" }, // Tyler → Hayes
    { _coachKey: "coach2", _athleteKey: "athlete2" }, // Marcus → Rivera
    { _coachKey: "coach1", _athleteKey: "athlete3" }, // Sofia → Hayes
    { _coachKey: "coach2", _athleteKey: "athlete3" }, // Sofia → Rivera
    { _coachKey: "coach1", _athleteKey: "athlete4" }, // Jamal → Hayes
    { _coachKey: "coach2", _athleteKey: "athlete5" }, // Aisha → Rivera
    // Devon (athlete6) intentionally has no roster entry
  ],

  // Activity templates — athleteKey resolved after creation
  activities: [
    // Tyler (athlete1) — 5 records — high traction
    { _athleteKey: "athlete1", activity_type: "phone_call",      school_name: "Florida",     coach_name: "__hc_ft_Coach Adams",   coach_title: "Offensive Coordinator", notes: "Initial call about program fit.",      daysAgo: 55 },
    { _athleteKey: "athlete1", activity_type: "phone_call",      school_name: "Auburn",      coach_name: "__hc_ft_Coach Baker",   coach_title: "Head Coach",            notes: "Follow-up call.",                      daysAgo: 40 },
    { _athleteKey: "athlete1", activity_type: "unofficial_visit",school_name: "Georgia",     coach_name: "__hc_ft_Coach Carter",  coach_title: "QB Coach",              notes: "Campus visit, toured facilities.",     daysAgo: 30 },
    { _athleteKey: "athlete1", activity_type: "offer_received",  school_name: "Florida",     coach_name: "__hc_ft_Coach Adams",   coach_title: "Offensive Coordinator", notes: "Verbal offer extended.",               daysAgo: 15 },
    { _athleteKey: "athlete1", activity_type: "email",           school_name: "Tennessee",   coach_name: "__hc_ft_Coach Davis",   coach_title: "Recruiting Coordinator",notes: "Scholarship information packet sent.", daysAgo: 5  },

    // Marcus (athlete2) — 2 records — moderate
    { _athleteKey: "athlete2", activity_type: "phone_call",      school_name: "Penn State",  coach_name: "__hc_ft_Coach Evans",   coach_title: "Wide Receivers Coach",  notes: "Introduction call.",                   daysAgo: 45 },
    { _athleteKey: "athlete2", activity_type: "email",           school_name: "Ohio State",  coach_name: "__hc_ft_Coach Foster",  coach_title: "Recruiting Coordinator",notes: "Program brochure sent.",               daysAgo: 20 },

    // Sofia (athlete3) — 4 records — high traction, both coaches
    { _athleteKey: "athlete3", activity_type: "phone_call",      school_name: "Florida",     coach_name: "__hc_ft_Coach Garcia",  coach_title: "Defensive Coordinator", notes: "Initial contact.",                     daysAgo: 50 },
    { _athleteKey: "athlete3", activity_type: "phone_call",      school_name: "Georgia",     coach_name: "__hc_ft_Coach Harris",  coach_title: "DB Coach",              notes: "Scheme overview call.",                daysAgo: 35 },
    { _athleteKey: "athlete3", activity_type: "unofficial_visit",school_name: "Auburn",      coach_name: "__hc_ft_Coach Harris",  coach_title: "DB Coach",              notes: "Unofficial campus visit.",             daysAgo: 22 },
    { _athleteKey: "athlete3", activity_type: "offer_received",  school_name: "Georgia",     coach_name: "__hc_ft_Coach Harris",  coach_title: "DB Coach",              notes: "Scholarship offer letter received.",   daysAgo: 8  },

    // Jamal (athlete4) — 1 record — camp-focused / low activity
    { _athleteKey: "athlete4", activity_type: "email",           school_name: "Tennessee",   coach_name: "__hc_ft_Coach Irving",  coach_title: "Recruiting Coordinator",notes: "Camp invitation email sent.",          daysAgo: 28 },

    // Aisha (athlete5) — 2 records — moderate
    { _athleteKey: "athlete5", activity_type: "phone_call",      school_name: "Penn State",  coach_name: "__hc_ft_Coach Jones",   coach_title: "Linebackers Coach",     notes: "Initial recruiting call.",             daysAgo: 38 },
    { _athleteKey: "athlete5", activity_type: "text_message",    school_name: "Ohio State",  coach_name: "__hc_ft_Coach Kim",     coach_title: "Recruiting Coordinator",notes: "Quick check-in text.",                 daysAgo: 12 },

    // Devon (athlete6) — 0 records — sparse state (intentionally empty)
  ],
};

// ---------------------------------------------------------------------------
// discoverSeeds — query all entities for __hc_ft_ records
// ---------------------------------------------------------------------------

export async function discoverSeeds(base44) {
  const [coaches, athletes, rosters, activities] = await Promise.all([
    base44.entities.Coach.filter({}).catch(() => []),
    base44.entities.AthleteProfile.filter({}).catch(() => []),
    base44.entities.CoachRoster.filter({}).catch(() => []),
    base44.entities.RecruitingActivity.filter({}).catch(() => []),
  ]);

  return {
    coaches:    coaches.filter(r => _isSeedRecord(r, ["first_name", "last_name", "account_id", "invite_code"])),
    athletes:   athletes.filter(r => _isSeedRecord(r, ["athlete_name", "account_id"])),
    rosters:    rosters.filter(r => _isSeedRecord(r, ["invite_code", "account_id", "athlete_id", "coach_id"])),
    activities: activities.filter(r => _isSeedRecord(r, ["account_id", "athlete_id", "coach_name"])),
  };
}

/** Returns true if any of the listed fields on record starts with SEED_PREFIX */
function _isSeedRecord(record, fields) {
  return fields.some(f => typeof record[f] === "string" && record[f].startsWith(SEED_PREFIX));
}

// ---------------------------------------------------------------------------
// deleteAllSeeds
// ---------------------------------------------------------------------------

export async function deleteAllSeeds(base44) {
  const found = await discoverSeeds(base44);
  let deleted = 0;
  const errors = [];

  const allDeletions = [
    ...found.activities.map(r => ({ entity: base44.entities.RecruitingActivity, id: r.id, label: `RecruitingActivity:${r.id}` })),
    ...found.rosters.map(r =>    ({ entity: base44.entities.CoachRoster,        id: r.id, label: `CoachRoster:${r.id}` })),
    ...found.athletes.map(r =>   ({ entity: base44.entities.AthleteProfile,     id: r.id, label: `AthleteProfile:${r.id}` })),
    ...found.coaches.map(r =>    ({ entity: base44.entities.Coach,              id: r.id, label: `Coach:${r.id}` })),
  ];

  for (const item of allDeletions) {
    try {
      await item.entity.delete(item.id);
      deleted++;
    } catch (err) {
      errors.push(`Failed to delete ${item.label}: ${err?.message || err}`);
    }
  }

  return { deleted, errors };
}

// ---------------------------------------------------------------------------
// seedTopology
// ---------------------------------------------------------------------------

export async function seedTopology(base44) {
  // Guard: refuse to seed if records already exist — prevents duplicate records
  // accumulating across multiple seed runs. Use resetTopology to wipe and reseed.
  const existing = await discoverSeeds(base44);
  const totalExisting =
    existing.coaches.length + existing.athletes.length +
    existing.rosters.length + existing.activities.length;
  if (totalExisting > 0) {
    throw new Error(
      `Seed records already exist (${totalExisting} found: ` +
      `${existing.coaches.length} coaches, ${existing.athletes.length} athletes, ` +
      `${existing.rosters.length} rosters, ${existing.activities.length} activities). ` +
      `Use Reset & Reseed to delete existing records and start fresh.`
    );
  }

  const seededAt = new Date().toISOString();

  // --- Phase 1: Coaches ---
  const coaches = [];
  for (const def of FT_TOPOLOGY.coaches) {
    const { _key, ...data } = def;
    const record = await base44.entities.Coach.create(data);
    coaches.push({ ...record, _key });
  }

  // Build lookup maps
  const coachById  = Object.fromEntries(coaches.map(c => [c._key, c]));

  // --- Phase 2: Athletes ---
  const athletes = [];
  for (const def of FT_TOPOLOGY.athletes) {
    const { _key, family, ...data } = def;
    const record = await base44.entities.AthleteProfile.create(data);
    athletes.push({ ...record, _key, family });
  }

  const athleteById = Object.fromEntries(athletes.map(a => [a._key, a]));

  // --- Phase 3: CoachRoster links ---
  const rosters = [];
  for (const def of FT_TOPOLOGY.rosters) {
    const coach   = coachById[def._coachKey];
    const athlete = athleteById[def._athleteKey];
    if (!coach || !athlete) continue;

    const record = await base44.entities.CoachRoster.create({
      coach_id:     coach.id,
      account_id:   athlete.account_id,
      athlete_id:   athlete.id,
      athlete_name: `${athlete.first_name} ${athlete.last_name}`,
      invite_code:  coach.invite_code,
      joined_at:    new Date().toISOString().slice(0, 10),
    });
    rosters.push(record);
  }

  // --- Phase 4: RecruitingActivity records ---
  const activities = [];
  for (const def of FT_TOPOLOGY.activities) {
    const { _athleteKey, daysAgo, ...data } = def;
    const athlete = athleteById[_athleteKey];
    if (!athlete) continue;

    const record = await base44.entities.RecruitingActivity.create({
      ...data,
      account_id:    athlete.account_id,
      athlete_id:    athlete.id,
      activity_date: isoDateAgo(daysAgo),
    });
    activities.push(record);
  }

  const totalRecords = coaches.length + athletes.length + rosters.length + activities.length;

  return {
    coaches,
    athletes,
    rosters,
    activities,
    meta: { seededAt, version: SEED_VERSION, totalRecords },
  };
}

// ---------------------------------------------------------------------------
// resetTopology — delete existing seeds then reseed
// ---------------------------------------------------------------------------

export async function resetTopology(base44) {
  await deleteAllSeeds(base44);
  return seedTopology(base44);
}

// ---------------------------------------------------------------------------
// verifyTopology
// ---------------------------------------------------------------------------

export async function verifyTopology(base44) {
  const notes    = [];
  const warnings = [];
  const errors   = [];
  const scenarios = {
    multiAthleteHousehold: false,
    athleteTiedToCoach1Only: false,
    athleteTiedToCoach2Only: false,
    athleteTiedToBothCoaches: false,
    highTractionAthlete: false,
    moderateTractionAthlete: false,
    campFocusedAthlete: false,
    sparseDataAthlete: false,
  };

  // Discover current seeds
  const { coaches, athletes, rosters, activities } = await discoverSeeds(base44);

  const counts = {
    coaches:    coaches.length,
    athletes:   athletes.length,
    rosters:    rosters.length,
    activities: activities.length,
  };

  // --- Coach check ---
  const hayes  = coaches.find(c => c.last_name === "Hayes"  && c.invite_code === "__hc_ft_HAYES-001");
  const rivera = coaches.find(c => c.last_name === "Rivera" && c.invite_code === "__hc_ft_RIVERA-001");

  if (!hayes)  errors.push("Coach Hayes missing (invite_code __hc_ft_HAYES-001 not found)");
  if (!rivera) errors.push("Coach Rivera missing (invite_code __hc_ft_RIVERA-001 not found)");

  if (coaches.length !== 2) {
    warnings.push(`Expected 2 seed coaches, found ${coaches.length}`);
  }

  // --- Athlete check ---
  // Use athlete_name + grad_year as stable identifiers — account_id may have been
  // updated to a real user ID via claimSlot, so it is no longer a reliable lookup key.
  const findAthlete = (athleteName, gradYear) =>
    athletes.find(a => a.athlete_name === athleteName && a.grad_year === gradYear);

  const tyler  = findAthlete("__hc_ft_Test Johnson",  2026);
  const marcus = findAthlete("__hc_ft_Test Johnson",  2027);
  const sofia  = findAthlete("__hc_ft_Test Martinez", 2026);
  const jamal  = findAthlete("__hc_ft_Test Williams", 2026);
  const aisha  = findAthlete("__hc_ft_Test Davis",    2027);
  const devon  = findAthlete("__hc_ft_Test Brown",    2028);

  if (!tyler)  errors.push("Athlete Test Johnson 2026 (family1) missing");
  if (!marcus) errors.push("Athlete Test Johnson 2027 (family1) missing");
  if (!sofia)  errors.push("Athlete Test Martinez (family2) missing");
  if (!jamal)  errors.push("Athlete Test Williams (family3) missing");
  if (!aisha)  errors.push("Athlete Test Davis (family4) missing");
  if (!devon)  errors.push("Athlete Test Brown (family5) missing");

  if (athletes.length !== 6) {
    warnings.push(`Expected 6 seed athletes, found ${athletes.length}`);
  }

  // --- Scenario 1: Multi-athlete household ---
  // Use athlete_name lookup (stable) rather than account_id (may be a real UUID after claim)
  scenarios.multiAthleteHousehold = tyler !== undefined && marcus !== undefined;
  if (!scenarios.multiAthleteHousehold) {
    errors.push("Scenario 1 FAIL: family1 does not have 2+ athletes");
  } else {
    notes.push("Scenario 1 OK: family1 has 2 athletes (Tyler + Marcus)");
  }

  // --- Roster helpers ---
  const rostersForAthlete = (athlete) =>
    athlete ? rosters.filter(r => r.athlete_id === athlete.id) : [];

  const rosterLinkedToCoach = (athlete, coach) =>
    coach && athlete
      ? rosters.some(r => r.athlete_id === athlete.id && r.coach_id === coach.id)
      : false;

  // --- Scenario 2: Athlete tied to Coach 1 only ---
  const tylerRosters  = rostersForAthlete(tyler);
  const jamalRosters  = rostersForAthlete(jamal);
  const tylerHayes    = rosterLinkedToCoach(tyler,  hayes);
  const tylerRivera   = rosterLinkedToCoach(tyler,  rivera);
  const jamalHayes    = rosterLinkedToCoach(jamal,  hayes);
  const jamalRivera   = rosterLinkedToCoach(jamal,  rivera);

  scenarios.athleteTiedToCoach1Only =
    (tylerHayes && !tylerRivera) || (jamalHayes && !jamalRivera);
  if (!scenarios.athleteTiedToCoach1Only) {
    errors.push("Scenario 2 FAIL: no athlete exclusively tied to Coach Hayes (coach1)");
  } else {
    notes.push("Scenario 2 OK: Tyler and/or Jamal tied to Coach Hayes only");
  }

  // --- Scenario 3: Athlete tied to Coach 2 only ---
  const marcusHayes  = rosterLinkedToCoach(marcus, hayes);
  const marcusRivera = rosterLinkedToCoach(marcus, rivera);
  const aishaHayes   = rosterLinkedToCoach(aisha,  hayes);
  const aishaRivera  = rosterLinkedToCoach(aisha,  rivera);

  scenarios.athleteTiedToCoach2Only =
    (!marcusHayes && marcusRivera) || (!aishaHayes && aishaRivera);
  if (!scenarios.athleteTiedToCoach2Only) {
    errors.push("Scenario 3 FAIL: no athlete exclusively tied to Coach Rivera (coach2)");
  } else {
    notes.push("Scenario 3 OK: Marcus and/or Aisha tied to Coach Rivera only");
  }

  // --- Scenario 4: Athlete tied to both coaches ---
  const sofiaHayes  = rosterLinkedToCoach(sofia, hayes);
  const sofiaRivera = rosterLinkedToCoach(sofia, rivera);
  scenarios.athleteTiedToBothCoaches = sofiaHayes && sofiaRivera;
  if (!scenarios.athleteTiedToBothCoaches) {
    errors.push("Scenario 4 FAIL: Sofia not linked to both coaches");
  } else {
    notes.push("Scenario 4 OK: Sofia linked to both Coach Hayes and Coach Rivera");
  }

  // --- Activity helpers ---
  const activitiesForAthlete = (athlete) =>
    athlete ? activities.filter(a => a.athlete_id === athlete.id) : [];

  const tylerActs  = activitiesForAthlete(tyler);
  const marcusActs = activitiesForAthlete(marcus);
  const sofiaActs  = activitiesForAthlete(sofia);
  const jamalActs  = activitiesForAthlete(jamal);
  const aishaActs  = activitiesForAthlete(aisha);
  const devonActs  = activitiesForAthlete(devon);

  // --- Scenario 5: High-traction athlete (≥4 activity records) ---
  scenarios.highTractionAthlete =
    tylerActs.length >= 4 || sofiaActs.length >= 4;
  if (!scenarios.highTractionAthlete) {
    errors.push(`Scenario 5 FAIL: neither Tyler (${tylerActs.length}) nor Sofia (${sofiaActs.length}) has ≥4 activities`);
  } else {
    notes.push(`Scenario 5 OK: Tyler=${tylerActs.length} acts, Sofia=${sofiaActs.length} acts`);
  }

  // --- Scenario 6: Moderate-traction athlete (≥2 records) ---
  scenarios.moderateTractionAthlete =
    marcusActs.length >= 2 || aishaActs.length >= 2;
  if (!scenarios.moderateTractionAthlete) {
    warnings.push(`Scenario 6 WARN: neither Marcus (${marcusActs.length}) nor Aisha (${aishaActs.length}) has ≥2 activities`);
  } else {
    notes.push(`Scenario 6 OK: Marcus=${marcusActs.length} acts, Aisha=${aishaActs.length} acts`);
  }

  // --- Scenario 7: Camp-focused athlete (Jamal) ---
  // Jamal is designated camp-focused even with only 1 activity record
  scenarios.campFocusedAthlete = jamal !== undefined;
  if (!scenarios.campFocusedAthlete) {
    errors.push("Scenario 7 FAIL: Jamal (camp-focused athlete) not found");
  } else {
    notes.push(`Scenario 7 OK: Jamal present as camp-focused athlete (${jamalActs.length} activity records)`);
  }

  // --- Scenario 8: Sparse-data athlete (Devon — 0 records, no coach) ---
  const devonRosters = rostersForAthlete(devon);
  scenarios.sparseDataAthlete =
    devon !== undefined && devonActs.length === 0 && devonRosters.length === 0;
  if (!scenarios.sparseDataAthlete) {
    if (!devon) {
      errors.push("Scenario 8 FAIL: Devon (sparse athlete) not found");
    } else {
      warnings.push(`Scenario 8 WARN: Devon found but has ${devonActs.length} activities and ${devonRosters.length} roster links (expected 0 each)`);
    }
  } else {
    notes.push("Scenario 8 OK: Devon has 0 activities and 0 roster links (sparse state confirmed)");
  }

  // --- Roster count check ---
  if (rosters.length !== 6) {
    warnings.push(`Expected 6 CoachRoster records, found ${rosters.length}`);
  }

  if (activities.length !== 15) {
    warnings.push(`Expected 15 RecruitingActivity records, found ${activities.length}`);
  }

  // --- Determine overall status ---
  let status;
  if (errors.length > 0) {
    const allMissing =
      counts.coaches === 0 && counts.athletes === 0 &&
      counts.rosters === 0 && counts.activities === 0;
    status = allMissing ? "missing" : "broken";
  } else if (warnings.length > 0) {
    status = "partial";
  } else {
    status = "ready";
  }

  return { status, scenarios, notes, warnings, errors, counts };
}

// ---------------------------------------------------------------------------
// lookupAccountByEmail — find a real Base44 account ID from an email address.
// Returns { id, email, full_name } or null if not found.
// ---------------------------------------------------------------------------

export async function lookupAccountByEmail(base44, email) {
  if (!email) return null;
  const users = await base44.entities.User.filter({ email: email.trim().toLowerCase() }).catch(() => []);
  if (!users || users.length === 0) return null;
  return users[0];
}

// ---------------------------------------------------------------------------
// SLOT_MAP — stable definitions for the 7 account slots.
// Keyed by slotKey; used by claimSlot / releaseSlot to find and patch records
// even after account_id has been updated to a real user ID.
// ---------------------------------------------------------------------------

export const SLOT_MAP = {
  family1: {
    type: "family",
    label: "Family 1",
    desc: "Test Johnson QB '26 · Test Johnson WR '27",
    syntheticId: "__hc_ft_family1",
    athletes: [
      { athleteName: "__hc_ft_Test Johnson", gradYear: 2026 },
      { athleteName: "__hc_ft_Test Johnson", gradYear: 2027 },
    ],
  },
  family2: {
    type: "family",
    label: "Family 2",
    desc: "Test Martinez DB '26",
    syntheticId: "__hc_ft_family2",
    athletes: [{ athleteName: "__hc_ft_Test Martinez", gradYear: 2026 }],
  },
  family3: {
    type: "family",
    label: "Family 3",
    desc: "Test Williams RB '26",
    syntheticId: "__hc_ft_family3",
    athletes: [{ athleteName: "__hc_ft_Test Williams", gradYear: 2026 }],
  },
  family4: {
    type: "family",
    label: "Family 4",
    desc: "Test Davis LB '27",
    syntheticId: "__hc_ft_family4",
    athletes: [{ athleteName: "__hc_ft_Test Davis", gradYear: 2027 }],
  },
  family5: {
    type: "family",
    label: "Family 5",
    desc: "Test Brown OL '28 (sparse)",
    syntheticId: "__hc_ft_family5",
    athletes: [{ athleteName: "__hc_ft_Test Brown", gradYear: 2028 }],
  },
  coach1: {
    type: "coach",
    label: "Coach Hayes",
    desc: "TestCoach Hayes — Riverside High",
    syntheticId: "__hc_ft_coach1_account",
    inviteCode: "__hc_ft_HAYES-001",
  },
  coach2: {
    type: "coach",
    label: "Coach Rivera",
    desc: "TestCoach Rivera — Lincoln Academy",
    syntheticId: "__hc_ft_coach2_account",
    inviteCode: "__hc_ft_RIVERA-001",
  },
};

// ---------------------------------------------------------------------------
// claimSlot — link a real Base44 account ID to a seed account slot.
// Updates account_id on AthleteProfile + CoachRoster (family slots)
// or Coach (coach slots). Pass slot.syntheticId as realId to release.
//
// @param base44    — Base44 client
// @param slotKey   — key in SLOT_MAP ("family1"…"family5" | "coach1" | "coach2")
// @param realId    — the real account ID to write (or syntheticId to release)
// @returns {{ updated: number, errors: string[] }}
// ---------------------------------------------------------------------------

export async function claimSlot(base44, slotKey, realId) {
  const slot = SLOT_MAP[slotKey];
  if (!slot) throw new Error(`Unknown slot key: ${slotKey}`);

  const [allAthletes, allRosters, allCoaches] = await Promise.all([
    base44.entities.AthleteProfile.filter({}).catch(() => []),
    base44.entities.CoachRoster.filter({}).catch(() => []),
    base44.entities.Coach.filter({}).catch(() => []),
  ]);

  let updated = 0;
  const errors = [];

  if (slot.type === "family") {
    for (const def of slot.athletes) {
      const record = allAthletes.find(
        a => a.athlete_name === def.athleteName && a.grad_year === def.gradYear
      );
      if (!record) {
        errors.push(`AthleteProfile not found: ${def.athleteName} ${def.gradYear}`);
        continue;
      }
      try {
        await base44.entities.AthleteProfile.update(record.id, { account_id: realId });
        updated++;
      } catch (e) {
        errors.push(`AthleteProfile ${record.id}: ${e?.message}`);
      }
      // Update roster records that link this athlete to a coach
      const athleteRosters = allRosters.filter(r => r.athlete_id === record.id);
      for (const r of athleteRosters) {
        try {
          await base44.entities.CoachRoster.update(r.id, { account_id: realId });
          updated++;
        } catch (e) {
          errors.push(`CoachRoster ${r.id}: ${e?.message}`);
        }
      }
    }
  } else if (slot.type === "coach") {
    const record = allCoaches.find(c => c.invite_code === slot.inviteCode);
    if (!record) {
      errors.push(`Coach not found: invite_code ${slot.inviteCode}`);
    } else {
      try {
        await base44.entities.Coach.update(record.id, { account_id: realId });
        updated++;
      } catch (e) {
        errors.push(`Coach ${record.id}: ${e?.message}`);
      }
    }
  }

  return { updated, errors };
}

// ---------------------------------------------------------------------------
// releaseSlot — revert a seed account slot back to its synthetic account_id.
// ---------------------------------------------------------------------------

export async function releaseSlot(base44, slotKey) {
  const slot = SLOT_MAP[slotKey];
  if (!slot) throw new Error(`Unknown slot key: ${slotKey}`);
  return claimSlot(base44, slotKey, slot.syntheticId);
}
