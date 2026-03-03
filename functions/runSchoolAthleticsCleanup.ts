// functions/runSchoolAthleticsCleanup.ts
//
// Single-page proxy for auditSchoolsAthletics — processes one batch per call.
// Call repeatedly, passing nextStartAt back as startAt, until done: true.
// Accumulate totals on the caller side (see SchoolAthleticsCleanup page).
//
// This avoids gateway timeouts that occur when looping inside the function,
// since each auditSchoolsAthletics call already takes ~15s (Wikipedia fetches).
//
// Usage (first call):
//   { "mode": "update", "startAt": 0 }
// Subsequent calls:
//   { "mode": "update", "startAt": <nextStartAt from previous response> }
//
// Optional: maxRows (default 50), sleepMs (default 400), dryRun (default false)

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const mode    = String(body?.mode ?? "update");
    const maxRows = Math.max(1, Math.min(200, Number(body?.maxRows ?? 50)));
    const sleepMs = Math.max(0, Number(body?.sleepMs ?? 400));
    const startAt = Math.max(0, Number(body?.startAt ?? 0));
    const dryRun  = body?.dryRun !== false;

    if (!["update", "delete"].includes(mode)) {
      return Response.json({ ok: false, error: "mode must be 'update' or 'delete'" });
    }

    const base44 = createClientFromRequest(req);

    const res  = await base44.functions.invoke("auditSchoolsAthletics", {
      mode, dryRun, maxRows, sleepMs, startAt,
    });
    const data = res?.data ?? res;

    if (!data?.ok) {
      return Response.json({
        ok:    false,
        error: `auditSchoolsAthletics failed: ${data?.error ?? JSON.stringify(data)}`,
        startAt,
      });
    }

    return Response.json({
      ok:           true,
      stats:        data.stats,
      next:         data.next,
      athleticsFound:     data.athleticsFound,
      flaggedForDeletion: data.flaggedForDeletion,
      wikiNotFound:       data.wikiNotFound,
    });

  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});