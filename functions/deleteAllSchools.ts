// functions/deleteAllSchools.js
// Deletes ALL School records. Requires confirm="DELETE_ALL" for live run.
// Payload: { "dryRun": true } or { "dryRun": false, "confirm": "DELETE_ALL" }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;
    const confirm = body?.confirm || "";

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== "admin") return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });

    const School = base44.entities.School;
    const all = await School.filter({}, "school_name", 99999);
    const count = (all || []).length;

    if (dryRun) {
      return Response.json({
        ok: true, dryRun: true,
        schoolCount: count,
        message: `Would delete ${count} schools`,
      });
    }

    if (confirm !== "DELETE_ALL") {
      return Response.json({ ok: false, error: 'Must pass confirm: "DELETE_ALL" for live run' }, { status: 400 });
    }

    let deleted = 0;
    let errors = 0;
    for (const school of (all || [])) {
      try {
        await School.delete(school.id);
        deleted++;
      } catch {
        errors++;
      }
    }

    return Response.json({ ok: true, dryRun: false, deleted, errors });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
});