// functions/linkToCoach/entry.ts
// Called by paid members (athletes/parents) to connect to a coach via invite code.
// Creates a CoachRoster entry if the code is valid and the athlete isn't already on the roster.
// Safe to call multiple times — idempotent.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" }, { status: 405 });

  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const accountId = user.id;

  const { inviteCode } = await req.json().catch(() => ({}));
  if (!inviteCode) return Response.json({ ok: false, error: "inviteCode required" }, { status: 400 });

  const normalizedCode = String(inviteCode).trim().toUpperCase();

  // Look up coach by invite code only — validate status in code.
  // Filtering by active:true can silently return [] if the field isn't an exact
  // boolean match in the underlying store, so we keep the DB filter minimal.
  let coaches = [];
  try {
    coaches = await base44.asServiceRole.entities.Coach.filter({ invite_code: normalizedCode });
    console.log("linkToCoach: code lookup returned", coaches?.length ?? "null", "coaches for code:", normalizedCode);
  } catch (e) {
    console.error("linkToCoach: coach lookup threw:", (e as Error).message);
    return Response.json({ ok: false, error: "Coach lookup failed: " + (e as Error).message }, { status: 500 });
  }

  if (!Array.isArray(coaches) || coaches.length === 0) {
    return Response.json({ ok: false, error: "Invite code not found. Double-check the code with your coach." }, { status: 404 });
  }

  // Find an approved coach — reject if pending/rejected
  const coach = coaches.find(c => c.status === "approved") || null;
  if (!coach) {
    const status = coaches[0]?.status || "unknown";
    console.warn("linkToCoach: coach found but status is", status);
    return Response.json({ ok: false, error: `Coach account is not yet approved (status: ${status}). Please wait for admin approval.` }, { status: 403 });
  }

  const coachId = coach.id;

  // Idempotency: skip if already on this coach's roster
  const existing = await base44.asServiceRole.entities.CoachRoster.filter({
    coach_id: coachId,
    account_id: accountId,
  }).catch(() => []);

  if (Array.isArray(existing) && existing.length > 0) {
    return Response.json({ ok: true, already_connected: true, coachName: `${coach.first_name || ""} ${coach.last_name || ""}`.trim() });
  }

  // Get athlete profile info to populate the roster entry
  const profiles = await base44.asServiceRole.entities.AthleteProfile.filter({
    account_id: accountId,
  }).catch(() => []);

  const primaryProfile = Array.isArray(profiles)
    ? (profiles.find(p => p.is_primary && p.active !== false) || profiles.find(p => p.active !== false) || profiles[0] || null)
    : null;

  const athleteId = primaryProfile?.id || "";
  const athleteName = primaryProfile
    ? [primaryProfile.first_name, primaryProfile.last_name].filter(Boolean).join(" ")
    : (String(user.full_name || "").trim() || "");
  const gradYear = primaryProfile?.grad_year || null;

  try {
    await base44.asServiceRole.entities.CoachRoster.create({
      coach_id: coachId,
      account_id: accountId,
      athlete_id: athleteId,
      athlete_name: athleteName,
      athlete_grad_year: gradYear,
      invite_code: normalizedCode,
      joined_at: new Date().toISOString(),
    });
    console.log("linkToCoach: created CoachRoster — account:", accountId, "coach:", coachId, "athlete:", athleteId, "name:", athleteName);
  } catch (e) {
    console.error("linkToCoach: CoachRoster.create failed:", (e as Error).message);
    return Response.json({ ok: false, error: "Failed to create roster entry: " + (e as Error).message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    linked: true,
    coachName: `${coach.first_name || ""} ${coach.last_name || ""}`.trim(),
    schoolOrOrg: coach.school_or_org || "",
  });
});
