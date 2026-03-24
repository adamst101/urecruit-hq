import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Generates a unique invite code: LASTNAME-SCHOOLABBR-XXXX
function generateInviteCode(name: string, schoolOrOrg: string): string {
  const lastName = (name || "").trim().split(/\s+/).pop()?.toUpperCase().replace(/[^A-Z]/g, "") || "COACH";
  const schoolAbbr = (schoolOrOrg || "").trim().replace(/[^A-Za-z]/g, "").substring(0, 3).toUpperCase() || "SCH";
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${lastName}-${schoolAbbr}-${rand}`;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Caller must be authenticated (just registered)
  let me = null;
  try {
    me = await base44.auth.me();
  } catch {}

  if (!me?.id) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  let body: { name?: string; school_or_org?: string; sport?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { name, school_or_org, sport } = body;

  if (!name || !school_or_org) {
    return Response.json({ ok: false, error: "name and school_or_org are required" }, { status: 400 });
  }

  try {
    // Generate invite code — retry once on collision (extremely rare)
    let invite_code = generateInviteCode(name, school_or_org);
    const existing = await base44.asServiceRole.entities.Coach.filter({ invite_code }).catch(() => []);
    if (Array.isArray(existing) && existing.length > 0) {
      invite_code = generateInviteCode(name, school_or_org);
    }

    // Create the Coach entity record
    const coach = await base44.asServiceRole.entities.Coach.create({
      account_id: me.id,
      name,
      school_or_org,
      sport: sport || "Football",
      invite_code,
      active: true,
      created_at: new Date().toISOString(),
    });

    // Set role="coach" on the auth user account
    try {
      await base44.asServiceRole.entities.User.update(me.id, { role: "coach" });
      console.log("Set role=coach on user:", me.id);
    } catch (e) {
      console.warn("Could not set coach role on User entity:", (e as Error).message);
    }

    console.log("Coach registered — id:", coach.id, "invite_code:", invite_code);
    return Response.json({ ok: true, invite_code, coach_id: coach.id });
  } catch (err) {
    console.error("registerCoach error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
