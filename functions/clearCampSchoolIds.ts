// functions/clearCampSchoolIds.js
// Clears school_id on Camp records in batches. Paginated to avoid timeouts.
// Payload: { "dryRun": true, "startAt": 0, "maxRows": 100 }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function sleep(ms) { return new Promise(r => setTimeout(r, Math.max(0, ms))); }

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;
    const startAt = Math.max(0, Number(body?.startAt ?? 0));
    const maxRows = Math.max(1, Math.min(200, Number(body?.maxRows ?? 100)));

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const Camp = base44.entities.Camp;
    const allCamps = await Camp.filter({}, "camp_name", startAt + maxRows);
    const page = (allCamps || []).slice(startAt, startAt + maxRows);
    const withSchoolId = page.filter(c => c.school_id);

    if (dryRun) {
      return Response.json({
        ok: true, dryRun: true,
        pageSize: page.length,
        withSchoolId: withSchoolId.length,
        nextStartAt: startAt + page.length,
        done: page.length < maxRows,
      });
    }

    let cleared = 0;
    let errors = 0;
    for (const camp of withSchoolId) {
      try {
        await Camp.update(camp.id, { school_id: null });
        cleared++;
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes("429") || msg.includes("rate limit")) {
          await sleep(2000);
          try {
            await Camp.update(camp.id, { school_id: null });
            cleared++;
          } catch { errors++; }
        } else {
          errors++;
        }
      }
      await sleep(150); // throttle
    }

    return Response.json({
      ok: true, dryRun: false,
      cleared, errors,
      nextStartAt: startAt + page.length,
      done: page.length < maxRows,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
});