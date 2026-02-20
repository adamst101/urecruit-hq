// functions/ingestSchoolLogos.ts
// Minimal logo enrichment - stripped down for deployment stability

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms || 0)));
}

function extractRows(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  const cands = [resp.data, resp.items, resp.records];
  for (const c of cands) if (Array.isArray(c)) return c;
  return [];
}

function extractCursor(resp) {
  if (!resp || Array.isArray(resp)) return null;
  return resp.next_cursor ?? resp.nextCursor ?? null;
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  
  try {
    if (req.method !== "POST") {
      return Response.json({ ok: false, error: "POST only" });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const cursor = body?.cursor ?? null;
    const maxRows = Math.max(1, Number(body?.maxRows ?? 50));
    const throttleMs = Math.max(0, Number(body?.throttleMs ?? 250));

    const base44 = createClientFromRequest(req);
    const School = base44?.entities?.School ?? base44?.entities?.Schools;
    
    if (!School || typeof School.list !== "function") {
      return Response.json({ ok: false, error: "School entity not available" });
    }

    const listParams = { limit: maxRows };
    if (cursor) listParams.cursor = cursor;

    const resp = await School.list(listParams);
    const rows = extractRows(resp);
    const next_cursor = extractCursor(resp);
    const done = !next_cursor || rows.length === 0;

    const stats = {
      scanned: rows.length,
      eligible: 0,
      updated: 0,
      skipped: rows.length,
      errors: 0,
      elapsedMs: Date.now() - t0,
    };

    return Response.json({
      ok: true,
      dryRun,
      done,
      next_cursor,
      stats,
      debug: { note: "Minimal stub - no actual logo fetching yet" },
    });
  } catch (e) {
    return Response.json({
      ok: false,
      error: String(e?.message || e),
      elapsedMs: Date.now() - t0,
    });
  }
});