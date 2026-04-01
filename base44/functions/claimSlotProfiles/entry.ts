// functions/claimSlotProfiles/entry.ts
//
// Admin-only server function to claim or release a seed slot by updating
// account_id on AthleteProfile, CoachRoster, and Coach records using asServiceRole.
//
// Client-side AthleteProfile.filter({}) only returns records the caller owns
// (account_id = caller.id). Seed profiles are owned by a synthetic ID like
// "__hc_ft_family1", so a client-side filter always misses them. This function
// bypasses that restriction via asServiceRole.
//
// Body: {
//   type: "family" | "coach",
//   realId: string,                           // account ID to write (or syntheticId to release)
//   athletes?: { athleteName: string, gradYear: number }[],  // for family slots
//   inviteCode?: string,                       // for coach slots
// }
//
// Returns: { ok, updated, errors }

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

  try {
    if (type === "family") {
      if (!Array.isArray(athletes) || athletes.length === 0) {
        return Response.json({ ok: false, error: "athletes array required for family slots" }, { status: 400 });
      }

      for (const { athleteName, gradYear } of athletes) {
        // Find the AthleteProfile by athlete_name + grad_year using service role
        const matches = await base44.asServiceRole.entities.AthleteProfile.filter({
          athlete_name: athleteName,
          grad_year: gradYear,
        });

        if (!Array.isArray(matches) || matches.length === 0) {
          errors.push(`AthleteProfile not found: ${athleteName} ${gradYear}`);
          continue;
        }

        const record = matches[0];
        const athleteId = record.id || record._id || record.uuid;

        try {
          await base44.asServiceRole.entities.AthleteProfile.update(String(athleteId), { account_id: realId });
          updated++;
        } catch (e) {
          errors.push(`AthleteProfile ${athleteId} update failed: ${(e as Error).message}`);
          continue;
        }

        // Update CoachRoster records referencing this athlete
        const rosters = await base44.asServiceRole.entities.CoachRoster.filter({
          athlete_id: String(athleteId),
        }).catch(() => []);

        for (const r of rosters) {
          const rid = r.id || r._id || r.uuid;
          try {
            await base44.asServiceRole.entities.CoachRoster.update(String(rid), { account_id: realId });
            updated++;
          } catch (e) {
            errors.push(`CoachRoster ${rid} update failed: ${(e as Error).message}`);
          }
        }
      }

    } else if (type === "coach") {
      if (!inviteCode) {
        return Response.json({ ok: false, error: "inviteCode required for coach slots" }, { status: 400 });
      }

      const matches = await base44.asServiceRole.entities.Coach.filter({
        invite_code: inviteCode,
      });

      if (!Array.isArray(matches) || matches.length === 0) {
        errors.push(`Coach not found: invite_code ${inviteCode}`);
      } else {
        const record = matches[0];
        const coachId = record.id || record._id || record.uuid;
        try {
          await base44.asServiceRole.entities.Coach.update(String(coachId), { account_id: realId });
          updated++;
        } catch (e) {
          errors.push(`Coach ${coachId} update failed: ${(e as Error).message}`);
        }
      }

    } else {
      return Response.json({ ok: false, error: `Unknown slot type: ${type}` }, { status: 400 });
    }

  } catch (e) {
    console.error("claimSlotProfiles error:", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message, updated, errors }, { status: 500 });
  }

  return Response.json({ ok: true, updated, errors });
});
