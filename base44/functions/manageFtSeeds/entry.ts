// base44/functions/manageFtSeeds/entry.ts
//
// Admin-only FT seed lifecycle management — MUST run in PROD function slot.
//
// ════════════════════════════════════════════════════════════════════════════
// WHY THIS MUST BE SERVER-SIDE (not client-side entity writes)
// ════════════════════════════════════════════════════════════════════════════
// In the Base44 SDK, `functionsVersion` in createClient ONLY affects the
// `functionsAxiosClient` used by `base44.functions.invoke()`. The `entities`
// module uses a separate `axiosClient` that NEVER carries the
// `Base44-Functions-Version` header (client.js:75-118).
//
// Entity routing is determined by `X-Origin-URL` (window.location.href),
// which the SDK injects on every entity request (axios-client.js:131-135).
// When the FT admin page is viewed in Base44's test/preview environment,
// X-Origin-URL contains the test URL → every entity write goes to TEST data,
// regardless of any functionsVersion config on the client.
//
// Server functions deployed to the PROD slot do NOT run in a browser. There
// is no window.location.href, no X-Origin-URL header. Entity operations here
// are routed to PROD data by the platform's execution context.
//
// All entity operations use asServiceRole (SR) for consistent visibility:
//   • SR-created records are listable/filterable/deletable by SR
//   • getMyAthleteProfiles Attempt 1 (SR list scan) finds SR-created athletes
//   • claimSlotProfiles athlete lookup uses SR (updated to match)
// ════════════════════════════════════════════════════════════════════════════
//
// Body: { action: "seed" | "reset" | "delete" | "discover" | "integrity" }
//
// Responses:
//   seed/reset:  { ok, action, version, coaches, athletes, rosters, activities, totalRecords }
//   delete:      { ok, action, deleted, errors }
//   discover:    { ok, action, coaches, athletes, rosters, activities }
//   integrity:   { ok, action, counts, family2AthleteId, athleteIds, issues }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const ADMIN_EMAILS = ["adamst101@gmail.com", "adamst1@gmail.com"];
const SEED_PREFIX  = "__hc_ft_";
const SEED_VERSION = "1.2.0";

// ─── FT Topology (mirrors src/lib/ftEnvService.js FT_TOPOLOGY) ───────────────

function isoDateAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const FT_COACHES = [
  { _key: "coach1", first_name: "TestCoach", last_name: "Hayes",  school_or_org: "Riverside High School (FT Seed)", sport: "Football", invite_code: "__hc_ft_HAYES-001",  account_id: "__hc_ft_coach1_account", status: "approved", active: true },
  { _key: "coach2", first_name: "TestCoach", last_name: "Rivera", school_or_org: "Lincoln Academy (FT Seed)",       sport: "Football", invite_code: "__hc_ft_RIVERA-001", account_id: "__hc_ft_coach2_account", status: "approved", active: true },
];

const FT_ATHLETES = [
  { _key: "athlete1", first_name: "Test", last_name: "Johnson",  athlete_name: "__hc_ft_Test Johnson",  account_id: "__hc_ft_family1", grad_year: 2026, sport_id: "football", position: "QB", active: true,
    home_city: "Alpharetta", home_state: "GA", height_ft: 6, height_in: 2, weight_lbs: 195,
    player_email: "tyler.johnson.ft@fttest.invalid", x_handle: "@TylerJohnsonQB26",
    parent_first_name: "David",  parent_last_name: "Johnson",  parent_phone: "555-201-0001" },
  { _key: "athlete2", first_name: "Test", last_name: "Johnson2", athlete_name: "__hc_ft_Test Johnson2", account_id: "__hc_ft_family1", grad_year: 2027, sport_id: "football", position: "WR", active: true,
    home_city: "Alpharetta", home_state: "GA", height_ft: 6, height_in: 0, weight_lbs: 175,
    player_email: "marcus.johnson2.ft@fttest.invalid", x_handle: "@MarcusJohnson2WR27",
    parent_first_name: "David",  parent_last_name: "Johnson",  parent_phone: "555-201-0001" },
  { _key: "athlete3", first_name: "Test", last_name: "Martinez", athlete_name: "__hc_ft_Test Martinez", account_id: "__hc_ft_family2", grad_year: 2026, sport_id: "football", position: "DB", active: true,
    home_city: "Tampa",       home_state: "FL", height_ft: 5, height_in: 10, weight_lbs: 165,
    player_email: "sofia.martinez.ft@fttest.invalid", x_handle: "@SofiaMartinezDB26",
    parent_first_name: "Maria",  parent_last_name: "Martinez", parent_phone: "555-202-0003" },
  { _key: "athlete4", first_name: "Test", last_name: "Williams", athlete_name: "__hc_ft_Test Williams", account_id: "__hc_ft_family3", grad_year: 2026, sport_id: "football", position: "RB", active: true,
    home_city: "Houston",     home_state: "TX", height_ft: 5, height_in: 11, weight_lbs: 205,
    player_email: "jamal.williams.ft@fttest.invalid", x_handle: "@JamalWilliamsRB26",
    parent_first_name: "Robert", parent_last_name: "Williams", parent_phone: "555-203-0004" },
  { _key: "athlete5", first_name: "Test", last_name: "Davis",    athlete_name: "__hc_ft_Test Davis",    account_id: "__hc_ft_family4", grad_year: 2027, sport_id: "football", position: "LB", active: true,
    home_city: "Atlanta",     home_state: "GA", height_ft: 6, height_in: 1,  weight_lbs: 225,
    player_email: "aisha.davis.ft@fttest.invalid",    x_handle: "@AishaDavisLB27",
    parent_first_name: "Lisa",   parent_last_name: "Davis",    parent_phone: "555-204-0005" },
  { _key: "athlete6", first_name: "Test", last_name: "Brown",    athlete_name: "__hc_ft_Test Brown",    account_id: "__hc_ft_family5", grad_year: 2028, sport_id: "football", position: "OL", active: true,
    home_city: "Charlotte",   home_state: "NC", height_ft: 6, height_in: 4,  weight_lbs: 285,
    player_email: "devon.brown.ft@fttest.invalid",    x_handle: "@DevonBrownOL28",
    parent_first_name: "James",  parent_last_name: "Brown",    parent_phone: "555-205-0006" },
];

const FT_ROSTERS = [
  { _coachKey: "coach1", _athleteKey: "athlete1" }, // Tyler  → Hayes
  { _coachKey: "coach1", _athleteKey: "athlete4" }, // Jamal  → Hayes
  { _coachKey: "coach2", _athleteKey: "athlete2" }, // Marcus → Rivera
  { _coachKey: "coach1", _athleteKey: "athlete3" }, // Sofia  → Hayes (both)
  { _coachKey: "coach2", _athleteKey: "athlete3" }, // Sofia  → Rivera (both)
  { _coachKey: "coach2", _athleteKey: "athlete5" }, // Aisha  → Rivera
  // athlete6 (Devon) intentionally has no roster entry
];

const FT_ACTIVITIES: { _athleteKey: string; daysAgo: number; [k: string]: any }[] = [
  // Tyler (athlete1) — 5 records
  { _athleteKey: "athlete1", activity_type: "phone_call",       school_name: "Florida",   coach_name: "__hc_ft_Coach Adams",  coach_title: "Offensive Coordinator",  notes: "Initial call about program fit.",      daysAgo: 55 },
  { _athleteKey: "athlete1", activity_type: "phone_call",       school_name: "Auburn",    coach_name: "__hc_ft_Coach Baker",  coach_title: "Head Coach",             notes: "Follow-up call.",                      daysAgo: 40 },
  { _athleteKey: "athlete1", activity_type: "unofficial_visit", school_name: "Georgia",   coach_name: "__hc_ft_Coach Carter", coach_title: "QB Coach",               notes: "Campus visit, toured facilities.",     daysAgo: 30 },
  { _athleteKey: "athlete1", activity_type: "offer_received",   school_name: "Florida",   coach_name: "__hc_ft_Coach Adams",  coach_title: "Offensive Coordinator",  notes: "Verbal offer extended.",               daysAgo: 15 },
  { _athleteKey: "athlete1", activity_type: "email",            school_name: "Tennessee", coach_name: "__hc_ft_Coach Davis",  coach_title: "Recruiting Coordinator", notes: "Scholarship information packet sent.", daysAgo: 5  },
  // Marcus (athlete2) — 2 records
  { _athleteKey: "athlete2", activity_type: "phone_call", school_name: "Penn State", coach_name: "__hc_ft_Coach Evans",  coach_title: "Wide Receivers Coach",   notes: "Introduction call.",     daysAgo: 45 },
  { _athleteKey: "athlete2", activity_type: "email",      school_name: "Ohio State",  coach_name: "__hc_ft_Coach Foster", coach_title: "Recruiting Coordinator", notes: "Program brochure sent.", daysAgo: 20 },
  // Sofia (athlete3) — 4 records
  { _athleteKey: "athlete3", activity_type: "phone_call",       school_name: "Florida", coach_name: "__hc_ft_Coach Garcia", coach_title: "Defensive Coordinator", notes: "Initial contact.",                     daysAgo: 50 },
  { _athleteKey: "athlete3", activity_type: "phone_call",       school_name: "Georgia", coach_name: "__hc_ft_Coach Harris", coach_title: "DB Coach",              notes: "Scheme overview call.",                daysAgo: 35 },
  { _athleteKey: "athlete3", activity_type: "unofficial_visit", school_name: "Auburn",  coach_name: "__hc_ft_Coach Harris", coach_title: "DB Coach",              notes: "Unofficial campus visit.",             daysAgo: 22 },
  { _athleteKey: "athlete3", activity_type: "offer_received",   school_name: "Georgia", coach_name: "__hc_ft_Coach Harris", coach_title: "DB Coach",              notes: "Scholarship offer letter received.",   daysAgo: 8  },
  // Jamal (athlete4) — 1 record
  { _athleteKey: "athlete4", activity_type: "email", school_name: "Tennessee", coach_name: "__hc_ft_Coach Irving", coach_title: "Recruiting Coordinator", notes: "Camp invitation email sent.", daysAgo: 28 },
  // Aisha (athlete5) — 2 records
  { _athleteKey: "athlete5", activity_type: "phone_call",   school_name: "Penn State", coach_name: "__hc_ft_Coach Jones", coach_title: "Linebackers Coach",      notes: "Initial recruiting call.", daysAgo: 38 },
  { _athleteKey: "athlete5", activity_type: "text_message", school_name: "Ohio State",  coach_name: "__hc_ft_Coach Kim",   coach_title: "Recruiting Coordinator", notes: "Quick check-in text.",     daysAgo: 12 },
  // Devon (athlete6) — 0 records intentionally
];

// ─── Camp intent plan — staggered offsets into a shared football camp pool ────
// Max offset 22 → pool must have ≥23 camps; seedAll fetches 200, takes 25, wraps with modulo.
// Offsets overlap across athletes intentionally (realistic: same popular camps attract multiple recruits).
// Per-athlete dedup (Set) prevents the same camp_id+status appearing twice for one athlete.

const ATHLETE_CAMP_PLANS: { _key: string; favoriteOffsets: number[]; registeredOffsets: number[] }[] = [
  { _key: "athlete1", favoriteOffsets: [0, 1, 2],             registeredOffsets: [3, 4]       }, // 3 fav  2 reg
  { _key: "athlete2", favoriteOffsets: [2, 3, 5, 6],         registeredOffsets: [7, 8]       }, // 4 fav  2 reg
  { _key: "athlete3", favoriteOffsets: [4, 5, 9],             registeredOffsets: [10, 11]     }, // 3 fav  2 reg
  { _key: "athlete4", favoriteOffsets: [6, 7, 8, 12],        registeredOffsets: [13, 14, 15] }, // 4 fav  3 reg
  { _key: "athlete5", favoriteOffsets: [9, 10, 16],           registeredOffsets: [17, 18]     }, // 3 fav  2 reg
  { _key: "athlete6", favoriteOffsets: [11, 12, 13, 19, 20], registeredOffsets: [21, 22]     }, // 5 fav  2 reg
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSeedRecord(record: any, fields: string[]): boolean {
  return fields.some(f => typeof record[f] === "string" && record[f].startsWith(SEED_PREFIX));
}

// ─── discoverSeeds — SR list scan filtered by __hc_ft_ prefix ────────────────

async function discoverSeeds(sr: any) {
  const [coaches, athletes, rosters, activities, campIntents] = await Promise.all([
    sr.entities.Coach.list("-created_date", 2000).catch(() => []),
    sr.entities.AthleteProfile.list("-created_date", 2000).catch(() => []),
    sr.entities.CoachRoster.list("-created_date", 2000).catch(() => []),
    sr.entities.RecruitingActivity.list("-created_date", 2000).catch(() => []),
    sr.entities.CampIntent.list("-created_date", 2000).catch(() => []),
  ]);
  return {
    coaches:     (Array.isArray(coaches)     ? coaches     : []).filter((r: any) => isSeedRecord(r, ["first_name", "last_name", "account_id", "invite_code"])),
    athletes:    (Array.isArray(athletes)    ? athletes    : []).filter((r: any) => isSeedRecord(r, ["athlete_name", "account_id"])),
    rosters:     (Array.isArray(rosters)     ? rosters     : []).filter((r: any) => isSeedRecord(r, ["invite_code", "account_id", "athlete_id", "coach_id"])),
    activities:  (Array.isArray(activities)  ? activities  : []).filter((r: any) => isSeedRecord(r, ["account_id", "athlete_id", "coach_name"])),
    campIntents: (Array.isArray(campIntents) ? campIntents : []).filter((r: any) => isSeedRecord(r, ["account_id"])),
  };
}

// ─── deleteAllSeeds — delete all SR-created FT seed records ──────────────────

async function deleteAllSeeds(sr: any): Promise<{ deleted: number; errors: string[] }> {
  const found = await discoverSeeds(sr);
  let deleted = 0;
  const errors: string[] = [];

  // Delete in dependency order: campIntents → activities → rosters → athletes → coaches
  const queue = [
    ...found.campIntents.map((r: any) => ({ entity: sr.entities.CampIntent,          id: r.id, label: `CampIntent:${r.id}` })),
    ...found.activities.map((r: any) =>  ({ entity: sr.entities.RecruitingActivity,  id: r.id, label: `RecruitingActivity:${r.id}` })),
    ...found.rosters.map((r: any) =>     ({ entity: sr.entities.CoachRoster,         id: r.id, label: `CoachRoster:${r.id}` })),
    ...found.athletes.map((r: any) =>    ({ entity: sr.entities.AthleteProfile,      id: r.id, label: `AthleteProfile:${r.id}` })),
    ...found.coaches.map((r: any) =>     ({ entity: sr.entities.Coach,               id: r.id, label: `Coach:${r.id}` })),
  ];

  console.log(`[manageFtSeeds] delete: ${queue.length} records to delete`);
  for (const item of queue) {
    try {
      await item.entity.delete(item.id);
      deleted++;
    } catch (err) {
      errors.push(`Delete ${item.label} failed: ${(err as Error).message}`);
      console.warn(`[manageFtSeeds] delete failed for ${item.label}:`, (err as Error).message);
    }
  }

  // Extra CampIntent cleanup: also delete any SR-visible CampIntents for seed athlete IDs
  // that were NOT caught by the isSeedRecord account_id filter. This covers CampIntents
  // created via saveCampIntent (SR) after claim, which have account_id = real user ID.
  const seedAthleteIds = found.athletes
    .map((a: any) => String(a.id ?? a._id ?? "")).filter(Boolean);
  const knownCiIds = new Set(found.campIntents.map((ci: any) => String(ci.id ?? ci._id ?? "")));
  let extraCiDeleted = 0;
  for (const athleteId of seedAthleteIds) {
    try {
      const extra = await sr.entities.CampIntent.filter({ athlete_id: athleteId }).catch(() => []);
      for (const ci of (Array.isArray(extra) ? extra : [])) {
        const ciId = String(ci.id ?? ci._id ?? "");
        if (!ciId || knownCiIds.has(ciId)) continue;
        try {
          await sr.entities.CampIntent.delete(ciId);
          deleted++;
          extraCiDeleted++;
          knownCiIds.add(ciId);
          console.log(`[manageFtSeeds] delete: extra CampIntent ${ciId} (athlete=${athleteId} account_id=${ci.account_id} status=${ci.status})`);
        } catch (err) {
          errors.push(`Delete extra CampIntent ${ciId}: ${(err as Error).message}`);
        }
      }
    } catch (e) {
      errors.push(`CampIntent extra-cleanup for athlete ${athleteId}: ${(e as Error).message}`);
    }
  }
  if (extraCiDeleted > 0) {
    console.log(`[manageFtSeeds] delete: purged ${extraCiDeleted} extra CampIntent(s) by athlete_id`);
  }

  console.log(`[manageFtSeeds] delete complete: ${deleted} deleted, ${errors.length} errors`);
  return { deleted, errors };
}

// ─── seedAll — create all FT seed records via SR ─────────────────────────────

async function seedAll(sr: any, base44?: any): Promise<{
  coaches: any[]; athletes: any[]; rosters: any[]; activities: any[]; campIntents: any[]; totalRecords: number;
}> {
  // Phase 1: Coaches
  const coaches: any[] = [];
  for (const def of FT_COACHES) {
    const { _key, ...data } = def;
    const record = await sr.entities.Coach.create(data);
    coaches.push({ ...record, _key });
    console.log(`[manageFtSeeds] coach created: key=${_key} id=${record.id ?? record._id}`);
  }
  const coachById: Record<string, any> = Object.fromEntries(coaches.map(c => [c._key, c]));

  // Phase 2: Athletes
  const athletes: any[] = [];
  for (const def of FT_ATHLETES) {
    const { _key, ...data } = def;
    const record = await sr.entities.AthleteProfile.create(data);
    athletes.push({ ...record, _key });
    console.log(`[manageFtSeeds] athlete created: key=${_key} id=${record.id ?? record._id} account_id=${data.account_id}`);
  }
  const athleteById: Record<string, any> = Object.fromEntries(athletes.map(a => [a._key, a]));

  console.log(`[manageFtSeeds] seed Phase 1+2 done — ${coaches.length} coaches, ${athletes.length} athletes`);
  console.log(`[manageFtSeeds] athlete IDs: ${JSON.stringify(athletes.map((a: any) => ({ key: a._key, id: a.id, account_id: a.account_id })))}`);

  // Phase 3: CoachRoster
  const rosters: any[] = [];
  for (const def of FT_ROSTERS) {
    const coach   = coachById[def._coachKey];
    const athlete = athleteById[def._athleteKey];
    if (!coach || !athlete) {
      console.warn(`[manageFtSeeds] roster skipped: coach=${def._coachKey} athlete=${def._athleteKey} (not found)`);
      continue;
    }
    const record = await sr.entities.CoachRoster.create({
      coach_id:     coach.id,
      account_id:   athlete.account_id,
      athlete_id:   athlete.id,
      athlete_name: `${athlete.first_name} ${athlete.last_name}`,
      invite_code:  coach.invite_code,
      joined_at:    new Date().toISOString().slice(0, 10),
    });
    rosters.push(record);
  }
  console.log(`[manageFtSeeds] seed Phase 3 done — ${rosters.length} rosters`);

  // Phase 4: RecruitingActivity
  const activities: any[] = [];
  for (const def of FT_ACTIVITIES) {
    const { _athleteKey, daysAgo, ...data } = def;
    const athlete = athleteById[_athleteKey];
    if (!athlete) {
      console.warn(`[manageFtSeeds] activity skipped: athlete=${_athleteKey} not found`);
      continue;
    }
    const record = await sr.entities.RecruitingActivity.create({
      ...data,
      account_id:    athlete.account_id,
      athlete_id:    athlete.id,
      activity_date: isoDateAgo(daysAgo),
    });
    activities.push(record);
  }
  console.log(`[manageFtSeeds] seed Phase 4 done — ${activities.length} activities`);

  // Phase 5: CampIntents for all 6 athletes — staggered pool offsets per ATHLETE_CAMP_PLANS.
  // Each athlete gets ≥3 favorites and ≥2 registered from a shared football camp pool (25 camps max).
  // Offsets wrap with modulo so any pool size ≥1 works. Per-athlete Set deduplicates same camp+status.
  //
  // camp_id normalization: always prefer .id → ._id → event_key; never store undefined/null
  // (useCampSummariesClient skips intents with falsy camp_id).
  const campIntents: any[] = [];
  if (base44) {
    try {
      const camps = await base44.entities.Camp.list("-created_date", 200).catch(() => []);
      const campList = Array.isArray(camps) ? camps : [];
      const footballCamps = campList.filter((c: any) =>
        (c.sport ?? "").toLowerCase().includes("football") ||
        (c.sport_id ?? "").toLowerCase().includes("football")
      );
      const campPool = (footballCamps.length >= 10 ? footballCamps : campList).slice(0, 25);
      console.log(`[manageFtSeeds] Phase 5: campList=${campList.length} footballCamps=${footballCamps.length} campPool=${campPool.length}`);

      for (const plan of ATHLETE_CAMP_PLANS) {
        const athlete = athleteById[plan._key];
        if (!athlete) {
          console.warn(`[manageFtSeeds] Phase 5: athlete ${plan._key} not found — skipping`);
          continue;
        }
        const athleteId  = String(athlete.id ?? athlete._id ?? "");
        const accountId  = String(athlete.account_id ?? "");
        const usedKeys   = new Set<string>();

        const intentDefs: { offset: number; status: string }[] = [
          ...plan.favoriteOffsets.map((o) => ({ offset: o, status: "favorite" })),
          ...plan.registeredOffsets.map((o) => ({ offset: o, status: "registered" })),
        ];

        for (const { offset, status } of intentDefs) {
          if (campPool.length === 0) { console.warn(`[manageFtSeeds] Phase 5: empty camp pool — aborting`); break; }
          const camp   = campPool[offset % campPool.length];
          if (!camp) continue;
          const campId = String(camp.id ?? camp._id ?? "") || String(camp.event_key ?? "");
          if (!campId) { console.warn(`[manageFtSeeds] Phase 5: camp at offset ${offset} has no id — skipping`); continue; }
          const dedupeKey = `${campId}:${status}`;
          if (usedKeys.has(dedupeKey)) { console.warn(`[manageFtSeeds] Phase 5: dedup ${plan._key} ${dedupeKey}`); continue; }
          usedKeys.add(dedupeKey);
          const record = await sr.entities.CampIntent.create({
            camp_id:    campId,
            athlete_id: athleteId,
            account_id: accountId,
            status,
            priority:   status === "registered" ? "high" : "medium",
          });
          campIntents.push(record);
          console.log(`[manageFtSeeds] campIntent: ${plan._key} camp_id=${campId} camp_name="${camp.camp_name ?? ""}" status=${status}`);
        }
      }

      const nullCampIdCount = campIntents.filter((ci: any) => !ci.camp_id).length;
      if (nullCampIdCount > 0) {
        console.warn(`[manageFtSeeds] Phase 5 WARNING: ${nullCampIdCount} CampIntent(s) without camp_id — MyCamps join will fail`);
      }
    } catch (e) {
      console.warn(`[manageFtSeeds] Phase 5 CampIntent creation failed (non-critical): ${(e as Error).message}`);
    }
  }
  console.log(`[manageFtSeeds] seed Phase 5 done — ${campIntents.length} campIntents`);

  const totalRecords = coaches.length + athletes.length + rosters.length + activities.length + campIntents.length;
  console.log(`[manageFtSeeds] seed complete: total=${totalRecords} version=${SEED_VERSION} env=PROD (server-side SR)`);

  return { coaches, athletes, rosters, activities, campIntents, totalRecords };
}

// ─── checkIntegrity ───────────────────────────────────────────────────────────

// Definitions used only for integrity checking (athlete_name + grad_year = stable key after claim).
const INTEGRITY_ATHLETE_DEFS = [
  { _key: "athlete1", athleteName: "__hc_ft_Test Johnson",  gradYear: 2026, minFav: 3, minReg: 2 },
  { _key: "athlete2", athleteName: "__hc_ft_Test Johnson2", gradYear: 2027, minFav: 3, minReg: 2 },
  { _key: "athlete3", athleteName: "__hc_ft_Test Martinez", gradYear: 2026, minFav: 3, minReg: 2 },
  { _key: "athlete4", athleteName: "__hc_ft_Test Williams", gradYear: 2026, minFav: 3, minReg: 2 },
  { _key: "athlete5", athleteName: "__hc_ft_Test Davis",    gradYear: 2027, minFav: 3, minReg: 2 },
  { _key: "athlete6", athleteName: "__hc_ft_Test Brown",    gradYear: 2028, minFav: 3, minReg: 2 },
];

async function checkIntegrity(sr: any): Promise<{
  ok: boolean;
  counts: { coaches: number; athletes: number; rosters: number; activities: number; campIntents: number };
  perAthleteStats: any[];
  family2AthleteId: string | null;
  family2ActivityCount: number;
  family2CampIntentCount: number;
  family2FavoriteCount: number;
  family2RegisteredCount: number;
  family2NullCampIdCount: number;
  family2CampIntentIds: { id: string; status: string; campId: string | null }[];
  athleteIds: { id: string; accountId: string; name: string }[];
  issues: string[];
}> {
  const { coaches, athletes, rosters, activities, campIntents } = await discoverSeeds(sr);
  const issues: string[] = [];

  // Each family slot must have at least one athlete with the synthetic account_id
  const FAMILY_SYNTHETIC_IDS = [
    "__hc_ft_family1", "__hc_ft_family2", "__hc_ft_family3",
    "__hc_ft_family4", "__hc_ft_family5",
  ];
  for (const syntheticId of FAMILY_SYNTHETIC_IDS) {
    const found = athletes.filter((a: any) => a.account_id === syntheticId);
    if (found.length === 0) {
      issues.push(`${syntheticId}: no athlete found with account_id === "${syntheticId}"`);
    }
  }

  // ── Per-athlete stats (all 6) ─────────────────────────────────────────────
  const perAthleteStats: any[] = [];
  for (const def of INTEGRITY_ATHLETE_DEFS) {
    const athlete = athletes.find(
      (a: any) => a.athlete_name === def.athleteName && Number(a.grad_year) === def.gradYear
    );
    if (!athlete) {
      issues.push(`${def.athleteName} (${def.gradYear}) not found`);
      perAthleteStats.push({
        id: null, accountId: null, name: def.athleteName, gradYear: def.gradYear,
        hasEmail: false, hasTwitter: false, hasParent: false,
        favCount: 0, regCount: 0, nullCampIdCount: 0, warnings: ["not found"],
      });
      continue;
    }
    const athleteId = String(athlete.id ?? athlete._id ?? "");
    const aCampIntents = campIntents.filter((ci: any) => String(ci.athlete_id ?? "") === athleteId);
    const favCount        = aCampIntents.filter((ci: any) => String(ci.status ?? "") === "favorite").length;
    const regCount        = aCampIntents.filter((ci: any) => String(ci.status ?? "") === "registered").length;
    const nullCampIdCount = aCampIntents.filter((ci: any) => !ci.camp_id).length;
    const hasEmail   = !!athlete.player_email;
    const hasTwitter = !!athlete.x_handle;
    const hasParent  = !!athlete.parent_first_name;
    const warnings: string[] = [];
    if (!hasEmail)           { warnings.push("missing player_email");      issues.push(`${def.athleteName}: missing player_email`); }
    if (!hasTwitter)         { warnings.push("missing x_handle");          issues.push(`${def.athleteName}: missing x_handle`); }
    if (!hasParent)          { warnings.push("missing parent_first_name"); issues.push(`${def.athleteName}: missing parent_first_name`); }
    if (favCount < def.minFav) { warnings.push(`fav=${favCount} < min ${def.minFav}`); issues.push(`${def.athleteName}: favCount=${favCount} < ${def.minFav}`); }
    if (regCount < def.minReg) { warnings.push(`reg=${regCount} < min ${def.minReg}`); issues.push(`${def.athleteName}: regCount=${regCount} < ${def.minReg}`); }
    if (nullCampIdCount > 0) { warnings.push(`${nullCampIdCount} null camp_id`); issues.push(`${def.athleteName}: ${nullCampIdCount} CampIntent(s) with null camp_id`); }
    perAthleteStats.push({
      id: athleteId, accountId: String(athlete.account_id ?? ""), name: def.athleteName, gradYear: def.gradYear,
      hasEmail, hasTwitter, hasParent, favCount, regCount, nullCampIdCount, warnings,
    });
  }

  // ── Legacy family2 fields (backward compat) ───────────────────────────────
  const family2Athlete    = athletes.find((a: any) => a.account_id === "__hc_ft_family2");
  const family2AthleteId  = family2Athlete ? String(family2Athlete.id ?? family2Athlete._id ?? "") : null;
  const family2ActivityCount = family2AthleteId
    ? activities.filter((a: any) => String(a.athlete_id ?? "") === family2AthleteId).length : 0;
  const family2CampIntents   = family2AthleteId
    ? campIntents.filter((ci: any) => String(ci.athlete_id ?? "") === family2AthleteId) : [];
  const family2CampIntentCount  = family2CampIntents.length;
  const family2FavoriteCount    = family2CampIntents.filter((ci: any) => String(ci.status ?? "") === "favorite").length;
  const family2RegisteredCount  = family2CampIntents.filter((ci: any) => String(ci.status ?? "") === "registered").length;
  const family2NullCampIdCount  = family2CampIntents.filter((ci: any) => !ci.camp_id).length;
  const family2CampIntentIds    = family2CampIntents.map((ci: any) => ({
    id: String(ci.id ?? ci._id ?? ""), status: String(ci.status ?? ""), campId: ci.camp_id ? String(ci.camp_id) : null,
  }));

  const totalCampIntents = campIntents.length;
  console.log(
    `[manageFtSeeds] integrity v1.2: coaches=${coaches.length} athletes=${athletes.length} ` +
    `rosters=${rosters.length} activities=${activities.length} campIntents=${totalCampIntents} issues=${issues.length}` +
    (perAthleteStats.length ? ` | perAthlete: ${perAthleteStats.map(s => `${s.name.replace("__hc_ft_","")}(fav=${s.favCount} reg=${s.regCount})`).join(", ")}` : ""),
  );

  return {
    ok: issues.length === 0,
    counts: {
      coaches: coaches.length, athletes: athletes.length,
      rosters: rosters.length, activities: activities.length, campIntents: totalCampIntents,
    },
    perAthleteStats,
    family2AthleteId,
    family2ActivityCount,
    family2CampIntentCount,
    family2FavoriteCount,
    family2RegisteredCount,
    family2NullCampIdCount,
    family2CampIntentIds,
    athleteIds: athletes.map((a: any) => ({
      id: String(a.id ?? a._id ?? ""),
      accountId: String(a.account_id ?? ""),
      name: String(a.athlete_name ?? ""),
    })),
    issues,
  };
}

// ─── Post-write verification — proves what SR can see immediately after seed ──
// Reads back family2 athlete by account_id from SR right after creation.
// If family2ExistsServerSide is false but seedAll returned an ID, the write
// either failed silently or went to a namespace SR cannot see.

async function verifyFamily2Write(sr: any): Promise<{
  family2ExistsServerSide: boolean;
  family2AthleteId: string | null;
  family2AccountId: string | null;
  family2ReadMethod: string;
}> {
  // Attempt 1: filter by account_id
  try {
    const rows = await sr.entities.AthleteProfile.filter({ account_id: "__hc_ft_family2" }).catch(() => null);
    if (Array.isArray(rows) && rows.length > 0) {
      const r = rows[0];
      const id = String(r.id ?? r._id ?? "");
      console.log(`[manageFtSeeds] postWriteVerify family2 via filter: found id=${id}`);
      return { family2ExistsServerSide: true, family2AthleteId: id, family2AccountId: String(r.account_id ?? ""), family2ReadMethod: "sr_filter_account_id" };
    }
  } catch (_e) { /* fall through */ }

  // Attempt 2: list scan
  try {
    const all = await sr.entities.AthleteProfile.list("-created_date", 2000).catch(() => null);
    if (Array.isArray(all)) {
      const found = all.find((r: any) => r.account_id === "__hc_ft_family2");
      if (found) {
        const id = String(found.id ?? found._id ?? "");
        console.log(`[manageFtSeeds] postWriteVerify family2 via list scan: found id=${id}`);
        return { family2ExistsServerSide: true, family2AthleteId: id, family2AccountId: String(found.account_id ?? ""), family2ReadMethod: "sr_list_scan" };
      }
      console.warn(`[manageFtSeeds] postWriteVerify: SR list returned ${all.length} athletes but none with account_id=__hc_ft_family2`);
      return { family2ExistsServerSide: false, family2AthleteId: null, family2AccountId: null, family2ReadMethod: `sr_list_scan_miss(${all.length}_total)` };
    }
  } catch (e) {
    console.warn(`[manageFtSeeds] postWriteVerify list scan failed: ${(e as Error).message}`);
  }

  return { family2ExistsServerSide: false, family2AthleteId: null, family2AccountId: null, family2ReadMethod: "all_attempts_failed" };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const caller = await base44.auth.me().catch(() => null);
  if (!caller) return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  const isAdmin = caller.role === "admin" || ADMIN_EMAILS.includes(caller.email);
  if (!isAdmin) return Response.json({ ok: false, error: "Admin only" }, { status: 403 });

  let body: { action?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const { action } = body;
  const sr = base44.asServiceRole;

  // ── Execution context diagnostics — proves which slot/env received this call ──
  const receivedFunctionsVersion = req.headers.get("Base44-Functions-Version") ?? "(not set)";
  const receivedAppId            = req.headers.get("Base44-App-Id")            ?? "(not set)";
  const receivedApiUrl           = req.headers.get("Base44-Api-Url")           ?? "(not set)";
  const execCtx = {
    functionVersion:   "manageFtSeeds_v_livecheck_1",
    executionContext:  "server_function",
    receivedFunctionsVersion,
    receivedAppId,
    receivedApiUrl,
    action,
    callerEmail: caller.email,
  };
  console.log(`[manageFtSeeds] LIVECHECK exec context:`, JSON.stringify(execCtx));

  try {
    switch (action) {

      case "seed": {
        // Guard: refuse to seed if records already exist
        const existing = await discoverSeeds(sr);
        const totalExisting = existing.coaches.length + existing.athletes.length +
                              existing.rosters.length + existing.activities.length;
        if (totalExisting > 0) {
          return Response.json({
            ok: false,
            ...execCtx,
            error: `Seed records already exist (${totalExisting} found — coaches=${existing.coaches.length} athletes=${existing.athletes.length} rosters=${existing.rosters.length} activities=${existing.activities.length}). Use action=reset to delete and reseed.`,
            existing: { coaches: existing.coaches.length, athletes: existing.athletes.length, rosters: existing.rosters.length, activities: existing.activities.length },
          }, { status: 409 });
        }
        const result = await seedAll(sr, base44);
        const postWriteVerify = await verifyFamily2Write(sr);
        return Response.json({
          ok: true, ...execCtx, version: SEED_VERSION, ...result,
          firstAthleteIds: result.athletes.slice(0, 3).map((a: any) => ({ key: a._key, id: String(a.id ?? a._id ?? ""), accountId: a.account_id })),
          firstCoachIds:   result.coaches.slice(0, 3).map((c: any) => ({ key: c._key, id: String(c.id ?? c._id ?? "") })),
          postWriteVerify,
        });
      }

      case "reset": {
        const deleteResult = await deleteAllSeeds(sr);
        const seedResult   = await seedAll(sr, base44);
        const postWriteVerify = await verifyFamily2Write(sr);
        return Response.json({
          ok: true, ...execCtx, version: SEED_VERSION, deleteResult, ...seedResult,
          firstAthleteIds: seedResult.athletes.slice(0, 3).map((a: any) => ({ key: a._key, id: String(a.id ?? a._id ?? ""), accountId: a.account_id })),
          firstCoachIds:   seedResult.coaches.slice(0, 3).map((c: any) => ({ key: c._key, id: String(c.id ?? c._id ?? "") })),
          postWriteVerify,
        });
      }

      case "delete": {
        const result = await deleteAllSeeds(sr);
        return Response.json({ ok: true, ...execCtx, ...result });
      }

      case "discover": {
        const result = await discoverSeeds(sr);
        console.log(`[manageFtSeeds] discover: coaches=${result.coaches.length} athletes=${result.athletes.length} rosters=${result.rosters.length} activities=${result.activities.length}`);
        return Response.json({ ok: true, ...execCtx, ...result });
      }

      case "integrity": {
        const result = await checkIntegrity(sr);
        return Response.json({ ok: true, ...execCtx, ...result });
      }

      case "camp_check": {
        const allAthletes = await sr.entities.AthleteProfile.list("-created_date", 2000).catch(() => []);
        const family2Athlete = (Array.isArray(allAthletes) ? allAthletes : [])
          .find((a: any) => a.athlete_name === "__hc_ft_Test Martinez" && Number(a.grad_year) === 2026);
        const family2AthleteId = family2Athlete
          ? String(family2Athlete.id ?? family2Athlete._id ?? "")
          : null;
        if (!family2AthleteId) {
          return Response.json({ ok: false, ...execCtx, error: "family2 athlete not found (name=__hc_ft_Test Martinez grad_year=2026)" }, { status: 404 });
        }
        const allIntents = await sr.entities.CampIntent.filter({ athlete_id: family2AthleteId }).catch(() => []);
        const intentList = Array.isArray(allIntents) ? allIntents : [];
        const intentRows: { id: string; status: string; campId: string | null; campFound: boolean; campName: string | null; isSeed: boolean; accountId: string }[] = [];
        let matchedCount = 0;
        for (const ci of intentList) {
          const intentId = String(ci.id ?? ci._id ?? "");
          const campId   = ci.camp_id ? String(ci.camp_id) : null;
          let campFound  = false;
          let campName: string | null = null;
          if (campId) {
            try {
              const camp = await base44.entities.Camp.get(campId);
              campFound = !!(camp && (camp.id || camp._id || camp.event_key));
              campName  = camp?.camp_name ?? null;
              if (campFound) matchedCount++;
            } catch { /* camp not found */ }
          }
          intentRows.push({
            id: intentId,
            status: String(ci.status ?? ""),
            campId,
            campFound,
            campName,
            isSeed: String(ci.account_id ?? "").startsWith("__hc_ft_"),
            accountId: String(ci.account_id ?? ""),
          });
        }
        const favoriteCount   = intentList.filter((ci: any) => ci.status === "favorite").length;
        const registeredCount = intentList.filter((ci: any) => ci.status === "registered").length;
        const nullCampIdCount = intentList.filter((ci: any) => !ci.camp_id).length;
        const staleRows       = intentRows.filter((r) => !r.isSeed);
        const allOk = nullCampIdCount === 0 && intentList.length >= 3 && staleRows.length === 0 &&
                      matchedCount >= intentRows.filter((r) => !!r.campId).length;
        return Response.json({
          ok: allOk,
          ...execCtx,
          family2AthleteId,
          family2AthleteAccountId: String(family2Athlete.account_id ?? ""),
          totalCampIntents:          intentList.length,
          favoriteCount,
          registeredCount,
          nullCampIdCount,
          matchedCampCount:          matchedCount,
          staleCount:                staleRows.length,
          intentRows,
          staleRows,
          workspaceCampsSaved:       intentList.filter((ci: any) => ci.status === "favorite" || ci.status === "registered").length,
          workspaceUpcomingCamps:    registeredCount,
          myCampsFavoritesRenderable:  intentRows.filter((r) => r.status === "favorite"   && r.campFound).length,
          myCampsRegisteredRenderable: intentRows.filter((r) => r.status === "registered" && r.campFound).length,
        });
      }

      default:
        return Response.json({
          ok: false,
          ...execCtx,
          error: `Unknown action: ${JSON.stringify(action)}. Valid actions: seed, reset, delete, discover, integrity, camp_check`,
        }, { status: 400 });
    }
  } catch (e) {
    console.error(`[manageFtSeeds] unhandled error action=${action}:`, (e as Error).message);
    return Response.json({ ok: false, ...execCtx, error: (e as Error).message }, { status: 500 });
  }
});
