// functions/runSchoolAthleticsCleanup.ts
//
// Orchestrator that loops over auditSchoolsAthletics until done, accumulating stats.
//
// Usage:
//   { "mode": "update" }  — write division/conference/nickname to confirmed athletics schools
//   { "mode": "delete" }  — delete rows with no athletics affiliation found on Wikipedia
//
// Optional overrides:
//   { "mode": "update", "maxRows": 50, "sleepMs": 400, "startAt": 0 }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

Deno.serve(async (req) => {
  const t0 = Date.now();

  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const mode    = String(body?.mode ?? "update");
    const maxRows = Math.max(1, Math.min(200, Number(body?.maxRows ?? 50)));
    const sleepMs = Math.max(0, Number(body?.sleepMs ?? 400));
    const startAt = Math.max(0, Number(body?.startAt ?? 0));

    if (!["update", "delete"].includes(mode)) {
      return Response.json({ ok: false, error: "mode must be 'update' or 'delete'" });
    }

    const base44 = createClientFromRequest(req);

    // Accumulated totals
    const totals: Record<string, number> = {
      scanned:          0,
      alreadyConfirmed: 0,
      wikipediaFetched: 0,
      athleticsFound:   0,
      noAthleticsFound: 0,
      wikiNotFound:     0,
      updated:          0,
      deleted:          0,
      errors:           0,
    };

    let currentStartAt = startAt;
    let iterations     = 0;
    let done           = false;
    const MAX_ITERATIONS = 500; // safety cap

    while (!done && iterations < MAX_ITERATIONS) {
      const payload = {
        mode,
        dryRun:   false,
        maxRows,
        sleepMs,
        startAt:  currentStartAt,
      };

      const res = await base44.functions.invoke("auditSchoolsAthletics", payload);
      const data = res?.data ?? res;

      if (!data?.ok) {
        return Response.json({
          ok:    false,
          error: `auditSchoolsAthletics failed at startAt=${currentStartAt}: ${data?.error ?? JSON.stringify(data)}`,
          totals,
          iterations,
          lastStartAt: currentStartAt,
        });
      }

      const s = data?.stats ?? {};
      for (const key of Object.keys(totals)) {
        if (typeof s[key] === "number") totals[key] += s[key];
      }

      done           = !!data?.next?.done || s?.done === true;
      currentStartAt = data?.next?.nextStartAt ?? s?.nextStartAt ?? (currentStartAt + maxRows);
      iterations++;

      // Brief pause between iterations to avoid hammering Wikipedia
      if (!done) await new Promise((r) => setTimeout(r, 200));
    }

    const elapsedMs = Date.now() - t0;

    return Response.json({
      ok: true,
      mode,
      iterations,
      elapsedMs,
      elapsedMin: +(elapsedMs / 60000).toFixed(2),
      totals,
      summary: [
        `Mode: ${mode}`,
        `Iterations: ${iterations}`,
        `Scanned: ${totals.scanned}`,
        `Already confirmed (skipped): ${totals.alreadyConfirmed}`,
        `Wikipedia fetched: ${totals.wikipediaFetched}`,
        `✅ Athletics found: ${totals.athleticsFound}`,
        `🚩 No athletics (flagged): ${totals.noAthleticsFound}`,
        `❓ Wiki not found: ${totals.wikiNotFound}`,
        mode === "update" ? `📝 Updated: ${totals.updated}` : `🗑️  Deleted: ${totals.deleted}`,
        `⚠️  Errors: ${totals.errors}`,
        `⏱  Elapsed: ${(elapsedMs / 1000).toFixed(1)}s`,
      ].filter(Boolean),
    });

  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});