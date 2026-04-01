// functions/claimSlotProfiles/entry.ts
//
// Admin-only server function to claim or release a seed slot.
//
// Core problem this solves:
//   AthleteProfile seed records are created by the admin via client-side
//   base44.entities.AthleteProfile.create(). In Base44, asServiceRole can only
//   see records it created. So getMyAthleteProfiles (which uses asServiceRole)
//   can NEVER find admin-created seed profiles, regardless of whether
//   account_id is updated.
//
// Fix: at claim time, write a SchoolPreference record via asServiceRole with
//   { account_id: realAccountId, athlete_id: seedAthleteProfileId }.
//   Since SchoolPreference is written via asServiceRole, getMyAthleteProfiles
//   can READ it via asServiceRole and resolve the athlete profile by ID.
//
// Body: {
//   type: "family" | "coach",
//   realId: string,
//   athletes?: { athleteName: string, gradYear: number }[],   // family slots
//   inviteCode?: string,                                       // coach slots
// }
//
// Returns: { ok, updated, errors, athleteProfileIds }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ADMIN_EMAILS = [
  "adamst101@gmail.com",
  "adamst1@gmail.com",
];

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

  let body: { type?: string; realId?: string; athletes?: { athleteName: string; gradYear: number }[]; inviteCode?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const { type, realId, athletes, inviteCode } = body;

  if (!type || !realId) {
    return Response.json({ ok: false, error: "type and realId are required" }, { status: 400 });
  }

  let updated = 0;
  const errors: string[] = [];
  const athleteProfileIds: string[] = [];  // IDs found — returned for diagnostics + SchoolPref link

  try {
    if (type === "family") {
      if (!Array.isArray(athletes) || athletes.length === 0) {
        return Response.json({ ok: false, error: "athletes array required for family slots" }, { status: 400 });
      }

      for (const { athleteName, gradYear } of athletes) {
        // Try asServiceRole filter first (works if seeds were created via asServiceRole)
        let matches: any[] = [];
        try {
          const res = await base44.asServiceRole.entities.AthleteProfile.filter({
            athlete_name: athleteName,
            grad_year: gradYear,
          });
          if (Array.isArray(res)) matches = res;
        } catch (_e) {
          matches = [];
        }

        // If asServiceRole filter found nothing, the profiles were admin-created (not via asServiceRole).
        // Fall back to listing all and matching in-process.
        if (matches.length === 0) {
          try {
            const all = await base44.asServiceRole.entities.AthleteProfile.list("-created_date", 2000);
            if (Array.isArray(all)) {
              matches = all.filter((r: any) =>
                r.athlete_name === athleteName &&
                String(r.grad_year) === String(gradYear)
              );
              console.log(`[claimSlotProfiles] asServiceRole list fallback: scanned ${all.length}, matched ${matches.length} for ${athleteName} ${gradYear}`);
            }
          } catch (listErr) {
            console.warn("[claimSlotProfiles] list fallback failed:", (listErr as Error).message);
          }
        }

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

        // Attempt account_id update (may or may not persist depending on Base44 ownership model)
        try {
          await base44.asServiceRole.entities.AthleteProfile.update(athleteId, { account_id: realId });
          updated++;
        } catch (e) {
          errors.push(`AthleteProfile ${athleteId} update attempt: ${(e as Error).message}`);
          // Do NOT continue — we still write the SchoolPref link below
        }

        // Update CoachRoster records referencing this athlete
        const rosters = await base44.asServiceRole.entities.CoachRoster.filter({
          athlete_id: athleteId,
        }).catch(() => []) as any[];

        for (const r of rosters) {
          const rid = String(r.id || r._id || r.uuid || "");
          if (!rid) continue;
          try {
            await base44.asServiceRole.entities.CoachRoster.update(rid, { account_id: realId });
            updated++;
          } catch (e) {
            errors.push(`CoachRoster ${rid} update: ${(e as Error).message}`);
          }
        }
      }

      // ── Write SchoolPreference link (the canonical mapping for getMyAthleteProfiles) ──
      // SchoolPreference is written via asServiceRole so it IS visible to future
      // asServiceRole reads in getMyAthleteProfiles. This is the reliable link even
      // when AthleteProfile.account_id update is silently ignored by Base44.
      if (athleteProfileIds.length > 0) {
        const athleteIdValue = athleteProfileIds[0]; // primary (first); multi-athlete families store first
        try {
          const existingPrefs = await base44.asServiceRole.entities.SchoolPreference
            .filter({ account_id: realId })
            .catch(() => []) as any[];

          if (Array.isArray(existingPrefs) && existingPrefs.length > 0) {
            const prefId = String(existingPrefs[0].id || existingPrefs[0]._id || "");
            if (prefId) {
              await base44.asServiceRole.entities.SchoolPreference.update(prefId, {
                athlete_id: athleteIdValue,
              });
            }
          } else {
            await base44.asServiceRole.entities.SchoolPreference.create({
              account_id: realId,
              athlete_id: athleteIdValue,
            });
          }
          console.log(`[claimSlotProfiles] SchoolPreference link written: account=${realId} -> athlete=${athleteIdValue}`);
        } catch (prefErr) {
          errors.push(`SchoolPreference link failed: ${(prefErr as Error).message}`);
        }
      }

    } else if (type === "coach") {
      if (!inviteCode) {
        return Response.json({ ok: false, error: "inviteCode required for coach slots" }, { status: 400 });
      }

      let matches: any[] = [];
      try {
        const res = await base44.asServiceRole.entities.Coach.filter({ invite_code: inviteCode });
        if (Array.isArray(res)) matches = res;
      } catch (_e) {
        matches = [];
      }

      if (matches.length === 0) {
        // List fallback for admin-created coach records
        try {
          const all = await base44.asServiceRole.entities.Coach.list("-created_date", 500);
          if (Array.isArray(all)) {
            matches = all.filter((r: any) => r.invite_code === inviteCode);
          }
        } catch (_listErr) { /* ignore */ }
      }

      if (matches.length === 0) {
        errors.push(`Coach not found: invite_code ${inviteCode}`);
      } else {
        const record = matches[0];
        const coachId = String(record.id || record._id || record.uuid || "");
        try {
          await base44.asServiceRole.entities.Coach.update(coachId, { account_id: realId });
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
