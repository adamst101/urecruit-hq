// functions/getMyCampIntents/entry.ts
// Returns all CampIntent records for an athlete from the PRODUCTION entity store.
// Must be called instead of client-side base44.entities.CampIntent.filter() so
// data is always read from production regardless of which URL the app is accessed from.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function filterWithRetry(entity: any, where: any, retries = 3): Promise<any[]> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const rows = await entity.filter(where);
      return Array.isArray(rows) ? rows : [];
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e || "").toLowerCase();
      const isRateLimit = msg.includes("rate limit") || msg.includes("429") || msg.includes("too many");
      if (!isRateLimit || attempt === retries) break;
      await sleep(300 * Math.pow(2, attempt)); // 300ms, 600ms, 1200ms
    }
  }
  throw lastErr;
}

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

  try {
    const IntentEntity = base44.asServiceRole.entities.CampIntent;

    let intents: any[] = [];

    if (athleteId) {
      intents = await filterWithRetry(IntentEntity, { athlete_id: athleteId });
    }

    // If no results by athleteId, fall back to accountId (older records may have
    // accountId stored in athlete_id field, e.g. from coach/demo paths)
    if (intents.length === 0 && accountId) {
      intents = await filterWithRetry(IntentEntity, { athlete_id: accountId });
    }

    return Response.json({ ok: true, intents });
  } catch (err: any) {
    const msg = String(err?.message || err || "Unknown error");
    console.error("getMyCampIntents error:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
});
