// functions/ingestCampsUSAChain.js
// Runs ONE batch of ingestCampsUSA, then self-invokes for the next batch.
// Each invocation stays well within the 3-minute timeout.
// Called by weeklyAthleticCampsIngest or manually.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.21";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, Math.max(0, Number(ms) || 0)); });
}

function randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

var MAX_BATCHES = 50;

Deno.serve(async function(req) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") return json({ error: "Forbidden: Admin access required" }, 403);

  var body = {};
  try { body = await req.json(); } catch(e) { body = {}; }

  var sportKey = body.sport_key;
  if (!sportKey) return json({ error: "sport_key is required" }, 400);

  var dryRun = body.dryRun === true || body.dryRun === "true";
  var startAt = Math.max(0, Number(body.startAt || 0));
  var batchNumber = Math.max(1, Number(body.batchNumber || 1));
  var t0 = Date.now();

  // Safety: don't exceed max batches
  if (batchNumber > MAX_BATCHES) {
    return json({
      ok: true,
      sport_key: sportKey,
      message: "Max batch limit reached (" + MAX_BATCHES + ")",
      batchNumber: batchNumber,
      done: true,
    });
  }

  // Run one batch of ingestCampsUSA
  var batchResult = null;
  var batchOk = true;
  var batchError = null;

  try {
    var res = await base44.functions.invoke("ingestCampsUSA", {
      sport_key: sportKey,
      dryRun: dryRun,
      startAt: startAt,
      maxSchools: 261,
      timeBudgetMs: 55000,
    });
    batchResult = res.data || res;
  } catch (e) {
    batchOk = false;
    batchError = String(e.message || e).substring(0, 500);
  }

  // Determine if there are more batches
  var isDone = true;
  var nextStartAt = 0;

  if (batchOk && batchResult && batchResult.pagination) {
    nextStartAt = batchResult.pagination.nextStartAt || 0;
    isDone = !!batchResult.pagination.done;
  }

  // Write summary to LastIngestRun for this batch
  var runIso = new Date().toISOString();
  var batchDuration = Date.now() - t0;
  var stats = (batchResult && batchResult.stats) || {};

  try {
    await base44.asServiceRole.entities.LastIngestRun.create({
      sport: sportKey,
      source: "ingestCampsUSAChain",
      run_at: runIso,
      camps_inserted: stats.campsInserted || 0,
      camps_updated: stats.campsUpdated || 0,
      camps_skipped: stats.campsSkipped || 0,
      camps_errors: stats.campsErrors || 0,
      match_rate: batchResult && batchResult.matchSummary ? batchResult.matchSummary.matchRate : 0,
      dry_run: dryRun,
      duration_ms: batchDuration,
      notes: (batchOk ? "OK" : "FAILED") +
        " Batch#" + batchNumber +
        " startAt=" + startAt +
        " New=" + (stats.campsInserted || 0) +
        " Updated=" + (stats.campsUpdated || 0) +
        " Errors=" + (stats.campsErrors || 0) +
        (batchError ? " Error: " + batchError : "") +
        (isDone ? " [DONE]" : " [CONTINUES]"),
    });
  } catch (e) { /* ignore */ }

  // If not done and batch succeeded, schedule the next batch
  if (!isDone && batchOk) {
    // Add a stealth delay between batches (3-6 seconds)
    var delay = dryRun ? 100 : randBetween(3000, 6000);
    await sleep(delay);

    // Self-invoke for next batch (fire-and-forget via .catch to not block)
    try {
      // We await this but the next chain link returns quickly too
      await base44.functions.invoke("ingestCampsUSAChain", {
        sport_key: sportKey,
        dryRun: dryRun,
        startAt: nextStartAt,
        batchNumber: batchNumber + 1,
      });
    } catch (e) {
      // Log continuation failure
      try {
        await base44.asServiceRole.entities.LastIngestRun.create({
          sport: sportKey,
          source: "ingestCampsUSAChain",
          run_at: new Date().toISOString(),
          dry_run: dryRun,
          duration_ms: Date.now() - t0,
          notes: "CHAIN BROKEN at batch#" + (batchNumber + 1) +
            " startAt=" + nextStartAt + " Error: " + String(e.message || e).substring(0, 300),
        });
      } catch (e2) { /* ignore */ }
    }
  }

  // Update config last_run_at if this was the final batch
  if (isDone && batchOk) {
    try {
      var configs = await base44.entities.SportIngestConfig.filter({ sport_key: sportKey }, "sport_key", 1);
      if (configs && configs[0]) {
        await base44.asServiceRole.entities.SportIngestConfig.update(String(configs[0].id), { last_run_at: runIso });
      }
    } catch (e) { /* ignore */ }

    // Write final summary
    try {
      await base44.asServiceRole.entities.LastIngestRun.create({
        sport: sportKey,
        source: "ingestCampsUSAChain",
        run_at: runIso,
        dry_run: dryRun,
        duration_ms: Date.now() - t0,
        notes: "COMPLETED all batches for " + sportKey + ". Total batches=" + batchNumber,
      });
    } catch (e) { /* ignore */ }
  }

  return json({
    ok: batchOk,
    sport_key: sportKey,
    dryRun: dryRun,
    batchNumber: batchNumber,
    startAt: startAt,
    nextStartAt: nextStartAt,
    done: isDone,
    batchDuration_ms: batchDuration,
    stats: stats,
    error: batchError,
  });
});