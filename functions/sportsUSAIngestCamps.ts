// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// v13 updates (2026-02-05):
// - FIX: stop double-JSON-stringifying responses (AdminImport was seeing version=MISSING + zeros)
// - Add directRegistrationUrl handling:
//   - If testSiteUrl (or a siteUrl) is already a registration/listing page (register.cfm / camp.cfm),
//     treat it as a reg URL directly (no reg-link discovery step).
// - Keep v12 controls: fastMode, maxMs, timeouts, maxRegFetchTotal
// - Preserve flat CampDemo-shaped accepted objects
// - Preserve event_key single-prefix (no double "ryzer:")

const VERSION =
  "sportsUSAIngestCamps_2026-02-05_v13_fix_json_response_direct_registration_url";

function safeString(x) {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
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
  const str = String(s || "");
  const max = n || 1200;
  return str.length > max ? str.slice(0, max) + "…(truncated)" : str;
}

function absUrl(baseUrl, maybeRelative) {
  const u = safeString(maybeRelative);
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return "https:" + u;
  try {
    return new URL(u, baseUrl).toString();
  } catch {
    return u;
  }
}

function uniq(arr) {
  const out = [];
  const seen = {};
  for (let i = 0; i < (arr || []).length; i++) {
    const v = arr[i];
    if (!v) continue;
    const k = String(v);
    if (seen[k]) continue;
    seen[k] = true;
    out.push(v);
  }
  return out;
}

function hashLite(s) {
  const str = String(s || "");
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return String(h);
}

/* -------------------------
   Fetch with timeout
-------------------------- */
async function fetchWithTimeout(url, opts, ms) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1000, Number(ms || 12000)));
  try {
    return await fetch(url, { ...(opts || {}), signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/* -------------------------
   Identify direct registration/listing pages
   - SportsUSA sites often use /register.cfm on the same domain
   - Ryzer pages are usually register.ryzer.com/camp.cfm?id=...
-------------------------- */
function isDirectRegistrationUrl(url) {
  const u = safeString(url);
  if (!u) return false;
  const x = lc(u);

  // Most common SportsUSA listing page
  if (x.includes("/register.cfm")) return true;

  // Ryzer camp registration page
  if (x.includes("camp.cfm")) return true;

  return false;
}

/* -------------------------
   Registration link discovery (Ryzer camp links)
-------------------------- */
function extractRyzerRegLinksFromHtml(html, siteUrl) {
  let out = [];
  if (!html) return out;

  function normalizeUrl(u) {
    if (!u) return null;
    let s = String(u).trim();

    s = s.replace(/&amp;/g, "&");
    s = s.split("#")[0];

    if (s.startsWith("//")) s = "https:" + s;

    // If the site uses relative Ryzer pathing, normalize it
    if (s.startsWith("/camp.cfm")) s = "https://register.ryzer.com" + s;
    if (s.startsWith("camp.cfm")) s = "https://register.ryzer.com/" + s;

    if (!s.startsWith("http://") && !s.startsWith("https://")) {
      s = absUrl(siteUrl, s);
    }

    return s ? String(s).trim() : null;
  }

  function isRyzerCampLink(u) {
    const x = lc(u || "");
    return x.includes("register.ryzer.com") && x.includes("camp.cfm");
  }

  function pushIfValid(raw) {
    const u = normalizeUrl(raw);
    if (!u) return;
    if (!isRyzerCampLink(u)) return;
    out.push(u);
  }

  let m;

  const reHrefDq = /href="([^"]*camp\.cfm[^"]*)"/gi;
  while ((m = reHrefDq.exec(html)) !== null) pushIfValid(m[1]);

  const reHrefSq = /href='([^']*camp\.cfm[^']*)'/gi;
  while ((m = reHrefSq.exec(html)) !== null) pushIfValid(m[1]);

  const reOnclickDq = /onclick="[^"]*(camp\.cfm[^"]*)"/gi;
  while ((m = reOnclickDq.exec(html)) !== null) pushIfValid(m[1]);

  const reOnclickSq = /onclick='[^']*(camp\.cfm[^']*)'/gi;
  while ((m = reOnclickSq.exec(html)) !== null) pushIfValid(m[1]);

  const reData =
    /(data-href|data-url)\s*=\s*("([^"]*camp\.cfm[^"]*)"|'([^']*camp\.cfm[^']*)'|([^\s>]*camp\.cfm[^\s>]*))/gi;
  while ((m = reData.exec(html)) !== null) pushIfValid(m[3] || m[4] || m[5]);

  const reFull = /(https?:\/\/register\.ryzer\.com\/[^"' <]*camp\.cfm[^"' <]*)/gi;
  while ((m = reFull.exec(html)) !== null) pushIfValid(m[1]);

  const reRel = /([\/]camp\.cfm\?[^"' <]+)/gi;
  while ((m = reRel.exec(html)) !== null) pushIfValid(m[1]);

  out = uniq(out);
  for (let i = 0; i < out.length; i++) out[i] = String(out[i]).split("#")[0];
  return out;
}

/* -------------------------
   Snippet extraction + html->text
-------------------------- */
function extractSnippetAroundNeedle(html, needle, radius) {
  if (!html || !needle) return null;
  const r = radius || 260;
  const hay = String(html);
  const ndl = String(needle);

  let idx = hay.indexOf(ndl);
  if (idx < 0) {
    const lowHay = hay.toLowerCase();
    const lowNdl = ndl.toLowerCase();
    idx = lowHay.indexOf(lowNdl);
  }
  if (idx < 0) return null;

  let start = idx - r;
  if (start < 0) start = 0;
  let end = idx + ndl.length + r;
  if (end > hay.length) end = hay.length;

  return hay.slice(start, end);
}

function htmlToText(html) {
  if (!html) return "";
  let s = String(html);
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
  const n = lc(name);
  if (n.startsWith("jan")) return 1;
  if (n.startsWith("feb")) return 2;
  if (n.startsWith("mar")) return 3;
  if (n.startsWith("apr")) return 4;
  if (n.startsWith("may")) return 5;
  if (n.startsWith("jun")) return 6;
  if (n.startsWith("jul")) return 7;
  if (n.startsWith("aug")) return 8;
  if (n.startsWith("sep")) return 9;
  if (n.startsWith("oct")) return 10;
  if (n.startsWith("nov")) return 11;
  if (n.startsWith("dec")) return 12;
  return null;
}
function stripOrdinal(x) {
  return String(x || "").replace(/(st|nd|rd|th)\b/gi, "");
}
function parseMMDDYYYY(s) {
  const m = /(\b\d{1,2})\/(\d{1,2})\/(\d{4}\b)/.exec(s);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yy = Number(m[3]);
  if (!mm || !dd || !yy) return null;
  return { y: yy, m: mm, d: dd };
}
function parseMonthNameDate(s) {
  const m =
    /\b(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\b\s+(\d{1,2}(?:st|nd|rd|th)?)\b(?:[,\s]+(\d{4}))?/i.exec(
      s
    );
  if (!m) return null;
  const month = monthNumFromName(m[1]);
  const day = Number(stripOrdinal(m[2]));
  const year = m[3] ? Number(m[3]) : null;
  if (!month || !day) return null;
  return { y: year, m: month, d: day };
}

function parseSingleOrRangeDate(line, defaultYear) {
  const raw = safeString(line);
  if (!raw) return { start: null, end: null, rawLine: null, pattern: null, inferredYear: false };

  const t = stripNonAscii(raw);

  const m1 = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(t);
  if (m1) {
    const a = parseMMDDYYYY(m1[1]);
    const b = parseMMDDYYYY(m1[2]);
    return {
      start: a ? toIsoDate(a.y, a.m, a.d) : null,
      end: b ? toIsoDate(b.y, b.m, b.d) : null,
      rawLine: t,
      pattern: "mdy_range",
      inferredYear: false,
    };
  }

  const a1 = parseMMDDYYYY(t);
  if (a1) {
    return {
      start: toIsoDate(a1.y, a1.m, a1.d),
      end: null,
      rawLine: t,
      pattern: "mdy_single",
      inferredYear: false,
    };
  }

  const m2 =
    /\b(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\b\s+(\d{1,2}(?:st|nd|rd|th)?)\s*[-–]\s*(\d{1,2}(?:st|nd|rd|th)?)\b(?:[,\s]+(\d{4}))?/i.exec(
      t
    );
  if (m2) {
    const mm = monthNumFromName(m2[1]);
    const d1 = Number(stripOrdinal(m2[2]));
    const d2 = Number(stripOrdinal(m2[3]));
    const hasYear = !!m2[4];
    const yy = m2[4] ? Number(m2[4]) : defaultYear || null;
    return {
      start: yy && mm && d1 ? toIsoDate(yy, mm, d1) : null,
      end: yy && mm && d2 ? toIsoDate(yy, mm, d2) : null,
      rawLine: t,
      pattern: hasYear ? "month_range_year" : "month_range_infer_year",
      inferredYear: !hasYear,
    };
  }

  const m3 =
    /(\b(?:January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\b\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)\s*[-–]\s*(\b(?:January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\b\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)/i.exec(
      t
    );
  if (m3) {
    const p1 = parseMonthNameDate(m3[1]);
    const p2 = parseMonthNameDate(m3[2]);
    const y1 = (p1 && p1.y) || defaultYear || null;
    const y2 = (p2 && p2.y) || y1 || null;
    const inferred = !((p1 && p1.y) || (p2 && p2.y));
    return {
      start: p1 ? toIsoDate(y1, p1.m, p1.d) : null,
      end: p2 ? toIsoDate(y2, p2.m, p2.d) : null,
      rawLine: t,
      pattern: "month_full_range",
      inferredYear: inferred,
    };
  }

  const p = parseMonthNameDate(t);
  if (p) {
    const hasY = !!p.y;
    const yy2 = p.y || defaultYear || null;
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
  let score = 10;
  if (parsed.end) score += 5;
  if (parsed.pattern && parsed.pattern.includes("infer_year")) score -= 2;
  if (parsed.pattern && parsed.pattern.includes("mdy")) score += 2;
  return score;
}

/* -------------------------
   Ryzer extraction: name/date candidates
-------------------------- */
function extractTitle(html) {
  if (!html) return null;
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  if (!m) return null;
  return stripNonAscii(m[1]);
}
function extractMetaDescription(html) {
  if (!html) return null;
  const m = /<meta[^>]*name="description"[^>]*content="([^"]*)"/i.exec(html);
  if (!m) return null;
  return stripNonAscii(m[1]);
}
function extractH1(html) {
  if (!html) return null;
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!m || !m[1]) return null;
  const t = stripNonAscii(htmlToText(m[1]));
  return t || null;
}

function extractRyzerDateCandidates(html) {
  let out = [];
  if (!html) return out;

  const patterns = [
    /(?:Dates?|Camp Dates?|Camp Date|Event Date|When)\s*<\/[^>]+>\s*<[^>]+>\s*([^<]{3,120})</i,
    /(?:Dates?|Camp Dates?|Camp Date|Event Date|When)\s*:\s*([^<]{3,120})</i,
    /(?:Dates?|Camp Dates?|Camp Date|Event Date|When)\s*-\s*([^<]{3,120})</i,
  ];

  for (let i = 0; i < patterns.length; i++) {
    const m = patterns[i].exec(html);
    if (m && m[1]) out.push(stripNonAscii(m[1]));
  }

  const m2 = /(\d{1,2}\/\d{1,2}\/\d{4}\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{4})/.exec(html);
  if (m2 && m2[1]) out.push(stripNonAscii(m2[1]));

  const reSingle = /(\d{1,2}\/\d{1,2}\/\d{4})/g;
  let m3,
    count3 = 0;
  while ((m3 = reSingle.exec(html)) !== null) {
    out.push(stripNonAscii(m3[1]));
    count3++;
    if (count3 >= 3) break;
  }

  const reMonth =
    /((January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?)?(?:,\s*\d{4})?)/gi;
  let m4,
    count4 = 0;
  while ((m4 = reMonth.exec(html)) !== null) {
    if (m4[1]) out.push(stripNonAscii(m4[1]));
    count4++;
    if (count4 >= 6) break;
  }

  const h1 = extractH1(html);
  if (h1) out.push(h1);

  const text = htmlToText(html);
  if (text) {
    const lower = text.toLowerCase();
    const tokens = [
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
    let added = 0;
    for (let k = 0; k < tokens.length; k++) {
      const idx = lower.indexOf(tokens[k]);
      if (idx >= 0) {
        let start = idx - 60;
        if (start < 0) start = 0;
        let end = idx + 160;
        if (end > text.length) end = text.length;
        const snip = stripNonAscii(text.slice(start, end));
        if (snip && snip.length >= 8) out.push(snip);
        added++;
        if (added >= 6) break;
      }
    }
  }

  return uniq(out);
}

function guessDefaultYearFromContext(nowDate) {
  const d = nowDate || new Date();
  return d.getFullYear();
}

function pickBestParsedDateFromCandidates(candidates, defaultYear) {
  let best = null;
  let bestScore = 0;
  let bestRaw = null;

  for (let i = 0; i < (candidates || []).length; i++) {
    const c = candidates[i];
    if (!c) continue;
    const parsed = parseSingleOrRangeDate(c, defaultYear);
    const sc = scoreParsedDate(parsed);
    if (sc > bestScore) {
      best = parsed;
      bestScore = sc;
      bestRaw = c;
    }
    if (best && best.start && best.end && bestScore >= 15 && best.pattern && !best.pattern.includes("infer")) break;
  }

  return { parsed: best, bestRaw: bestRaw, score: bestScore };
}

/* -------------------------
   Grades / Location / Price parsing
-------------------------- */
function extractGradesRawFromText(text) {
  const t = safeString(text);
  if (!t) return null;
  const m = /\bGrades?\s*:\s*([^\.\|]{3,60})/i.exec(t);
  if (m && m[1]) return stripNonAscii(m[1]);
  return null;
}

function extractLocationFromText(text) {
  const t = safeString(text);
  if (!t) return { city: null, state: null, location_raw: null };

  let m = /\bLocation\b\s*:\s*([A-Za-z0-9 .'\-]+)\s*,\s*([A-Z]{2})\b/.exec(t);
  if (!m) m = /\bLocation\b\s+([A-Za-z0-9 .'\-]+)\s*,\s*([A-Z]{2})\b/.exec(t);

  if (m && m[1] && m[2]) {
    return {
      city: stripNonAscii(m[1]),
      state: String(m[2]).trim().toUpperCase(),
      location_raw: stripNonAscii(m[0]),
    };
  }

  return { city: null, state: null, location_raw: null };
}

function extractRegisterNowPrices(text) {
  const t = safeString(text);
  if (!t) return { totals: [], bases: [], raw: null };

  const re = /\bRegister\s+Now\b[^$]{0,20}\$\s*([0-9]{1,5})(?:\.[0-9]{2})?/gi;
  let m;
  const totals = [];
  while ((m = re.exec(t)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) totals.push(n);
    if (totals.length >= 10) break;
  }

  const rawLine = (() => {
    const mm = /\bRegister\s+Now\b[^\.]{0,180}/i.exec(t);
    return mm && mm[0] ? stripNonAscii(mm[0]) : null;
  })();

  return { totals, bases: [], raw: rawLine };
}

function extractPricesFromText(text) {
  const t = safeString(text);
  if (!t) return { price_raw: null, price_min: null, price_max: null, price_best: null };

  const reg = extractRegisterNowPrices(t);
  if (reg.totals.length) {
    const totals = reg.totals.slice().sort((a, b) => a - b);
    const minTotal = totals[0];
    const maxTotal = totals[totals.length - 1];

    return {
      price_raw: reg.raw || "Register Now prices detected",
      price_min: minTotal,
      price_max: maxTotal,
      price_best: maxTotal,
    };
  }

  const re = /\$\s*([0-9]{1,5})(?:\.[0-9]{2})?/g;
  let m;
  const nums = [];
  while ((m = re.exec(t)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) nums.push(n);
    if (nums.length >= 12) break;
  }
  if (!nums.length) return { price_raw: null, price_min: null, price_max: null, price_best: null };

  nums.sort((a, b) => a - b);
  return {
    price_raw: "Prices detected: " + nums.slice(0, 6).join(", "),
    price_min: nums[0],
    price_max: nums[nums.length - 1],
    price_best: nums[nums.length - 1],
  };
}

/* -------------------------
   Camp name shaping
-------------------------- */
function sanitizeCampName(titleOrH1) {
  let t = safeString(titleOrH1);
  if (!t) return "Camp";

  t = t.replace(/\s*\|\s*Event Registration.*$/i, "").trim();
  t = t.replace(/\s*\-\s*Event Registration.*$/i, "").trim();
  t = t.replace(/\s*\|\s*Registration.*$/i, "").trim();
  t = t.replace(/\s*\-\s*Registration.*$/i, "").trim();

  const m = /^View\s+(.+?)\s+Details$/i.exec(t);
  if (m && m[1]) t = String(m[1]).trim();

  return stripNonAscii(t) || "Camp";
}

/* -------------------------
   Event key normalization
-------------------------- */
function normalizeProgramIdForKey(programId) {
  let p = safeString(programId) || "unknown";
  p = p.replace(/^ryzer:/i, "");
  return p;
}

function buildEventKey(platform, programId, startDate, url) {
  const p = safeString(platform) || "sportsusa";
  const pr = normalizeProgramIdForKey(programId);
  const sd = safeString(startDate) || "na";
  const u = safeString(url) || "";
  return p + ":" + pr + ":" + sd + ":" + hashLite(u);
}

/* -------------------------
   Main handler
-------------------------- */
Deno.serve(async (req) => {
  const debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    received: {},
    stoppedEarly: false,
    stopReason: null,
    timeMs: 0,
    regFetches: 0,
    regFetchSkippedFastMode: 0,
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
      sitesDirectRegUrl: 0,
    },
  };

  const startedMs = Date.now();

  function outOfTime(maxMs) {
    return Date.now() - startedMs > maxMs;
  }

  function finishResponse(payload, status) {
    debug.timeMs = Date.now() - startedMs;
    return new Response(JSON.stringify(payload), {
      status: status || 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (req.method !== "POST") {
      return finishResponse({ error: "Method not allowed", version: VERSION, debug }, 405);
    }

    const body = await req.json().catch(() => null);

    const sportId = safeString(body && body.sportId);
    const sportName = safeString(body && body.sportName) || "";
    const dryRun = !!(body && body.dryRun);

    const maxSites = Number(body && body.maxSites !== undefined ? body.maxSites : 5);
    const maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 5);
    const maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 25);

    const fastMode = body && body.fastMode !== undefined ? !!body.fastMode : true;
    const maxMs = Number(body && body.maxMs !== undefined ? body.maxMs : 45000);
    const siteTimeoutMs = Number(body && body.siteTimeoutMs !== undefined ? body.siteTimeoutMs : 12000);
    const regTimeoutMs = Number(body && body.regTimeoutMs !== undefined ? body.regTimeoutMs : 12000);
    const maxRegFetchTotal = Number(body && body.maxRegFetchTotal !== undefined ? body.maxRegFetchTotal : 250);

    const testSiteUrl = safeString(body && body.testSiteUrl);
    const testSchoolId = safeString(body && body.testSchoolId);

    const sites = body && Array.isArray(body.sites) ? body.sites : null;
    const siteUrls = body && Array.isArray(body.siteUrls) ? body.siteUrls : null;

    debug.received = {
      sportId,
      sportName,
      dryRun,
      maxSites,
      maxRegsPerSite,
      maxEvents,
      fastMode,
      maxMs,
      siteTimeoutMs,
      regTimeoutMs,
      maxRegFetchTotal,
      testSiteUrl,
      testSchoolId,
      sitesCount: sites ? sites.length : 0,
      siteUrlsCount: siteUrls ? siteUrls.length : 0,
    };

    if (!sportId || !sportName) {
      return finishResponse({ error: "Missing required: sportId/sportName", version: VERSION, debug }, 400);
    }

    // Build crawl plan
    let crawl = [];

    if (testSiteUrl) {
      crawl = [{ siteUrl: testSiteUrl, school_id: testSchoolId || null }];
    } else if (sites && sites.length) {
      for (let i = 0; i < sites.length && crawl.length < maxSites; i++) {
        const row = sites[i] || {};
        const u = safeString(row.camp_site_url);
        if (!u) continue;
        crawl.push({ siteUrl: u, school_id: safeString(row.school_id) || null });
      }
    } else if (siteUrls && siteUrls.length) {
      for (let j = 0; j < siteUrls.length && crawl.length < maxSites; j++) {
        const u2 = safeString(siteUrls[j]);
        if (!u2) continue;
        crawl.push({ siteUrl: u2, school_id: null });
      }
    } else {
      return finishResponse(
        {
          version: VERSION,
          stats: { processedSites: 0, processedRegs: 0, accepted: 0, rejected: 0, errors: 1, percentWithStartDate: 0 },
          accepted: [],
          rejected_samples: [],
          errors: [{ error: "Provide sites[] OR siteUrls[] OR testSiteUrl." }],
          debug,
        },
        200
      );
    }

    const accepted = [];
    const rejected = [];
    const errors = [];

    let processedSites = 0;
    let processedRegs = 0;

    const defaultYear = guessDefaultYearFromContext(new Date());

    for (let s = 0; s < crawl.length; s++) {
      if (accepted.length >= maxEvents) break;
      if (outOfTime(maxMs)) {
        debug.stoppedEarly = true;
        debug.stopReason = "maxMs_exceeded";
        break;
      }

      const siteUrl = crawl[s].siteUrl;
      const siteSchoolId = crawl[s].school_id;

      processedSites += 1;

      let http = 0;
      let html = "";
      let htmlType = "";
      let regLinks = [];

      try {
        // DIRECT REG URL MODE (e.g., https://www.montanafootballcamps.com/register.cfm)
        if (isDirectRegistrationUrl(siteUrl)) {
          debug.siteKpi.sitesDirectRegUrl += 1;
          regLinks = [siteUrl];

          debug.siteDebug.push({
            siteUrl,
            http: 0,
            htmlType: "",
            regLinks: 1,
            sample: siteUrl,
            notes: "direct_registration_url",
          });
        } else {
          const r = await fetchWithTimeout(
            siteUrl,
            {
              method: "GET",
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
                Accept: "text/html,*/*",
              },
            },
            siteTimeoutMs
          );

          http = r.status;
          htmlType = r.headers.get("content-type") || "";
          html = await r.text().catch(() => "");

          if (!debug.firstSiteHtmlSnippet) debug.firstSiteHtmlSnippet = truncate(html, 1600);

          regLinks = extractRyzerRegLinksFromHtml(html, siteUrl).slice(0, maxRegsPerSite);

          if (regLinks.length) debug.siteKpi.sitesWithRegLinks += 1;
          else debug.siteKpi.sitesWithNoRegLinks += 1;

          debug.siteDebug.push({
            siteUrl,
            http,
            htmlType,
            regLinks: regLinks.length,
            sample: regLinks.length ? regLinks[0] : "",
            notes: regLinks.length ? "" : "no_registration_links_found",
          });

          if (!regLinks.length) continue;
        }

        for (let i2 = 0; i2 < regLinks.length; i2++) {
          if (accepted.length >= maxEvents) break;
          if (outOfTime(maxMs)) {
            debug.stoppedEarly = true;
            debug.stopReason = "maxMs_exceeded";
            break;
          }

          const regUrl = regLinks[i2];
          processedRegs += 1;

          let finalParsed = null;
          let eventDatesRaw = null;

          // If we came from a site homepage crawl, we may have html to try a listing snippet.
          // If direct_registration_url, we likely do not have listing html; we'll rely on reg fetch.
          if (html) {
            const listingSnippetHtml = extractSnippetAroundNeedle(html, regUrl, 340);
            const listingSnippetText = listingSnippetHtml ? htmlToText(listingSnippetHtml) : null;
            const listingParsed = listingSnippetText ? parseSingleOrRangeDate(listingSnippetText, defaultYear) : null;
            if (listingParsed && listingParsed.start) {
              finalParsed = listingParsed;
              eventDatesRaw = listingParsed.rawLine || truncate(listingSnippetText, 240);
              debug.kpi.datesParsedFromListing += 1;
            }
          }

          let regHttp = 0;
          let regHtml = "";
          let regText = "";
          let ryzerCandidates = [];
          let ryzerPick = null;

          const shouldFetchReg =
            // If direct reg URL, we must fetch
            true;

          if (shouldFetchReg) {
            if (debug.regFetches >= maxRegFetchTotal) {
              debug.stoppedEarly = true;
              debug.stopReason = "maxRegFetchTotal_reached";
              break;
            }

            debug.regFetches += 1;

            try {
              const rr = await fetchWithTimeout(
                regUrl,
                {
                  method: "GET",
                  headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
                    Accept: "text/html,*/*",
                  },
                },
                regTimeoutMs
              );

              regHttp = rr.status;
              regHtml = await rr.text().catch(() => "");
              if (rr.ok && regHtml) regText = htmlToText(regHtml);
            } catch (eRegFetch) {
              errors.push({
                error: "reg_exception",
                message: String((eRegFetch && eRegFetch.message) || eRegFetch),
                registrationUrl: regUrl,
              });
            }

            // FAST MODE: if listing already provided a date, we can skip candidate scan to save time,
            // BUT we still fetched regHtml above (we need this for direct-registration pages).
            if ((!finalParsed || !finalParsed.start) && regHtml) {
              ryzerCandidates = extractRyzerDateCandidates(regHtml);
              ryzerPick = pickBestParsedDateFromCandidates(ryzerCandidates, defaultYear);

              if (ryzerPick && ryzerPick.parsed && ryzerPick.parsed.start) {
                finalParsed = ryzerPick.parsed;
                eventDatesRaw = ryzerPick.bestRaw || (finalParsed.rawLine || null);
                debug.kpi.datesParsedFromRyzer += 1;
              }
            } else if (fastMode && finalParsed && finalParsed.start) {
              debug.regFetchSkippedFastMode += 0; // we didn't skip fetch; we skipped scan
            }
          }

          if (!finalParsed || !finalParsed.start) {
            debug.kpi.datesMissing += 1;
            rejected.push({
              reason: "missing_start_date",
              registrationUrl: regUrl,
              debug: {
                siteUrl,
                regHttp: regHttp || null,
                sampleCandidates: ryzerCandidates && ryzerCandidates.length ? ryzerCandidates.slice(0, 6) : [],
              },
            });
            continue;
          }

          // Name / Notes / Enrichment
          const h1 = regHtml ? extractH1(regHtml) : null;
          const title = regHtml ? extractTitle(regHtml) : null;
          const campName = sanitizeCampName(h1 || title || "Camp");
          const desc = regHtml ? extractMetaDescription(regHtml) : null;

          // Program id from id= if present
          let programId = null;
          const idMatch = /[?&]id=(\d+)/i.exec(regUrl);
          if (idMatch && idMatch[1]) programId = "ryzer:" + idMatch[1];
          if (!programId) programId = "ryzer:" + hashLite(regUrl);

          const eventKey = buildEventKey("ryzer", programId, finalParsed.start, regUrl);

          const gradesRaw = regText ? extractGradesRawFromText(regText) : null;
          const loc = regText ? extractLocationFromText(regText) : { city: null, state: null, location_raw: null };
          const pricePack = regText ? extractPricesFromText(regText) : { price_raw: null, price_min: null, price_max: null, price_best: null };

          accepted.push({
            school_id: siteSchoolId || null,
            sport_id: sportId,
            camp_name: campName,
            start_date: finalParsed.start,
            end_date: finalParsed.end || null,

            city: loc.city || null,
            state: loc.state || null,
            position_ids: [],

            price: pricePack.price_best != null ? pricePack.price_best : null,

            link_url: regUrl,
            notes: desc || null,

            season_year: Number(finalParsed.start.slice(0, 4)),
            program_id: programId,
            event_key: eventKey,
            source_platform: "ryzer",
            source_url: regUrl,
            last_seen_at: new Date().toISOString(),

            content_hash: hashLite(
              stripNonAscii(campName) +
                "|" +
                (desc || "") +
                "|" +
                (eventDatesRaw || "") +
                "|" +
                (gradesRaw || "") +
                "|" +
                (pricePack.price_raw || "") +
                "|" +
                ((loc && loc.location_raw) || "")
            ),

            event_dates_raw: eventDatesRaw || null,
            grades_raw: gradesRaw || null,
            register_by_raw: null,

            price_raw: pricePack.price_raw || null,
            price_min: pricePack.price_min != null ? pricePack.price_min : null,
            price_max: pricePack.price_max != null ? pricePack.price_max : null,

            sections_json: null,
          });
        }
      } catch (eSite) {
        errors.push({
          error: "site_exception",
          message: String((eSite && eSite.message) || eSite),
          siteUrl,
        });
        debug.siteDebug.push({
          siteUrl,
          http: http || 0,
          htmlType: htmlType || "",
          regLinks: 0,
          sample: "",
          notes: "exception:" + String((eSite && eSite.message) || eSite),
        });
      }
    }

    const rejected_samples = rejected.slice(0, 25);
    let percentWithStartDate = 0;
    if (processedRegs > 0) percentWithStartDate = Math.round((accepted.length / processedRegs) * 1000) / 10;

    return finishResponse(
      {
        version: VERSION,
        stats: {
          processedSites,
          processedRegs,
          accepted: accepted.length,
          rejected: rejected.length,
          errors: errors.length,
          percentWithStartDate,
          fastMode: fastMode ? true : false,
          maxMs,
          maxRegFetchTotal,
          regFetches: debug.regFetches,
          regFetchSkippedFastMode: debug.regFetchSkippedFastMode,
          stoppedEarly: debug.stoppedEarly,
          stopReason: debug.stopReason,
        },
        accepted,
        rejected_samples,
        errors: errors.slice(0, 10),
        debug,
      },
      200
    );
  } catch (eTop) {
    debug.timeMs = Date.now() - startedMs;
    return new Response(JSON.stringify({ error: "Unhandled error", version: VERSION, debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
