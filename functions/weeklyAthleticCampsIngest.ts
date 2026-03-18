// functions/weeklyAthleticCampsIngest.js
// Scheduled weekly job: loops active SportIngestConfig records,
// kicks off ingestCampsUSAChain for each sport (fire-and-forget).
// Completes within the 3-minute automation timeout.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.21";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async function(req) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") return json({ error: "Forbidden: Admin access required" }, 403);

  var body = {};
  try { body = await req.json(); } catch(e) { body = {}; }

  var dryRun = body.dryRun === true || body.dryRun === "true";

  // Load active configs
  var configs = await base44.entities.SportIngestConfig.filter({ active: true }, "sport_key", 100);
  if (!configs || configs.length === 0) {
    return json({ ok: true, message: "No active sport configs found", sports: [], dryRun: dryRun });
  }

  // Fire off a chained ingest for each sport (non-blocking)
  var dispatched = [];
  for (var i = 0; i < configs.length; i++) {
    var cfg = configs[i];
    var sportKey = cfg.sport_key;

    try {
      // Fire-and-forget: invoke the chain starter, don't await completion
      // We DO await this call, but ingestCampsUSAChain returns quickly
      // after processing one batch and scheduling the next.
      var res = await base44.functions.invoke("ingestCampsUSAChain", {
        sport_key: sportKey,
        dryRun: dryRun,
        startAt: 0,
        batchNumber: 1,
      });
      dispatched.push({ sport_key: sportKey, status: "dispatched", response: res.data || res });
    } catch (e) {
      dispatched.push({ sport_key: sportKey, status: "dispatch_error", error: String(e.message || e) });
    }
  }

  return json({
    ok: true,
    dryRun: dryRun,
    sportsDispatched: dispatched.length,
    dispatched: dispatched,
    message: "Ingest chains started for " + dispatched.length + " sport(s). Each sport processes in batches autonomously.",
  });
});