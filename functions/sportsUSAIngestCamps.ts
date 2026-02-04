// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// v10 updates:
// - Contract-compat: accepted is FLAT CampDemo-shaped objects (no nested {event})
// - Fix event_key: avoid double "ryzer:" prefix
// - Price hygiene: unknown price stays null (never 0)
// - Parse grades + price_min/price_max from Ryzer page text (best-effort)
// - Debug KPIs retained (dates listing vs ryzer, site KPI)

const VERSION =
  "sportsUSAIngestCamps_2026-02-04_v10_price_grades_parse_null_price_fix_eventKey_prefix_fix";

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
-------------------------- */
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

  var reHrefDq = /href="([^"]*camp\.cfm[^"]*)"/gi;
  var m;
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

/* -------------------------
   Snippet extraction + html->text
-------------------------- */
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
-------------------------- */
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
   Ryzer extraction: title/desc + date candidates
-------------------------- */
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
    /(?:Dates?|Camp Dates?|Camp Date|Event Date|When)\s*<\/[^>]+>\s*<[^>]+>\s*([^<]{3,120})</i,
    /(?:Dates?|Camp Dates?|Camp Date|Event Date|When)\s*:\s*([^<]{3,120})</i,
    /(?:Dates?|Camp Dates?|Camp Date|Event Date|When)\s*-\s*([^<]{3,120})</i,
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
    if (count4 >= 6) break;
  }

  var headers = extractHeaderTextCandidates(html);
  for (var j = 0; j < headers.length; j++) out.push(headers[j]);

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
      "/20",
    ];
    var lower = text.toLowerCase();
    var added = 0;
    for (var k = 0; k < tokens.length; k++) {
      var idx = lower.indexOf(tokens[k]);
      if (idx >= 0) {
        var start = idx - 60;
        if (start < 0) start = 0;
        var end = idx + 160;
        if (end > text.length) end = text.length;
        var snip = stripNonAscii(text.slice(start, end));
        if (snip && snip.length >= 8) out.push(snip);
        added++;
        if (added >= 6) break;
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
   Grades / Price parsing
-------------------------- */
function extractGradesRawFromText(text) {
  var t = safeString(text);
  if (!t) return null;

  // Examples:
  // "Grades: 9th - 12th"
  // "Grades: 7-12"
  // "Grade: 9-12"
  var m = /\bGrades?\s*:\s*([^\.\|]{3,40})/i.exec(t);
  if (m && m[1]) return stripNonAscii(m[1]);

  return null;
}

function extractPricesFromText(text) {
  var t = safeString(text);
  if (!t) return { price_raw: null, price_min: null, price_max: null };

  // Capture all $ amounts
  var re = /\$\s*([0-9]{1,5})(?:\.[0-9]{2})?/g;
  var m;
  var nums = [];
  while ((m = re.exec(t)) !== null) {
    var n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) nums.push(n);
    if (nums.length >= 10) break;
  }

  if (!nums.length) return { price_raw: null, price_min: null, price_max: null };

  nums.sort(function (a, b) {
    return a - b;
  });

  // Prefer lines that mention cost/price
  var rawLine = null;
  var m2 = /\b(?:Cost|Price)\b[^\.]{0,120}/i.exec(t);
  if (m2 && m2[0]) rawLine = stripNonAscii(m2[0]);
  if (!rawLine) rawLine = "Prices detected: " + nums.slice(0, 5).join(", ");

  var min = nums[0] || null;
  var max = nums[nums.length - 1] || null;

  return {
    price_raw: rawLine,
    price_min: min,
    price_max: max,
  };
}

/* -------------------------
   Camp name shaping
-------------------------- */
function sanitizeCampName(title) {
  var t = safeString(title);
  if (!t) return "Camp";

  // Trim common Ryzer title suffixes/noise
  t = t.replace(/\s*\|\s*Event Registration.*$/i, "").trim();
  t = t.replace(/\s*\-\s*Event Registration.*$/i, "").trim();
  t = t.replace(/\s*\|\s*Registration.*$/i, "").trim();
  t = t.replace(/\s*\-\s*Registration.*$/i, "").trim();

  // "View XYZ Details" -> "XYZ"
  var m = /^View\s+(.+?)\s+Details$/i.exec(t);
  if (m && m[1]) t = String(m[1]).trim();

  return stripNonAscii(t) || "Camp";
}

/* -------------------------
   Event key normalization
-------------------------- */
function normalizeProgramIdForKey(programId) {
  var p = safeString(programId) || "unknown";
  // If programId already includes "ryzer:" then don't double-prefix later
  // We'll remove a leading "ryzer:" only for key construction stability
  p = p.replace(/^ryzer:/i, "");
  return p;
}

function buildEventKey(platform, programId, startDate, url) {
  var p = safeString(platform) || "sportsusa";
  var pr = normalizeProgramIdForKey(programId);
  var sd = safeString(startDate) || "na";
  var u = safeString(url) || "";
  return p + ":" + pr + ":" + sd + ":" + hashLite(u);
}

/* -------------------------
   Main handler
-------------------------- */
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
    },
    siteKpi: {
      sitesWithRegLinks: 0,
      sitesWithNoRegLinks: 0,
    },
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", version: VERSION, debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    var body = await req.json().catch(function () {
      return null;
    });

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var dryRun = !!(body && body.dryRun);

    var maxSites = Number(body && body.maxSites !== undefined ? body.maxSites : 5);
    var maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 5);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 25);

    var testSiteUrl = safeString(body && body.testSiteUrl);
    var testSchoolId = safeString(body && body.testSchoolId);

    // Preferred: sites[] = [{school_id, sport_id, camp_site_url}]
    var sites = body && Array.isArray(body.sites) ? body.sites : null;

    // Back-compat: siteUrls[]
    var siteUrls = body && Array.isArray(body.siteUrls) ? body.siteUrls : null;

    if (!sportId || !sportName) {
      return new Response(JSON.stringify({ error: "Missing required: sportId/sportName", version: VERSION, debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build crawl plan (keep mapping to school_id if we have it)
    var crawl = [];

    if (testSiteUrl) {
      crawl = [{ siteUrl: testSiteUrl, school_id: testSchoolId || null }];
    } else if (sites && sites.length) {
      for (var i = 0; i < sites.length && crawl.length < maxSites; i++) {
        var row = sites[i] || {};
        var u = safeString(row.camp_site_url);
        if (!u) continue;
        crawl.push({ siteUrl: u, school_id: safeString(row.school_id) || null });
      }
    } else if (siteUrls && siteUrls.length) {
      for (var j = 0; j < siteUrls.length && crawl.length < maxSites; j++) {
        var u2 = safeString(siteUrls[j]);
        if (!u2) continue;
        crawl.push({ siteUrl: u2, school_id: null });
      }
    } else {
      return new Response(
        JSON.stringify({
          version: VERSION,
          stats: { processedSites: 0, processedRegs: 0, accepted: 0, rejected: 0, errors: 1 },
          accepted: [],
          rejected_samples: [],
          errors: [{ error: "Provide sites[] OR siteUrls[] OR testSiteUrl." }],
          debug: debug,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
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
      var siteSchoolId = crawl[s].school_id;

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

        if (regLinks.length) debug.siteKpi.sitesWithRegLinks += 1;
        else debug.siteKpi.sitesWithNoRegLinks += 1;

        debug.siteDebug.push({
          siteUrl: siteUrl,
          http: http,
          htmlType: htmlType,
          regLinks: regLinks.length,
          sample: regLinks.length ? regLinks[0] : "",
          notes: regLinks.length ? "" : "no_registration_links_found",
        });

        if (!regLinks.length) continue;

        for (var i2 = 0; i2 < regLinks.length; i2++) {
          if (accepted.length >= maxEvents) break;

          var regUrl = regLinks[i2];
          processedRegs += 1;

          // Listing-first attempt
          var listingSnippetHtml = extractSnippetAroundNeedle(html, regUrl, 340);
          var listingSnippetText = listingSnippetHtml ? htmlToText(listingSnippetHtml) : null;
          var listingParsed = listingSnippetText ? parseSingleOrRangeDate(listingSnippetText, defaultYear) : null;

          var finalParsed = null;
          var datesSource = null;
          var eventDatesRaw = null;
          var datePattern = null;

          if (listingParsed && listingParsed.start) {
            finalParsed = listingParsed;
            datesSource = "listing";
            eventDatesRaw = listingParsed.rawLine || truncate(listingSnippetText, 240);
            datePattern = listingParsed.pattern || null;
            debug.kpi.datesParsedFromListing += 1;
          }

          // Ryzer fetch if needed (or for metadata/price/grades)
          var regHttp = 0;
          var regHtml = "";
          var regText = "";
          var ryzerCandidates = [];
          var ryzerPick = null;

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

            if (rr.ok && regHtml) {
              regText = htmlToText(regHtml);
            }
          } catch (eRegFetch) {
            errors.push({
              error: "reg_exception",
              message: String((eRegFetch && eRegFetch.message) || eRegFetch),
              registrationUrl: regUrl,
            });
          }

          if ((!finalParsed || !finalParsed.start) && regHtml) {
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

          // Metadata
          var title = regHtml ? extractTitle(regHtml) : null;
          var desc = regHtml ? extractMetaDescription(regHtml) : null;
          var campName = sanitizeCampName(title);

          // Program id from id= param
          var programId = null;
          var idMatch = /[?&]id=(\d+)/i.exec(regUrl);
          if (idMatch && idMatch[1]) programId = "ryzer:" + idMatch[1];
          if (!programId) programId = "ryzer:" + hashLite(regUrl);

          // event_key (single-prefix fix)
          var eventKey = buildEventKey("ryzer", programId, finalParsed.start, regUrl);

          // Grades + Price (from Ryzer page text)
          var gradesRaw = extractGradesRawFromText(regText);
          var pricePack = extractPricesFromText(regText);

          // IMPORTANT: unknown price stays null (not 0)
          var priceMin = pricePack.price_min;
          var priceMax = pricePack.price_max;
          var priceRaw = pricePack.price_raw;

          accepted.push({
            // CampDemo-shaped flat object
            school_id: siteSchoolId || null, // AdminImport can overwrite if needed
            sport_id: sportId,
            camp_name: campName,
            start_date: finalParsed.start,
            end_date: finalParsed.end || null,
            city: null,
            state: null,
            position_ids: [],
            price: null, // keep null; UI can use min/max
            link_url: regUrl,
            notes: desc || null,

            season_year: Number(finalParsed.start.slice(0, 4)),
            program_id: programId,
            event_key: eventKey,
            source_platform: "ryzer",
            source_url: regUrl,
            last_seen_at: new Date().toISOString(),
            content_hash: hashLite(stripNonAscii(campName) + "|" + (desc || "") + "|" + (eventDatesRaw || "") + "|" + (gradesRaw || "") + "|" + (priceRaw || "")),

            event_dates_raw: eventDatesRaw || null,
            grades_raw: gradesRaw || null,
            register_by_raw: null,
            price_raw: priceRaw || null,
            price_min: priceMin != null ? priceMin : null,
            price_max: priceMax != null ? priceMax : null,
            sections_json: null,
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
    return new Response(JSON.stringify({ error: "Unhandled error", version: VERSION, debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
