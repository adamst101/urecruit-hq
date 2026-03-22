// functions/runNcaaUntilDone.ts
// Operator runner: repeatedly invokes ncaaMembershipSync until done=true (or safety caps)
// Safe for server-side use; resume by changing startAt.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}
function lc(x: any) {
  return String(x || "").toLowerCase();
}
function isRetryable(e: any) {
  const msg = lc(e?.message || e);
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("timeout") ||
    msg.includes("network")
  );
}

function jsonResp(payload: any) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const startedAt = new Date().toISOString();

  try {
    if (req.method !== "POST") return jsonResp({ ok: false, error: "Method not allowed" });

    const body = await req.json().catch(() => ({}));

    // ---- operator knobs ----
    const seasonYear = Number(body?.seasonYear ?? 2026);
    let startAt = Math.max(0, Number(body?.startAt ?? 719));

    const maxRows = Number(body?.maxRows ?? 100); // 80–120 recommended
    const confidenceThreshold = Number(body?.confidenceThreshold ?? 0.92);
    const throttleMs = Number(body?.throttleMs ?? 15);
    const timeBudgetMs = Number(body?.timeBudgetMs ?? 22000);
    const sourcePlatform = String(body?.sourcePlatform ?? "ncaa-api");
    const dryRun = !!body?.dryRun;

    const pauseBetweenBatchesMs = Number(body?.pauseBetweenBatchesMs ?? 800);
    const maxBatches = Number(body?.maxBatches ?? 200); // safety cap
    const haltOnBatchErrorsOver = Number(body?.haltOnBatchErrorsOver ?? 250);

    const invokeTries = Number(body?.invokeTries ?? 6);
    const baseBackoffMs = Number(body?.baseBackoffMs ?? 800);
    const jitterMs = Number(body?.jitterMs ?? 250);

    // base44 client + function invoke
    const client = createClientFromRequest(req);
    const fn = client?.functions?.invoke;
    if (typeof fn !== "function") {
      return jsonResp({ ok: false, error: "client.functions.invoke not available in this environment" });
    }

    const overall = {
      fetched: 0,
      processed: 0,
      matched: 0,
      noMatch: 0,
      ambiguous: 0,
      created: 0,
      updated: 0,
      missingName: 0,
      errors: 0,
      batches: 0,
    };

    const batchLogs: any[] = [];
    let done = false;

    async function invokeWithRetry(payload: any) {
      let lastErr: any = null;
      for (let i = 0; i < invokeTries; i++) {
        try {
          const raw = await fn("ncaaMembershipSync", payload);
          return (raw as any)?.data ?? raw;
        } catch (e) {
          lastErr = e;
          if (!isRetryable(e) || i === invokeTries - 1) throw e;

          const backoff = Math.min(12000, Math.floor(baseBackoffMs * Math.pow(2, i) + Math.random() * jitterMs));
          await sleep(backoff);
        }
      }
      throw lastErr;
    }

    for (let b = 1; b <= maxBatches; b++) {
      const payload = {
        dryRun,
        seasonYear,
        startAt,
        maxRows,
        confidenceThreshold,
        throttleMs,
        timeBudgetMs,
        sourcePlatform,
      };

      const res = await invokeWithRetry(payload);

      if (!res || res.ok !== true) {
        return jsonResp({ ok: false, error: "ncaaMembershipSync returned ok!=true", res, startedAt });
      }

      const st = res.stats || {};
      overall.fetched = Math.max(overall.fetched, Number(st.fetched || 0));
      overall.processed += Number(st.processed || 0);
      overall.matched += Number(st.matched || 0);
      overall.noMatch += Number(st.noMatch || 0);
      overall.ambiguous += Number(st.ambiguous || 0);
      overall.created += Number(st.created || 0);
      overall.updated += Number(st.updated || 0);
      overall.missingName += Number(st.missingName || 0);
      overall.errors += Number(st.errors || 0);
      overall.batches += 1;

      const nextStartAt = Math.max(startAt, Number(res.nextStartAt ?? startAt));
      done = !!res.done;

      batchLogs.push({
        batch: b,
        startAt,
        nextStartAt,
        done,
        stoppedEarly: !!res?.debug?.stoppedEarly,
        stats: st,
      });

      // Halt guard if you see a bad batch
      const batchErrors = Number(st.errors || 0);
      if (batchErrors > haltOnBatchErrorsOver) {
        return jsonResp({
          ok: true,
          halted: true,
          reason: `batchErrors ${batchErrors} > haltOnBatchErrorsOver ${haltOnBatchErrorsOver}`,
          startedAt,
          done: false,
          nextStartAt: startAt,
          overall,
          batches: batchLogs,
        });
      }

      startAt = nextStartAt;

      if (done) break;

      if (pauseBetweenBatchesMs > 0) await sleep(pauseBetweenBatchesMs);
    }

    return jsonResp({
      ok: true,
      startedAt,
      done,
      nextStartAt: startAt,
      overall,
      batches: batchLogs.slice(-10), // last 10 for payload size sanity
      note: "If not done, rerun with startAt=nextStartAt",
    });
  } catch (e: any) {
    return jsonResp({ ok: false, error: String(e?.message || e), startedAt });
  }
});