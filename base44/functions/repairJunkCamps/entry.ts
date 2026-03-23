// functions/repairJunkCamps.js
// One-time repair: re-fetches Ryzer detail pages for camps with junk names
// and restores correct data. Admin only.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, Math.max(0, Number(ms) || 0)); }); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function safeStr(x) { return (x === null || x === undefined) ? "" : String(x).trim(); }
function lc(x) { return safeStr(x).toLowerCase(); }

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
    .replace(/&bull;/gi, "\u2022").replace(/&hellip;/gi, "\u2026")
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

var JUNK_NAME_PATTERNS = [
  /^upcoming\b/i,
  /^20\d{2}\s+events?\s*$/i,
  /^events?\s*$/i,
  /^camps?\s*$/i,
  /^camp\s*$/i,
];

function isJunkCampName(name) {
  if (!name) return true;
  var n = safeStr(name);
  if (!n) return true;
  for (var i = 0; i < JUNK_NAME_PATTERNS.length; i++) {
    if (JUNK_NAME_PATTERNS[i].test(n)) return true;
  }
  return false;
}

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

function parseMDY(s) {
  var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (!m) return null;
  var mm = m[1].length === 1 ? "0" + m[1] : m[1];
  var dd = m[2].length === 1 ? "0" + m[2] : m[2];
  return m[3] + "-" + mm + "-" + dd;
}

function parseFlexibleDates(s) {
  var result = { start: null, end: null };
  if (!s) return result;
  var MONTHS = { jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12 };
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  var rangeM = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\s*[-\u2013]\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i.exec(s);
  if (rangeM) {
    var m1 = MONTHS[lc(rangeM[1])]; var d1 = parseInt(rangeM[2]); var y1 = rangeM[3] ? parseInt(rangeM[3]) : null;
    var m2 = MONTHS[lc(rangeM[4])]; var d2 = parseInt(rangeM[5]); var y2 = rangeM[6] ? parseInt(rangeM[6]) : null;
    var year = y2 || y1 || new Date().getFullYear(); if (!y1) y1 = year;
    if (m1 && d1) result.start = y1 + "-" + pad(m1) + "-" + pad(d1);
    if (m2 && d2) result.end = year + "-" + pad(m2) + "-" + pad(d2);
    return result;
  }
  var sameMonthRange = /([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-\u2013]\s*(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i.exec(s);
  if (sameMonthRange) {
    var sm = MONTHS[lc(sameMonthRange[1])]; var sd1 = parseInt(sameMonthRange[2]); var sd2 = parseInt(sameMonthRange[3]);
    var sy = sameMonthRange[4] ? parseInt(sameMonthRange[4]) : new Date().getFullYear();
    if (sm && sd1) result.start = sy + "-" + pad(sm) + "-" + pad(sd1);
    if (sm && sd2) result.end = sy + "-" + pad(sm) + "-" + pad(sd2);
    return result;
  }
  var mdyRange = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-\u2013]\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(s);
  if (mdyRange) { result.start = parseMDY(mdyRange[1]); result.end = parseMDY(mdyRange[2]); return result; }
  var mdySingle = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(s);
  if (mdySingle) result.start = parseMDY(mdySingle[1]);
  return result;
}

function stripPipeSuffix(s) {
  if (!s) return s;
  return s.replace(/\s*\|.*$/, "").trim();
}

function extractRyzerCampDetails(html) {
  if (!html) return null;
  var text = stripTags(html);

  var campName = null;
  var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1 && h1[1]) {
    campName = stripPipeSuffix(stripTags(h1[1]).replace(/\s*-\s*(?:Event\s+)?Registration.*$/i, "").trim());
  }
  if (!campName || campName.length < 4) {
    var titleM = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    if (titleM && titleM[1]) {
      campName = stripPipeSuffix(stripNonAscii(titleM[1]).replace(/\s*-\s*(?:Event\s+)?Registration.*$/i, "").trim());
    }
  }

  var hostOrg = null;
  var hostMatch = /<div class="campDetailsCustomer">([^<]+)<\/div>/i.exec(html);
  if (hostMatch && hostMatch[1]) hostOrg = stripNonAscii(hostMatch[1]).trim() || null;

  var ryzerProgramName = null;
  var viewMoreMatch = /View More Events by\s+([^<]+)/i.exec(html);
  if (viewMoreMatch && viewMoreMatch[1]) ryzerProgramName = stripNonAscii(viewMoreMatch[1]).trim() || null;
  if (!ryzerProgramName) {
    var progNameMatch = /<div[^>]*class="[^"]*programName[^"]*"[^>]*>([^<]+)<\/div>/i.exec(html);
    if (progNameMatch && progNameMatch[1]) ryzerProgramName = stripNonAscii(progNameMatch[1]).trim() || null;
  }
  if (!ryzerProgramName) {
    var headerAreaMatch = /<div[^>]*class="[^"]*campDetailsHeader[^"]*"[^>]*>([\s\S]*?)<h1/i.exec(html);
    if (headerAreaMatch && headerAreaMatch[1]) {
      var headerText = stripTags(headerAreaMatch[1]).trim();
      if (headerText && headerText.length > 2 && headerText.length < 120) ryzerProgramName = headerText;
    }
  }

  var locationRaw = null; var eventDateRaw = null; var gradesRaw = null;
  var detailsBlock = html.match(/<div class="row campDetailsTable">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i);
  if (detailsBlock) {
    var block = detailsBlock[1];
    var spanSections = block.split(/<span>\s*<div class="leftflt campDetailsIcon">/i);
    for (var si2 = 0; si2 < spanSections.length; si2++) {
      var sec = spanSections[si2];
      var labelMatch = /<span>([^<]+)<\/span>/i.exec(sec);
      if (!labelMatch) continue;
      var label = lc(labelMatch[1]);
      var afterLabel = sec.substring(sec.indexOf(labelMatch[0]) + labelMatch[0].length);
      var val2 = stripTags(afterLabel).trim();
      if (label.indexOf("location") >= 0 && val2) locationRaw = val2;
      else if (label.indexOf("event date") >= 0 && val2) eventDateRaw = val2;
      else if (label.indexOf("grade") >= 0 && val2) gradesRaw = val2;
    }
  }

  var city = null; var state = null;
  if (locationRaw) {
    var csMatch = /([A-Za-z .'-]{2,}),+\s*([A-Z]{2})\b/.exec(locationRaw);
    if (csMatch) { city = csMatch[1].replace(/,+$/, "").trim(); state = csMatch[2].trim(); }
  }
  if (!city) {
    var locFallback = /Location\s+(.{0,140}?)(?:Event Date|Grades|Register By|Select a price|We Accept|$)/i.exec(text);
    if (locFallback && locFallback[1]) {
      var seg = locFallback[1].indexOf("|") >= 0 ? locFallback[1].split("|").pop().trim() : locFallback[1].trim();
      var csMatch2 = /([A-Za-z .'-]{2,}),+\s*([A-Z]{2})\b/.exec(seg);
      if (csMatch2) { city = csMatch2[1].replace(/,+$/, "").trim(); state = csMatch2[2].trim(); }
    }
  }

  var venueName = null; var venueAddress = null;
  var addrLinkMatch = /<a[^>]*href="https:\/\/maps[^"]*"[^>]*(?:title="([^"]*)")?[^>]*>([^<]+)<\/a>/i.exec(html);
  if (addrLinkMatch) { venueAddress = stripNonAscii(addrLinkMatch[2]).trim() || null; if (addrLinkMatch[1]) venueName = stripNonAscii(addrLinkMatch[1]).trim() || null; }
  if (!venueName) {
    var venueDiv = /<h3[^>]*>\s*<strong>\s*Location:?\s*<\/strong>\s*<\/h3>\s*(?:<div[^>]*>)?\s*([^<]+)/i.exec(html);
    if (venueDiv && venueDiv[1]) venueName = stripNonAscii(venueDiv[1]).trim() || null;
  }

  if ((!city || !state) && venueAddress) {
    var vaCsMatch = /([A-Za-z .'-]{2,}),\s*([A-Z]{2})\b/.exec(venueAddress);
    if (vaCsMatch) { if (!city) city = vaCsMatch[1].replace(/,+$/, "").trim(); if (!state) state = vaCsMatch[2].trim(); }
  }

  var startDate = null; var endDate = null;
  if (eventDateRaw) { var parsed = parseFlexibleDates(eventDateRaw); if (parsed.start) startDate = parsed.start; if (parsed.end) endDate = parsed.end; }
  if (!startDate) {
    var dateRange = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-\u2013]\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text);
    if (dateRange) { startDate = parseMDY(dateRange[1]); endDate = parseMDY(dateRange[2]); }
    else { var singleDate = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text); if (singleDate) startDate = parseMDY(singleDate[1]); }
  }

  var desc = null;
  var campInfoDescMatch = /<div class="CampInfo">([\s\S]*?)<\/div>\s*(?:<\/div>|$)/i.exec(html);
  if (campInfoDescMatch && campInfoDescMatch[1]) { desc = stripTags(campInfoDescMatch[1]).trim(); if (desc.length > 500) desc = desc.substring(0, 497) + "..."; }

  var priceOptions = [];
  var seen = {};
  var optionBlocks = html.match(/<(?:div|label|li|tr)[^>]*class="[^"]*(?:price|option|campPrice)[^"]*"[^>]*>[\s\S]*?<\/(?:div|label|li|tr)>/gi);
  if (optionBlocks) {
    for (var oi = 0; oi < optionBlocks.length; oi++) {
      var blockText = stripTags(optionBlocks[oi]);
      var priceM = /\$\s*(\d{1,5})(?:\.(\d{2}))?/.exec(blockText);
      if (priceM) {
        var pval = parseFloat(priceM[1] + (priceM[2] ? "." + priceM[2] : ""));
        var plabel = blockText.replace(/\$\s*\d+(?:\.\d{2})?/, "").replace(/\s+/g, " ").trim();
        if (!plabel || plabel.length < 2) plabel = "Registration";
        plabel = plabel.substring(0, 100);
        var pkey = pval + "|" + plabel;
        if (!seen[pkey] && pval > 0 && pval < 20000) { seen[pkey] = true; priceOptions.push({ label: cleanTextField(plabel), price: pval }); }
      }
    }
  }
  var price = null;
  if (priceOptions.length > 0) {
    var allPrices = priceOptions.map(function(o) { return o.price; }).filter(function(p) { return p > 0; });
    price = allPrices.length > 0 ? Math.min.apply(null, allPrices) : null;
  }

  return {
    camp_name: cleanTextField(campName), host_org: cleanTextField(hostOrg),
    ryzer_program_name: cleanTextField(ryzerProgramName), description: desc,
    start_date: startDate, end_date: endDate, price: price, price_options: priceOptions,
    city: city, state: state, venue_name: cleanTextField(venueName),
    venue_address: cleanTextField(venueAddress), grades: cleanTextField(gradesRaw),
  };
}

Deno.serve(async function(req) {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  var body = {};
  try { body = await req.json(); } catch(e) { body = {}; }

  var base44 = createClientFromRequest(req);
  var user = await base44.auth.me();
  if (!user || user.role !== "admin") return json({ error: "Forbidden" }, 403);

  var dryRun = body.dryRun !== false && body.dryRun !== "false";
  var maxCamps = Math.max(1, Number(body.maxCamps || 50));
  var startAt = Math.max(0, Number(body.startAt || 0));
  var sleepMs = Math.max(0, Number(body.sleepMs || 2000));

  // Specific source_keys to repair (if provided)
  var specificKeys = body.sourceKeys || null;

  var Camp = base44.entities.Camp;

  // Find camps with junk names
  var allCamps = await Camp.filter({}, "source_key", 99999);
  var junkCamps = [];

  for (var i = 0; i < allCamps.length; i++) {
    var c = allCamps[i];
    if (specificKeys) {
      if (specificKeys.indexOf(c.source_key) >= 0) junkCamps.push(c);
    } else {
      if (isJunkCampName(c.camp_name)) junkCamps.push(c);
    }
  }

  var totalJunk = junkCamps.length;
  var slice = junkCamps.slice(startAt, startAt + maxCamps);
  var stats = { processed: 0, updated: 0, skipped: 0, errors: 0, fetchFailed: 0, noData: 0 };
  var sample = [];

  for (var si = 0; si < slice.length; si++) {
    var camp = slice[si];
    stats.processed++;

    // Build Ryzer URL from source_key or link_url
    var regUrl = camp.link_url || camp.source_url;
    if (!regUrl) {
      var idMatch = /(\d+)$/.exec(camp.source_key || "");
      if (idMatch) regUrl = "https://register.ryzer.com/camp.cfm?sport=1&id=" + idMatch[1];
    }
    if (!regUrl) { stats.errors++; continue; }

    var result = await fetchPage(regUrl, 15000);
    if (!result.ok) {
      stats.fetchFailed++;
      if (sample.length < 20) sample.push({ source_key: camp.source_key, status: "fetch_failed", http: result.status });
      await sleep(sleepMs);
      continue;
    }

    var details = extractRyzerCampDetails(result.html);
    if (!details || !details.camp_name) {
      stats.noData++;
      if (sample.length < 20) sample.push({ source_key: camp.source_key, status: "no_data", old_name: camp.camp_name });
      await sleep(sleepMs);
      continue;
    }

    // Build update — only set fields that have data from Ryzer
    var update = {};
    if (details.camp_name) update.camp_name = details.camp_name;
    if (details.price != null) update.price = details.price;
    if (details.price_options && details.price_options.length > 0) update.price_options = details.price_options;
    if (details.city) update.city = details.city;
    if (details.state) update.state = details.state;
    if (details.venue_name) update.venue_name = details.venue_name;
    if (details.venue_address) update.venue_address = details.venue_address;
    if (details.host_org) update.host_org = details.host_org;
    if (details.ryzer_program_name) update.ryzer_program_name = details.ryzer_program_name;
    if (details.grades) update.grades = details.grades;
    if (details.description) update.notes = details.description;
    if (details.start_date) update.start_date = details.start_date;
    if (details.end_date) update.end_date = details.end_date;

    if (Object.keys(update).length === 0) {
      stats.noData++;
      if (sample.length < 20) sample.push({ source_key: camp.source_key, status: "no_useful_data", old_name: camp.camp_name });
      await sleep(sleepMs);
      continue;
    }

    if (!dryRun) {
      await Camp.update(String(camp.id), update);
    }
    stats.updated++;

    if (sample.length < 20) {
      sample.push({
        source_key: camp.source_key,
        status: "repaired",
        old_name: camp.camp_name,
        new_name: update.camp_name || camp.camp_name,
        new_city: update.city || null,
        new_state: update.state || null,
        new_price: update.price || null,
        new_venue: update.venue_name || null,
        new_host_org: update.host_org || null,
      });
    }

    await sleep(sleepMs);
  }

  var nextStartAt = startAt + stats.processed;
  return json({
    ok: true,
    dryRun: dryRun,
    totalJunkCamps: totalJunk,
    stats: stats,
    pagination: {
      startAt: startAt,
      processed: stats.processed,
      nextStartAt: nextStartAt,
      totalEligible: totalJunk,
      done: nextStartAt >= totalJunk,
    },
    sample: sample,
  });
});