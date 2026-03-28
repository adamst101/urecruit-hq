// functions/getMyCampIntents/entry.ts
// Returns all CampIntent records for an athlete from the PRODUCTION entity store.
// Must be called instead of client-side base44.entities.CampIntent.filter() so
// data is always read from production regardless of which URL the app is accessed from.

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

  console.log("getMyCampIntents received:", { accountId, athleteId });

  try {
    const IntentEntity = base44.asServiceRole.entities.CampIntent;

    let intents: any[] = [];

    if (athleteId) {
      const rows = await IntentEntity.filter({ athlete_id: athleteId }).catch((e: any) => {
        console.error("filter by athleteId failed:", e?.message);
        return [];
      });
      intents = Array.isArray(rows) ? rows : [];
      console.log(`filter by athleteId=${athleteId}: ${intents.length} results`);
    }

    // If no results by athleteId, fall back to accountId (older records may have
    // accountId stored in athlete_id field, e.g. from coach/demo paths)
    if (intents.length === 0 && accountId) {
      const rows = await IntentEntity.filter({ athlete_id: accountId }).catch((e: any) => {
        console.error("filter by accountId failed:", e?.message);
        return [];
      });
      intents = Array.isArray(rows) ? rows : [];
      console.log(`filter by accountId=${accountId}: ${intents.length} results`);
    }

    console.log("getMyCampIntents returning:", intents.length, "intents:", intents.map((i: any) => ({ id: i.id, athlete_id: i.athlete_id, camp_id: i.camp_id, status: i.status })));

    return Response.json({ ok: true, intents });
  } catch (err: any) {
    console.error("getMyCampIntents error:", err?.message);
    return Response.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
});
