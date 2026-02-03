// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Given a Sport + SchoolSportSite rows (or a test URL), crawl camp-site pages
// - Discover Ryzer registration links (register.ryzer.com/camp.cfm?...)
// - For each registration link, fetch the Ryzer page and parse:
//   camp_name, start_date, end_date, city/state (best-effort), notes (best-effort)
// - Return normalized "accepted" events that AdminImport can write into CampDemo.
//
// Design goals:
// - Editor-safe: NO optional chaining, NO external imports.
// - Fail-closed, verbose debug.
// - Registration link discovery is flexible; Ryzer pages are the truth source for dates.
//
// Inputs:
// {
//   sportId: string (required),
//   sportName: string (required),
//   dryRun: boolean,
//   maxSites: number,
//   maxRegsPerSite: number,
//   maxEvents: number,
//   testSiteUrl: string|null,
//   testSchoolSportSiteId: string|null,
//   siteUrls: string[]|null
// }
//
// Output:
// {
//   version,
//   stats,
//   accepted: [{ event, derived, debug }],
//   rejected_samples,
//   errors,
//   debug: { siteDebug:[], firstSiteHtmlSnippet:"..." }
// }

const VERSION = "sportsUSAIngestCamps_2026-02-03_v6_fetch_ryzer_and_parse_single_or_range_dates_editor_safe";

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

  // Accept both register.ryzer.com and ryzer.com/register.* patterns (if any)
  // We specifically want camp.cfm links.
  var re = /href="([^"]+camp\.cfm[^"]*)"/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var href = m[1];
    var u = absUrl(siteUrl, href);
    if (!u) continue;
    if (lc(u).indexOf("register.ryzer.com/camp.cfm") === -1) continue;
    out.push(u);
  }

  // Also sometimes links show without href quotes or inside JS; try a looser match
  var re2 = /(https?:\/\/register\.ryzer\.com\/camp\.cfm[^"' <]+)/gi;
  while ((m = re2.exec(html)) !== null) {
    out.push(m[1]);
  }

  out = uniq(out);

  // Normalize: drop any trailing fragments
  for (var i = 0; i < out.length; i++) {
    out[i] = out[i].split("#")[0];
  }
  return out;
}

// -------------------------
// Date parsing (single or range)
// Output: { start:"YYYY-MM-DD"|null, end:"YYYY-MM-DD"|null, rawLine:string|null }
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
  // 21st -> 21, 2nd -> 2
  return String(x || "").replace(/(st|nd|rd|th)\b/gi, "");
}

function parseMMDDYYYY(s) {
  // 06/12/2026
  var m = /(\b\d{1,2})\/(\d{1,2})\/(\d{4}\b)/.exec(s);
  if (!m) return null;
  var mm = Number(m[1]);
  var dd = Number(m[2]);
  var yy = Number(m[3]);
  if (!mm || !dd || !yy) return null;
  return { y: yy, m: mm, d: dd };
}

function parseMonthNameDate(s) {
  // "February 21st, 2026" OR "February 21st" (year may be missing)
  var m = /\b(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\b\s+(\d{1,2}(?:st|nd|rd|th)?)\b(?:[,\s]+(\d{4}))?/i.exec(
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
  if (!raw) return { start: null, end: null, rawLine: null };

  var t = stripNonAscii(raw);

  // 1) Numeric range: 06/12/2026 - 06/13/2026
  var m1 = /(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(t);
  if (m1) {
    var a = parseMMDDYYYY(m1[1]);
    var b = parseMMDDYYYY(m1[2]);
    return {
      start: a ? toIsoDate(a.y, a.m, a.d) : null,
      end: b ? toIsoDate(b.y, b.m, b.d) : null,
      rawLine: t,
    };
  }

  // 2) Numeric single: 02/15/2026
  var a1 = parseMMDDYYYY(t);
  if (a1) {
    return { start: toIsoDate(a1.y, a1.m, a1.d), end: null, rawLine: t };
  }

  // 3) Month name range: "February 21st - 22nd" (same month, year maybe missing)
  // Also handles "June 12th-13th" with no spaces.
  var m2 = /\b(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\b\s+(\d{1,2}(?:st|nd|rd|th)?)\s*[-–]\s*(\d{1,2}(?:st|nd|rd|th)?)\b(?:[,\s]+(\d{4}))?/i.exec(
    t
  );
  if (m2) {
    var mm = monthNumFromName(m2[1]);
    var d1 = Number(stripOrdinal(m2[2]));
    var d2 = Number(stripOrdinal(m2[3]));
    var yy = m2[4] ? Number(m2[4]) : defaultYear || null;
    return {
      start: yy && mm && d1 ? toIsoDate(yy, mm, d1) : null,
      end: yy && mm && d2 ? toIsoDate(yy, mm, d2) : null,
      rawLine: t,
    };
  }

  // 4) Month name with year range: "February 21st, 2026 - February 22nd, 2026"
  var m3 = /(\b(?:January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\b\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)\s*[-–]\s*(\b(?:January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\b\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?)/i.exec(
    t
  );
  if (m3) {
    var p1 = parseMonthNameDate(m3[1]);
    var p2 = parseMonthNameDate(m3[2]);
    var y1 = (p1 && p1.y) || defaultYear || null;
    var y2 = (p2 && p2.y) || y1 || null;
    return {
      start: p1 ? toIsoDate(y1, p1.m, p1.d) : null,
      end: p2 ? toIsoDate(y2, p2.m, p2.d) : null,
      rawLine: t,
    };
  }

  // 5) Month name single: "February 15th" or "Feb 15, 2026"
  var p = parseMonthNameDate(t);
  if (p) {
    var yy2 = p.y || defaultYear || null;
    return { start: yy2 ? toIsoDate(yy2, p.m, p.d) : null, end: null, rawLine: t };
  }

  return { start: null, end: null, rawLine: t };
}

// -------------------------
// Ryzer registration page parsing
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

function extractDateLineFromRyzer(html) {
  if (!html) return null;

  // Ryzer pages frequently include date strings in visible text.
  // We'll scan for likely date patterns near "Date", "Dates", or obvious formats.

  // Prefer explicit labels if present
  var m = /(?:Dates?|Camp Dates?)\s*<\/[^>]+>\s*<[^>]+>\s*([^<]{3,60})</i.exec(html);
  if (m && m[1]) return stripNonAscii(m[1]);

  // Scan for numeric date range on page
  var m2 = /(\d{1,2}\/\d{1,2}\/\d{4}\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{4})/.exec(html);
  if (m2 && m2[1]) return stripNonAscii(m2[1]);

  // Scan for numeric single
  var m3 = /(\d{1,2}\/\d{1,2}\/\d{4})/.exec(html);
  if (m3 && m3[1]) return stripNonAscii(m3[1]);

  // Scan for month-name patterns
  var m4 = /((January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|October|Oct|November|Nov|December|Dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?)?(?:,\s*\d{4})?)/i.exec(
    html
  );
  if (m4 && m4[1]) return stripNonAscii(m4[1]);

  return null;
}

function guessYearFromContext(sportName) {
  // For now: if page date doesn't include year, assume current year or next year if late in season.
  // We will prefer current year.
  var y = new Date().getFullYear();
  return y;
}

function buildEventKey(platform, programId, startDate, url) {
  var p = safeString(platform) || "sportsusa";
  var pr = safeString(programId) || "unknown";
  var sd = safeString(startDate) || "na";
  var u = safeString(url) || "";
  return p + ":" + pr + ":" + sd + ":" + hashLite(u);
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
    var maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 10);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 25);

    var testSiteUrl = safeString(body && body.testSiteUrl);
    var testSchoolSportSiteId = safeString(body && body.testSchoolSportSiteId);

    var siteUrls = body && body.siteUrls ? body.siteUrls : null;

    if (!sportId || !sportName) {
      return new Response(JSON.stringify({ error: "Missing required: sportId/sportName", version: VERSION, debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Decide which site URLs to crawl
    var crawlUrls = [];

    if (testSiteUrl) {
      crawlUrls = [testSiteUrl];
    } else if (siteUrls && Array.isArray(siteUrls) && siteUrls.length) {
      crawlUrls = siteUrls.slice(0, maxSites);
    } else if (testSchoolSportSiteId) {
      // We can't look up DB here (function-only). AdminImport should translate ID -> URL and pass it in.
      return new Response(
        JSON.stringify({
          version: VERSION,
          stats: { processedSites: 0, processedRegs: 0, accepted: 0, rejected: 0, errors: 1 },
          accepted: [],
          rejected_samples: [],
          errors: [{ error: "Provide testSiteUrl OR siteUrls. testSchoolSportSiteId must be resolved client-side." }],
          debug: debug,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({
          version: VERSION,
          stats: { processedSites: 0, processedRegs: 0, accepted: 0, rejected: 0, errors: 1 },
          accepted: [],
          rejected_samples: [],
          errors: [{ error: "Provide siteUrls (array) OR testSiteUrl." }],
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

    for (var s = 0; s < crawlUrls.length; s++) {
      if (accepted.length >= maxEvents) break;

      var siteUrl = crawlUrls[s];
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

        if (!debug.firstSiteHtmlSnippet) {
          debug.firstSiteHtmlSnippet = truncate(html, 1600);
        }

        debug.siteDebug.push({
          siteUrl: siteUrl,
          http: http,
          htmlType: htmlType,
          regLinks: regLinks.length,
          sample: regLinks.length ? regLinks[0] : "",
          notes: regLinks.length ? "" : "no_registration_links_found",
        });

        // No regs found; move on (common early season)
        if (!regLinks.length) continue;

        // For each registration link, fetch the Ryzer page to parse details
        for (var i = 0; i < regLinks.length; i++) {
          if (accepted.length >= maxEvents) break;

          var regUrl = regLinks[i];
          processedRegs += 1;

          try {
            var rr = await fetch(regUrl, {
              method: "GET",
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
                Accept: "text/html,*/*",
              },
            });

            var regHttp = rr.status;
            var regHtml = await rr.text().catch(function () {
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

            var title = extractTitle(regHtml) || "Camp";
            var desc = extractMetaDescription(regHtml) || null;

            // Date parsing
            var dateLine = extractDateLineFromRyzer(regHtml);
            var defaultYear = guessYearFromContext(sportName);
            var parsed = parseSingleOrRangeDate(dateLine || "", defaultYear);

            // If date is still missing, try extracting from the "View ..." link text by URL context (rare)
            if (!parsed.start) {
              rejected.push({
                reason: "missing_date",
                title: title,
                registrationUrl: regUrl,
                event_dates_line: dateLine || null,
              });
              continue;
            }

            // Derivations for IDs
            // program_id: use ryzer camp id param if present
            var programId = null;
            var idMatch = /[?&]id=(\d+)/i.exec(regUrl);
            if (idMatch && idMatch[1]) programId = "ryzer:" + idMatch[1];
            if (!programId) programId = "ryzer:" + hashLite(regUrl);

            var eventKey = buildEventKey("ryzer", programId, parsed.start, regUrl);

            // Event (CampDemo-like) normalized output
            accepted.push({
              event: {
                school_id: null, // AdminImport fills from SchoolSportSite context
                sport_id: sportId,
                camp_name: stripNonAscii(title),
                start_date: parsed.start,
                end_date: parsed.end || null,
                city: null,
                state: null,
                position_ids: [],
                price: null,
                link_url: regUrl,
                notes: desc,

                season_year: Number(parsed.start.slice(0, 4)),
                program_id: programId,
                event_key: eventKey,
                source_platform: "ryzer",
                source_url: regUrl,
                last_seen_at: new Date().toISOString(),
                content_hash: hashLite(stripNonAscii(title) + "|" + (desc || "") + "|" + (dateLine || "")),

                event_dates_raw: dateLine || null,
                grades_raw: null,
                register_by_raw: null,
                price_raw: null,
                price_min: null,
                price_max: null,
                sections_json: null,
              },
              derived: {
                reg_http: regHttp,
                date_line: dateLine || null,
              },
              debug: {
                reg_url: regUrl,
              },
            });
          } catch (eReg) {
            errors.push({ error: "reg_exception", message: String((eReg && eReg.message) || eReg), registrationUrl: regUrl });
          }
        }
      } catch (eSite) {
        errors.push({ error: "site_exception", message: String((eSite && eSite.message) || eSite), siteUrl: siteUrl });
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

    return new Response(
      JSON.stringify({
        version: VERSION,
        stats: {
          processedSites: processedSites,
          processedRegs: processedRegs,
          accepted: accepted.length,
          rejected: rejected.length,
          errors: errors.length,
        },
        accepted: accepted,
        rejected_samples: rejected_samples,
        errors: errors.slice(0, 10),
        debug: debug,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (eTop) {
    debug.siteDebug.push({ siteUrl: "", http: 0, htmlType: "", regLinks: 0, sample: "", notes: "top-level error: " + String((eTop && eTop.message) || eTop) });
    return new Response(JSON.stringify({ error: "Unhandled error", version: VERSION, debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
