import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let body: { code?: string } = {};
  try { body = await req.json(); } catch {}

  const code = (body.code || "").trim();
  if (!code) {
    return Response.json({ ok: false, error: "code is required" }, { status: 400 });
  }

  try {
    const coaches = await base44.asServiceRole.entities.Coach.filter({
      invite_code: code,
      active: true,
      status: "approved",
    });
    const list = Array.isArray(coaches) ? coaches : [];
    if (!list.length) {
      return Response.json({ ok: false, error: "Invite code not found or inactive" });
    }

    const c = list[0];
    // Return only the fields the landing page needs — no sensitive data
    return Response.json({
      ok: true,
      coach: {
        first_name: c.first_name,
        last_name: c.last_name,
        school_or_org: c.school_or_org,
        sport: c.sport,
      },
    });
  } catch (err) {
    console.error("getCoachByInviteCode error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
