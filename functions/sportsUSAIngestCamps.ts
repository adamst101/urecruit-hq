// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Crawl per-school camp sites
// - Discover Ryzer registration links (register.ryzer.com/...camp.cfm...)
// - Parse dates (listing first, then Ryzer fallback)
// - Parse best-effort camp_name (Ryzer-first, then listing fallback)
// - Return normalized accepted events (flat + wrapped) that AdminImport can write into CampDemo.
//
// Design goals:
// - Editor-safe: NO optional chaining, NO external imports.
// - Fail-soft with verbose debug.
//
// Inputs (supported):
// {
//   sportId: string (required),
//   sportName: string (required),
//   dryRun: boolean,
//   maxSites: number,
//   maxRegsPerSite: number,
//   maxEvents: number,
//
//   // Option A: direct URLs
//   siteUrls: string[]|null,
//
//   // Option B: structured sites (preferred for writing)
//   sites: [{ school_id: string|null, sport_id?: string|null, camp_site_url: string|null }]|null,
//
//   // Test mode
//   testSiteUrl: string|null,
//   testSchoolId: string|null
// }
//
// Output:
// {
//   version,
//   stats,
//   accepted: [ { school_id, sport_id, camp_name, start_date, end_date, registration_url, program_id, event_key, source_platform, source_url, event_dates_raw, content_hash, season_year, derived, debug } ],
//   accepted_wrapped: [ { event, derived, debug } ],
//   rejected_samples,
//   errors,
//   debug: { siteDebug:[], firstSiteHtmlSnippet:"...", kpi:{} }
// }

const VERSION =
  "sportsUSAIngestCamps_2026-02-04_v9_contract_compat_flatAccepted_plus_better_campName";

function safeString(x) {
  if (x === null || x === undefined) return null;
  var s = String(x).trim();
  return s ? s : null;
}

function lc(x) {
  return String(x || "").toLowerCase().trim();
}

function stripNonAscii(s) {
  return String(s || "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s, n) {
  var str = String(s || "");
  var max = n || 1200;
  return str.length > max ? str.slice(0, max) + "…(truncated)" : str;
}

function absUrl(baseUrl, maybeRelative) {
  var u = safeString(maybeRelative);
  if (!u) return null;
  if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
  if (u.indexOf("//") === 0) return "https:" + u;
  try {
    return new URL(u, baseUrl).toString();
  } catch (e) {
    return u;
  }
}

function uniq(arr) {
  var out = [];
  var seen = {};
  for (var i = 0; i < (arr || []).length; i++) {
    var v = arr[i];
    if (!v) continue;
    var k = String(v);
    if (seen[k]) continue;
    seen[k] = true;
    out.push(v);
  }
  return out;
}

function hashLite(s) {
  var str = String(s || "");
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return String(h);
}

/* -------------------------
   Registration link discovery
------------------------- */

function extractRyzerRegLinksFromHtml(html, siteUrl) {
  var out = [];
  if (!html) return out;

  function normalizeUrl(u) {
    if (!u) return null;
    var s = String(u).trim();

    s = s.replace(/&amp;/g, "&");
    s = s.split("#")[0];

    if (s.indexOf("//") === 0) s = "https:" + s;

    if (s.indexOf("/camp.cfm") === 0) s = "https://register.ryzer.com" + s;
    if (s.indexOf("camp.cfm") === 0) s = "https://register.ryzer.com/" + s;

    if (s.indexOf("http://") !== 0 && s.indexOf("https://") !== 0) {
      s = absUrl(siteUrl, s);
    }

    return s ? String(s).trim() : null;
  }

  function isRyzerCampLink(u) {
    var x = lc(u || "");
    if (x.indexOf("register.ryzer.com") !== -1 && x.indexOf("camp.cfm") !== -1) return true;
    return false;
  }

  function pushIfValid(raw) {
    var u = normalizeUrl(raw);
    if (!u) return;
    if (!isRyzerCampLink(u)) return;
    out.push(u);
  }

  var m;

  var reHrefDq = /href="([^"]*camp\.cfm[^"]*)"/gi;
  while ((m = reHrefDq.exec(html)) !== null) pushIfValid(m[1]);

  var reHrefSq = /href='([^']*camp\.cfm[^']*)'/gi;
  while ((m = reHrefSq.exec(html)) !== null) pushIfValid(m[1]);

  var reOnclickDq = /onclick="[^"]*(camp\.cfm[^"]*)"/gi;
  while ((m = reOnclickDq.exec(html)) !== null) pushIfValid(m[1]);

  var reOnclickSq = /onclick='[^']*(camp\.cfm[^']*)'/gi;
  while ((m = reOnclickSq.exec(html)) !== null) pushIfValid(m[1]);

  var reData =
    /(data-href|data-url)\s*=\s*("([^"]*camp\.cfm[^"]*)"|'([^']*camp\.cfm[^']*)'|([^\s>]*camp\.cfm[^\s>]*))/gi;
  while ((m = reData.exec(html)) !== null) pushIfValid(m[3] || m[4] || m[5]);

  var reFull = /(https?:\/\/register\.ryzer\.com\/[^"' <]*camp\.cfm[^"' <]*)/gi;
  while ((m = reFull.exec(html)) !== null) pushIfValid(m[1]);

  var reRel = /([\/]camp\.cfm\?[^"' <]+)/gi;
  while ((m = reRel.exec(html)) !== null) pushIfValid(m[1]);

  out = uniq(out);

  for (var i = 0; i < out.length; i++) {
    out[i] = String(out[i]).split("#")[0];
  }

  return out;
}

/* -------------------------
   Listing snippet extraction
------------------------- */

function extractSnippetAroundNeedle(html, needle, radius) {
  if (!html || !needle) return null;
  var r = radius || 260;
  var hay = String(html);
  var ndl = String(needle);

  var idx = hay.indexOf(ndl);
  if (idx < 0) {
    var lowHay = hay.toLowerCase();
    var lowNdl = ndl.toLowerCase();
    idx = lowHay.indexOf(lowNdl);
  }
  if (idx < 0) return null;

  var start = idx - r;
  if (start < 0) start = 0;
  var end = idx + ndl.length + r;
  if (end > hay.length) end = hay.length;

  return hay.slice(start, end);
}

function htmlToText(html) {
  if (!html) return "";
  var s = String(html);

  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");

  s = s.replace(/<\/?[^>]+>/g, " ");

  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&#39;/gi, "'");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");

  s = s.replace(/\s+/g, " ").trim();

  return s;
}

/* -------------------------
   Date parsing
------------------------- */

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function toIsoDate(y, m, d) {
  if (!y || !m || !d) return null;
  return String(y) + "-" + pad2(m) + "-" + pad2(d);
}

function monthNumFromName(name) {
  var n = lc(name);
  if (n.indexOf("jan") === 0) return 1;
  if (n.indexOf("feb") === 0) return 2;
  if (n.indexOf("mar") === 0) return 3;
  if (n.indexOf("apr") === 0) return 4;
  if (n.indexOf("may") === 0) return 5;
  if (n.indexOf("jun") === 0) return 6;
  if (n.indexOf("jul") === 0) return 7;
  if (n.indexOf("aug") === 0) return 8;
  if (n.indexOf("sep") === 0) return 9;
  if (n.indexOf("oct") === 0) return 10;
  if (n.indexOf("nov") === 0) return 11;
  if (n.indexOf("dec") === 0) return 12;
  return null;
}

function stripOrdinal(x) {
  return String(x || "").replace(/(st|nd|rd|th)\b/gi, "");
}

function parseMMDDYYYY(s) {
  var m = /(\b\d{1,2})\/(\d{1,2})\/(\d{4}\b)/.exec(s);
  if (!m) return null;
  var mm = Number(m[1]);
  var dd = Number(m[2]);
  var yy = Number(m[3]);
  if (!mm || !dd || !yy) return null;
  return { y: yy, m: mm, d: dd };
}

function parseMonthNameDate(s) {
  var m =
    /\b(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\b\s+(\d{1,2}(?:st|nd|rd|th)?)\b(?:[,\s]+(\d{4}))?/i.exec(
      s
    );
  if (!m) return null;
  var month = monthNumFromName(m[1]);
  var day = Number(stripOrdinal(m[2]));
  var year = m[3] ? Number(m[3]) : null;
  if (!month || !day) return null;
  return { y: year, m: month, d: day };
}

function parseSingleOrRangeDate(line, defaultYear) {
  var raw = safeString(line);
  if (!raw)
    return { start: null, end: null, rawLine: null, pattern: null, inferredYear: false };

  var t = stripNonAscii(raw);

  var m1 = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(t);
  if (m1) {
    var a = parseMMDDYYYY(m1[1]);
    var b = parseMMDDYYYY(m1[2]);
    return {
      start: a ? toIsoDate(a.y, a.m, a.d) : null,
      end: b ? toIsoDate(b.y, b.m, b.d) : null,
      rawLine: t,
      pattern: "mdy_range",
      inferredYear: false,
    };
  }

  var a1 = parseMMDDYYYY(t);
  if (a1) {
    return {
      start: toIsoDate(a1.y, a1.m, a1.d),
      end: null,
      rawLine: t,
      pattern: "mdy_single",
      inferredYear: false,
    };
  }

  var m2 =
    /\b(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\b\s+(\d{1,2}(?:st|nd|rd|th)?)\s*[-–]\s*(\d{1,2}(?:st|nd|rd|th)?)\b(?:[,\s]+(\d{4}))?/i.exec(
      t
    );
  if (m2) {
    var mm = monthNumFromName(m2[1]);
    var d1 = Number(stripOrdinal(m2[2]));
    var d2 = Number(stripOrdinal(m2[3]));
    var hasYear = !!m2[4];
    var yy = m2[4] ? Number(m2[4]) : defaultYear || null;
    return {
      start: yy && mm && d1 ? toIsoDate(yy, mm, d1) : null,
      end: yy && mm && d2 ? toIsoDate(yy, mm, d2) : null,
      rawLine: t,
      pattern: hasYear ? "month_range_year" : "month_range_infer_year",
      inferredYear: !hasYear,
    };
  }

  var m3 =
    /(\b(?:January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\b\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)\s*[-–]\s*(\b(?:January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\b\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)/i.exec(
      t
    );
  if (m3) {
    var p1 = parseMonthNameDate(m3[1]);
    var p2 = parseMonthNameDate(m3[2]);
    var y1 = (p1 && p1.y) || defaultYear || null;
    var y2 = (p2 && p2.y) || y1 || null;
    var inferred = !((p1 && p1.y) || (p2 && p2.y));
    return {
      start: p1 ? toIsoDate(y1, p1.m, p1.d) : null,
      end: p2 ? toIsoDate(y2, p2.m, p2.d) : null,
      rawLine: t,
      pattern: "month_full_range",
      inferredYear: inferred,
    };
  }

  var p = parseMonthNameDate(t);
  if (p) {
    var hasY = !!p.y;
    var yy2 = p.y || defaultYear || null;
    return {
      start: yy2 ? toIsoDate(yy2, p.m, p.d) : null,
      end: null,
      rawLine: t,
      pattern: hasY ? "month_single_year" : "month_single_infer_year",
      inferredYear: !hasY,
    };
  }

  return { start: null, end: null, rawLine: t, pattern: null, inferredYear: false };
}

function scoreParsedDate(parsed) {
  if (!parsed || !parsed.start) return 0;
  var score = 10;
  if (parsed.end) score += 5;
  if (parsed.pattern && parsed.pattern.indexOf("infer_year") >= 0) score -= 2;
  if (parsed.pattern && parsed.pattern.indexOf("mdy") >= 0) score += 2;
  return score;
}

/* -------------------------
   Ryzer page parsing
------------------------- */

function extractTitle(html) {
  if (!html) return null;
  var m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  if (!m) return null;
  return stripNonAscii(m[1]);
}

function extractMetaDescription(html) {
  if (!html) return null;
  var m = /<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html);
  if (!m) return null;
  return stripNonAscii(m[1]);
}

function extractRyzerDateCandidates(html) {
  var out = [];
  if (!html) return out;

  var patterns = [
    /(?:Dates?|Camp Dates?|Camp Date|Event Date|When)\s*<\/[^>]+>\s*<[^>]+>\s*([^<]{3,80})</i,
    /(?:Dates?|Camp Dates?|Camp Date|Event Date|When)\s*:\s*([^<]{3,80})</i,
    /(?:Dates?|Camp Dates?|Camp Date|Event Date|When)\s*-\s*([^<]{3,80})</i,
  ];

  for (var i = 0; i < patterns.length; i++) {
    var m = patterns[i].exec(html);
    if (m && m[1]) out.push(stripNonAscii(m[1]));
  }

  var m2 = /(\d{1,2}\/\d{1,2}\/\d{4}\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{4})/.exec(html);
  if (m2 && m2[1]) out.push(stripNonAscii(m2[1]));

  var reSingle = /(\d{1,2}\/\d{1,2}\/\d{4})/g;
  var m3,
    count3 = 0;
  while ((m3 = reSingle.exec(html)) !== null) {
    out.push(stripNonAscii(m3[1]));
    count3++;
    if (count3 >= 3) break;
  }

  var reMonth =
    /((January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?)?(?:,\s*\d{4})?)/gi;
  var m4,
    count4 = 0;
  while ((m4 = reMonth.exec(html)) !== null) {
    if (m4[1]) out.push(stripNonAscii(m4[1]));
    count4++;
    if (count4 >= 5) break;
  }

  var text = htmlToText(html);
  if (text) {
    var tokens = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
      "jan ",
      "feb ",
      "mar ",
      "apr ",
      "jun ",
      "jul ",
      "aug ",
      "sep ",
      "oct ",
      "nov ",
      "dec ",
      "/20",
    ];
    var lower = text.toLowerCase();
    var added = 0;
    for (var k = 0; k < tokens.length; k++) {
      var idx = lower.indexOf(tokens[k]);
      if (idx >= 0) {
        var start = idx - 60;
        if (start < 0) start = 0;
        var end = idx + 140;
        if (end > text.length) end = text.length;
        var snip = stripNonAscii(text.slice(start, end));
        if (snip && snip.length >= 8) out.push(snip);
        added++;
        if (added >= 5) break;
      }
    }
  }

  return uniq(out);
}

function guessDefaultYearFromContext(nowDate) {
  var d = nowDate || new Date();
  return d.getFullYear();
}

function pickBestParsedDateFromCandidates(candidates, defaultYear) {
  var best = null;
  var bestScore = 0;
  var bestRaw = null;

  for (var i = 0; i < (candidates || []).length; i++) {
    var c = candidates[i];
    if (!c) continue;
    var parsed = parseSingleOrRangeDate(c, defaultYear);
    var sc = scoreParsedDate(parsed);
    if (sc > bestScore) {
      best = parsed;
      bestScore = sc;
      bestRaw = c;
    }
    if (
      best &&
      best.start &&
      best.end &&
      bestScore >= 15 &&
      best.pattern &&
      best.pattern.indexOf("infer") < 0
    ) {
      break;
    }
  }

  return { parsed: best, bestRaw: bestRaw, score: bestScore };
}

/* -------------------------
   Better camp name extraction
------------------------- */

function cleanCampName(s) {
  var t = stripNonAscii(s || "");
  if (!t) return null;

  // common cleanup
  t = t.replace(/\s+\|\s+/g, " | ");
  t = t.replace(/\bDetails\b/gi, "").trim();

  // If it's a long title like "Register | School Camps | City"
  // keep the left-most meaningful segment unless it's generic.
  if (t.indexOf("|") >= 0) {
    var parts = t.split("|").map(function (x) {
      return stripNonAscii(x);
    });
    // pick the first non-generic segment
    for (var i = 0; i < parts.length; i++) {
      var p = stripNonAscii(parts[i]);
      if (!p) continue;
      if (lc(p) === "camp" || lc(p) === "register" || lc(p) === "registration") continue;
      return p;
    }
  }

  if (lc(t) === "camp") return null;

  return t;
}

function extractOgTitle(html) {
  if (!html) return null;
  var m = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (m && m[1]) return stripNonAscii(m[1]);
  return null;
}

function extractH1H2Text(html) {
  var out = [];
  if (!html) return out;

  var m;
  var re = /<(h1|h2)[^>]*>([\s\S]*?)<\/\1>/gi;
  while ((m = re.exec(html)) !== null) {
    var txt = stripNonAscii(htmlToText(m[2]));
    if (txt && txt.length >= 3) out.push(txt);
  }
  return uniq(out);
}

function extractLabeledName(html) {
  if (!html) return null;

  // Try shapes like: "Camp Name: XYZ" or "<label>Camp Name</label> XYZ"
  var m1 = /Camp Name\s*:\s*([^\n<]{3,120})/i.exec(html);
  if (m1 && m1[1]) return stripNonAscii(m1[1]);

  var m2 = /Camp Name\s*<\/[^>]+>\s*<[^>]+>\s*([^<]{3,120})</i.exec(html);
  if (m2 && m2[1]) return stripNonAscii(m2[1]);

  // Sometimes "Event" or "Program"
  var m3 = /(Event|Program)\s*Name\s*:\s*([^\n<]{3,120})/i.exec(html);
  if (m3 && m3[2]) return stripNonAscii(m3[2]);

  return null;
}

function pickBestCampName(regHtml, listingSnippetText) {
  var candidates = [];

  var labeled = extractLabeledName(regHtml);
  if (labeled) candidates.push(labeled);

  var og = extractOgTitle(regHtml);
  if (og) candidates.push(og);

  var h = extractH1H2Text(regHtml);
  for (var i = 0; i < h.length; i++) candidates.push(h[i]);

  var t = extractTitle(regHtml);
  if (t) candidates.push(t);

  // listing snippet sometimes has "View XYZ Camp" even when Ryzer title is generic
  if (listingSnippetText) {
    // Pull a “View ...” phrase if present
    var m = /\bView\s+([A-Za-z0-9][A-Za-z0-9\s\/&\-\(\)]{3,80})/i.exec(listingSnippetText);
    if (m && m[0]) candidates.push(stripNonAscii(m[0]));
  }

  // score candidates
  var best = null;
  var bestScore = 0;

  for (var j = 0; j < candidates.length; j++) {
    var raw = candidates[j];
    if (!raw) continue;
    var cleaned = cleanCampName(raw);
    if (!cleaned) continue;

    var s = 10;

    // prefer explicit "Camp" phrases that are not just "Camp"
    if (lc(cleaned).indexOf("camp") >= 0) s += 3;
    if (lc(cleaned).indexOf("registration") >= 0) s -= 5;
    if (lc(cleaned).indexOf("register") >= 0) s -= 5;

    // penalize if it looks like the site homepage title
    if (cleaned.indexOf("Football Camps") >= 0) s -= 2;

    // length heuristic
    if (cleaned.length >= 10 && cleaned.length <= 80) s += 2;
    if (cleaned.length > 110) s -= 2;

    if (s > bestScore) {
      bestScore = s;
      best = cleaned;
    }
  }

  return best || "Camp";
}

function buildEventKey(platform, programId, startDate, url) {
  var p = safeString(platform) || "sportsusa";
  var pr = safeString(programId) || "unknown";
  var sd = safeString(startDate) || "na";
  var u = safeString(url) || "";
  return p + ":" + pr + ":" + sd + ":" + hashLite(u);
}

function safeArray(x) {
  return Array.isArray(x) ? x : [];
}

Deno.serve(async (req) => {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    siteDebug: [],
    firstSiteHtmlSnippet: null,
    kpi: {
      datesParsedFromListing: 0,
      datesParsedFromRyzer: 0,
      datesMissing: 0,
      sitesWithNoRegLinks: 0,
      sitesWithRegLinks: 0,
    },
  };

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed", version: VERSION, debug: debug }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    var body = await req.json().catch(function () {
      return null;
    });

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var dryRun = !!(body && body.dryRun);

    var maxSites = Number(body && body.maxSites !== undefined ? body.maxSites : 5);
    var maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 10);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 25);

    var testSiteUrl = safeString(body && body.testSiteUrl);
    var testSchoolId = safeString(body && body.testSchoolId);

    var siteUrls = body && body.siteUrls ? body.siteUrls : null;
    var sites = body && body.sites ? body.sites : null;

    if (!sportId || !sportName) {
      return new Response(
        JSON.stringify({ error: "Missing required: sportId/sportName", version: VERSION, debug: debug }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build crawl plan with optional school_id context
    var crawl = []; // [{ siteUrl, schoolId }]
    if (testSiteUrl) {
      crawl.push({ siteUrl: testSiteUrl, schoolId: testSchoolId || null });
    } else if (sites && Array.isArray(sites) && sites.length) {
      var sliced = sites.slice(0, maxSites);
      for (var i = 0; i < sliced.length; i++) {
        var r = sliced[i] || {};
        var u = safeString(r.camp_site_url || r.siteUrl || r.url);
        if (!u) continue;
        crawl.push({ siteUrl: u, schoolId: safeString(r.school_id) });
      }
    } else if (siteUrls && Array.isArray(siteUrls) && siteUrls.length) {
      var su = siteUrls.slice(0, maxSites);
      for (var j = 0; j < su.length; j++) {
        var uu = safeString(su[j]);
        if (!uu) continue;
        crawl.push({ siteUrl: uu, schoolId: null });
      }
    } else {
      return new Response(
        JSON.stringify({
          version: VERSION,
          stats: { processedSites: 0, processedRegs: 0, accepted: 0, rejected: 0, errors: 1 },
          accepted: [],
          accepted_wrapped: [],
          rejected_samples: [],
          errors: [{ error: "Provide sites[] OR siteUrls[] OR testSiteUrl." }],
          debug: debug,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    var acceptedWrapped = [];
    var acceptedFlat = [];
    var rejected = [];
    var errors = [];

    var processedSites = 0;
    var processedRegs = 0;

    var now = new Date();
    var defaultYear = guessDefaultYearFromContext(now);

    for (var s = 0; s < crawl.length; s++) {
      if (acceptedFlat.length >= maxEvents) break;

      var siteUrl = crawl[s].siteUrl;
      var schoolId = crawl[s].schoolId;

      processedSites += 1;

      var http = 0;
      var html = "";
      var htmlType = "";
      var regLinks = [];

      try {
        var r = await fetch(siteUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
            Accept: "text/html,*/*",
          },
        });

        http = r.status;
        htmlType = r.headers.get("content-type") || "";
        html = await r.text().catch(function () {
          return "";
        });

        regLinks = extractRyzerRegLinksFromHtml(html, siteUrl).slice(0, maxRegsPerSite);

        if (!debug.firstSiteHtmlSnippet) debug.firstSiteHtmlSnippet = truncate(html, 1600);

        if (!regLinks.length) debug.kpi.sitesWithNoRegLinks += 1;
        else debug.kpi.sitesWithRegLinks += 1;

        debug.siteDebug.push({
          siteUrl: siteUrl,
          school_id: schoolId || null,
          http: http,
          htmlType: htmlType,
          regLinks: regLinks.length,
          sample: regLinks.length ? regLinks[0] : "",
          notes: regLinks.length ? "has_registration_links" : "no_registration_links_found",
        });

        if (!regLinks.length) continue;

        for (var k = 0; k < regLinks.length; k++) {
          if (acceptedFlat.length >= maxEvents) break;

          var regUrl = regLinks[k];
          processedRegs += 1;

          // listing-first date parse
          var listingSnippetHtml = extractSnippetAroundNeedle(html, regUrl, 360);
          var listingSnippetText = listingSnippetHtml ? htmlToText(listingSnippetHtml) : null;
          var listingParsed = listingSnippetText ? parseSingleOrRangeDate(listingSnippetText, defaultYear) : null;

          var finalParsed = null;
          var datesSource = null;
          var eventDatesRaw = null;
          var datePattern = null;

          if (listingParsed && listingParsed.start) {
            finalParsed = listingParsed;
            datesSource = "listing";
            eventDatesRaw = listingParsed.rawLine || truncate(listingSnippetText, 220);
            datePattern = listingParsed.pattern || null;
            debug.kpi.datesParsedFromListing += 1;
          }

          var regHttp = 0;
          var regHtml = "";
          var ryzerCandidates = [];
          var ryzerPick = null;

          // always fetch Ryzer if we need dates OR if we need name quality (camp_name currently a problem)
          var mustFetchRyzer = true;

          if (mustFetchRyzer) {
            try {
              var rr = await fetch(regUrl, {
                method: "GET",
                headers: {
                  "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
                  Accept: "text/html,*/*",
                },
              });

              regHttp = rr.status;
              regHtml = await rr.text().catch(function () {
                return "";
              });

              if (!rr.ok || !regHtml) {
                rejected.push({
                  reason: "reg_fetch_failed",
                  registrationUrl: regUrl,
                  http: regHttp,
                });
                continue;
              }

              // date fallback if listing didn't produce
              if (!finalParsed || !finalParsed.start) {
                ryzerCandidates = extractRyzerDateCandidates(regHtml);
                ryzerPick = pickBestParsedDateFromCandidates(ryzerCandidates, defaultYear);

                if (ryzerPick && ryzerPick.parsed && ryzerPick.parsed.start) {
                  finalParsed = ryzerPick.parsed;
                  datesSource = "ryzer";
                  eventDatesRaw = ryzerPick.bestRaw || (finalParsed.rawLine || null);
                  datePattern = finalParsed.pattern || null;
                  debug.kpi.datesParsedFromRyzer += 1;
                }
              }
            } catch (eRegFetch) {
              errors.push({
                error: "reg_exception",
                message: String((eRegFetch && eRegFetch.message) || eRegFetch),
                registrationUrl: regUrl,
              });
            }
          }

          if (!finalParsed || !finalParsed.start) {
            debug.kpi.datesMissing += 1;
            rejected.push({
              reason: "missing_start_date",
              registrationUrl: regUrl,
              debug: {
                siteUrl: siteUrl,
                listingSnippetText: listingSnippetText ? truncate(listingSnippetText, 360) : null,
                ryzerCandidatesSample:
                  ryzerCandidates && ryzerCandidates.length ? ryzerCandidates.slice(0, 6) : [],
                regHttp: regHttp || null,
              },
            });
            continue;
          }

          // Program ID from query id
          var programId = null;
          var idMatch = /[?&]id=(\d+)/i.exec(regUrl);
          if (idMatch && idMatch[1]) programId = "ryzer:" + idMatch[1];
          if (!programId) programId = "ryzer:" + hashLite(regUrl);

          var eventKey = buildEventKey("ryzer", programId, finalParsed.start, regUrl);

          // Better camp name
          var campName = "Camp";
          var desc = null;
          if (regHtml) {
            campName = pickBestCampName(regHtml, listingSnippetText);
            desc = extractMetaDescription(regHtml) || null;
          } else {
            campName = listingSnippetText ? cleanCampName(listingSnippetText) || "Camp" : "Camp";
            desc = null;
          }

          var wrapped = {
            event: {
              school_id: schoolId || null,
              sport_id: sportId,
              camp_name: stripNonAscii(campName),
              start_date: finalParsed.start,
              end_date: finalParsed.end || null,
              city: null,
              state: null,
              position_ids: [],
              price: null,
              link_url: regUrl,
              notes: desc,

              season_year: Number(finalParsed.start.slice(0, 4)),
              program_id: programId,
              event_key: eventKey,
              source_platform: "ryzer",
              source_url: regUrl,
              last_seen_at: new Date().toISOString(),
              content_hash: hashLite(
                stripNonAscii(campName) + "|" + (desc || "") + "|" + (eventDatesRaw || "")
              ),

              event_dates_raw: eventDatesRaw || null,
              grades_raw: null,
              register_by_raw: null,
              price_raw: null,
              price_min: null,
              price_max: null,
              sections_json: null,
            },
            derived: {
              reg_http: regHttp || null,
              dates_source: datesSource,
              date_pattern: datePattern,
              listing_snippet_used: datesSource === "listing" ? true : false,
              ryzer_candidates_count: ryzerCandidates ? ryzerCandidates.length : 0,
              camp_name_source: regHtml ? "ryzer" : "listing",
            },
            debug: {
              reg_url: regUrl,
              site_url: siteUrl,
              school_id: schoolId || null,
              listingSnippetText: listingSnippetText ? truncate(listingSnippetText, 360) : null,
              ryzerCandidatesSample:
                ryzerCandidates && ryzerCandidates.length ? ryzerCandidates.slice(0, 6) : [],
            },
          };

          acceptedWrapped.push(wrapped);

          // Flat record for AdminImport stability (old log formatting expects these keys)
          acceptedFlat.push({
            school_id: schoolId || null,
            sport_id: sportId,
            camp_name: wrapped.event.camp_name,
            start_date: wrapped.event.start_date,
            end_date: wrapped.event.end_date,
            registration_url: regUrl,
            program_id: wrapped.event.program_id,
            event_key: wrapped.event.event_key,
            source_platform: wrapped.event.source_platform,
            source_url: wrapped.event.source_url,
            season_year: wrapped.event.season_year,
            content_hash: wrapped.event.content_hash,
            event_dates_raw: wrapped.event.event_dates_raw,
            derived: wrapped.derived,
            debug: wrapped.debug,
          });
        }
      } catch (eSite) {
        errors.push({
          error: "site_exception",
          message: String((eSite && eSite.message) || eSite),
          siteUrl: siteUrl,
        });
        debug.siteDebug.push({
          siteUrl: siteUrl,
          school_id: schoolId || null,
          http: http || 0,
          htmlType: htmlType || "",
          regLinks: 0,
          sample: "",
          notes: "exception:" + String((eSite && eSite.message) || eSite),
        });
      }
    }

    var rejected_samples = rejected.slice(0, 25);

    var percentWithStartDate = 0;
    var denom = processedRegs;
    if (denom > 0) {
      percentWithStartDate = Math.round((acceptedFlat.length / denom) * 1000) / 10;
    }

    return new Response(
      JSON.stringify({
        version: VERSION,
        stats: {
          processedSites: processedSites,
          processedRegs: processedRegs,
          accepted: acceptedFlat.length,
          rejected: rejected.length,
          errors: errors.length,
          percentWithStartDate: percentWithStartDate,
        },
        accepted: acceptedFlat, // ✅ stable shape for AdminImport
        accepted_wrapped: acceptedWrapped, // ✅ richer debugging retained
        rejected_samples: rejected_samples,
        errors: errors.slice(0, 10),
        debug: debug,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (eTop) {
    return new Response(
      JSON.stringify({
        error: "Unhandled error",
        version: VERSION,
        debug: {
          version: VERSION,
          startedAt: new Date().toISOString(),
          siteDebug: [
            {
              siteUrl: "",
              http: 0,
              htmlType: "",
              regLinks: 0,
              sample: "",
              notes: "top-level error: " + String((eTop && eTop.message) || eTop),
            },
          ],
        },
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
