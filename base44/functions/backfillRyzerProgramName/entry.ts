// functions/backfillRyzerProgramName.js
// Re-fetches Ryzer registration pages for camps missing ryzer_program_name
// and backfills ryzer_program_name, venue_name, venue_address, and fixes city double-commas.
//
// Payload:
//   dryRun:       boolean (default true)
//   maxCamps:     number  (default 50)
//   startAt:      number  (default 0) — cursor offset into the filtered list
//   sleepMs:      number  (default 800)
//   timeBudgetMs: number  (default 50000)

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function safeStr(x) {
  if (x === null || x === undefined) return "";
  return String(x).trim();
}

function stripNonAscii(s) {
  return String(s || "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function stripTags(html) {
  if (!html) return "";
  return decodeHtmlEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(s) {
  if (!s) return "";
  return String(s)
    .replace(/&ndash;/gi, "\u2013").replace(/&mdash;/gi, "\u2014")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&rsquo;/gi, "\u2019").replace(/&lsquo;/gi, "\u2018")
    .replace(/&rdquo;/gi, "\u201D").replace(/&ldquo;/gi, "\u201C")
    .replace(/&bull;/gi, "\u2022").replace(/&hellip;/gi, "\u2026")
    .replace(/&#(\d+);/gi, function(_, n) { return String.fromCharCode(parseInt(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function(_, h) { return String.fromCharCode(parseInt(h, 16)); });
}

function cleanTextField(s) {
  if (!s) return null;
  var v = decodeHtmlEntities(String(s)).replace(/\s+/g, " ").trim();
  return v || null;
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, Math.max(0, Number(ms) || 0)); }); }

async function fetchWithTimeout(url, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs || 15000);
  try {
    var resp = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)", Accept: "text/html,*/*" },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, status: resp.status, html: "" };
    var html = await resp.text();
    return { ok: true, status: resp.status, html: html };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, html: "", error: String(e.message || e) };
  }
}

// Extract ryzer_program_name using same logic as ingestFootballCampsUSA
function extractRyzerProgramName(html) {
  if (!html) return null;

  // Method 1: "View More Events by X"
  var viewMoreMatch = /View More Events by\s+([^<]+)/i.exec(html);
  if (viewMoreMatch && viewMoreMatch[1]) {
    var val = stripNonAscii(viewMoreMatch[1]).trim();
    if (val && val.length > 2) return val;
  }

  // Method 2: programName div
  var progNameMatch = /<div[^>]*class="[^"]*programName[^"]*"[^>]*>([^<]+)<\/div>/i.exec(html);
  if (progNameMatch && progNameMatch[1]) {
    var val2 = stripNonAscii(progNameMatch[1]).trim();
    if (val2 && val2.length > 2) return val2;
  }

  // Method 3: campDetailsHeader area above h1
  var headerAreaMatch = /<div[^>]*class="[^"]*campDetailsHeader[^"]*"[^>]*>([\s\S]*?)<h1/i.exec(html);
  if (headerAreaMatch && headerAreaMatch[1]) {
    var headerText = stripTags(headerAreaMatch[1]).trim();
    if (headerText && headerText.length > 2 && headerText.length < 120) return headerText;
  }

  return null;
}

// Extract venue_name from the page
function extractVenueName(html) {
  if (!html) return null;

  // Maps link with title attribute
  var addrLinkMatch = /<a[^>]*href="https:\/\/maps[^"]*"[^>]*title="([^"]*)"[^>]*>/i.exec(html);
  if (addrLinkMatch && addrLinkMatch[1]) {
    var val = stripNonAscii(addrLinkMatch[1]).trim();
    if (val && val.length > 2) return val;
  }

  // Location header
  var venueDiv = /<h3[^>]*>\s*<strong>\s*Location:?\s*<\/strong>\s*<\/h3>\s*(?:<div[^>]*>)?\s*([^<]+)/i.exec(html);
  if (venueDiv && venueDiv[1]) {
    var val2 = stripNonAscii(venueDiv[1]).trim();
    if (val2 && val2.length > 2) return val2;
  }

  return null;
}

// Extract venue_address from the page
function extractVenueAddress(html) {
  if (!html) return null;

  var addrLinkMatch = /<a[^>]*href="https:\/\/maps[^"]*"[^>]*>([^<]+)<\/a>/i.exec(html);
  if (addrLinkMatch && addrLinkMatch[1]) {
    var val = stripNonAscii(addrLinkMatch[1]).trim();
    if (val && val.length > 4) return val;
  }

  return null;
}

// Fix double-comma in city: "Springfield," → "Springfield"
function fixCityDoubleComma(city) {
  if (!city) return null;
  var fixed = safeStr(city).replace(/,,/g, ",").replace(/,\s*$/, "").trim();
  return fixed || null;
}

Deno.serve(async function(req) {
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405 });
  }

  var body = {};
  try { body = await req.json(); } catch(e) { body = {}; }

  var dryRun = body.dryRun !== false;
  var maxCamps = Math.max(1, Number(body.maxCamps || 50));
  var startAt = Math.max(0, Number(body.startAt || 0));
  var sleepMs = Math.max(200, Number(body.sleepMs || 800));
  var timeBudgetMs = Math.max(10000, Number(body.timeBudgetMs || 50000));

  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  var t0 = Date.now();
  var elapsed = function() { return Date.now() - t0; };

  var Camp = base44.entities.Camp;

  // Fetch all camps, then filter client-side for the ones we need
  var allCamps = await Camp.filter({}, "source_key", 99999);

  var eligible = [];
  for (var i = 0; i < allCamps.length; i++) {
    var c = allCamps[i];
    if (c.ryzer_program_name) continue; // already has it
    if (!c.link_url) continue;
    if (c.link_url.indexOf("register.ryzer.com/camp.cfm") < 0 && c.link_url.indexOf("ryzerevents.com/camp.cfm") < 0) continue;
    if (c.source_platform !== "footballcampsusa") continue;
    eligible.push(c);
  }

  // Sort for deterministic batching
  eligible.sort(function(a, b) { return (a.source_key || "").localeCompare(b.source_key || ""); });

  var slice = eligible.slice(startAt, startAt + maxCamps);

  var stats = {
    totalEligible: eligible.length,
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    fetchFailed: 0,
    rpnFound: 0,
    venueNameFound: 0,
    venueAddressFound: 0,
    cityFixed: 0,
  };
  var sample = [];

  for (var si = 0; si < slice.length; si++) {
    if (elapsed() >= timeBudgetMs) {
      stats.stoppedEarly = true;
      break;
    }

    var camp = slice[si];
    stats.processed++;

    var fetchResult = await fetchWithTimeout(camp.link_url, 12000);
    if (!fetchResult.ok) {
      stats.fetchFailed++;
      stats.errors++;
      if (sample.length < 30) {
        sample.push({ id: camp.id, source_key: camp.source_key, status: "fetch_failed", httpStatus: fetchResult.status });
      }
      await sleep(sleepMs);
      continue;
    }

    var html = fetchResult.html;
    var updates = {};
    var found = [];

    // Extract ryzer_program_name
    var rpn = extractRyzerProgramName(html);
    if (rpn) {
      updates.ryzer_program_name = cleanTextField(rpn);
      stats.rpnFound++;
      found.push("rpn");
    }

    // Extract venue_name if currently null
    if (!camp.venue_name) {
      var vn = extractVenueName(html);
      if (vn) {
        updates.venue_name = cleanTextField(vn);
        stats.venueNameFound++;
        found.push("venue_name");
      }
    }

    // Extract venue_address if currently null
    if (!camp.venue_address) {
      var va = extractVenueAddress(html);
      if (va) {
        updates.venue_address = cleanTextField(va);
        stats.venueAddressFound++;
        found.push("venue_address");
      }
    }

    // Fix city double-comma
    if (camp.city && (camp.city.indexOf(",,") >= 0 || camp.city.match(/,\s*$/))) {
      var fixedCity = fixCityDoubleComma(camp.city);
      if (fixedCity !== camp.city) {
        updates.city = fixedCity;
        stats.cityFixed++;
        found.push("city_fixed");
      }
    }

    if (Object.keys(updates).length === 0) {
      stats.skipped++;
      if (sample.length < 30) {
        sample.push({ id: camp.id, source_key: camp.source_key, camp_name: camp.camp_name, status: "no_data_found" });
      }
      await sleep(sleepMs);
      continue;
    }

    if (!dryRun) {
      try {
        await Camp.update(String(camp.id), updates);
      } catch (e) {
        stats.errors++;
        if (sample.length < 30) {
          sample.push({ id: camp.id, source_key: camp.source_key, status: "update_error", error: String(e.message || e) });
        }
        await sleep(sleepMs);
        continue;
      }
    }

    stats.updated++;
    if (sample.length < 30) {
      sample.push({
        id: camp.id,
        source_key: camp.source_key,
        camp_name: camp.camp_name,
        status: "updated",
        found: found,
        ryzer_program_name: updates.ryzer_program_name || null,
        venue_name: updates.venue_name || null,
        venue_address: updates.venue_address || null,
        city: updates.city || null,
      });
    }

    await sleep(sleepMs);
  }

  var nextStartAt = startAt + stats.processed;
  var done = nextStartAt >= eligible.length;

  return Response.json({
    ok: true,
    dryRun: dryRun,
    stats: stats,
    pagination: {
      startAt: startAt,
      processed: stats.processed,
      nextStartAt: nextStartAt,
      done: done,
      totalEligible: eligible.length,
    },
    sample: sample,
    elapsedMs: elapsed(),
  });
});