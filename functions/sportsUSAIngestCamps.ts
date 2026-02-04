// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Crawl per-school camp sites (SchoolSportSite.camp_site_url)
// - Discover Ryzer registration links (register.ryzer.com/...camp.cfm...)
// - Parse dates listing-first (snippet around link), then Ryzer page as truth source
// - Return a contract-compatible flat "accepted" array that AdminImport can upsert into CampDemo
//
// Design goals:
// - Editor-safe: NO optional chaining, NO external imports.
// - Fail-soft with verbose debug.
// - High likelihood of "no camps listed yet": skip cleanly.
//
// Inputs (supports both shapes):
// {
//   sportId: string (required),
//   sportName: string (required),
//   dryRun: boolean,
//   maxSites: number,
//   maxRegsPerSite: number,
//   maxEvents: number,
//   testSiteUrl: string|null,
//   testSchoolId: string|null,
//   sites: [{ school_id, camp_site_url }] | null,
//   siteUrls: string[] | null
// }
//
// Output:
// {
//   version,
//   stats,
//   accepted: [{ ...flatCampDemoLike }],
//   rejected_samples,
//   errors,
//   debug: { siteDebug:[], firstSiteHtmlSnippet:"...", kpi:{...}, siteKpi:{...} }
// }

const VERSION = "sportsUSAIngestCamps_2026-02-04_v9_contract_compat_flatAccepted_plus_better_campName";

// -------------------------
// Helpers
// -------------------------
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
  // small deterministic hash (not crypto) for event_key stability
  var str = String(s || "");
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return String(h);
}

// -------------------------
// Registration link discovery
// -------------------------
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

  var reData = /(data-href|data-url)\s*=\s*("([^"]*camp\.cfm[^"]*)"|'([^']*camp\.cfm[^']*)'|([^\s>]*camp\.cfm[^\s>]*))/gi;
  while ((m = reData.exec(html)) !== null) pushIfValid(m[3] || m[4] || m[5]);

  var reFull = /(https?:\/\/register\.ryzer\.com\/[^"' <]*camp\.cfm[^"' <]*)/gi;
  while ((m = reFull.exec(html)) !== null) pushIfValid(m[1]);

  var reRel = /([\/]camp\.cfm\?[^"' <]+)/gi;
  while ((m = reRel.exec(html)) !== null) pushIfValid(m[1]);

  out = uniq(out);

  for (var i = 0; i < out.length; i++) out[i] = String(out[i]).split("#")[0];

  return out;
}

// -------------------------
// Listing snippet extraction (camp site)
// -------------------------
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

// -------------------------
// Date parsing (single or range)
// Output: { start, end, rawLine, pattern, inferredYear }
// -------------------------
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
  if (!raw) return { start: null, end: null, rawLine: null, pattern: null, inferredYear: false };

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
    return { start: toIsoDate(a1.y, a1.m, a1.d), end: null, rawLine: t, pattern: "mdy_single", inferredYear: false };
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

// -------------------------
// Ryzer parsing
// -------------------------
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

function extractHeaderTextCandidates(html) {
  var out = [];
  if (!html) return out;

  var m;
  var re = /<(h1|h2)[^>]*>([\s\S]*?)<\/\1>/gi;
  while ((m = re.exec(html)) !== null) {
    var txt = stripNonAscii(htmlToText(m[2]));
    if (txt && txt.length >= 3) out.push(txt);
  }

  var t = extractTitle(html);
  if (t) out.push(t);

  return uniq(out);
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
  var m3, count3 = 0;
  while ((m3 = reSingle.exec(html)) !== null) {
    out.push(stripNonAscii(m3[1]));
    count3++;
    if (count3 >= 3) break;
  }

  var reMonth = /((January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?)?(?:,\s*\d{4})?)/gi;
  var m4, count4 = 0;
  while ((m4 = reMonth.exec(html)) !== null) {
    if (m4[1]) out.push(stripNonAscii(m4[1]));
    count4++;
    if (count4 >= 5) break;
  }

  var headers = extractHeaderTextCandidates(html);
  for (var j = 0; j < headers.length; j++) out.push(headers[j]);

  var text = htmlToText(html);
  if (text) {
    var tokens = [
      "january","february","march","april","may","june","july","august","september","october","november","december",
      "jan ","feb ","mar ","apr ","jun ","jul ","aug ","sep ","oct ","nov ","dec ",
      "/20"
    ];

    var lower = text.toLowerCase();
    var added = 0;
    for (var k = 0; k < tokens.length; k++) {
      var idx = lower.indexOf(tokens[k]);
      if (idx >= 0) {
        var start = idx - 60; if (start < 0) start = 0;
        var end = idx + 140; if (end > text.length) end = text.length;
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
    if (best && best.start && best.end && bestScore >= 15 && best.pattern && best.pattern.indexOf("infer") < 0) break;
  }

  return { parsed: best, bestRaw: bestRaw, score: bestScore };
}

function buildEventKey(platform, programId, startDate, url) {
  var p = safeString(platform) || "sportsusa";
  var pr = safeString(programId) || "unknown";
  var sd = safeString(startDate) || "na";
  var u = safeString(url) || "";
  return p + ":" + pr + ":" + sd + ":" + hashLite(u);
}

function cleanCampName(title) {
  var t = stripNonAscii(title || "");
  if (!t) return "Camp";

  t = t.replace(/\s*\|\s*Ryzer\s*$/i, "").trim();
  t = t.replace(/\s*\|\s*Registration\s*$/i, "").trim();
  t = t.replace(/\s*-\s*Registration\s*$/i, "").trim();

  // Common noisy prefixes from "View ... Details"
  t = t.replace(/^View\s+/i, "");
  t = t.replace(/\s+Details$/i, "");

  t = t.replace(/\s+/g, " ").trim();
  return t || "Camp";
}

function findCampNameFromListingSnippet(listingSnippetText) {
  // best-effort: grab a short "title-ish" segment around common keywords
  var t = safeString(listingSnippetText);
  if (!t) return null;

  var s = stripNonAscii(t);

  // If the snippet includes "View X Details" capture X
  var m = /\bView\s+(.{3,80}?)\s+Details\b/i.exec(s);
  if (m && m[1]) return cleanCampName(m[1]);

  // Otherwise: first ~60 chars before a date token might be name-ish
  var idx = s.search(/(January|February|March|April|May|June|July|August|September|October|November|December|\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (idx > 6) {
    var head = s.slice(0, idx).trim();
    if (head.length >= 3) return cleanCampName(head.slice(0, 80));
  }

  return null;
}

function normalizeSitesInput(body) {
  var out = [];

  var sites = body && body.sites ? body.sites : null;
  if (sites && Array.isArray(sites) && sites.length) {
    for (var i = 0; i < sites.length; i++) {
      var r = sites[i] || {};
      var url = safeString(r.camp_site_url) || safeString(r.siteUrl) || safeString(r.url);
      if (!url) continue;
      out.push({
        siteUrl: url,
        school_id: safeString(r.school_id),
      });
    }
    return out;
  }

  var siteUrls = body && body.siteUrls ? body.siteUrls : null;
  if (siteUrls && Array.isArray(siteUrls) && siteUrls.length) {
    for (var j = 0; j < siteUrls.length; j++) {
      var u = safeString(siteUrls[j]);
      if (!u) continue;
      out.push({ siteUrl: u, school_id: null });
    }
    return out;
  }

  return out;
}

// -------------------------
// Main handler
// -------------------------
Deno.serve(async (req) => {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    siteDebug: [],
    firstSiteHtmlSnippet: null,
    kpi: {
      datesParsedFromListing: 0,
      datesParsedFromRyzer: 0,
      datesMissing: 0
    },
    siteKpi: {
      sitesWithRegLinks: 0,
      sitesWithNoRegLinks: 0
    }
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", version: VERSION, debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    var body = await req.json().catch(function () { return null; });

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var dryRun = !!(body && body.dryRun);

    var maxSites = Number(body && body.maxSites !== undefined ? body.maxSites : 5);
    var maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 10);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 25);

    var testSiteUrl = safeString(body && body.testSiteUrl);
    var testSchoolId = safeString(body && body.testSchoolId);

    if (!sportId || !sportName) {
      return new Response(JSON.stringify({ error: "Missing required: sportId/sportName", version: VERSION, debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Decide which site URLs to crawl
    var crawl = [];

    if (testSiteUrl) {
      crawl = [{ siteUrl: testSiteUrl, school_id: testSchoolId || null }];
    } else {
      crawl = normalizeSitesInput(body);
      if (!crawl.length) {
        return new Response(
          JSON.stringify({
            version: VERSION,
            stats: { processedSites: 0, processedRegs: 0, accepted: 0, rejected: 0, errors: 1 },
            accepted: [],
            rejected_samples: [],
            errors: [{ error: "Provide sites[] (preferred) or siteUrls[] or testSiteUrl." }],
            debug: debug,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      crawl = crawl.slice(0, maxSites);
    }

    var accepted = [];
    var rejected = [];
    var errors = [];

    var processedSites = 0;
    var processedRegs = 0;

    var now = new Date();
    var defaultYear = guessDefaultYearFromContext(now);

    for (var s = 0; s < crawl.length; s++) {
      if (accepted.length >= maxEvents) break;

      var siteUrl = crawl[s].siteUrl;
      var schoolIdForSite = crawl[s].school_id || null;

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
        html = await r.text().catch(function () { return ""; });

        if (!debug.firstSiteHtmlSnippet) debug.firstSiteHtmlSnippet = truncate(html, 1600);

        regLinks = extractRyzerRegLinksFromHtml(html, siteUrl).slice(0, maxRegsPerSite);

        if (regLinks.length) debug.siteKpi.sitesWithRegLinks += 1;
        else debug.siteKpi.sitesWithNoRegLinks += 1;

        debug.siteDebug.push({
          siteUrl: siteUrl,
          school_id: schoolIdForSite || null,
          http: http,
          htmlType: htmlType,
          regLinks: regLinks.length,
          sample: regLinks.length ? regLinks[0] : "",
          notes: regLinks.length ? "" : "no_registration_links_found",
        });

        if (!regLinks.length) continue;

        for (var i = 0; i < regLinks.length; i++) {
          if (accepted.length >= maxEvents) break;

          var regUrl = regLinks[i];
          processedRegs += 1;

          // 1) listing-first
          var listingSnippetHtml = extractSnippetAroundNeedle(html, regUrl, 320);
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

          // Camp name attempt from listing snippet
          var campNameFromListing = findCampNameFromListingSnippet(listingSnippetText);

          // 2) ryzer fetch (if needed for dates OR camp name)
          var regHttp = 0;
          var regHtml = "";
          var ryzerCandidates = [];
          var ryzerPick = null;

          var needRyzer = false;
          if (!finalParsed || !finalParsed.start) needRyzer = true;
          if (!campNameFromListing) needRyzer = true;

          var title = null;
          var desc = null;

          if (needRyzer) {
            try {
              var rr = await fetch(regUrl, {
                method: "GET",
                headers: {
                  "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
                  Accept: "text/html,*/*",
                },
              });

              regHttp = rr.status;
              regHtml = await rr.text().catch(function () { return ""; });

              if (!rr.ok || !regHtml) {
                rejected.push({ reason: "reg_fetch_failed", registrationUrl: regUrl, http: regHttp });
                continue;
              }

              title = extractTitle(regHtml) || null;
              desc = extractMetaDescription(regHtml) || null;

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
                ryzerCandidatesSample: ryzerCandidates && ryzerCandidates.length ? ryzerCandidates.slice(0, 6) : [],
                regHttp: regHttp || null,
              },
            });
            continue;
          }

          // Determine best camp_name
          var campName = null;
          if (campNameFromListing) campName = campNameFromListing;
          else if (title) campName = cleanCampName(title);
          else campName = "Camp";

          // Derive program_id from regUrl id param if present
          var programId = null;
          var idMatch = /[?&]id=(\d+)/i.exec(regUrl);
          if (idMatch && idMatch[1]) programId = "ryzer:" + idMatch[1];
          if (!programId) programId = "ryzer:" + hashLite(regUrl);

          var eventKey = buildEventKey("ryzer", programId, finalParsed.start, regUrl);

          // ✅ Contract-compat: FLAT accepted rows (AdminImport writes into CampDemo)
          accepted.push({
            school_id: schoolIdForSite || null,
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
            content_hash: hashLite(stripNonAscii(campName) + "|" + (desc || "") + "|" + (eventDatesRaw || "")),

            event_dates_raw: eventDatesRaw || null,
            grades_raw: null,
            register_by_raw: null,
            price_raw: null,
            price_min: null,
            price_max: null,
            sections_json: null,

            // extra convenience fields for logging/back-compat
            registration_url: regUrl,
            dates_source: datesSource,
            date_pattern: datePattern,
          });
        }
      } catch (eSite) {
        errors.push({ error: "site_exception", message: String((eSite && eSite.message) || eSite), siteUrl: siteUrl });
        debug.siteDebug.push({
          siteUrl: siteUrl,
          school_id: schoolIdForSite || null,
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
      percentWithStartDate = Math.round((accepted.length / denom) * 1000) / 10;
    }

    return new Response(
      JSON.stringify({
        version: VERSION,
        stats: {
          processedSites: processedSites,
          processedRegs: processedRegs,
          accepted: accepted.length,
          rejected: rejected.length,
          errors: errors.length,
          percentWithStartDate: percentWithStartDate,
        },
        accepted: accepted,
        rejected_samples: rejected_samples,
        errors: errors.slice(0, 10),
        debug: debug,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (eTop) {
    debug.siteDebug.push({
      siteUrl: "",
      http: 0,
      htmlType: "",
      regLinks: 0,
      sample: "",
      notes: "top-level error: " + String((eTop && eTop.message) || eTop),
    });
    return new Response(JSON.stringify({ error: "Unhandled error", version: VERSION, debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
