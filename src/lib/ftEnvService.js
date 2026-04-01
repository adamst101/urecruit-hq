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
      first_name: "__hc_ft_Coach",
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
      first_name: "__hc_ft_Coach",
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
      first_name: "__hc_ft_Tyler",
      last_name: "Johnson",
      athlete_name: "__hc_ft_Tyler Johnson",
      account_id: "__hc_ft_family1",
      grad_year: 2026,
      sport_id: "football",
      position: "QB",
      active: true,
    },
    {
      _key: "athlete2",
      family: "family1",
      first_name: "__hc_ft_Marcus",
      last_name: "Johnson",
      athlete_name: "__hc_ft_Marcus Johnson",
      account_id: "__hc_ft_family1",
      grad_year: 2027,
      sport_id: "football",
      position: "WR",
      active: true,
    },
    {
      _key: "athlete3",
      family: "family2",
      first_name: "__hc_ft_Sofia",
      last_name: "Martinez",
      athlete_name: "__hc_ft_Sofia Martinez",
      account_id: "__hc_ft_family2",
      grad_year: 2026,
      sport_id: "football",
      position: "DB",
      active: true,
    },
    {
      _key: "athlete4",
      family: "family3",
      first_name: "__hc_ft_Jamal",
      last_name: "Williams",
      athlete_name: "__hc_ft_Jamal Williams",
      account_id: "__hc_ft_family3",
      grad_year: 2026,
      sport_id: "football",
      position: "RB",
      active: true,
    },
    {
      _key: "athlete5",
      family: "family4",
      first_name: "__hc_ft_Aisha",
      last_name: "Davis",
      athlete_name: "__hc_ft_Aisha Davis",
      account_id: "__hc_ft_family4",
      grad_year: 2027,
      sport_id: "football",
      position: "LB",
      active: true,
    },
    {
      _key: "athlete6",
      family: "family5",
      first_name: "__hc_ft_Devon",
      last_name: "Brown",
      athlete_name: "__hc_ft_Devon Brown",
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
    athletes:   athletes.filter(r => _isSeedRecord(r, ["first_name", "last_name", "account_id"])),
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
  const findAthlete = (lastName, accountId) =>
    athletes.find(a => a.last_name === lastName && a.account_id === accountId);

  const tyler  = findAthlete("Johnson",  "__hc_ft_family1");  // first match = Tyler
  const marcus = athletes.find(a => a.first_name === "__hc_ft_Marcus" && a.account_id === "__hc_ft_family1");
  const sofia  = findAthlete("Martinez", "__hc_ft_family2");
  const jamal  = findAthlete("Williams", "__hc_ft_family3");
  const aisha  = findAthlete("Davis",    "__hc_ft_family4");
  const devon  = findAthlete("Brown",    "__hc_ft_family5");

  if (!tyler)  errors.push("Athlete Tyler Johnson (family1) missing");
  if (!marcus) errors.push("Athlete Marcus Johnson (family1) missing");
  if (!sofia)  errors.push("Athlete Sofia Martinez (family2) missing");
  if (!jamal)  errors.push("Athlete Jamal Williams (family3) missing");
  if (!aisha)  errors.push("Athlete Aisha Davis (family4) missing");
  if (!devon)  errors.push("Athlete Devon Brown (family5) missing");

  if (athletes.length !== 6) {
    warnings.push(`Expected 6 seed athletes, found ${athletes.length}`);
  }

  // --- Scenario 1: Multi-athlete household ---
  const family1Athletes = athletes.filter(a => a.account_id === "__hc_ft_family1");
  scenarios.multiAthleteHousehold = family1Athletes.length >= 2;
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
