// functions/weeklyAthleticCampsIngest.js
// Scheduled weekly job: loops all active SportIngestConfig records,
// runs ingestCampsUSA in batched cursor loop for each sport.
// Replaces weeklyIngestAllSports.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

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

Deno.serve(async function(req) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") return json({ error: "Forbidden: Admin access required" }, 403);

  var body = {};
  try { body = await req.json(); } catch(e) { body = {}; }

  var dryRun = body.dryRun === true || body.dryRun === "true";
  var t0 = Date.now();

  // 1. Load active configs, ordered by sport_key
  var configs = await base44.entities.SportIngestConfig.filter({ active: true }, "sport_key", 100);
  if (!configs || configs.length === 0) {
    return json({ ok: true, message: "No active sport configs found", sports: [], dryRun: dryRun });
  }

  var MAX_BATCHES = 50;
  var BATCH_DELAY_MIN = 3000;
  var BATCH_DELAY_MAX = 6000;
  var SPORT_DELAY_MIN = 10 * 60 * 1000;  // 10 min
  var SPORT_DELAY_MAX = 15 * 60 * 1000;  // 15 min

  // In dry-run mode use tiny delays
  if (dryRun) {
    BATCH_DELAY_MIN = 100; BATCH_DELAY_MAX = 200;
    SPORT_DELAY_MIN = 100; SPORT_DELAY_MAX = 200;
  }

  var totalNew = 0, totalUpdated = 0, totalSkipped = 0, totalBlocked = 0, totalErrors = 0;
  var sportsRun = 0, sportsOk = 0, sportsFailed = 0;
  var sportResults = [];

  for (var i = 0; i < configs.length; i++) {
    var cfg = configs[i];
    var sportKey = cfg.sport_key;
    var sportT0 = Date.now();
    sportsRun++;

    var cursor = 0;
    var done = false;
    var batchCount = 0;
    var sportStats = { new: 0, updated: 0, skipped: 0, blocked: 0, errors: 0 };
    var sportOk = true;
    var sportNotes = "";
    var lastBatchResult = null;

    try {
      while (!done) {
        var res = await base44.functions.invoke("ingestCampsUSA", {
          sport_key: sportKey,
          dryRun: dryRun,
          startAt: cursor,
          maxSchools: 261,
          sleepMs: 0,
          timeBudgetMs: 55000,
        });

        var data = res.data || res;
        lastBatchResult = data;

        // Accumulate stats
        if (data.stats) {
          sportStats.new += (data.stats.campsInserted || 0);
          sportStats.updated += (data.stats.campsUpdated || 0);
          sportStats.skipped += (data.stats.campsSkipped || 0);
          sportStats.blocked += (data.stats.blocked || 0);
          sportStats.errors += (data.stats.campsErrors || 0);
        }

        // Advance cursor
        if (data.pagination) {
          cursor = data.pagination.nextStartAt || 0;
          done = !!data.pagination.done;
        } else {
          done = true; // no pagination info = assume done
        }

        batchCount++;

        // Safety valve
        if (batchCount >= MAX_BATCHES) {
          sportNotes += "Hit max batch limit (" + MAX_BATCHES + "). ";
          break;
        }

        // Delay between batches (not after last one)
        if (!done) {
          await sleep(randBetween(BATCH_DELAY_MIN, BATCH_DELAY_MAX));
        }
      }
    } catch (e) {
      sportOk = false;
      sportNotes += "Error: " + String(e.message || e).substring(0, 500);
    }

    // 3. Update config + write LastIngestRun
    var runIso = new Date().toISOString();
    var sportDuration = Date.now() - sportT0;

    if (sportOk) sportsOk++;
    else sportsFailed++;

    totalNew += sportStats.new;
    totalUpdated += sportStats.updated;
    totalSkipped += sportStats.skipped;
    totalBlocked += sportStats.blocked;
    totalErrors += sportStats.errors;

    try {
      await base44.asServiceRole.entities.SportIngestConfig.update(String(cfg.id), { last_run_at: runIso });
    } catch (e) { /* ignore */ }

    try {
      await base44.asServiceRole.entities.LastIngestRun.create({
        sport: sportKey,
        source: cfg.source_platform || sportKey,
        run_at: runIso,
        camps_inserted: sportStats.new,
        camps_updated: sportStats.updated,
        camps_skipped: sportStats.skipped,
        camps_errors: sportStats.errors,
        match_rate: lastBatchResult && lastBatchResult.matchSummary ? lastBatchResult.matchSummary.matchRate : 0,
        dry_run: dryRun,
        duration_ms: sportDuration,
        notes: (sportOk ? "OK" : "FAILED") + ". Batches=" + batchCount +
          " New=" + sportStats.new + " Updated=" + sportStats.updated +
          " Blocked=" + sportStats.blocked + " Errors=" + sportStats.errors +
          (sportNotes ? " " + sportNotes : ""),
      });
    } catch (e) { /* ignore */ }

    sportResults.push({
      sport_key: sportKey,
      ok: sportOk,
      batches: batchCount,
      stats: sportStats,
      duration_ms: sportDuration,
      notes: sportNotes || null,
    });

    // 4. Delay between sports (not after last one)
    if (i < configs.length - 1) {
      await sleep(randBetween(SPORT_DELAY_MIN, SPORT_DELAY_MAX));
    }
  }

  // 6. Summary "ALL" record
  var totalDuration = Date.now() - t0;
  try {
    await base44.asServiceRole.entities.LastIngestRun.create({
      sport: "ALL",
      source: "weeklyAthleticCampsIngest",
      run_at: new Date().toISOString(),
      camps_inserted: totalNew,
      camps_updated: totalUpdated,
      camps_skipped: totalSkipped,
      camps_errors: totalErrors,
      match_rate: 0,
      dry_run: dryRun,
      duration_ms: totalDuration,
      notes: "Sports=" + sportsRun + " OK=" + sportsOk + " Failed=" + sportsFailed +
        " New=" + totalNew + " Updated=" + totalUpdated + " Errors=" + totalErrors,
    });
  } catch (e) { /* ignore */ }

  return json({
    ok: sportsFailed === 0,
    dryRun: dryRun,
    sportsRun: sportsRun,
    sportsOk: sportsOk,
    sportsFailed: sportsFailed,
    totalNew: totalNew,
    totalUpdated: totalUpdated,
    totalSkipped: totalSkipped,
    totalBlocked: totalBlocked,
    totalErrors: totalErrors,
    duration_ms: totalDuration,
    sports: sportResults,
  });
});