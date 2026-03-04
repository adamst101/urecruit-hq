// functions/weeklyIngestAllSports.js
// Loops all active SportIngestConfig records and runs ingestCampsUSA for each.
// Designed to be called by a scheduled automation.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

Deno.serve(async function(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { "content-type": "application/json" } });
  }

  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403, headers: { "content-type": "application/json" } });
  }

  var body = {};
  try { body = await req.json(); } catch(e) { body = {}; }

  // Load active configs
  var configs = await base44.entities.SportIngestConfig.filter({ active: true }, "sport_key", 100);
  if (!configs || configs.length === 0) {
    return new Response(JSON.stringify({ ok: true, message: "No active sport configs found", results: [] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  var results = [];
  var sleepMs = Number(body.sleepMs || 2000);
  var maxSchoolsPerSport = Number(body.maxSchoolsPerSport || 999);

  for (var i = 0; i < configs.length; i++) {
    var cfg = configs[i];
    var sportKey = cfg.sport_key;

    try {
      var res = await base44.functions.invoke("ingestCampsUSA", {
        sport_key: sportKey,
        dryRun: false,
        maxSchools: maxSchoolsPerSport,
        startAt: 0,
        sleepMs: sleepMs,
        timeBudgetMs: 50000,
      });

      results.push({
        sport_key: sportKey,
        ok: true,
        stats: res.data ? res.data.stats : null,
        matchSummary: res.data ? res.data.matchSummary : null,
      });
    } catch (e) {
      results.push({
        sport_key: sportKey,
        ok: false,
        error: String(e.message || e),
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, sportsProcessed: results.length, results: results }), {
    status: 200, headers: { "content-type": "application/json; charset=utf-8" },
  });
});