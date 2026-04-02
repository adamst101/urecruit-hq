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

export const SEED_VERSION = "1.2.0";
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
      _key: "athlete1", family: "family1",
      first_name: "Test", last_name: "Johnson", athlete_name: "__hc_ft_Test Johnson",
      account_id: "__hc_ft_family1", grad_year: 2026, sport_id: "football", position: "QB", active: true,
      home_city: "Alpharetta", home_state: "GA", height_ft: 6, height_in: 2, weight_lbs: 195,
      player_email: "tyler.johnson.ft@fttest.invalid", x_handle: "@TylerJohnsonQB26",
      parent_first_name: "David",  parent_last_name: "Johnson",  parent_phone: "555-201-0001",
    },
    {
      _key: "athlete2", family: "family1",
      first_name: "Test", last_name: "Johnson2", athlete_name: "__hc_ft_Test Johnson2",
      account_id: "__hc_ft_family1", grad_year: 2027, sport_id: "football", position: "WR", active: true,
      home_city: "Alpharetta", home_state: "GA", height_ft: 6, height_in: 0, weight_lbs: 175,
      player_email: "marcus.johnson2.ft@fttest.invalid", x_handle: "@MarcusJohnson2WR27",
      parent_first_name: "David",  parent_last_name: "Johnson",  parent_phone: "555-201-0001",
    },
    {
      _key: "athlete3", family: "family2",
      first_name: "Test", last_name: "Martinez", athlete_name: "__hc_ft_Test Martinez",
      account_id: "__hc_ft_family2", grad_year: 2026, sport_id: "football", position: "DB", active: true,
      home_city: "Tampa",       home_state: "FL", height_ft: 5, height_in: 10, weight_lbs: 165,
      player_email: "sofia.martinez.ft@fttest.invalid", x_handle: "@SofiaMartinezDB26",
      parent_first_name: "Maria",  parent_last_name: "Martinez", parent_phone: "555-202-0003",
    },
    {
      _key: "athlete4", family: "family3",
      first_name: "Test", last_name: "Williams", athlete_name: "__hc_ft_Test Williams",
      account_id: "__hc_ft_family3", grad_year: 2026, sport_id: "football", position: "RB", active: true,
      home_city: "Houston",     home_state: "TX", height_ft: 5, height_in: 11, weight_lbs: 205,
      player_email: "jamal.williams.ft@fttest.invalid", x_handle: "@JamalWilliamsRB26",
      parent_first_name: "Robert", parent_last_name: "Williams", parent_phone: "555-203-0004",
    },
    {
      _key: "athlete5", family: "family4",
      first_name: "Test", last_name: "Davis", athlete_name: "__hc_ft_Test Davis",
      account_id: "__hc_ft_family4", grad_year: 2027, sport_id: "football", position: "LB", active: true,
      home_city: "Atlanta",     home_state: "GA", height_ft: 6, height_in: 1,  weight_lbs: 225,
      player_email: "aisha.davis.ft@fttest.invalid",    x_handle: "@AishaDavisLB27",
      parent_first_name: "Lisa",   parent_last_name: "Davis",    parent_phone: "555-204-0005",
    },
    {
      _key: "athlete6", family: "family5",
      first_name: "Test", last_name: "Brown", athlete_name: "__hc_ft_Test Brown",
      account_id: "__hc_ft_family5", grad_year: 2028, sport_id: "football", position: "OL", active: true,
      home_city: "Charlotte",   home_state: "NC", height_ft: 6, height_in: 4,  weight_lbs: 285,
      player_email: "devon.brown.ft@fttest.invalid",    x_handle: "@DevonBrownOL28",
      parent_first_name: "James",  parent_last_name: "Brown",    parent_phone: "555-205-0006",
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
// discoverSeeds — delegates to manageFtSeeds server function (PROD slot).
//
// WHY SERVER-SIDE: FT seed records are SR-created in the PROD data namespace
// via manageFtSeeds. Client-side entity reads use X-Origin-URL for routing,
// which sends them to the TEST namespace when the page is in test/preview
// context. The server function runs in PROD and uses SR to list its own
// records, which are PROD-namespaced.
// ---------------------------------------------------------------------------

export async function discoverSeeds(base44) {
  console.log("[ftEnvService] invoking manageFtSeeds action=discover");
  const res = await base44.functions.invoke("manageFtSeeds", { action: "discover" });
  const d = res?.data ?? res;
  console.log("[ftEnvService] manageFtSeeds discover raw:", JSON.stringify({
    ok: d?.ok,
    functionVersion: d?.functionVersion,
    executionContext: d?.executionContext,
    receivedFunctionsVersion: d?.receivedFunctionsVersion,
    receivedAppId: d?.receivedAppId,
    counts: { coaches: d?.coaches?.length, athletes: d?.athletes?.length, rosters: d?.rosters?.length, activities: d?.activities?.length },
  }));
  if (!d?.ok) throw new Error(d?.error || "manageFtSeeds discover failed");
  return {
    coaches:     d.coaches     ?? [],
    athletes:    d.athletes    ?? [],
    rosters:     d.rosters     ?? [],
    activities:  d.activities  ?? [],
    campIntents: d.campIntents ?? [],
  };
}

// ---------------------------------------------------------------------------
// deleteAllSeeds — delegates to manageFtSeeds server function (PROD slot).
// ---------------------------------------------------------------------------

export async function deleteAllSeeds(base44) {
  const res = await base44.functions.invoke("manageFtSeeds", { action: "delete" });
  const d = res?.data ?? res;
  if (!d?.ok) throw new Error(d?.error || "manageFtSeeds delete failed");
  return { deleted: d.deleted ?? 0, errors: d.errors ?? [] };
}

// ---------------------------------------------------------------------------
// checkSeedIntegrity — delegates to manageFtSeeds server function (PROD slot).
// ---------------------------------------------------------------------------

export async function checkSeedIntegrity(base44) {
  const res = await base44.functions.invoke("manageFtSeeds", { action: "integrity" });
  const d = res?.data ?? res;
  if (!d?.ok) throw new Error(d?.error || "manageFtSeeds integrity failed");
  return {
    ok:                      d.ok,
    counts:                  d.counts           ?? { coaches: 0, athletes: 0, rosters: 0, activities: 0 },
    perAthleteStats:         d.perAthleteStats  ?? [],
    family2AthleteId:        d.family2AthleteId ?? null,
    family2ActivityCount:    d.family2ActivityCount    ?? null,
    family2CampIntentCount:  d.family2CampIntentCount  ?? null,
    family2FavoriteCount:    d.family2FavoriteCount    ?? null,
    family2RegisteredCount:  d.family2RegisteredCount  ?? null,
    family2NullCampIdCount:  d.family2NullCampIdCount  ?? null,
    family2CampIntentIds:    d.family2CampIntentIds    ?? [],
    athleteIds:              d.athleteIds       ?? [],
    issues:                  d.issues           ?? [],
  };
}

// ---------------------------------------------------------------------------
// campCheck — deep verification of family2 CampIntent rows and Camp joins.
// ---------------------------------------------------------------------------

export async function campCheck(base44) {
  const res = await base44.functions.invoke("manageFtSeeds", { action: "camp_check" });
  const d = res?.data ?? res;
  if (d == null) throw new Error("campCheck: no response from manageFtSeeds");
  if (!d.ok && d.error) throw new Error(d.error);
  return {
    ok:                          d.ok ?? false,
    family2AthleteId:            d.family2AthleteId            ?? null,
    family2AthleteAccountId:     d.family2AthleteAccountId     ?? null,
    totalCampIntents:            d.totalCampIntents            ?? 0,
    favoriteCount:               d.favoriteCount               ?? 0,
    registeredCount:             d.registeredCount             ?? 0,
    nullCampIdCount:             d.nullCampIdCount             ?? 0,
    matchedCampCount:            d.matchedCampCount            ?? 0,
    staleCount:                  d.staleCount                  ?? 0,
    intentRows:                  d.intentRows                  ?? [],
    staleRows:                   d.staleRows                   ?? [],
    workspaceCampsSaved:         d.workspaceCampsSaved         ?? 0,
    workspaceUpcomingCamps:      d.workspaceUpcomingCamps      ?? 0,
    myCampsFavoritesRenderable:  d.myCampsFavoritesRenderable  ?? 0,
    myCampsRegisteredRenderable: d.myCampsRegisteredRenderable ?? 0,
  };
}

// ---------------------------------------------------------------------------
// seedTopology — delegates to manageFtSeeds server function (PROD slot).
//
// WHY SERVER-SIDE: Client-side entity creates route to TEST data when
// the page is viewed in Base44's test/preview context (X-Origin-URL routing).
// manageFtSeeds runs in PROD, uses SR, writes to PROD data namespace.
// ---------------------------------------------------------------------------

export async function seedTopology(base44, { envLabel = "default" } = {}) {
  console.log("[ftEnvService] invoking manageFtSeeds action=seed");
  const res = await base44.functions.invoke("manageFtSeeds", { action: "seed" });
  const d = res?.data ?? res;
  console.log("[ftEnvService] manageFtSeeds seed raw:", JSON.stringify({
    ok: d?.ok,
    functionVersion: d?.functionVersion,
    executionContext: d?.executionContext,
    receivedFunctionsVersion: d?.receivedFunctionsVersion,
    receivedAppId: d?.receivedAppId,
    version: d?.version,
    totalRecords: d?.totalRecords,
    firstAthleteIds: d?.firstAthleteIds,
    firstCoachIds: d?.firstCoachIds,
    postWriteVerify: d?.postWriteVerify,
    error: d?.error,
  }));
  if (!d?.ok) throw new Error(d?.error || "manageFtSeeds seed failed");
  return {
    coaches:    d.coaches    ?? [],
    athletes:   d.athletes   ?? [],
    rosters:    d.rosters    ?? [],
    activities: d.activities ?? [],
    meta: {
      seededAt:     new Date().toISOString(),
      version:      d.version   ?? SEED_VERSION,
      totalRecords: d.totalRecords ?? 0,
      envLabel,
    },
  };
}

// ---------------------------------------------------------------------------
// resetTopology — delegates to manageFtSeeds server function (PROD slot).
// ---------------------------------------------------------------------------

export async function resetTopology(base44, opts = {}) {
  const envLabel = opts.envLabel ?? "default";
  console.log("[ftEnvService] invoking manageFtSeeds action=reset");
  const res = await base44.functions.invoke("manageFtSeeds", { action: "reset" });
  const d = res?.data ?? res;
  console.log("[ftEnvService] manageFtSeeds reset raw:", JSON.stringify({
    ok: d?.ok,
    functionVersion: d?.functionVersion,
    executionContext: d?.executionContext,
    receivedFunctionsVersion: d?.receivedFunctionsVersion,
    receivedAppId: d?.receivedAppId,
    version: d?.version,
    totalRecords: d?.totalRecords,
    firstAthleteIds: d?.firstAthleteIds,
    firstCoachIds: d?.firstCoachIds,
    postWriteVerify: d?.postWriteVerify,
    error: d?.error,
  }));
  if (!d?.ok) throw new Error(d?.error || "manageFtSeeds reset failed");
  return {
    coaches:    d.coaches    ?? [],
    athletes:   d.athletes   ?? [],
    rosters:    d.rosters    ?? [],
    activities: d.activities ?? [],
    meta: {
      seededAt:     new Date().toISOString(),
      version:      d.version   ?? SEED_VERSION,
      totalRecords: d.totalRecords ?? 0,
      envLabel,
    },
  };
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
  const { coaches, athletes, rosters, activities, campIntents } = await discoverSeeds(base44);

  const counts = {
    coaches:    coaches.length,
    athletes:   athletes.length,
    rosters:    rosters.length,
    activities: activities.length,
    campIntents: campIntents.length,
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
  const marcus = findAthlete("__hc_ft_Test Johnson2", 2027);
  const sofia  = findAthlete("__hc_ft_Test Martinez", 2026);
  const jamal  = findAthlete("__hc_ft_Test Williams", 2026);
  const aisha  = findAthlete("__hc_ft_Test Davis",    2027);
  const devon  = findAthlete("__hc_ft_Test Brown",    2028);

  if (!tyler)  errors.push("Athlete Test Johnson 2026 (family1) missing");
  if (!marcus) errors.push("Athlete Test Johnson2 2027 (family1) missing");
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

  if (activities.length !== 14) {
    warnings.push(`Expected 14 RecruitingActivity records, found ${activities.length}`);
  }

  // --- Camp intent checks (v1.2) — per-athlete minimums and profile completeness ---
  const campIntentAthletes = [
    { athlete: tyler,  name: "Tyler Johnson",  minFav: 3, minReg: 2 },
    { athlete: marcus, name: "Marcus Johnson2", minFav: 3, minReg: 2 },
    { athlete: sofia,  name: "Sofia Martinez",  minFav: 3, minReg: 2 },
    { athlete: jamal,  name: "Jamal Williams",  minFav: 3, minReg: 2 },
    { athlete: aisha,  name: "Aisha Davis",     minFav: 3, minReg: 2 },
    { athlete: devon,  name: "Devon Brown",     minFav: 3, minReg: 2 },
  ];
  let totalCampIntents = 0;
  for (const { athlete, name, minFav, minReg } of campIntentAthletes) {
    if (!athlete) continue; // already reported as missing above
    const athleteId   = athlete.id;
    const aCampIntents = campIntents.filter(ci => ci.athlete_id === athleteId);
    const favCount  = aCampIntents.filter(ci => ci.status === "favorite").length;
    const regCount  = aCampIntents.filter(ci => ci.status === "registered").length;
    const nullCount = aCampIntents.filter(ci => !ci.camp_id).length;
    totalCampIntents += aCampIntents.length;
    if (favCount < minFav) warnings.push(`${name}: favCount=${favCount} < ${minFav} (run reset to rebuild)`);
    if (regCount < minReg) warnings.push(`${name}: regCount=${regCount} < ${minReg} (run reset to rebuild)`);
    if (nullCount > 0)     warnings.push(`${name}: ${nullCount} CampIntent(s) with null camp_id`);
    // Profile completeness
    if (!athlete.player_email)      warnings.push(`${name}: missing player_email`);
    if (!athlete.x_handle)          warnings.push(`${name}: missing x_handle`);
    if (!athlete.parent_first_name) warnings.push(`${name}: missing parent_first_name`);
    if (favCount >= minFav && regCount >= minReg && nullCount === 0) {
      notes.push(`Camp OK ${name}: fav=${favCount} reg=${regCount}`);
    }
  }
  if (campIntents.length > 0 && totalCampIntents === 0) {
    warnings.push(`${campIntents.length} CampIntent(s) found but none matched known athlete IDs`);
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
    desc: "Test Johnson QB '26 · Test Johnson2 WR '27",
    syntheticId: "__hc_ft_family1",
    athletes: [
      { athleteName: "__hc_ft_Test Johnson",  gradYear: 2026 },
      { athleteName: "__hc_ft_Test Johnson2", gradYear: 2027 },
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

// opts.previousRealId — the real account ID that previously held this slot,
// required on release so the server can clear its SchoolPreference athlete link.
export async function claimSlot(base44, slotKey, realId, opts = {}) {
  const slot = SLOT_MAP[slotKey];
  if (!slot) throw new Error(`Unknown slot key: ${slotKey}`);

  // Prefer server-side claim: uses asServiceRole so it can find seed profiles
  // that client-side filter({}) cannot see (created with synthetic account_id).
  // On release, previousRealId allows the server to clear the SchoolPreference link.
  try {
    const base = slot.type === "family"
      ? { type: "family", realId, syntheticId: slot.syntheticId, athletes: slot.athletes.map(d => ({ athleteName: d.athleteName, gradYear: d.gradYear })) }
      : { type: "coach", realId, syntheticId: slot.syntheticId, inviteCode: slot.inviteCode };
    const body = {
      ...base,
      ...(opts.previousRealId ? { previousRealId: opts.previousRealId } : {}),
      ...(opts.knownAthleteProfileIds?.length ? { knownAthleteProfileIds: opts.knownAthleteProfileIds } : {}),
    };

    const res = await base44.functions.invoke("claimSlotProfiles", body);
    console.log("[claimSlot] RAW claimSlotProfiles response:", JSON.stringify(res?.data ?? res));
    if (res?.data?.ok !== undefined) {
      const d = res.data;
      if (d.errors?.length) {
        d.errors.forEach(e => console.warn("[claimSlot] server warning:", e));
      }
      return {
        updated: d.updated ?? 0,
        errors: d.errors ?? [],
        athleteProfileIds: d.athleteProfileIds ?? [],
        athleteProfileReverted: d.athleteProfileReverted ?? null,
        schoolPreferenceUpdated: d.schoolPreferenceUpdated ?? null,
        rosterReverted: d.rosterReverted ?? null,
        _raw: d,
      };
    }
  } catch (fnErr) {
    console.warn("[claimSlot] server function failed, falling back to client-side:", fnErr?.message);
  }

  // Fallback: client-side (only works if records are owned by the current caller)
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
        errors.push(`AthleteProfile not found (client-side fallback): ${def.athleteName} ${def.gradYear}`);
        continue;
      }
      try {
        await base44.entities.AthleteProfile.update(record.id, { account_id: realId });
        updated++;
      } catch (e) {
        errors.push(`AthleteProfile ${record.id}: ${e?.message}`);
      }
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
// previousRealId: the real account that currently holds the slot — passed so
// the server can clear its SchoolPreference athlete link on release.
// ---------------------------------------------------------------------------

export async function releaseSlot(base44, slotKey, previousRealId, knownAthleteProfileIds = []) {
  const slot = SLOT_MAP[slotKey];
  if (!slot) throw new Error(`Unknown slot key: ${slotKey}`);
  return claimSlot(base44, slotKey, slot.syntheticId, { previousRealId, knownAthleteProfileIds });
}

// ---------------------------------------------------------------------------
// grantTestEntitlement — create an active Entitlement for the current season.
// Safe to call multiple times — skips creation if one already exists.
// Uses source: "ft_seed" so revokeTestEntitlement can target it precisely.
//
// NOTE: base44.entities.Entitlement.filter() returns [] for non-admins.
//       .list() works for admin sessions. FunctionalTestEnv is admin-only.
// ---------------------------------------------------------------------------

function _ftSeasonYear() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1));
  return now >= feb1 ? y : y - 1;
}

export async function grantTestEntitlement(base44, accountId) {
  const seasonYear = _ftSeasonYear();

  // Prefer the server-side function — it uses asServiceRole so the Entitlement
  // is created with the caller's verified auth context, avoiding any client-side
  // entity-ID vs auth-ID mismatch.
  try {
    const res = await base44.functions.invoke("grantFtEntitlement", { accountId });
    if (res?.data?.ok !== undefined) {
      const d = res.data;
      if (d.granted === true) {
        return { granted: true, seasonYear: d.seasonYear ?? seasonYear };
      }
      // "already_entitled" means an active entitlement already exists — skip fallback.
      // Any other error (permission, server fault, etc.) falls through to the client-side
      // path so a usable entitlement is still created.
      if (d.reason === "already_entitled") {
        return { granted: false, reason: "already_entitled", seasonYear: d.seasonYear ?? seasonYear };
      }
      console.warn("[grantTestEntitlement] server function returned non-success, trying fallback:", d.error || d.reason);
    }
  } catch (fnErr) {
    // Server function not yet deployed or not reachable — fall through to direct entity write
    console.warn("[grantTestEntitlement] server function threw, falling back to direct write:", fnErr?.message);
  }

  // Fallback: direct entity write (requires Entitlement entity to be accessible).
  if (!base44.entities?.Entitlement) {
    return { granted: false, reason: "entity_not_found", seasonYear };
  }

  // Check for existing active entitlement — list() requires admin session.
  // Season-year comparison uses loose equality to handle string/number mismatch.
  const all = await base44.entities.Entitlement.list("-created_date", 500).catch(() => []);
  // eslint-disable-next-line eqeqeq
  const existing = all.find(
    e => e.account_id === accountId && e.season_year == seasonYear && e.status === "active"
  );
  if (existing) return { granted: false, reason: "already_entitled", seasonYear };

  try {
    await base44.entities.Entitlement.create({
      account_id:  accountId,
      season_year: seasonYear,
      status:      "active",
      amount_paid: 0,
      source:      "ft_seed",
    });
  } catch (createErr) {
    return { granted: false, reason: `create_failed: ${createErr?.message || createErr}`, seasonYear };
  }
  return { granted: true, seasonYear };
}

// ---------------------------------------------------------------------------
// revokeTestEntitlement — delete any ft_seed entitlements for a given account.
// Only removes records created by grantTestEntitlement (source: "ft_seed").
//
// IMPORTANT: client-side base44.entities.Entitlement.list() cannot see records
// created via asServiceRole (grantFtEntitlement server function). The revokeFtEntitlement
// server function uses asServiceRole with a list-scan fallback, covering both paths.
// ---------------------------------------------------------------------------

export async function revokeTestEntitlement(base44, accountId) {
  // Prefer the server-side function — it uses asServiceRole so it can find
  // entitlements created by grantFtEntitlement (which also uses asServiceRole).
  // Client-side list() is permanently blind to those records.
  try {
    const res = await base44.functions.invoke("revokeFtEntitlement", { accountId });
    console.log("[revokeTestEntitlement] RAW revokeFtEntitlement response:", JSON.stringify(res?.data ?? res));
    if (res?.data?.ok !== undefined) {
      const d = res.data;
      if (d.errors?.length) {
        d.errors.forEach(e => console.warn("[revokeTestEntitlement] server warning:", e));
      }
      return { revoked: d.revoked ?? 0, errors: d.errors ?? [], _raw: d };
    }
  } catch (fnErr) {
    console.warn("[revokeTestEntitlement] server function failed, falling back to client-side:", fnErr?.message);
  }

  // Fallback: client-side delete (only sees records not created via asServiceRole)
  const all = await base44.entities.Entitlement.list("-created_date", 500).catch(() => []);
  const toDelete = all.filter(e => e.account_id === accountId && e.source === "ft_seed");
  let revoked = 0;
  for (const e of toDelete) {
    await base44.entities.Entitlement.delete(e.id).catch(() => {});
    revoked++;
  }
  return { revoked };
}
