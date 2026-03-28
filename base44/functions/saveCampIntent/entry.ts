// functions/saveCampIntent/entry.ts
// Writes a CampIntent record to the PRODUCTION entity store via asServiceRole.
// Must be called instead of client-side base44.entities.CampIntent writes so
// data always lands in production regardless of which URL the app is accessed from.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let body: any = {};
  try {
    body = await req.clone().json().catch(() => ({}));
  } catch {}

  // Auth: prefer auth.me(); fall back to client-supplied accountId
  let accountId = "";
  try {
    const me = await base44.auth.me();
    accountId = me?.id || "";
  } catch {}
  if (!accountId && body?.accountId) accountId = String(body.accountId);

  if (!accountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const athleteId: string = body?.athleteId ? String(body.athleteId) : "";
  const campId: string = body?.campId ? String(body.campId) : "";

  // Accept either `status` directly or legacy `action` field
  let status: string;
  if (body?.status !== undefined) {
    status = body.status === null ? "" : String(body.status);
  } else if (body?.action === "register") {
    status = "registered";
  } else if (body?.action === "favorite") {
    status = "favorite";
  } else {
    status = "";
  }

  if (!campId) {
    return Response.json({ ok: false, error: "campId is required" }, { status: 400 });
  }

  // The effective athlete_id stored on the record — fall back to accountId for
  // coach accounts that have no athlete profile (matches Discover's behavior)
  const effectiveAthleteId = athleteId || accountId;

  try {
    const IntentEntity = base44.asServiceRole.entities.CampIntent;

    // Look up any existing intent for this athlete+camp
    let existing: any = null;
    const rows = await IntentEntity.filter({ athlete_id: effectiveAthleteId, camp_id: campId }).catch(() => []);
    existing = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    let intent: any = null;

    if (!status) {
      // Clear / unfavorite
      if (existing?.id) {
        await IntentEntity.update(String(existing.id), { status: "" });
        intent = { ...existing, status: "" };
      }
    } else if (existing?.id) {
      // Don't downgrade registered/completed to a lower status
      if (
        (existing.status === "registered" || existing.status === "completed") &&
        status !== "registered" && status !== "completed"
      ) {
        intent = existing;
      } else {
        const updatePayload: any = { status };
        // Heal orphaned records that are missing athlete_id
        if (!existing.athlete_id && athleteId) updatePayload.athlete_id = athleteId;
        await IntentEntity.update(String(existing.id), updatePayload);
        intent = { ...existing, ...updatePayload };
      }
    } else {
      // Create new
      const created = await IntentEntity.create({
        athlete_id: effectiveAthleteId,
        camp_id: campId,
        account_id: accountId,
        status,
        priority: status === "registered" ? "high" : "medium",
      });
      intent = created;
    }

    return Response.json({ ok: true, intent });
  } catch (err: any) {
    console.error("saveCampIntent error:", err?.message);
    return Response.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
});
