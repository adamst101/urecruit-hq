// functions/stripPipeCampNames.js
// One-pass cleanup: strips " | anything" suffixes from camp_name fields.
// No HTTP fetching needed — pure string operation on existing data.
// Admin only. Supports dryRun and pagination.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.21";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function safeStr(x) { return (x === null || x === undefined) ? "" : String(x).trim(); }

function stripPipeSuffix(s) {
  if (!s) return s;
  return s.replace(/\s*\|.*$/, "").trim();
}

Deno.serve(async function(req) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") return json({ error: "Forbidden" }, 403);

  var body = {};
  try { body = await req.json(); } catch(e) { body = {}; }

  var dryRun = body.dryRun !== false && body.dryRun !== "false";
  var maxCamps = Math.max(1, Number(body.maxCamps || 200));
  var startAt = Math.max(0, Number(body.startAt || 0));

  var Camp = base44.entities.Camp;

  // Load all camps and find ones with "|" in the name
  var allCamps = await Camp.filter({}, "source_key", 99999);
  var pipeCamps = allCamps.filter(function(c) {
    return safeStr(c.camp_name).indexOf("|") >= 0;
  });

  var totalEligible = pipeCamps.length;
  var slice = pipeCamps.slice(startAt, startAt + maxCamps);
  var stats = { processed: 0, updated: 0, skipped: 0, errors: 0 };
  var sample = [];

  for (var i = 0; i < slice.length; i++) {
    var camp = slice[i];
    stats.processed++;

    var oldName = safeStr(camp.camp_name);
    var newName = stripPipeSuffix(oldName);

    if (!newName || newName === oldName) {
      stats.skipped++;
      continue;
    }

    if (sample.length < 30) {
      sample.push({ source_key: camp.source_key, old: oldName, new: newName });
    }

    if (!dryRun) {
      try {
        await Camp.update(String(camp.id), { camp_name: newName });
        stats.updated++;
      } catch (e) {
        stats.errors++;
      }
    } else {
      stats.updated++;
    }
  }

  var nextStartAt = startAt + stats.processed;
  return json({
    ok: true,
    dryRun: dryRun,
    totalEligible: totalEligible,
    stats: stats,
    pagination: {
      startAt: startAt,
      processed: stats.processed,
      nextStartAt: nextStartAt,
      totalEligible: totalEligible,
      done: nextStartAt >= totalEligible,
    },
    sample: sample,
  });
});
