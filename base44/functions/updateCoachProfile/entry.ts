import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const ALLOWED_FIELDS = new Set([
  "first_name", "last_name", "title", "school_or_org",
  "sport", "phone", "website", "email",
]);

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Authenticate caller
  let accountId = "";
  try {
    const me = await base44.auth.me();
    accountId = me?.id || "";
  } catch {}

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  let body: { fields?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch {
    return Response.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { fields } = body;
  if (!fields || typeof fields !== "object") {
    return Response.json({ ok: false, error: "fields are required" }, { status: 400 });
  }

  // Whitelist — only allow safe profile fields, never status/invite_code/active etc.
  const safeFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(k)) safeFields[k] = v;
  }

  if (Object.keys(safeFields).length === 0) {
    return Response.json({ ok: false, error: "No valid fields to update" }, { status: 400 });
  }

  try {
    // Find the coach record for this account
    const coaches = await base44.asServiceRole.entities.Coach.filter({ account_id: accountId });
    const list = Array.isArray(coaches) ? coaches : [];

    if (!list.length) {
      return Response.json({ ok: false, error: "Coach profile not found" }, { status: 404 });
    }

    const coachId = list[0].id;
    await base44.asServiceRole.entities.Coach.update(coachId, safeFields);

    // Also sync first_name / last_name to the User entity if they were updated
    const nameUpdate: Record<string, unknown> = {};
    if (safeFields.first_name !== undefined) nameUpdate.first_name = safeFields.first_name;
    if (safeFields.last_name  !== undefined) nameUpdate.last_name  = safeFields.last_name;
    if (Object.keys(nameUpdate).length > 0) {
      base44.asServiceRole.entities.User.update(accountId, nameUpdate).catch(() => {});
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("updateCoachProfile error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
