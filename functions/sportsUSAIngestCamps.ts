// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// v15 updates (2026-02-05):
// - Fix camp_name="Camp" in fastMode by extracting camp name from listing snippet
// - If listing name missing, fetch detail page ONLY to get name/desc (selective fallback)
// - Keep v14: expand /register.cfm into many camp links
// - Keep: fastMode/maxMs/timeouts/maxRegFetchTotal
// - Keep: proper JSON response
// - Preserve flat CampDemo-shaped accepted objects

const VERSION =
  "sportsUSAIngestCamps_2026-02-05_v15_listing_name_extract_detail_fallback";

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
   URL classification
-------------------------- */
function isRegisterListingUrl(url) {
  const u = safeString(url);
  if (!u) return false;
  return lc(u).includes("/register.cfm");
}

function isDirectRegistrationUrl(url) {
  const u = safeString(url);
  if (!u) return false;
  const x = lc(u);
  if (x.includes("/register.cfm")) return true;
  if (x.includes("camp.cfm")) return true;
  return false;
}

/* -------------------------
   Link discovery
-------------------------- */
function extractCampLinksFromHtml(html, baseUrl) {
  let out = [];
  if (!html) return out;

  function normalizeUrl(u) {
    if (!u) return null;
    let s = String(u).trim();
    s = s.replace(/&amp;/g, "&");
    s = s.split("#")[0];
    if (s.startsWith("//")) s = "https:" + s;
    if (!s.startsWith("http://") && !s.startsWith("https://")) {
      s = absUrl(baseUrl, s);
    }
    return s ? String(s).trim() : null;
  }

  function isCampLikeLink(u) {
    const x = lc(u || "");
    if (!x) return false;
    if (x.startsWith("mailto:") || x.startsWith("tel:")) return false;
    if (x.includes("camp.cfm") && x.includes("id=")) return true;
    if (x.includes("register.ryzer.com") && x.includes("camp.cfm")) return true;
    if (x.includes("camp.cfm")) return true;
    return false;
  }

  function pushIfValid(raw) {
    const u = normalizeUrl(raw);
    if (!u) return;
    if (!isCampLikeLink(u)) return;
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

  const reFull = /(https?:\/\/[^"' <]*camp\.cfm[^"' <]*)/gi;
  while ((m = reFull.exec(html)) !== null) pushIfValid(m[1]);

  out = uniq(out).map((u) => String(u).split("#")[0]);

  const withId = out.filter((u) => lc(u).includes("camp.cfm") && lc(u).includes("id="));
  if (withId.length) return withId;

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
    idx = hay.toLowerCase().indexOf(ndl.toLowerCase());
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
   Listing name extraction (NEW)
-------------------------- */
function extractCampNameFromListingSnippet(listingSnippetHtml, regUrl) {
  if (!listingSnippetHtml || !regUrl) return null;

  // Try to get anchor text: <a href="regUrl">NAME</a>
  // We intentionally use a flexible match because the URL might appear relative/encoded.
  const u = String(regUrl).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // escape regex
  const reA = new RegExp(`<a[^>]*href=["'][^"']*${u}[^"']*["'][^>]*>([\\s\\S]{1,180}?)<\\/a>`, "i");
  let m = reA.exec(listingSnippetHtml);
  if (m && m[1]) {
    const t = stripNonAscii(htmlToText(m[1]));
    if (t && t.length >= 3 && !/^(register|register now|view details)$/i.test(t)) return t;
  }

  // Some templates use "View Details" link and the name is nearby in a card header
  // Pull a short window of plain text and pick the best “title-like” line.
  const txt = htmlToText(listingSnippetHtml);
  if (!txt) return null;

  // Remove common junk phrases so they don't win
  const cleaned = txt
    .replace(/\b(View Details|Register Now|Learn More|Details)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Heuristic: pick the longest phrase before the date-ish tokens or price tokens
  // and keep it short enough to be a title.
  const stopIdx = (() => {
    const lower = cleaned.toLowerCase();
    const tokens = ["grades", "location", "cost", "price", "$", "am", "pm", "202", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "/20"];
    let best = -1;
    for (let i = 0; i < tokens.length; i++) {
      const k = lower.indexOf(tokens[i]);
      if (k >= 0 && (best < 0 || k < best)) best = k;
    }
    return best;
  })();

  const head = (stopIdx > 10 ? cleaned.slice(0, stopIdx) : cleaned).trim();

  // Titles tend to be 3–90 chars; avoid super generic results
  if (head && head.length >= 3) {
    // Take last segment if it looks like a card listing: "... Montana Football Camps YOUTH CAMP"
    const parts = head.split(" | ").join(" ").split("  ");
    const candidate = stripNonAscii(parts.join(" ").trim());
    if (candidate && candidate.length <= 90 && !/^montana football camps$/i.test(candidate)) return candidate;
  }

  return null;
}

/* -------------------------
   Date parsing (same as v14)
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

function extractDateCandidates(html) {
  if (!html) return [];
  const text = htmlToText(html);
  const out = [];

  const m2 = /(\d{1,2}\/\d{1,2}\/\d{4}\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{4})/.exec(html);
  if (m2 && m2[1]) out.push(stripNonAscii(m2[1]));

  const reSingle = /(\d{1,2}\/\d{1,2}\/\d{4})/g;
  let m3,
    count3 = 0;
  while ((m3 = reSingle.exec(html)) !== null) {
    out.push(stripNonAscii(m3[1]));
    count3++;
    if (count3 >= 4) break;
  }

  const reMonth =
    /((January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?)?(?:,\s*\d{4})?)/gi;
  let m4,
    count4 = 0;
  while ((m4 = reMonth.exec(text)) !== null) {
    if (m4[1]) out.push(stripNonAscii(m4[1]));
    count4++;
    if (count4 >= 6) break;
  }

  return uniq(out);
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
   Camp name shaping from detail page
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
function sanitizeCampName(titleOrH1) {
  let t = safeString(titleOrH1);
  if (!t) return null;
  t = t.replace(/\s*\|\s*Event Registration.*$/i, "").trim();
  t = t.replace(/\s*\-\s*Event Registration.*$/i, "").trim();
  t = t.replace(/\s*\|\s*Registration.*$/i, "").trim();
  t = t.replace(/\s*\-\s*Registration.*$/i, "").trim();
  const m = /^View\s+(.+?)\s+Details$/i.exec(t);
  if (m && m[1]) t = String(m[1]).trim();
  t = stripNonAscii(t);
  return t || null;
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
    nameFetches: 0,
    siteDebug: [],
    firstSiteHtmlSnippet: null,
    kpi: {
      datesParsedFromListing: 0,
      datesParsedFromDetail: 0,
      datesMissing: 0,
      namesFromListing: 0,
      namesFromDetail: 0,
      namesMissing: 0,
    },
    siteKpi: {
      sitesWithRegLinks: 0,
      sitesWithNoRegLinks: 0,
      sitesDirectRegUrl: 0,
      registerListingsExpanded: 0,
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
    const maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 10);
    const maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 25);

    const fastMode = body && body.fastMode !== undefined ? !!body.fastMode : true;
    const maxMs = Number(body && body.maxMs !== undefined ? body.maxMs : 45000);
    const siteTimeoutMs = Number(body && body.siteTimeoutMs !== undefined ? body.siteTimeoutMs : 12000);
    const regTimeoutMs = Number(body && body.regTimeoutMs !== undefined ? body.regTimeoutMs : 12000);

    // NEW: name-only fallback fetch timeout (keep it small)
    const nameTimeoutMs = Number(body && body.nameTimeoutMs !== undefined ? body.nameTimeoutMs : 6000);

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
      nameTimeoutMs,
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

    const defaultYear = new Date().getFullYear();

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
        if (isDirectRegistrationUrl(siteUrl)) {
          debug.siteKpi.sitesDirectRegUrl += 1;

          const r = await fetchWithTimeout(
            siteUrl,
            {
              method: "GET",
              headers: { "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)", Accept: "text/html,*/*" },
            },
            siteTimeoutMs
          );

          http = r.status;
          htmlType = r.headers.get("content-type") || "";
          html = await r.text().catch(() => "");

          if (!debug.firstSiteHtmlSnippet) debug.firstSiteHtmlSnippet = truncate(html, 1600);

          if (isRegisterListingUrl(siteUrl)) {
            const links = extractCampLinksFromHtml(html, siteUrl);
            regLinks = (links && links.length ? links : [siteUrl]).slice(0, maxRegsPerSite);
            debug.siteKpi.registerListingsExpanded += 1;

            debug.siteDebug.push({
              siteUrl,
              http,
              htmlType,
              regLinks: regLinks.length,
              sample: regLinks.length ? regLinks[0] : "",
              notes: "direct_register_listing_expanded",
            });
          } else {
            regLinks = [siteUrl];
            debug.siteDebug.push({
              siteUrl,
              http,
              htmlType,
              regLinks: 1,
              sample: siteUrl,
              notes: "direct_camp_page",
            });
          }
        } else {
          const r = await fetchWithTimeout(
            siteUrl,
            {
              method: "GET",
              headers: { "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)", Accept: "text/html,*/*" },
            },
            siteTimeoutMs
          );

          http = r.status;
          htmlType = r.headers.get("content-type") || "";
          html = await r.text().catch(() => "");

          if (!debug.firstSiteHtmlSnippet) debug.firstSiteHtmlSnippet = truncate(html, 1600);

          const links = extractCampLinksFromHtml(html, siteUrl);
          regLinks = (links || []).slice(0, maxRegsPerSite);

          if (regLinks.length) debug.siteKpi.sitesWithRegLinks += 1;
          else debug.siteKpi.sitesWithNoRegLinks += 1;

          debug.siteDebug.push({
            siteUrl,
            http,
            htmlType,
            regLinks: regLinks.length,
            sample: regLinks.length ? regLinks[0] : "",
            notes: regLinks.length ? "" : "no_camp_links_found",
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

          const listingSnippetHtml = html ? extractSnippetAroundNeedle(html, regUrl, 560) : null;
          const listingSnippetText = listingSnippetHtml ? htmlToText(listingSnippetHtml) : null;

          // DATE from listing snippet
          const listingParsed = listingSnippetText ? parseSingleOrRangeDate(listingSnippetText, defaultYear) : null;

          let finalParsed = null;
          let eventDatesRaw = null;

          if (listingParsed && listingParsed.start) {
            finalParsed = listingParsed;
            eventDatesRaw = listingParsed.rawLine || truncate(listingSnippetText, 240);
            debug.kpi.datesParsedFromListing += 1;
          }

          // NAME from listing snippet (NEW)
          let campName = extractCampNameFromListingSnippet(listingSnippetHtml, regUrl);
          if (campName) debug.kpi.namesFromListing += 1;

          // FAST MODE: skip detail fetch if date is present,
          // BUT: if name is missing, do a small name-only fetch
          let shouldFetchDetailForDates = !fastMode || !(finalParsed && finalParsed.start);
          let shouldFetchDetailForName = !campName;

          // Protect runtime with maxRegFetchTotal
          let regHttp = 0;
          let regHtml = "";
          let desc = null;

          // If we must fetch detail for dates, it also helps name, so combine.
          const shouldFetchAnyDetail = shouldFetchDetailForDates || shouldFetchDetailForName;

          if (shouldFetchAnyDetail) {
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
                  headers: { "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)", Accept: "text/html,*/*" },
                },
                // If we already have dates but need name, use the smaller timeout
                shouldFetchDetailForDates ? regTimeoutMs : nameTimeoutMs
              );

              regHttp = rr.status;
              regHtml = await rr.text().catch(() => "");

              // Fill missing name/desc from detail
              if (!campName && regHtml) {
                const h1 = extractH1(regHtml);
                const title = extractTitle(regHtml);
                campName = sanitizeCampName(h1 || title) || null;
                if (campName) debug.kpi.namesFromDetail += 1;
              }

              if (regHtml) {
                desc = extractMetaDescription(regHtml);
              }

              // Fill missing date from detail
              if ((!finalParsed || !finalParsed.start) && regHtml) {
                const candidates = extractDateCandidates(regHtml);
                const pick = pickBestParsedDateFromCandidates(candidates, defaultYear);
                if (pick && pick.parsed && pick.parsed.start) {
                  finalParsed = pick.parsed;
                  eventDatesRaw = pick.bestRaw || (finalParsed.rawLine || null);
                  debug.kpi.datesParsedFromDetail += 1;
                }
              }
            } catch (eRegFetch) {
              errors.push({
                error: "reg_exception",
                message: String((eRegFetch && eRegFetch.message) || eRegFetch),
                registrationUrl: regUrl,
              });
            }
          } else {
            debug.regFetchSkippedFastMode += 1;
          }

          if (!finalParsed || !finalParsed.start) {
            debug.kpi.datesMissing += 1;
            rejected.push({
              reason: "missing_start_date",
              registrationUrl: regUrl,
              debug: {
                siteUrl,
                listingSnippetText: listingSnippetText ? truncate(listingSnippetText, 360) : null,
                regHttp: regHttp || null,
              },
            });
            continue;
          }

          if (!campName) {
            debug.kpi.namesMissing += 1;
            campName = "Camp"; // final fallback
          }

          // program id from id=
          let programId = null;
          const idMatch = /[?&]id=(\d+)/i.exec(regUrl);
          if (idMatch && idMatch[1]) programId = "ryzer:" + idMatch[1];
          if (!programId) programId = "ryzer:" + hashLite(regUrl);

          const eventKey = buildEventKey("ryzer", programId, finalParsed.start, regUrl);

          accepted.push({
            school_id: siteSchoolId || null,
            sport_id: sportId,
            camp_name: campName,
            start_date: finalParsed.start,
            end_date: finalParsed.end || null,

            city: null,
            state: null,
            position_ids: [],
            price: null,

            link_url: regUrl,
            notes: desc || null,

            season_year: Number(finalParsed.start.slice(0, 4)),
            program_id: programId,
            event_key: eventKey,
            source_platform: "sportsusa",
            source_url: regUrl,
            last_seen_at: new Date().toISOString(),

            content_hash: hashLite(
              stripNonAscii(campName) +
                "|" +
                (desc || "") +
                "|" +
                (eventDatesRaw || "")
            ),

            event_dates_raw: eventDatesRaw || null,
            grades_raw: null,
            register_by_raw: null,

            price_raw: null,
            price_min: null,
            price_max: null,

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
          processedSites: processedSites,
          processedRegs: processedRegs,
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
