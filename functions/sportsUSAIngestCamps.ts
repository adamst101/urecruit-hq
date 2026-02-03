// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Crawl SchoolSportSite.camp_site_url for a sport
// - Find registration links (primarily register.ryzer.com/camp.cfm?id=...)
// - Fetch registration pages and extract camp details
// - Return normalized CampDemo-shaped payloads to AdminImport (AdminImport does DB writes)
//
// Editor-safe constraints:
// - Deno.serve wrapper required
// - No optional chaining
// - No external imports
//
// Version:
const VERSION = "sportsUSAIngestCamps_2026-02-02_v1_editor_safe";

function safeString(x) {
  if (x === null || x === undefined) return null;
  var s = String(x).trim();
  return s ? s : null;
}

function stripNonAscii(s) {
  return String(s || "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lc(s) {
  return String(s || "").toLowerCase().trim();
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function truncate(s, n) {
  var str = String(s || "");
  var lim = n || 1200;
  return str.length > lim ? str.slice(0, lim) + "…(truncated)" : str;
}

function absUrl(baseUrl, maybeRelative) {
  var u = safeString(maybeRelative);
  if (!u) return null;

  if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
  if (u.indexOf("//") === 0) return "https:" + u;

  if (u.indexOf("/") === 0) {
    try {
      var b = new URL(baseUrl);
      return b.origin + u;
    } catch (e) {
      return u;
    }
  }

  try {
    return new URL(u, baseUrl).toString();
  } catch (e2) {
    return u;
  }
}

function tryParseJsonString(s) {
  if (typeof s !== "string") return null;
  var t = s.trim();
  if (!t) return null;
  if (!(t.indexOf("{") === 0 || t.indexOf("[") === 0)) return null;
  try {
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

// Convert various date strings into YYYY-MM-DD (UTC-ish)
function toISODateFromParts(y, m, d) {
  var yyyy = String(y);
  var mm = String(m).length === 1 ? "0" + String(m) : String(m);
  var dd = String(d).length === 1 ? "0" + String(d) : String(d);
  return yyyy + "-" + mm + "-" + dd;
}

function toISODateFromMDY(mdy) {
  // mdy: MM/DD/YYYY or M/D/YYYY
  var m = mdy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  var mm = parseInt(m[1], 10);
  var dd = parseInt(m[2], 10);
  var yyyy = parseInt(m[3], 10);
  if (!yyyy || !mm || !dd) return null;
  return toISODateFromParts(yyyy, mm, dd);
}

function monthNameToNumber(mon) {
  var k = lc(mon);
  if (k === "jan" || k === "january") return 1;
  if (k === "feb" || k === "february") return 2;
  if (k === "mar" || k === "march") return 3;
  if (k === "apr" || k === "april") return 4;
  if (k === "may") return 5;
  if (k === "jun" || k === "june") return 6;
  if (k === "jul" || k === "july") return 7;
  if (k === "aug" || k === "august") return 8;
  if (k === "sep" || k === "sept" || k === "september") return 9;
  if (k === "oct" || k === "october") return 10;
  if (k === "nov" || k === "november") return 11;
  if (k === "dec" || k === "december") return 12;
  return null;
}

function parseDateFromText(text) {
  // Returns { start_date, end_date, raw }
  var t = stripNonAscii(text || "");
  if (!t) return { start_date: null, end_date: null, raw: null };

  // 1) MM/DD/YYYY (first occurrence)
  var m1 = t.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
  if (m1 && m1[1]) {
    var startISO = toISODateFromMDY(m1[1]);
    // find second date for end_date (optional)
    var rest = t.slice((m1.index || 0) + m1[0].length);
    var m2 = rest.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
    var endISO = null;
    if (m2 && m2[1]) endISO = toISODateFromMDY(m2[1]);
    return { start_date: startISO, end_date: endISO, raw: t };
  }

  // 2) Month Day, Year
  // Example: June 5, 2026
  var mdy = t.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,\s*(\d{4})\b/i);
  if (mdy && mdy[1] && mdy[2] && mdy[3]) {
    var mm = monthNameToNumber(mdy[1]);
    var dd = parseInt(mdy[2], 10);
    var yyyy = parseInt(mdy[3], 10);
    var startISO2 = (mm && dd && yyyy) ? toISODateFromParts(yyyy, mm, dd) : null;

    // try to find another Month Day, Year for end date
    var rest2 = t.slice((mdy.index || 0) + mdy[0].length);
    var mdy2 = rest2.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,\s*(\d{4})\b/i);
    var endISO2 = null;
    if (mdy2 && mdy2[1] && mdy2[2] && mdy2[3]) {
      var mm2 = monthNameToNumber(mdy2[1]);
      var dd2 = parseInt(mdy2[2], 10);
      var yyyy2 = parseInt(mdy2[3], 10);
      if (mm2 && dd2 && yyyy2) endISO2 = toISODateFromParts(yyyy2, mm2, dd2);
    }

    return { start_date: startISO2, end_date: endISO2, raw: t };
  }

  return { start_date: null, end_date: null, raw: t };
}

// Football rollover: Feb 1 (UTC-ish)
function computeSeasonYearFootball(startDateISO) {
  if (!startDateISO) return null;
  var m = startDateISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  var yyyy = parseInt(m[1], 10);
  var mm = parseInt(m[2], 10);
  var dd = parseInt(m[3], 10);
  if (!yyyy || !mm || !dd) return null;

  // If on/after Feb 1 => season year = yyyy, else yyyy-1
  if (mm > 2) return yyyy;
  if (mm === 2 && dd >= 1) return yyyy;
  return yyyy - 1;
}

function simpleHash(obj) {
  var str = typeof obj === "string" ? obj : JSON.stringify(obj || {});
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return "h" + String(Math.abs(h));
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractTitleFromHtml(html) {
  var h = String(html || "");
  var m1 = h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m1 && m1[1]) return stripNonAscii(m1[1].replace(/<[^>]+>/g, " "));
  var t = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t && t[1]) return stripNonAscii(t[1].replace(/<[^>]+>/g, " "));
  return null;
}

function extractFirstMoney(html) {
  var h = String(html || "");
  // $199, $199.00, USD 199 etc (we focus on $)
  var m = h.match(/\$\s*([0-9]{1,5}(?:\.[0-9]{2})?)/);
  if (m && m[1]) {
    var n = Number(String(m[1]).replace(/[^0-9.]/g, ""));
    return isFinite(n) ? n : null;
  }
  return null;
}

function extractAllMoney(html) {
  var h = String(html || "");
  var re = /\$\s*([0-9]{1,5}(?:\.[0-9]{2})?)/g;
  var out = [];
  var m;
  while ((m = re.exec(h)) !== null) {
    if (m[1]) {
      var n = Number(String(m[1]).replace(/[^0-9.]/g, ""));
      if (isFinite(n)) out.push(n);
    }
    if (out.length > 50) break;
  }
  return out;
}

function parsePriceRange(prices) {
  var arr = asArray(prices).filter(function (n) { return isFinite(n); });
  if (!arr.length) return { price_min: null, price_max: null, price_best: null };
  var min = Math.min.apply(null, arr);
  var max = Math.max.apply(null, arr);
  return { price_min: min, price_max: max, price_best: min };
}

function extractTextSnippetNear(html, needle, windowSize) {
  var h = String(html || "");
  var n = lc(needle || "");
  if (!n) return null;

  var idx = lc(h).indexOf(n);
  if (idx < 0) return null;

  var w = windowSize || 800;
  var start = idx - Math.floor(w / 2);
  if (start < 0) start = 0;
  var end = start + w;
  if (end > h.length) end = h.length;

  var snippet = h.slice(start, end);
  snippet = snippet.replace(/<[^>]+>/g, " ");
  snippet = stripNonAscii(snippet);
  return snippet || null;
}

function extractRegistrationLinksFromHtml(html, baseUrl, maxLinks) {
  var h = String(html || "");
  var links = [];
  var seen = {};

  // Pull all hrefs; filter down
  var re = /href="([^"]+)"/gi;
  var m;
  while ((m = re.exec(h)) !== null) {
    var href = m[1];
    var u = absUrl(baseUrl, href);
    if (!u) continue;

    var ul = lc(u);

    // Common Ryzer registration pattern
    var isRyzer = (ul.indexOf("register.ryzer.com/camp.cfm") >= 0 && ul.indexOf("id=") >= 0) ||
                  (ul.indexOf("ryzer.com/camp.cfm") >= 0 && ul.indexOf("id=") >= 0);

    // Also allow "camp.cfm?id=" anywhere
    var isCampCfm = ul.indexOf("camp.cfm?id=") >= 0;

    if (!(isRyzer || isCampCfm)) continue;

    if (!seen[u]) {
      seen[u] = true;
      links.push(u);
      if (maxLinks && links.length >= maxLinks) break;
    }
  }

  return links;
}

function parseRyzerIdFromUrl(url) {
  var u = safeString(url);
  if (!u) return null;
  var m = u.match(/[?&]id=(\d+)/i);
  if (m && m[1]) return m[1];
  return null;
}

function buildEventKey(sourcePlatform, programId, startDateISO, discriminator) {
  var p = safeString(sourcePlatform) || "sportsusa";
  var pid = safeString(programId) || "na";
  var sd = safeString(startDateISO) || "na";
  var disc = safeString(discriminator) || "na";
  return p + ":" + pid + ":" + sd + ":" + disc;
}

Deno.serve(async (req) => {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    notes: [],
    sites: [],
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    var body = await req.json().catch(function () { return null; });

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var sites = asArray(body && body.sites);
    var maxSites = Number(body && body.maxSites !== undefined ? body.maxSites : 25);
    var maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 8);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 100);
    var dryRun = !!(body && body.dryRun);

    if (!sportId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!sites.length) {
      return new Response(JSON.stringify({
        error: "Missing required: sites[] (from SchoolSportSite rows)",
        debug: debug
      }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    var accepted = [];
    var rejected = [];
    var errors = [];

    var processedSites = 0;
    var processedRegs = 0;

    for (var i = 0; i < sites.length; i++) {
      if (processedSites >= maxSites) break;
      if (accepted.length >= maxEvents) break;

      var site = sites[i] || {};
      var schoolId = safeString(site.school_id);
      var siteUrl = safeString(site.camp_site_url || site.site_url || site.view_site_url || site.url);

      if (!schoolId || !siteUrl) {
        rejected.push({
          reason: "missing_school_or_site",
          school_id: schoolId,
          camp_site_url: siteUrl,
        });
        continue;
      }

      processedSites += 1;

      var siteDebug = {
        school_id: schoolId,
        camp_site_url: siteUrl,
        http: null,
        regLinksFound: 0,
        regLinksUsed: 0,
        campsAccepted: 0,
        campsRejected: 0,
        notes: [],
      };

      try {
        var r = await fetch(siteUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
            Accept: "text/html,*/*",
          },
        });

        siteDebug.http = r.status;

        var html = await r.text().catch(function () { return ""; });

        if (!r.ok) {
          siteDebug.notes.push("Non-200 fetch from camp_site_url");
          debug.sites.push(siteDebug);
          continue;
        }

        var regLinks = extractRegistrationLinksFromHtml(html, siteUrl, maxRegsPerSite);
        siteDebug.regLinksFound = regLinks.length;
        siteDebug.regLinksUsed = regLinks.length;

        for (var j = 0; j < regLinks.length; j++) {
          if (accepted.length >= maxEvents) break;

          var regUrl = regLinks[j];
          processedRegs += 1;

          // Fetch registration page for details (best-effort)
          var regHttp = null;
          var regHtml = "";

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

            if (!rr.ok) {
              siteDebug.campsRejected += 1;
              rejected.push({
                reason: "reg_fetch_failed",
                school_id: schoolId,
                registration_url: regUrl,
                http: regHttp,
              });
              continue;
            }
          } catch (e1) {
            siteDebug.campsRejected += 1;
            rejected.push({
              reason: "reg_fetch_exception",
              school_id: schoolId,
              registration_url: regUrl,
              error: String((e1 && e1.message) || e1),
            });
            continue;
          }

          // Extract fields
          var campName = extractTitleFromHtml(regHtml) || "Camp";
          campName = stripNonAscii(campName);

          // Date parsing
          var dateHint = extractTextSnippetNear(regHtml, "date", 1200) || extractTextSnippetNear(regHtml, "dates", 1200);
          var parsedDates = parseDateFromText(dateHint || regHtml);

          var startDate = parsedDates.start_date;
          var endDate = parsedDates.end_date;

          if (!startDate) {
            siteDebug.campsRejected += 1;
            rejected.push({
              reason: "missing_start_date",
              school_id: schoolId,
              registration_url: regUrl,
              camp_name_guess: campName,
            });
            continue;
          }

          var allPrices = extractAllMoney(regHtml);
          var pr = parsePriceRange(allPrices);
          var priceBest = pr.price_best;

          // Try pull "grades" / "register by" snippets
          var gradesRaw = extractTextSnippetNear(regHtml, "grades", 900);
          var registerByRaw = extractTextSnippetNear(regHtml, "register", 900);

          // Basic location sniff
          var locationRaw = extractTextSnippetNear(regHtml, "location", 900);
          var city = null;
          var state = null;
          if (locationRaw) {
            // Look for "City, ST"
            var mm = locationRaw.match(/\b([A-Za-z .'-]{2,}),\s*([A-Z]{2})\b/);
            if (mm && mm[1] && mm[2]) {
              city = stripNonAscii(mm[1]);
              state = stripNonAscii(mm[2]);
            }
          }

          // Program id from ryzer id if present
          var ryzerId = parseRyzerIdFromUrl(regUrl);
          var programId = ryzerId ? ("ryzerid:" + ryzerId) : ("site:" + slugify(siteUrl) + ":" + slugify(campName));

          // Season year
          var seasonYear = null;
          if (lc(sportName) === "football") {
            seasonYear = computeSeasonYearFootball(startDate);
          } else {
            var y = startDate.match(/^(\d{4})-/);
            seasonYear = y && y[1] ? Number(y[1]) : null;
          }
          if (!isFinite(seasonYear)) seasonYear = null;

          // event_key discriminator: reg url
          var eventKey = buildEventKey("sportsusa", programId, startDate, regUrl);

          var runIso = new Date().toISOString();

          var payload = {
            school_id: schoolId,
            sport_id: sportId,
            camp_name: campName,
            start_date: startDate,
            end_date: endDate || null,
            city: city || null,
            state: state || null,
            position_ids: [],
            price: priceBest !== null && priceBest !== undefined ? priceBest : null,
            link_url: regUrl,
            notes: null,

            season_year: seasonYear,
            program_id: programId,
            event_key: eventKey,
            source_platform: "sportsusa",
            source_url: regUrl,
            last_seen_at: runIso,
            content_hash: simpleHash({
              school_id: schoolId,
              sport_id: sportId,
              camp_name: campName,
              start_date: startDate,
              end_date: endDate,
              link_url: regUrl,
              price: priceBest,
              city: city,
              state: state,
              grades_raw: gradesRaw,
            }),

            event_dates_raw: parsedDates.raw || null,
            grades_raw: gradesRaw || null,
            register_by_raw: registerByRaw || null,
            price_raw: null,
            price_min: pr.price_min,
            price_max: pr.price_max,
            sections_json: null,
          };

          // Enforce required CampDemo fields
          if (!payload.season_year || !payload.program_id || !payload.event_key) {
            siteDebug.campsRejected += 1;
            rejected.push({
              reason: "missing_required_fields_after_parse",
              school_id: schoolId,
              registration_url: regUrl,
              start_date: startDate,
              season_year: payload.season_year,
              program_id: payload.program_id,
              event_key: payload.event_key,
            });
            continue;
          }

          accepted.push(payload);
          siteDebug.campsAccepted += 1;
        }

        debug.sites.push(siteDebug);
      } catch (e2) {
        siteDebug.notes.push("site crawl exception: " + String((e2 && e2.message) || e2));
        debug.sites.push(siteDebug);
        errors.push({ school_id: schoolId, camp_site_url: siteUrl, error: String((e2 && e2.message) || e2) });
      }
    }

    var response = {
      stats: {
        processedSites: processedSites,
        processedRegs: processedRegs,
        accepted: accepted.length,
        rejected: rejected.length,
        errors: errors.length,
        dryRun: dryRun,
        maxSites: maxSites,
        maxRegsPerSite: maxRegsPerSite,
        maxEvents: maxEvents,
      },
      debug: debug,
      errors: errors.slice(0, 25),
      rejected_samples: rejected.slice(0, 25),
      accepted: dryRun ? accepted.slice(0, 25) : accepted,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (eTop) {
    debug.notes.push("top-level error: " + String((eTop && eTop.message) || eTop));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});