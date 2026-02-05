// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// v14 updates (2026-02-05):
// - Expand SportsUSA /register.cfm listing pages into MANY camp reg links
//   (previously treated register.cfm as a single "regUrl" -> only 1 accepted event)
// - Keep v13 fixes: proper JSON response, direct registration URL handling
// - Broaden camp link extraction to include same-domain camp.cfm?id=... links (not only register.ryzer.com)
// - Preserve v12 controls: fastMode, maxMs, timeouts, maxRegFetchTotal
// - Preserve flat CampDemo-shaped accepted objects
// - Preserve event_key single-prefix (no double "ryzer:")

const VERSION =
  "sportsUSAIngestCamps_2026-02-05_v14_expand_register_listing_multi_events";

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
   Registration link discovery
   - Ryzer direct links: register.ryzer.com/camp.cfm?id=...
   - SportsUSA same-domain camp pages: https://{school}footballcamps.com/camp.cfm?id=...
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

    // Allow relative links
    if (!s.startsWith("http://") && !s.startsWith("https://")) {
      s = absUrl(baseUrl, s);
    }

    return s ? String(s).trim() : null;
  }

  function isCampLikeLink(u) {
    const x = lc(u || "");
    if (!x) return false;
    if (x.startsWith("mailto:") || x.startsWith("tel:")) return false;

    // Core target: camp.cfm with id parameter (most SportsUSA/Ryzer camp detail pages)
    if (x.includes("camp.cfm") && x.includes("id=")) return true;

    // Some sites still use camp.cfm without id in rare cases; allow it but lower confidence
    if (x.includes("camp.cfm")) return true;

    // Keep legacy Ryzer pattern too
    if (x.includes("register.ryzer.com") && x.includes("camp.cfm")) return true;

    return false;
  }

  function pushIfValid(raw) {
    const u = normalizeUrl(raw);
    if (!u) return;
    if (!isCampLikeLink(u)) return;
    out.push(u);
  }

  let m;

  // href="...camp.cfm..."
  const reHrefDq = /href="([^"]*camp\.cfm[^"]*)"/gi;
  while ((m = reHrefDq.exec(html)) !== null) pushIfValid(m[1]);

  // href='...camp.cfm...'
  const reHrefSq = /href='([^']*camp\.cfm[^']*)'/gi;
  while ((m = reHrefSq.exec(html)) !== null) pushIfValid(m[1]);

  // onclick="...camp.cfm..."
  const reOnclickDq = /onclick="[^"]*(camp\.cfm[^"]*)"/gi;
  while ((m = reOnclickDq.exec(html)) !== null) pushIfValid(m[1]);

  const reOnclickSq = /onclick='[^']*(camp\.cfm[^']*)'/gi;
  while ((m = reOnclickSq.exec(html)) !== null) pushIfValid(m[1]);

  // data-url / data-href
  const reData =
    /(data-href|data-url)\s*=\s*("([^"]*camp\.cfm[^"]*)"|'([^']*camp\.cfm[^']*)'|([^\s>]*camp\.cfm[^\s>]*))/gi;
  while ((m = reData.exec(html)) !== null) pushIfValid(m[3] || m[4] || m[5]);

  // full URLs that include camp.cfm
  const reFull = /(https?:\/\/[^"' <]*camp\.cfm[^"' <]*)/gi;
  while ((m = reFull.exec(html)) !== null) pushIfValid(m[1]);

  out = uniq(out).map((u) => String(u).split("#")[0]);

  // Strongly prefer camp.cfm?id=... when present (reduces noise)
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
   Camp name / meta helpers
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
   Candidate extraction from any page html
-------------------------- */
function extractDateCandidates(html) {
  if (!html) return [];
  const text = htmlToText(html);
  const out = [];

  // common compact patterns
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

  // light context snippets
  if (text) {
    const lower = text.toLowerCase();
    const tokens = ["dates", "camp date", "when", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "/20"];
    let added = 0;
    for (let k = 0; k < tokens.length; k++) {
      const idx = lower.indexOf(tokens[k]);
      if (idx >= 0) {
        let start = idx - 60;
        if (start < 0) start = 0;
        let end = idx + 180;
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
      datesParsedFromDetail: 0,
      datesMissing: 0,
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
        // If it's a direct reg/listing URL, fetch it and expand appropriately
        if (isDirectRegistrationUrl(siteUrl)) {
          debug.siteKpi.sitesDirectRegUrl += 1;

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

          if (isRegisterListingUrl(siteUrl)) {
            // EXPAND listing -> camp links
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
            // camp.cfm already
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
          // Normal site homepage crawl: fetch and extract camp links
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

        // Process each camp link
        for (let i2 = 0; i2 < regLinks.length; i2++) {
          if (accepted.length >= maxEvents) break;
          if (outOfTime(maxMs)) {
            debug.stoppedEarly = true;
            debug.stopReason = "maxMs_exceeded";
            break;
          }

          const regUrl = regLinks[i2];
          processedRegs += 1;

          // listing-first attempt: parse from snippet around the link within listing/homepage HTML
          const listingSnippetHtml = html ? extractSnippetAroundNeedle(html, regUrl, 460) : null;
          const listingSnippetText = listingSnippetHtml ? htmlToText(listingSnippetHtml) : null;
          const listingParsed = listingSnippetText ? parseSingleOrRangeDate(listingSnippetText, defaultYear) : null;

          let finalParsed = null;
          let eventDatesRaw = null;

          if (listingParsed && listingParsed.start) {
            finalParsed = listingParsed;
            eventDatesRaw = listingParsed.rawLine || truncate(listingSnippetText, 240);
            debug.kpi.datesParsedFromListing += 1;
          }

          // FAST MODE: if listing gave date and it's not a direct camp page, we can skip fetching regUrl
          const shouldFetchDetail = !fastMode || !(finalParsed && finalParsed.start);

          let regHttp = 0;
          let regHtml = "";
          let regText = "";
          let candidates = [];
          let pick = null;

          if (shouldFetchDetail) {
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

            if ((!finalParsed || !finalParsed.start) && regHtml) {
              candidates = extractDateCandidates(regHtml);
              pick = pickBestParsedDateFromCandidates(candidates, defaultYear);

              if (pick && pick.parsed && pick.parsed.start) {
                finalParsed = pick.parsed;
                eventDatesRaw = pick.bestRaw || (finalParsed.rawLine || null);
                debug.kpi.datesParsedFromDetail += 1;
              }
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
                sampleCandidates: candidates && candidates.length ? candidates.slice(0, 6) : [],
              },
            });
            continue;
          }

          // Name/notes enrichment from detail page if fetched; else fallback to site title-ish
          const h1 = regHtml ? extractH1(regHtml) : null;
          const title = regHtml ? extractTitle(regHtml) : null;
          const campName = sanitizeCampName(h1 || title || "Camp");
          const desc = regHtml ? extractMetaDescription(regHtml) : null;

          // program id from id= when present
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
