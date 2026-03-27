import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const SAFE_FIELDS = ["first_name", "last_name", "title", "school_or_org", "sport", "phone", "website", "email"];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let me;
  try {
    me = await base44.auth.me();
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const accountId = me?.id;
  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  let body = {};
  try { body = await req.json(); } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const fields = body.fields;
  if (!fields || typeof fields !== "object") {
    return Response.json({ ok: false, error: "fields object is required" }, { status: 400 });
  }

  // Whitelist safe fields
  const updates = {};
  for (const key of SAFE_FIELDS) {
    if (key in fields) updates[key] = fields[key];
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ ok: false, error: "No valid fields to update" }, { status: 400 });
  }

  try {
    // Find coach record by account_id
    const coaches = await base44.asServiceRole.entities.Coach.filter({ account_id: accountId });
    const list = Array.isArray(coaches) ? coaches : [];

    if (!list.length) {
      return Response.json({ ok: false, error: "Coach profile not found" }, { status: 404 });
    }

    const coach = list[0];

    // Update coach record
    await base44.asServiceRole.entities.Coach.update(coach.id, updates);

    // Sync name changes to User entity
    if (updates.first_name || updates.last_name) {
      const firstName = updates.first_name || coach.first_name || "";
      const lastName = updates.last_name || coach.last_name || "";
      const fullName = `${firstName} ${lastName}`.trim();
      if (fullName) {
        await base44.asServiceRole.entities.User.update(accountId, { full_name: fullName }).catch(() => {});
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("updateCoachProfile error:", err.message);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
});