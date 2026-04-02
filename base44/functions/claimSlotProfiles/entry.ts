// functions/claimSlotProfiles/entry.ts
//
// ════════════════════════════════════════════════════════════════════════════
// VISIBILITY MODEL — READ THIS BEFORE EDITING
// ════════════════════════════════════════════════════════════════════════════
//
// FT seed records are created by manageFtSeeds/entry.ts via asServiceRole.
// asServiceRole can ONLY see/mutate records it created. Therefore:
//
//   base44.asServiceRole.entities.*  — used for ALL seed entity ops
//     • AthleteProfile, CoachRoster, Coach — seed records are SR-created,
//       so SR filter/list/update/delete work on them.
//     • SchoolPreference — bridge written via SR at claim time; readable
//       and clearable via SR at release time.
//
//   base44.entities.*  (caller admin auth) — NOT used for seed entity ops
//     • Would return empty for SR-created records ("not found" or []).
//     • AthleteProfile account_id mutation is still attempted via caller auth
//       as a best-effort non-critical operation; it will fail, which is fine —
//       workspace access is via SchoolPreference bridge not account_id.
//
// ATHLETE LINK BRIDGE (why SchoolPreference exists):
//   getMyAthleteProfiles Attempt 1 uses SR list scan. SR-created AthleteProfiles
//   are visible there directly. SchoolPreference { account_id: realId,
//   athlete_id: seedId } is also written via SR so that Step 3 finds it.
//   Both paths lead to the same athlete — belt-and-suspenders.
//
// CANONICAL WRITE PATH:  this file (claimSlotProfiles)
// CANONICAL READ PATH:   base44/functions/getMyAthleteProfiles/entry.ts
// SEED WRITE PATH:       base44/functions/manageFtSeeds/entry.ts
// SAFEGUARD:             base44/functions/saveSchoolPreferences/entry.ts
//                        preserves athlete_id unless explicitly changed.
// ════════════════════════════════════════════════════════════════════════════
//
// Admin-only. Body: {
//   type: "family" | "coach",
//   realId: string,                    — account ID to assign (syntheticId on release)
//   syntheticId?: string,              — synthetic account ID of the slot
//   previousRealId?: string,           — real account ID being released
//   athletes?: { athleteName, gradYear }[],
//   inviteCode?: string,
//   knownAthleteProfileIds?: string[], — client-discovered IDs from manageFtSeeds discover
// }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const ADMIN_EMAILS = [
  "adamst101@gmail.com",
  "adamst1@gmail.com",
];

const FT_SYNTHETIC_PREFIX = "__hc_ft_";

// ── SchoolPreference helpers (SR — written via SR, readable/writable via SR) ──

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

// ── AthleteProfile lookup — SR only (seed records are SR-created) ─────────────

async function findAthleteProfilesByName(
  sr: any,
  athleteName: string,
  gradYear: number,
): Promise<any[]> {
  // Filter by name + grad_year via SR
  try {
    const res = await sr.entities.AthleteProfile.filter({
      athlete_name: athleteName,
      grad_year: gradYear,
    });
    if (Array.isArray(res) && res.length > 0) {
      console.log(`[claimSlotProfiles] SR filter found ${res.length} profiles for "${athleteName}" ${gradYear}`);
      return res;
    }
  } catch (_e) { /* fall through */ }

  // SR list-scan fallback
  try {
    const all = await sr.entities.AthleteProfile.list("-created_date", 2000);
    if (Array.isArray(all)) {
      const matched = all.filter((r: any) =>
        r.athlete_name === athleteName && String(r.grad_year) === String(gradYear)
      );
      console.log(`[claimSlotProfiles] SR list-scan: ${all.length} total, ${matched.length} matched "${athleteName}" ${gradYear}`);
      return matched;
    }
  } catch (e) {
    console.warn("[claimSlotProfiles] SR list-scan failed:", (e as Error).message);
  }

  return [];
}

async function findCoachByInviteCode(sr: any, inviteCode: string): Promise<any | null> {
  try {
    const res = await sr.entities.Coach.filter({ invite_code: inviteCode });
    if (Array.isArray(res) && res.length > 0) return res[0];
  } catch (_e) { /* fall through */ }

  try {
    const all = await sr.entities.Coach.list("-created_date", 500);
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
    syntheticId?: string;
    previousRealId?: string;
    athletes?: { athleteName: string; gradYear: number }[];
    inviteCode?: string;
    knownAthleteProfileIds?: string[];
  } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const { type, realId, syntheticId, previousRealId, athletes, inviteCode, knownAthleteProfileIds } = body;

  if (!type || !realId) {
    return Response.json({ ok: false, error: "type and realId are required" }, { status: 400 });
  }

  const isRelease = realId.startsWith(FT_SYNTHETIC_PREFIX);
  const sr = base44.asServiceRole;  // ALL seed entity ops — seeds are SR-created

  let updated = 0;
  let athleteProfileReverted = 0;
  let schoolPreferenceUpdated = 0;
  let rosterReverted = 0;
  let lookupMethod = "n/a";
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
        //   1. knownAthleteProfileIds from client (returned by manageFtSeeds discover)
        //   2. SchoolPreference bridge (written at claim time via SR)
        //
        // All AthleteProfile/CoachRoster reverts use SR — seeds are SR-created.
        // SchoolPreference clear uses SR — it created that record.

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

          // ── SchoolPreference bridge clear — canonical release operation ───────
          if (prefId) {
            try {
              const { cleared } = await clearAthleteLink(sr, previousRealId);
              schoolPreferenceUpdated += cleared;
              updated += cleared;
            } catch (e) {
              errors.push(`clearAthleteLink(${previousRealId}) failed: ${(e as Error).message}`);
            }
          } else {
            errors.push(`No SchoolPreference bridge found for ${previousRealId} — slot may already be released`);
          }

          // ── Best-effort: revert AthleteProfile/CoachRoster account_id ────────
          // Seeds are SR-created, so SR can update them. account_id revert is
          // still non-critical since workspace data is filtered by athlete_id.
          if (idsToRevert.length > 0) {
            for (const aid of idsToRevert) {
              athleteProfileIds.push(aid);

              try {
                await sr.entities.AthleteProfile.update(aid, { account_id: realId });
                athleteProfileReverted++;
              } catch (e) {
                errors.push(`AthleteProfile ${aid} revert failed [non-critical]: ${(e as Error).message}`);
              }

              try {
                const rosters = await sr.entities.CoachRoster.filter({ athlete_id: aid });
                const rosterList = Array.isArray(rosters) ? rosters : [];
                for (const r of rosterList) {
                  const rid = String(r.id || r._id || r.uuid || "");
                  if (!rid) continue;
                  try {
                    await sr.entities.CoachRoster.update(rid, { account_id: realId });
                    rosterReverted++;
                  } catch (e) {
                    errors.push(`CoachRoster ${rid} revert failed [non-critical]: ${(e as Error).message}`);
                  }
                }
              } catch (e) {
                errors.push(`CoachRoster filter failed for athlete ${aid} [non-critical]: ${(e as Error).message}`);
              }

              // Revert RecruitingActivity.account_id back to syntheticId.
              // On release, realId === syntheticId — the slot's placeholder account.
              try {
                const acts = await sr.entities.RecruitingActivity.filter({ athlete_id: aid });
                const actList = Array.isArray(acts) ? acts : [];
                for (const a of actList) {
                  const actId = String(a.id ?? a._id ?? "");
                  if (!actId) continue;
                  try {
                    await sr.entities.RecruitingActivity.update(actId, { account_id: realId }); // realId = syntheticId on release
                  } catch (e) {
                    errors.push(`RecruitingActivity ${actId} account_id revert [non-critical]: ${(e as Error).message}`);
                  }
                }
                console.log(`[claimSlotProfiles] reverted ${actList.length} RecruitingActivity.account_id for athlete ${aid} → ${realId} (syntheticId)`);
              } catch (e) {
                errors.push(`RecruitingActivity filter for athlete ${aid} [non-critical]: ${(e as Error).message}`);
              }
            }
          }
        }

      } else {
        // ── CLAIM PATH ───────────────────────────────────────────────────────
        // Seeds are SR-created (via manageFtSeeds). All lookup tiers use SR.
        //
        //   Tier 1: knownAthleteProfileIds from client
        //     Client called manageFtSeeds{action:discover} which used SR to
        //     list all seed records and returned their IDs. Most reliable.
        //
        //   Tier 2: account_id === syntheticId via SR filter
        //     Before claim, seed athlete has account_id = syntheticId.
        //     SR can filter by that since SR created the record.
        //
        //   Tier 3: athlete_name + grad_year via SR
        //     Last resort. Used if Tiers 1 and 2 produce nothing.

        const clientIds = Array.isArray(knownAthleteProfileIds)
          ? knownAthleteProfileIds.filter(Boolean)
          : [];

        if (clientIds.length === 0 && !syntheticId) {
          return Response.json({
            ok: false,
            functionVersion: "claimSlotProfiles_v_livecheck_1",
            state: "missing_canonical_identifiers",
            lookupMethod: "none",
            updated: 0,
            errors: [
              "Claim rejected: neither knownAthleteProfileIds nor syntheticId was provided. " +
              "The client must send at least one canonical identifier.",
            ],
            athleteProfileIds: [],
            athleteProfileReverted: 0,
            schoolPreferenceUpdated: 0,
            rosterReverted: 0,
          });
        }

        let resolvedProfiles: any[] = [];

        if (clientIds.length > 0) {
          // Tier 1 — SR filter by id (seed records are SR-created, SR can find them)
          lookupMethod = "client_ids";
          for (const id of clientIds) {
            try {
              const found = await sr.entities.AthleteProfile.filter({ id }).catch(() => null);
              if (Array.isArray(found) && found.length > 0) {
                resolvedProfiles.push(found[0]);
              } else {
                // ID known from client discover — use it even without full record
                resolvedProfiles.push({ id });
              }
            } catch (_e) {
              resolvedProfiles.push({ id });
            }
          }
          console.log(`[claimSlotProfiles] claim tier1 client_ids via SR: ${JSON.stringify(clientIds)}`);
        }

        if (resolvedProfiles.length === 0 && syntheticId) {
          // Tier 2 — SR filter by account_id === syntheticId
          lookupMethod = "synthetic_account_id";
          try {
            const res = await sr.entities.AthleteProfile.filter({ account_id: syntheticId });
            if (Array.isArray(res) && res.length > 0) {
              resolvedProfiles = res;
              console.log(`[claimSlotProfiles] claim tier2 SR filter found ${res.length} profiles for account_id=${syntheticId}`);
            } else {
              // SR list-scan fallback for tier 2
              const all = await sr.entities.AthleteProfile.list("-created_date", 2000).catch(() => []);
              if (Array.isArray(all)) {
                resolvedProfiles = all.filter((r: any) => r.account_id === syntheticId);
                console.log(`[claimSlotProfiles] claim tier2 SR list-scan: ${all.length} total, ${resolvedProfiles.length} matched account_id=${syntheticId}`);
              }
            }
          } catch (e) {
            errors.push(`Tier2 syntheticId SR lookup failed: ${(e as Error).message}`);
          }
        }

        if (resolvedProfiles.length === 0) {
          // Tier 3 — SR name + grad_year
          lookupMethod = "name_fallback";
          for (const { athleteName, gradYear } of athletes) {
            const matches = await findAthleteProfilesByName(sr, athleteName, gradYear);
            resolvedProfiles.push(...matches);
          }
          console.log(`[claimSlotProfiles] claim tier3 SR name_fallback found ${resolvedProfiles.length} profiles`);
        }

        if (resolvedProfiles.length === 0) {
          errors.push(`AthleteProfile not found via any SR lookup (tried: ${lookupMethod}) for syntheticId=${syntheticId}`);
        }

        for (const record of resolvedProfiles) {
          const athleteId = String(record.id || record._id || record.uuid || "");
          if (!athleteId) {
            errors.push(`AthleteProfile has no id (lookupMethod=${lookupMethod})`);
            continue;
          }

          athleteProfileIds.push(athleteId);

          // Best-effort: update AthleteProfile.account_id via SR (SR-created, SR can update).
          // Not required for workspace access — workspace filters by athlete_id via
          // SchoolPreference bridge. Logged as non-critical if it fails.
          try {
            await sr.entities.AthleteProfile.update(athleteId, { account_id: realId });
            athleteProfileReverted++;
          } catch (e) {
            errors.push(`AthleteProfile ${athleteId} update failed [non-critical]: ${(e as Error).message}`);
          }

          // Best-effort: update CoachRoster.account_id via SR.
          try {
            const rosters = await sr.entities.CoachRoster.filter({ athlete_id: athleteId });
            const rosterList = Array.isArray(rosters) ? rosters : [];
            for (const r of rosterList) {
              const rid = String(r.id || r._id || r.uuid || "");
              if (!rid) continue;
              try {
                await sr.entities.CoachRoster.update(rid, { account_id: realId });
                rosterReverted++;
              } catch (e) {
                errors.push(`CoachRoster ${rid} update failed [non-critical]: ${(e as Error).message}`);
              }
            }
          } catch (e) {
            errors.push(`CoachRoster filter failed for athlete ${athleteId} [non-critical]: ${(e as Error).message}`);
          }

          // Update RecruitingActivity.account_id so getRecruitingJourney can find them.
          // getRecruitingJourney filters by account_id === realId; seeds are created
          // with account_id === syntheticId. Without this update activities are invisible
          // to the real user after claim.
          try {
            const acts = await sr.entities.RecruitingActivity.filter({ athlete_id: athleteId });
            const actList = Array.isArray(acts) ? acts : [];
            for (const a of actList) {
              const actId = String(a.id ?? a._id ?? "");
              if (!actId) continue;
              try {
                await sr.entities.RecruitingActivity.update(actId, { account_id: realId });
              } catch (e) {
                errors.push(`RecruitingActivity ${actId} account_id update [non-critical]: ${(e as Error).message}`);
              }
            }
            console.log(`[claimSlotProfiles] updated ${actList.length} RecruitingActivity.account_id for athlete ${athleteId} → ${realId}`);
          } catch (e) {
            errors.push(`RecruitingActivity filter for athlete ${athleteId} [non-critical]: ${(e as Error).message}`);
          }
        }

        // ── SchoolPreference bridge write — canonical claim operation ─────────
        // getMyAthleteProfiles Step 3 reads this bridge. Attempt 1 (SR list scan)
        // will also find the SR-created athlete directly. Both paths succeed.
        if (athleteProfileIds.length > 0) {
          try {
            await writeAthleteLink(sr, realId, athleteProfileIds[0]);
            schoolPreferenceUpdated++;
            updated++;
          } catch (e) {
            errors.push(`writeAthleteLink(${realId}) failed: ${(e as Error).message}`);
          }
        }
      }

    } else if (type === "coach") {
      if (!inviteCode) {
        return Response.json({ ok: false, error: "inviteCode required for coach slots" }, { status: 400 });
      }

      // Coach seed records are SR-created — use SR for lookup and update
      const record = await findCoachByInviteCode(sr, inviteCode);
      if (!record) {
        errors.push(`Coach not found via SR: invite_code=${inviteCode}`);
      } else {
        const coachId = String(record.id || record._id || record.uuid || "");
        try {
          await sr.entities.Coach.update(coachId, { account_id: realId });
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
      lookupMethod,
      updated, errors, athleteProfileIds,
      athleteProfileReverted, schoolPreferenceUpdated, rosterReverted,
    }, { status: 500 });
  }

  return Response.json({
    ok: true,
    functionVersion: "claimSlotProfiles_v_livecheck_1",
    lookupMethod,
    updated,
    errors,
    athleteProfileIds,
    athleteProfileReverted,
    schoolPreferenceUpdated,
    rosterReverted,
  });
});
