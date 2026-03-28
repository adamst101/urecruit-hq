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
  const action: string = body?.action ? String(body.action) : ""; // "favorite" | "unfavorite" | "register"

  if (!campId) {
    return Response.json({ ok: false, error: "campId is required" }, { status: 400 });
  }
  if (!action) {
    return Response.json({ ok: false, error: "action is required" }, { status: 400 });
  }

  try {
    const IntentEntity = base44.asServiceRole.entities.CampIntent;

    // Look up any existing intent for this athlete+camp
    let existing: any = null;
    if (athleteId) {
      const rows = await IntentEntity.filter({ athlete_id: athleteId, camp_id: campId }).catch(() => []);
      existing = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    }

    let intent: any = null;

    if (action === "favorite") {
      if (existing) {
        // Don't downgrade registered/completed to favorite
        if (existing.status === "registered" || existing.status === "completed") {
          intent = existing;
        } else if (existing.status === "favorite") {
          // Toggle off
          await IntentEntity.update(String(existing.id), { status: "removed" });
          intent = { ...existing, status: "removed" };
        } else {
          await IntentEntity.update(String(existing.id), { status: "favorite" });
          intent = { ...existing, status: "favorite" };
        }
      } else {
        const created = await IntentEntity.create({
          athlete_id: athleteId || accountId,
          camp_id: campId,
          account_id: accountId,
          status: "favorite",
          priority: "medium",
        });
        intent = created;
      }
    } else if (action === "register") {
      if (existing) {
        if (existing.status === "registered" || existing.status === "completed") {
          intent = existing; // already done
        } else {
          await IntentEntity.update(String(existing.id), { status: "registered", priority: "high" });
          intent = { ...existing, status: "registered", priority: "high" };
        }
      } else {
        const created = await IntentEntity.create({
          athlete_id: athleteId || accountId,
          camp_id: campId,
          account_id: accountId,
          status: "registered",
          priority: "high",
        });
        intent = created;
      }
    } else {
      return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    return Response.json({ ok: true, intent });
  } catch (err: any) {
    console.error("saveCampIntent error:", err?.message);
    return Response.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
});
