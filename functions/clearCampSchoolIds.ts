// functions/clearCampSchoolIds.js
// Clears school_id on all Camp records so we can safely delete+rebuild the School table.
// Payload: { "dryRun": true }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== "admin") return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });

    const Camp = base44.entities.Camp;
    const allCamps = await Camp.filter({}, "camp_name", 99999);
    const withSchoolId = (allCamps || []).filter(c => c.school_id);

    if (dryRun) {
      return Response.json({
        ok: true, dryRun: true,
        totalCamps: (allCamps || []).length,
        withSchoolId: withSchoolId.length,
        message: `Would clear school_id on ${withSchoolId.length} camps`,
      });
    }

    let cleared = 0;
    let errors = 0;
    for (const camp of withSchoolId) {
      try {
        await Camp.update(camp.id, { school_id: null });
        cleared++;
      } catch {
        errors++;
      }
    }

    return Response.json({
      ok: true, dryRun: false,
      totalCamps: (allCamps || []).length,
      cleared,
      errors,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
});