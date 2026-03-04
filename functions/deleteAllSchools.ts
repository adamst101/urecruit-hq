// functions/deleteAllSchools.js
// Deletes School records in batches. Paginated to avoid timeouts.
// Payload: { "dryRun": true } or { "dryRun": false, "confirm": "DELETE_ALL", "maxRows": 200 }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function sleep(ms) { return new Promise(r => setTimeout(r, Math.max(0, ms))); }

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;
    const confirm = body?.confirm || "";
    const maxRows = Math.max(1, Math.min(500, Number(body?.maxRows ?? 200)));

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const School = base44.entities.School;

    if (dryRun) {
      const all = await School.filter({}, "school_name", 99999);
      return Response.json({
        ok: true, dryRun: true,
        schoolCount: (all || []).length,
        message: `Would delete ${(all || []).length} schools`,
      });
    }

    if (confirm !== "DELETE_ALL") {
      return Response.json({ ok: false, error: 'Must pass confirm: "DELETE_ALL" for live run' }, { status: 400 });
    }

    // Delete one batch
    const batch = await School.filter({}, "school_name", maxRows);
    const rows = batch || [];

    let deleted = 0;
    let errors = 0;
    for (const school of rows) {
      try {
        await School.delete(school.id);
        deleted++;
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes("429") || msg.includes("rate limit")) {
          await sleep(2000);
          try { await School.delete(school.id); deleted++; } catch { errors++; }
        } else {
          errors++;
        }
      }
      // Throttle to avoid rate limits
      if (deleted % 5 === 0) await sleep(100);
    }

    // Check if there are more
    const remaining = await School.filter({}, "school_name", 1);
    const done = !remaining || remaining.length === 0;

    return Response.json({
      ok: true, dryRun: false,
      deleted, errors, done,
      elapsedMs: Date.now() - t0,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
});