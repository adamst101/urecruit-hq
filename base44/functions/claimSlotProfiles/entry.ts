// functions/claimSlotProfiles/entry.ts
//
// ════════════════════════════════════════════════════════════════════════════
// ATHLETE LINK BRIDGE — WHY THIS EXISTS
// ════════════════════════════════════════════════════════════════════════════
// AthleteProfile seed records are created by the admin via client-side
// base44.entities.AthleteProfile.create(). Base44's asServiceRole can ONLY
// query records that asServiceRole itself created. Admin-created records are
// permanently invisible to asServiceRole.filter() and .list(), regardless of
// any account_id update. Therefore:
//
//   getMyAthleteProfiles (which runs via asServiceRole) will NEVER find seed
//   profiles via account_id lookup alone.
//
// FIX (Case B — explicit mapping, not ownership transfer):
//   At claim time, this function writes a SchoolPreference record via
//   asServiceRole: { account_id: realAccountId, athlete_id: seedProfileId }.
//   Because SchoolPreference is written via asServiceRole, it IS visible to
//   subsequent asServiceRole reads in getMyAthleteProfiles.
//
// CANONICAL WRITE PATH for the link:
//   This function is the ONLY place that writes SchoolPreference.athlete_id
//   for the purpose of athlete linkage. Do not write or clear it ad hoc.
//
// CANONICAL READ PATH:
//   base44/functions/getMyAthleteProfiles/entry.ts — Step 3
//
// SAFE GUARD:
//   base44/functions/saveSchoolPreferences/entry.ts preserves athlete_id
//   unless an explicit new value is provided, so normal user activity
//   (saving target school preferences) does not break this link.
//
// UNLINK PATH:
//   Caller passes previousRealId when releasing a slot. This function clears
//   SchoolPreference.athlete_id for that account so it can no longer resolve
//   the athlete after the slot is released.
// ════════════════════════════════════════════════════════════════════════════
//
// Admin-only. Body: {
//   type: "family" | "coach",
//   realId: string,             — account ID to assign (syntheticId to release)
//   previousRealId?: string,    — real account ID being released (for unlink)
//   athletes?: { athleteName: string, gradYear: number }[],
//   inviteCode?: string,
// }
// Returns: { ok, updated, errors, athleteProfileIds }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ADMIN_EMAILS = [
  "adamst101@gmail.com",
  "adamst1@gmail.com",
];

// A realId that starts with this prefix is a synthetic/seed ID (release op)
const FT_SYNTHETIC_PREFIX = "__hc_ft_";

// ── SchoolPreference link helpers ────────────────────────────────────────────

async function readAthleteLink(
  asServiceRole: any,
  accountId: string,
): Promise<{ athleteId: string | null; prefId: string | null; multipleFound: boolean }> {
  const rows = await asServiceRole.entities.SchoolPreference
    .filter({ account_id: accountId })
    .catch(() => []) as any[];

  if (!Array.isArray(rows) || rows.length === 0) {
    return { athleteId: null, prefId: null, multipleFound: false };
  }

  const multipleFound = rows.length > 1;
  const row = rows[0];
  return {
    athleteId: row.athlete_id ? String(row.athlete_id) : null,
    prefId: String(row.id || row._id || ""),
    multipleFound,
  };
}

async function writeAthleteLink(
  asServiceRole: any,
  accountId: string,
  athleteId: string,
): Promise<void> {
  const { prefId } = await readAthleteLink(asServiceRole, accountId);
  if (prefId) {
    await asServiceRole.entities.SchoolPreference.update(prefId, { athlete_id: athleteId });
  } else {
    await asServiceRole.entities.SchoolPreference.create({
      account_id: accountId,
      athlete_id: athleteId,
    });
  }
  console.log(`[claimSlotProfiles] wrote athlete link: account=${accountId} -> athlete=${athleteId}`);
}

async function clearAthleteLink(
  asServiceRole: any,
  accountId: string,
): Promise<void> {
  const { prefId, athleteId } = await readAthleteLink(asServiceRole, accountId);
  if (!prefId) {
    console.log(`[claimSlotProfiles] clearAthleteLink: no SchoolPreference found for account=${accountId}`);
    return;
  }
  await asServiceRole.entities.SchoolPreference.update(prefId, { athlete_id: null });
  console.log(`[claimSlotProfiles] cleared athlete link: account=${accountId} (was -> athlete=${athleteId})`);
}

// ── AthleteProfile lookup (two-step: filter then list-scan) ─────────────────

async function findAthleteProfiles(
  asServiceRole: any,
  athleteName: string,
  gradYear: number,
): Promise<any[]> {
  // Step 1: asServiceRole filter (works if records were created via asServiceRole)
  try {
    const res = await asServiceRole.entities.AthleteProfile.filter({
      athlete_name: athleteName,
      grad_year: gradYear,
    });
    if (Array.isArray(res) && res.length > 0) return res;
  } catch (_e) { /* fall through */ }

  // Step 2: list + in-process match (for admin-created seed profiles)
  try {
    const all = await asServiceRole.entities.AthleteProfile.list("-created_date", 2000);
    if (Array.isArray(all)) {
      const matched = all.filter((r: any) =>
        r.athlete_name === athleteName &&
        String(r.grad_year) === String(gradYear)
      );
      console.log(`[claimSlotProfiles] list scan: scanned ${all.length}, matched ${matched.length} for "${athleteName}" ${gradYear}`);
      return matched;
    }
  } catch (listErr) {
    console.warn("[claimSlotProfiles] list scan failed:", (listErr as Error).message);
  }

  return [];
}

async function findCoach(asServiceRole: any, inviteCode: string): Promise<any | null> {
  try {
    const res = await asServiceRole.entities.Coach.filter({ invite_code: inviteCode });
    if (Array.isArray(res) && res.length > 0) return res[0];
  } catch (_e) { /* fall through */ }

  try {
    const all = await asServiceRole.entities.Coach.list("-created_date", 500);
    if (Array.isArray(all)) {
      return all.find((r: any) => r.invite_code === inviteCode) ?? null;
    }
  } catch (_e) { /* ignore */ }

  return null;
}

// ── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Require admin
  const caller = await base44.auth.me().catch(() => null);
  if (!caller) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const isAdmin = caller.role === "admin" || ADMIN_EMAILS.includes(caller.email);
  if (!isAdmin) {
    return Response.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  let body: {
    type?: string;
    realId?: string;
    previousRealId?: string;
    athletes?: { athleteName: string; gradYear: number }[];
    inviteCode?: string;
  } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const { type, realId, previousRealId, athletes, inviteCode } = body;

  if (!type || !realId) {
    return Response.json({ ok: false, error: "type and realId are required" }, { status: 400 });
  }

  const isRelease = realId.startsWith(FT_SYNTHETIC_PREFIX);
  const sr = base44.asServiceRole;
  let updated = 0;
  const errors: string[] = [];
  const athleteProfileIds: string[] = [];

  try {
    if (type === "family") {
      if (!Array.isArray(athletes) || athletes.length === 0) {
        return Response.json({ ok: false, error: "athletes array required for family slots" }, { status: 400 });
      }

      for (const { athleteName, gradYear } of athletes) {
        const matches = await findAthleteProfiles(sr, athleteName, gradYear);

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

        // Update AthleteProfile.account_id (best-effort; may not persist for admin-created records)
        try {
          await sr.entities.AthleteProfile.update(athleteId, { account_id: realId });
          updated++;
        } catch (e) {
          errors.push(`AthleteProfile ${athleteId} account_id update: ${(e as Error).message}`);
          // Non-fatal — SchoolPreference link is the canonical mapping
        }

        // Update CoachRoster records referencing this athlete
        const rosters = await sr.entities.CoachRoster.filter({ athlete_id: athleteId })
          .catch(() => []) as any[];

        for (const r of rosters) {
          const rid = String(r.id || r._id || r.uuid || "");
          if (!rid) continue;
          try {
            await sr.entities.CoachRoster.update(rid, { account_id: realId });
            updated++;
          } catch (e) {
            errors.push(`CoachRoster ${rid} update: ${(e as Error).message}`);
          }
        }
      }

      // ── SchoolPreference link: write on claim, clear on release ─────────────
      if (isRelease) {
        // Release: clear the link for the account that previously held this slot.
        // previousRealId must be provided by the caller (FT page captures it before release).
        if (previousRealId && !previousRealId.startsWith(FT_SYNTHETIC_PREFIX)) {
          try {
            await clearAthleteLink(sr, previousRealId);
          } catch (e) {
            errors.push(`clearAthleteLink for ${previousRealId}: ${(e as Error).message}`);
          }
        } else {
          errors.push("Release called without previousRealId — SchoolPreference link NOT cleared. Old account may still resolve this athlete.");
        }
      } else {
        // Claim: write the link for the new real account.
        if (athleteProfileIds.length > 0) {
          try {
            await writeAthleteLink(sr, realId, athleteProfileIds[0]);
          } catch (e) {
            errors.push(`writeAthleteLink for ${realId}: ${(e as Error).message}`);
          }
        }
      }

    } else if (type === "coach") {
      if (!inviteCode) {
        return Response.json({ ok: false, error: "inviteCode required for coach slots" }, { status: 400 });
      }

      const record = await findCoach(sr, inviteCode);
      if (!record) {
        errors.push(`Coach not found: invite_code ${inviteCode}`);
      } else {
        const coachId = String(record.id || record._id || record.uuid || "");
        try {
          await sr.entities.Coach.update(coachId, { account_id: realId });
          updated++;
        } catch (e) {
          errors.push(`Coach ${coachId} update: ${(e as Error).message}`);
        }
      }

    } else {
      return Response.json({ ok: false, error: `Unknown slot type: ${type}` }, { status: 400 });
    }

  } catch (e) {
    console.error("claimSlotProfiles error:", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message, updated, errors, athleteProfileIds }, { status: 500 });
  }

  return Response.json({ ok: true, updated, errors, athleteProfileIds });
});
