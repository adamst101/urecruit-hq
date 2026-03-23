// functions/repairDateOnlyCampNames.js
// Cleanup step 2: finds camps whose name is just a date (e.g. "06/15/2025",
// "June 15-17, 2025") and replaces it with the real name from the Ryzer page.
// Run after stripPipeCampNames — pipe stripping often exposes date-only names.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.21";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, Math.max(0, Number(ms) || 0)); }); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function safeStr(x) { return (x === null || x === undefined) ? "" : String(x).trim(); }

function stripNonAscii(s) {
  return String(s || "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(s) {
  if (!s) return "";
  return String(s)
    .replace(/&ndash;/gi, "\u2013").replace(/&mdash;/gi, "\u2014")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&rsquo;/gi, "\u2019").replace(/&lsquo;/gi, "\u2018")
    .replace(/&rdquo;/gi, "\u201D").replace(/&ldquo;/gi, "\u201C")
    .replace(/&#(\d+);/gi, function(_, n) { return String.fromCharCode(parseInt(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function(_, h) { return String.fromCharCode(parseInt(h, 16)); });
}

function stripTags(html) {
  if (!html) return "";
  return decodeHtmlEntities(
    String(html).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function cleanTextField(s) {
  if (!s) return null;
  var v = decodeHtmlEntities(String(s)).replace(/\s+/g, " ").trim();
  return v || null;
}

function stripPipeSuffix(s) {
  if (!s) return s;
  return s.replace(/\s*\|.*$/, "").trim();
}

// ── Date-only detection ──────────────────────────────────────────────────────
// Returns true if the camp name is just a date or date range with no real words.

var MONTH_PAT = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
var DAY_PAT = "\\d{1,2}(?:st|nd|rd|th)?";
var YEAR_PAT = "(?:[,\\s]+\\d{4})?";
var SEP_PAT = "\\s*[-\u2013]\\s*";

// Full date range with slashes: 06/15/2025 or 06/15/2025 - 06/17/2025
var SLASH_DATE_RE = new RegExp(
  "^\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}(?:" + SEP_PAT + "\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})?$"
);

// Month-name date: "June 15", "June 15-17", "June 15, 2025", "June 15 - June 17, 2025"
var MONTH_DATE_RE = new RegExp(
  "^" + MONTH_PAT + "\\s+" + DAY_PAT + YEAR_PAT +
  "(?:" + SEP_PAT + "(?:" + MONTH_PAT + "\\s+)?" + DAY_PAT + YEAR_PAT + ")?$",
  "i"
);

function isDateOnlyCampName(name) {
  if (!name) return false;
  var n = safeStr(name);
  if (!n || n.length < 3) return false;
  return SLASH_DATE_RE.test(n) || MONTH_DATE_RE.test(n);
}

// ── Ryzer fetch ──────────────────────────────────────────────────────────────

var BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0",
};

async function fetchPage(url, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs || 15000);
  try {
    var resp = await fetch(url, { method: "GET", headers: BROWSER_HEADERS, signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, status: resp.status, html: "" };
    var html = await resp.text();
    return { ok: true, status: resp.status, html: html };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, html: "", error: String(e.message || e) };
  }
}

function extractCampNameFromRyzer(html) {
  if (!html) return null;

  // Primary: h1 tag
  var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1 && h1[1]) {
    var name = stripPipeSuffix(
      stripTags(h1[1]).replace(/\s*-\s*(?:Event\s+)?Registration.*$/i, "").trim()
    );
    if (name && name.length >= 4 && !isDateOnlyCampName(name)) return cleanTextField(name);
  }

  // Fallback: <title>
  var titleM = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  if (titleM && titleM[1]) {
    var name2 = stripPipeSuffix(
      stripNonAscii(titleM[1]).replace(/\s*-\s*(?:Event\s+)?Registration.*$/i, "").trim()
    );
    if (name2 && name2.length >= 4 && !isDateOnlyCampName(name2)) return cleanTextField(name2);
  }

  return null;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async function(req) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") return json({ error: "Forbidden" }, 403);

  var body = {};
  try { body = await req.json(); } catch(e) { body = {}; }

  var dryRun = body.dryRun !== false && body.dryRun !== "false";
  var maxCamps = Math.max(1, Number(body.maxCamps || 25));
  var startAt = Math.max(0, Number(body.startAt || 0));
  var sleepMs = Math.max(0, Number(body.sleepMs || 2000));

  var Camp = base44.asServiceRole.entities.Camp;

  var allCamps = await Camp.filter({}, "source_key", 99999);
  var dateCamps = allCamps.filter(function(c) {
    return isDateOnlyCampName(c.camp_name);
  });

  var totalEligible = dateCamps.length;
  var slice = dateCamps.slice(startAt, startAt + maxCamps);
  var stats = { processed: 0, updated: 0, skipped: 0, errors: 0, fetchFailed: 0, noName: 0 };
  var sample = [];

  for (var i = 0; i < slice.length; i++) {
    var camp = slice[i];
    stats.processed++;

    var regUrl = camp.link_url || camp.source_url;
    if (!regUrl) {
      var idMatch = /(\d+)$/.exec(camp.source_key || "");
      if (idMatch) regUrl = "https://register.ryzer.com/camp.cfm?sport=1&id=" + idMatch[1];
    }
    if (!regUrl) {
      stats.errors++;
      if (sample.length < 30) sample.push({ source_key: camp.source_key, old: camp.camp_name, status: "no_url" });
      continue;
    }

    var result = await fetchPage(regUrl, 15000);
    if (!result.ok) {
      stats.fetchFailed++;
      if (sample.length < 30) sample.push({ source_key: camp.source_key, old: camp.camp_name, status: "fetch_failed", http: result.status });
      await sleep(sleepMs + rand(0, 1000));
      continue;
    }

    var newName = extractCampNameFromRyzer(result.html);
    if (!newName) {
      stats.noName++;
      if (sample.length < 30) sample.push({ source_key: camp.source_key, old: camp.camp_name, status: "no_name_found", url: regUrl });
      await sleep(sleepMs);
      continue;
    }

    if (sample.length < 30) {
      sample.push({ source_key: camp.source_key, old: camp.camp_name, new: newName, status: dryRun ? "dry_run" : "updated" });
    }

    if (!dryRun) {
      try {
        await Camp.update(String(camp.id), { camp_name: newName });
        stats.updated++;
      } catch (e) {
        stats.errors++;
        if (sample.length < 30) sample.push({ source_key: camp.source_key, old: camp.camp_name, status: "update_error", error: String(e.message || e).substring(0, 200) });
      }
    } else {
      stats.updated++;
    }

    await sleep(sleepMs + rand(0, 1000));
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
