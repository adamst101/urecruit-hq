// functions/claimSlotProfiles/entry.ts
//
// ════════════════════════════════════════════════════════════════════════════
// VISIBILITY MODEL — READ THIS BEFORE EDITING
// ════════════════════════════════════════════════════════════════════════════
//
// There are two distinct auth contexts in this function:
//
//   base44.entities.*          — caller's auth token (admin)
//     • Can see and mutate ALL records, including admin-created seed profiles.
//     • Use for: AthleteProfile, CoachRoster, Coach reads/writes.
//
//   base44.asServiceRole.entities.*  — service-role context
//     • Can ONLY see/mutate records that asServiceRole itself created.
//     • Admin-created AthleteProfile/CoachRoster/Coach records are permanently
//       invisible to asServiceRole — filter/list/update/delete all return empty
//       or "not found" for those records.
//     • Use for: SchoolPreference only (written via asServiceRole at claim time,
//       therefore readable/writable via asServiceRole at release time).
//
// ATHLETE LINK BRIDGE (why SchoolPreference exists):
//   AthleteProfile seed records are admin-created. getMyAthleteProfiles runs
//   as asServiceRole and can never find them by account_id. Fix: at claim time,
//   write SchoolPreference { account_id: realId, athlete_id: seedProfileId }
//   via asServiceRole. getMyAthleteProfiles reads it as Step 3.
//
// CANONICAL WRITE PATH:  this file (claimSlotProfiles)
// CANONICAL READ PATH:   base44/functions/getMyAthleteProfiles/entry.ts — Step 3
// SAFEGUARD:             base44/functions/saveSchoolPreferences/entry.ts preserves
//                        athlete_id unless an explicit new value is provided.
// ════════════════════════════════════════════════════════════════════════════
//
// Admin-only. Body: {
//   type: "family" | "coach",
//   realId: string,                    — account ID to assign (syntheticId on release)
//   previousRealId?: string,           — real account ID being released
//   athletes?: { athleteName, gradYear }[],
//   inviteCode?: string,
//   knownAthleteProfileIds?: string[], — client-discovered IDs, preferred over name lookup
// }
// Returns: { ok, updated, errors, athleteProfileIds,
//            athleteProfileReverted, schoolPreferenceCleared, rosterReverted }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const ADMIN_EMAILS = [
  "adamst101@gmail.com",
  "adamst1@gmail.com",
];

const FT_SYNTHETIC_PREFIX = "__hc_ft_";

// ── SchoolPreference helpers (asServiceRole — these records were written via asServiceRole) ──

async function readAthleteLink(
  sr: any,
  accountId: string,
): Promise<{ athleteId: string | null; prefId: string | null; multipleFound: boolean }> {
  const rows = await sr.entities.SchoolPreference
    .filter({ account_id: accountId })
    .catch(() => []) as any[];

  if (!Array.isArray(rows) || rows.length === 0) {
    return { athleteId: null, prefId: null, multipleFound: false };
  }
  const row = rows[0];
  return {
    athleteId: row.athlete_id ? String(row.athlete_id) : null,
    prefId: String(row.id || row._id || ""),
    multipleFound: rows.length > 1,
  };
}

async function writeAthleteLink(sr: any, accountId: string, athleteId: string): Promise<void> {
  const { prefId } = await readAthleteLink(sr, accountId);
  if (prefId) {
    await sr.entities.SchoolPreference.update(prefId, { athlete_id: athleteId });
  } else {
    await sr.entities.SchoolPreference.create({ account_id: accountId, athlete_id: athleteId });
  }
  console.log(`[claimSlotProfiles] wrote athlete link: account=${accountId} -> athlete=${athleteId}`);
}

async function clearAthleteLink(sr: any, accountId: string): Promise<{ cleared: number }> {
  const { prefId, athleteId } = await readAthleteLink(sr, accountId);
  if (!prefId) {
    console.log(`[claimSlotProfiles] clearAthleteLink: no SchoolPreference found for account=${accountId}`);
    return { cleared: 0 };
  }
  await sr.entities.SchoolPreference.update(prefId, { athlete_id: null });
  console.log(`[claimSlotProfiles] cleared athlete link: account=${accountId} (was -> athlete=${athleteId})`);
  return { cleared: 1 };
}

// ── AthleteProfile lookup (caller admin auth — can see admin-created records) ──

async function findAthleteProfilesByName(
  db: any,
  athleteName: string,
  gradYear: number,
): Promise<any[]> {
  // Step 1: filter by name + grad_year (caller admin auth sees all records)
  try {
    const res = await db.entities.AthleteProfile.filter({
      athlete_name: athleteName,
      grad_year: gradYear,
    });
    if (Array.isArray(res) && res.length > 0) {
      console.log(`[claimSlotProfiles] filter found ${res.length} profiles for "${athleteName}" ${gradYear}`);
      return res;
    }
  } catch (_e) { /* fall through */ }

  // Step 2: full list scan (catches records where filter index may lag)
  try {
    const all = await db.entities.AthleteProfile.list("-created_date", 2000);
    if (Array.isArray(all)) {
      const matched = all.filter((r: any) =>
        r.athlete_name === athleteName && String(r.grad_year) === String(gradYear)
      );
      console.log(`[claimSlotProfiles] list-scan: ${all.length} total, ${matched.length} matched "${athleteName}" ${gradYear}`);
      return matched;
    }
  } catch (e) {
    console.warn("[claimSlotProfiles] list-scan failed:", (e as Error).message);
  }

  return [];
}

async function findCoachByInviteCode(db: any, inviteCode: string): Promise<any | null> {
  try {
    const res = await db.entities.Coach.filter({ invite_code: inviteCode });
    if (Array.isArray(res) && res.length > 0) return res[0];
  } catch (_e) { /* fall through */ }

  try {
    const all = await db.entities.Coach.list("-created_date", 500);
    if (Array.isArray(all)) return all.find((r: any) => r.invite_code === inviteCode) ?? null;
  } catch (_e) { /* ignore */ }

  return null;
}

// ── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const caller = await base44.auth.me().catch(() => null);
  if (!caller) return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  const isAdmin = caller.role === "admin" || ADMIN_EMAILS.includes(caller.email);
  if (!isAdmin) return Response.json({ ok: false, error: "Admin only" }, { status: 403 });

  let body: {
    type?: string;
    realId?: string;
    previousRealId?: string;
    athletes?: { athleteName: string; gradYear: number }[];
    inviteCode?: string;
    knownAthleteProfileIds?: string[];
  } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const { type, realId, previousRealId, athletes, inviteCode, knownAthleteProfileIds } = body;

  if (!type || !realId) {
    return Response.json({ ok: false, error: "type and realId are required" }, { status: 400 });
  }

  const isRelease = realId.startsWith(FT_SYNTHETIC_PREFIX);
  const sr = base44.asServiceRole;   // SchoolPreference ops only
  const db = base44;                  // AthleteProfile / CoachRoster / Coach ops (admin auth)

  let updated = 0;
  let athleteProfileReverted = 0;
  let schoolPreferenceCleared = 0;
  let rosterReverted = 0;
  const errors: string[] = [];
  const athleteProfileIds: string[] = [];

  try {
    if (type === "family") {
      if (!Array.isArray(athletes) || athletes.length === 0) {
        return Response.json({ ok: false, error: "athletes array required for family slots" }, { status: 400 });
      }

      if (isRelease) {
        // ── RELEASE PATH ─────────────────────────────────────────────────────
        // Athlete ID resolution priority:
        //   1. knownAthleteProfileIds from client (discoverSeeds ran with admin
        //      auth on the browser side and found the actual record IDs)
        //   2. SchoolPreference bridge (written at claim time via asServiceRole)
        //
        // AthleteProfile + CoachRoster mutations use db (caller admin auth) —
        // NOT asServiceRole, which cannot see admin-created records.
        // SchoolPreference clear uses sr (asServiceRole) — it created that record.

        if (!previousRealId || previousRealId.startsWith(FT_SYNTHETIC_PREFIX)) {
          errors.push("Release called without valid previousRealId — no records reverted");
        } else {
          const clientIds = Array.isArray(knownAthleteProfileIds)
            ? knownAthleteProfileIds.filter(Boolean)
            : [];
          const { athleteId: bridgeAthleteId, prefId } = await readAthleteLink(sr, previousRealId);

          const idsToRevert: string[] = clientIds.length > 0
            ? clientIds
            : bridgeAthleteId ? [bridgeAthleteId] : [];

          console.log(`[claimSlotProfiles] release — previousRealId=${previousRealId} clientIds=${JSON.stringify(clientIds)} bridgeId=${bridgeAthleteId} idsToRevert=${JSON.stringify(idsToRevert)}`);

          if (idsToRevert.length > 0) {
            for (const aid of idsToRevert) {
              athleteProfileIds.push(aid);

              // Revert AthleteProfile.account_id → synthetic (caller admin auth)
              try {
                await db.entities.AthleteProfile.update(aid, { account_id: realId });
                athleteProfileReverted++;
                updated++;
              } catch (e) {
                errors.push(`AthleteProfile ${aid} revert failed: ${(e as Error).message}`);
              }

              // Revert CoachRoster.account_id → synthetic (caller admin auth)
              try {
                const rosters = await db.entities.CoachRoster.filter({ athlete_id: aid });
                const rosterList = Array.isArray(rosters) ? rosters : [];
                for (const r of rosterList) {
                  const rid = String(r.id || r._id || r.uuid || "");
                  if (!rid) continue;
                  try {
                    await db.entities.CoachRoster.update(rid, { account_id: realId });
                    rosterReverted++;
                    updated++;
                  } catch (e) {
                    errors.push(`CoachRoster ${rid} revert failed: ${(e as Error).message}`);
                  }
                }
              } catch (e) {
                errors.push(`CoachRoster filter failed for athlete ${aid}: ${(e as Error).message}`);
              }
            }
          } else {
            errors.push(`No athlete IDs available for release (previousRealId=${previousRealId}) — AthleteProfile not reverted`);
          }

          // Clear SchoolPreference bridge (asServiceRole — it owns this record)
          if (prefId) {
            try {
              const { cleared } = await clearAthleteLink(sr, previousRealId);
              schoolPreferenceCleared += cleared;
            } catch (e) {
              errors.push(`clearAthleteLink(${previousRealId}) failed: ${(e as Error).message}`);
            }
          } else {
            console.log(`[claimSlotProfiles] no SchoolPreference for ${previousRealId} — already cleared or never written`);
          }
        }

      } else {
        // ── CLAIM PATH ───────────────────────────────────────────────────────
        // Find profiles by name (caller admin auth — sees admin-created records).
        for (const { athleteName, gradYear } of athletes) {
          const matches = await findAthleteProfilesByName(db, athleteName, gradYear);

          if (matches.length === 0) {
            errors.push(`AthleteProfile not found: ${athleteName} ${gradYear}`);
            continue;
          }

          const record = matches[0];
          const athleteId = String(record.id || record._id || record.uuid || "");
          if (!athleteId) {
            errors.push(`AthleteProfile has no id: ${athleteName} ${gradYear}`);
            continue;
          }

          athleteProfileIds.push(athleteId);

          // Update AthleteProfile.account_id (caller admin auth)
          try {
            await db.entities.AthleteProfile.update(athleteId, { account_id: realId });
            updated++;
          } catch (e) {
            errors.push(`AthleteProfile ${athleteId} claim update failed: ${(e as Error).message}`);
            // Non-fatal — SchoolPreference link is the canonical mapping
          }

          // Update CoachRoster records (caller admin auth)
          try {
            const rosters = await db.entities.CoachRoster.filter({ athlete_id: athleteId });
            const rosterList = Array.isArray(rosters) ? rosters : [];
            for (const r of rosterList) {
              const rid = String(r.id || r._id || r.uuid || "");
              if (!rid) continue;
              try {
                await db.entities.CoachRoster.update(rid, { account_id: realId });
                updated++;
              } catch (e) {
                errors.push(`CoachRoster ${rid} claim update failed: ${(e as Error).message}`);
              }
            }
          } catch (e) {
            errors.push(`CoachRoster filter failed for athlete ${athleteId}: ${(e as Error).message}`);
          }
        }

        // Write SchoolPreference bridge (asServiceRole — must be asServiceRole so
        // getMyAthleteProfiles can read it back via asServiceRole in Step 3)
        if (athleteProfileIds.length > 0) {
          try {
            await writeAthleteLink(sr, realId, athleteProfileIds[0]);
          } catch (e) {
            errors.push(`writeAthleteLink(${realId}) failed: ${(e as Error).message}`);
          }
        }
      }

    } else if (type === "coach") {
      if (!inviteCode) {
        return Response.json({ ok: false, error: "inviteCode required for coach slots" }, { status: 400 });
      }

      // Coach records are admin-created — use caller admin auth
      const record = await findCoachByInviteCode(db, inviteCode);
      if (!record) {
        errors.push(`Coach not found: invite_code=${inviteCode}`);
      } else {
        const coachId = String(record.id || record._id || record.uuid || "");
        try {
          await db.entities.Coach.update(coachId, { account_id: realId });
          updated++;
        } catch (e) {
          errors.push(`Coach ${coachId} update failed: ${(e as Error).message}`);
        }
      }

    } else {
      return Response.json({ ok: false, error: `Unknown slot type: ${type}` }, { status: 400 });
    }

  } catch (e) {
    console.error("claimSlotProfiles unhandled error:", (e as Error).message);
    return Response.json({
      ok: false,
      functionVersion: "claimSlotProfiles_v_livecheck_1",
      error: (e as Error).message,
      updated, errors, athleteProfileIds,
      athleteProfileReverted, schoolPreferenceCleared, rosterReverted,
    }, { status: 500 });
  }

  return Response.json({
    ok: true,
    functionVersion: "claimSlotProfiles_v_livecheck_1",
    updated,
    errors,
    athleteProfileIds,
    athleteProfileReverted,
    schoolPreferenceCleared,
    rosterReverted,
  });
});
