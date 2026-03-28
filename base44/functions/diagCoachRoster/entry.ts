// functions/diagCoachRoster/entry.ts
// Diagnostic: tests every step of coach roster linking and returns
// exactly what happens — no silent catches.
// Call with { inviteCode, dryRun: true } to test without writing.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const { inviteCode, dryRun = true } = await req.json().catch(() => ({}));
  if (!inviteCode) return Response.json({ ok: false, error: "inviteCode required" }, { status: 400 });

  const accountId = user.id;
  const normalizedCode = String(inviteCode).trim().toUpperCase();
  const steps: Record<string, unknown> = {};

  // ── Step 1: Look up Coach by invite_code ──
  let coaches: unknown[] = [];
  try {
    const raw = await base44.asServiceRole.entities.Coach.filter({ invite_code: normalizedCode });
    coaches = Array.isArray(raw) ? raw : [];
    steps.coach_lookup = {
      ok: true,
      count: coaches.length,
      coaches: coaches.map((c: any) => ({
        id: c.id,
        status: c.status,
        active: c.active,
        invite_code: c.invite_code,
        first_name: c.first_name,
        last_name: c.last_name,
      })),
    };
  } catch (e) {
    steps.coach_lookup = { ok: false, error: (e as Error).message };
    return Response.json({ ok: false, steps });
  }

  if (coaches.length === 0) {
    steps.verdict = `No coach found with invite_code="${normalizedCode}"`;
    return Response.json({ ok: false, steps });
  }

  const coach = (coaches as any[]).find(c => c.status === "approved") || null;
  if (!coach) {
    steps.verdict = `Coach found but status="${(coaches[0] as any).status}" — must be "approved"`;
    return Response.json({ ok: false, steps });
  }

  const coachId = coach.id;
  steps.coach_resolved = { id: coachId, name: `${coach.first_name} ${coach.last_name}` };

  // ── Step 2: Check existing roster entry ──
  let existingRoster: unknown[] = [];
  try {
    const raw = await base44.asServiceRole.entities.CoachRoster.filter({
      coach_id: coachId,
      account_id: accountId,
    });
    existingRoster = Array.isArray(raw) ? raw : [];
    steps.roster_check = { ok: true, existing_count: existingRoster.length };
  } catch (e) {
    steps.roster_check = { ok: false, error: (e as Error).message };
    // This is the most likely place it's failing — CoachRoster entity may not exist
    return Response.json({ ok: false, steps });
  }

  if (existingRoster.length > 0) {
    steps.verdict = "Already on roster — no action needed";
    return Response.json({ ok: true, already_connected: true, steps });
  }

  // ── Step 3: Look up AthleteProfile ──
  let athleteId = "";
  let athleteName = "";
  let gradYear = null;
  try {
    const profiles = await base44.asServiceRole.entities.AthleteProfile.filter({ account_id: accountId });
    const list = Array.isArray(profiles) ? profiles : [];
    const primary = list.find((p: any) => p.is_primary && p.active !== false)
      || list.find((p: any) => p.active !== false)
      || list[0]
      || null;
    athleteId = primary?.id || "";
    athleteName = primary ? [primary.first_name, primary.last_name].filter(Boolean).join(" ") : "";
    gradYear = primary?.grad_year || null;
    steps.profile_lookup = { ok: true, profile_count: list.length, resolved_athlete_id: athleteId, athlete_name: athleteName };
  } catch (e) {
    steps.profile_lookup = { ok: false, error: (e as Error).message };
  }

  // ── Step 4: Create CoachRoster (skipped if dryRun) ──
  if (dryRun) {
    steps.roster_create = { skipped: true, reason: "dryRun=true — would create with:", payload: {
      coach_id: coachId,
      account_id: accountId,
      athlete_id: athleteId,
      athlete_name: athleteName,
      athlete_grad_year: gradYear,
      invite_code: normalizedCode,
      joined_at: new Date().toISOString(),
    }};
    return Response.json({ ok: true, dry_run: true, steps });
  }

  try {
    const created = await base44.asServiceRole.entities.CoachRoster.create({
      coach_id: coachId,
      account_id: accountId,
      athlete_id: athleteId,
      athlete_name: athleteName,
      athlete_grad_year: gradYear,
      invite_code: normalizedCode,
      joined_at: new Date().toISOString(),
    });
    steps.roster_create = { ok: true, id: (created as any)?.id };
  } catch (e) {
    steps.roster_create = { ok: false, error: (e as Error).message };
    return Response.json({ ok: false, steps });
  }

  return Response.json({ ok: true, linked: true, steps });
});
