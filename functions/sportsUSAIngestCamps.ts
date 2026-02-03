// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Crawl SchoolSportSite.camp_site_url for a sport
// - Find registration links (primarily register.ryzer.com/camp.cfm?id=...)
// - If none found on homepage, try likely subpages (/camps, /events, etc.)
// - Fetch registration pages and extract camp details
//
// Editor-safe constraints:
// - Deno.serve wrapper required
// - No optional chaining
// - No external imports
//
// Version:
const VERSION = "sportsUSAIngestCamps_2026-02-03_v2_subpage_fallback_and_better_link_extract";

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

// ----------------------
// Date parsing helpers
// ----------------------
function toISODateFromParts(y, m, d) {
  var yyyy = String(y);
  var mm = String(m).length === 1 ? "0" + String(m) : String(m);
  var dd = String(d).length === 1 ? "0" + String(d) : String(d);
  return yyyy + "-" + mm + "-" + dd;
}

function toISODateFromMDY(mdy) {
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
  var t = stripNonAscii(text || "");
  if (!t) return { start_date: null, end_date: null, raw: null };

  var m1 = t.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
  if (m1 && m1[1]) {
    var startISO = toISODateFromMDY(m1[1]);
    var rest = t.slice((m1.index || 0) + m1[0].length);
    var m2 = rest.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
    var endISO = null;
    if (m2 && m2[1]) endISO = toISODateFromMDY(m2[1]);
    return { start_date: startISO, end_date: endISO, raw: t };
  }

  var mdy = t.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,\s*(\d{4})\b/i
  );
  if (mdy && mdy[1] && mdy[2] && mdy[3]) {
    var mm = monthNameToNumber(mdy[1]);
    var dd = parseInt(mdy[2], 10);
    var yyyy = parseInt(mdy[3], 10);
    var startISO2 = mm && dd && yyyy ? toISODateFromParts(yyyy, mm, dd) : null;

    var rest2 = t.slice((mdy.index || 0) + mdy[0].length);
    var mdy2 = rest2.match(
      /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,\s*(\d{4})\b/i
    );

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

function computeSeasonYearFootball(startDateISO) {
  if (!startDateISO) return null;
  var m = startDateISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  var yyyy = parseInt(m[1], 10);
  var mm = parseInt(m[2], 10);
  var dd = parseInt(m[3], 10);
  if (!yyyy || !mm || !dd) return null;

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
  var arr = asArray(prices).filter(function (n) {
    return isFinite(n);
  });
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

  var w = windowSize || 900;
  var start = idx - Math.floor(w / 2);
  if (start < 0) start = 0;
  var end = start + w;
  if (end > h.length) end = h.length;

  var snippet = h.slice(start, end);
  snippet = snippet.replace(/<[^>]+>/g, " ");
  snippet = stripNonAscii(snippet);
  return snippet || null;
}

// ----------------------
// Link extraction upgrades
// ----------------------
function addUnique(list, seen, url) {
  if (!url) return;
  if (!seen[url]) {
    seen[url] = true;
    list.push(url);
  }
}

function extractHrefLinks(html, baseUrl, maxLinks) {
  var h = String(html || "");
  var out = [];
  var seen = {};

  // href="..."
  var re1 = /href="([^"]+)"/gi;
  var m1;
  while ((m1 = re1.exec(h)) !== null) {
    var u1 = absUrl(baseUrl, m1[1]);
    if (u1) addUnique(out, seen, u1);
    if (maxLinks && out.length >= maxLinks) break;
  }

  // href='...'
  if (!maxLinks || out.length < maxLinks) {
    var re2 = /href='([^']+)'/gi;
    var m2;
    while ((m2 = re2.exec(h)) !== null) {
      var u2 = absUrl(baseUrl, m2[1]);
      if (u2) addUnique(out, seen, u2);
      if (maxLinks && out.length >= maxLinks) break;
    }
  }

  return out;
}

function looksLikeRegLink(url) {
  var u = lc(url || "");
  if (!u) return false;

  // Primary: Ryzer camp registration pages
  if (u.indexOf("camp.cfm?id=") >= 0) return true;
  if (u.indexOf("register.ryzer.com") >= 0 && u.indexOf("id=") >= 0) return true;

  return false;
}

function extractRegistrationLinksFromHtml(html, baseUrl, maxLinks) {
  var h = String(html || "");
  var out = [];
  var seen = {};

  // 1) from hrefs
  var hrefs = extractHrefLinks(h, baseUrl, 5000);
  for (var i = 0; i < hrefs.length; i++) {
    if (looksLikeRegLink(hrefs[i])) {
      addUnique(out, seen, hrefs[i]);
      if (maxLinks && out.length >= maxLinks) return out;
    }
  }

  // 2) From raw strings / JS: "camp.cfm?id=123456"
  // Find any occurrence of camp.cfm?id=digits and build absolute URL
  if (!maxLinks || out.length < maxLinks) {
    var re = /(camp\.cfm\?id=\d+)/gi;
    var m;
    while ((m = re.exec(h)) !== null) {
      var frag = m[1];
      var u = absUrl(baseUrl, frag);
      addUnique(out, seen, u);
      if (maxLinks && out.length >= maxLinks) break;
      if (out.length > 50) break;
    }
  }

  return out;
}

function extractCandidateSubpages(html, baseUrl, maxPages) {
  // Try to find likely nav pages that list camps/events
  var h = String(html || "");
  var hrefs = extractHrefLinks(h, baseUrl, 500);
  var scored = [];

  for (var i = 0; i < hrefs.length; i++) {
    var u = hrefs[i];
    var ul = lc(u);

    // keep same-origin preferred
    var sameOrigin = false;
    try {
      var b = new URL(baseUrl);
      var uu = new URL(u);
      sameOrigin = b.origin === uu.origin;
    } catch (e) {
      sameOrigin = false;
    }

    if (!sameOrigin) continue;

    var score = 0;
    if (ul.indexOf("camps") >= 0) score += 5;
    if (ul.indexOf("events") >= 0) score += 5;
    if (ul.indexOf("register") >= 0) score += 3;
    if (ul.indexOf("camp") >= 0) score += 2;

    // avoid obvious junk
    if (ul.indexOf("facebook") >= 0 || ul.indexOf("instagram") >= 0) score = 0;

    if (score > 0) scored.push({ url: u, score: score });
  }

  scored.sort(function (a, b) {
    return b.score - a.score;
  });

  var out = [];
  var seen = {};
  for (var j = 0; j < scored.length; j++) {
    var u2 = scored[j].url;
    if (!seen[u2]) {
      seen[u2] = true;
      out.push(u2);
    }
    if (out.length >= (maxPages || 3)) break;
  }
  return out;
}

function commonFallbackPages(siteUrl) {
  // Many Ryzer school sites expose camps under these paths
  var base = safeString(siteUrl);
  if (!base) return [];
  var candidates = [
    "/camps",
    "/camps/",
    "/events",
    "/events/",
    "/camp",
    "/camp/",
    "/index.cfm",
    "/index.cfm?event=camp",
    "/index.cfm?event=camps",
    "/index.cfm?event=events",
  ];

  var out = [];
  for (var i = 0; i < candidates.length; i++) {
    out.push(absUrl(base, candidates[i]));
  }
  return out;
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

async function fetchHtml(url) {
  var r = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
      Accept: "text/html,*/*",
    },
    redirect: "follow",
  });

  var text = await r.text().catch(function () { return ""; });
  return { ok: r.ok, status: r.status, html: text, finalUrl: url };
}

// ----------------------
// Deno handler
// ----------------------
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
      return new Response(
        JSON.stringify({ error: "Missing required: sites[] (from SchoolSportSite rows)", debug: debug }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
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
        rejected.push({ reason: "missing_school_or_site", school_id: schoolId, camp_site_url: siteUrl });
        continue;
      }

      processedSites += 1;

      var siteDebug = {
        school_id: schoolId,
        camp_site_url: siteUrl,
        home_http: null,
        regLinksFound_home: 0,
        subpages_tried: [],
        regLinksFound_total: 0,
        regLinksSample: [],
        campsAccepted: 0,
        campsRejected: 0,
        notes: [],
      };

      try {
        // Fetch homepage
        var home = await fetchHtml(siteUrl);
        siteDebug.home_http = home.status;

        if (!home.ok) {
          siteDebug.notes.push("Non-200 fetch from camp_site_url");
          debug.sites.push(siteDebug);
          continue;
        }

        // Extract reg links from homepage
        var regLinks = extractRegistrationLinksFromHtml(home.html, siteUrl, maxRegsPerSite);
        siteDebug.regLinksFound_home = regLinks.length;

        // Fallback if none found: try subpages
        if (!regLinks.length) {
          var candidates = [];
          var navCandidates = extractCandidateSubpages(home.html, siteUrl, 3);
          var commonCandidates = commonFallbackPages(siteUrl);

          // merge unique
          var seen = {};
          for (var a = 0; a < navCandidates.length; a++) {
            if (!seen[navCandidates[a]]) { seen[navCandidates[a]] = true; candidates.push(navCandidates[a]); }
          }
          for (var b = 0; b < commonCandidates.length; b++) {
            if (!seen[commonCandidates[b]]) { seen[commonCandidates[b]] = true; candidates.push(commonCandidates[b]); }
          }

          // try first few
          for (var c = 0; c < candidates.length; c++) {
            if (regLinks.length >= maxRegsPerSite) break;
            if (siteDebug.subpages_tried.length >= 5) break;

            var pageUrl = candidates[c];
            siteDebug.subpages_tried.push(pageUrl);

            var sub = await fetchHtml(pageUrl);
            if (!sub.ok) continue;

            var found = extractRegistrationLinksFromHtml(sub.html, pageUrl, maxRegsPerSite);
            // add unique
            var seen2 = {};
            for (var d = 0; d < regLinks.length; d++) seen2[regLinks[d]] = true;
            for (var e = 0; e < found.length; e++) {
              if (!seen2[found[e]]) regLinks.push(found[e]);
              if (regLinks.length >= maxRegsPerSite) break;
            }
          }
        }

        siteDebug.regLinksFound_total = regLinks.length;
        siteDebug.regLinksSample = regLinks.slice(0, 3);

        if (!regLinks.length) {
          siteDebug.notes.push("No registration links found (home + fallback subpages).");
          // include a tiny snippet in debug to confirm we’re getting real HTML
          siteDebug.notes.push("HTML snippet: " + truncate(home.html, 400));
          debug.sites.push(siteDebug);
          continue;
        }

        for (var j = 0; j < regLinks.length; j++) {
          if (accepted.length >= maxEvents) break;

          var regUrl = regLinks[j];
          processedRegs += 1;

          var rr = await fetchHtml(regUrl);
          if (!rr.ok) {
            siteDebug.campsRejected += 1;
            rejected.push({ reason: "reg_fetch_failed", school_id: schoolId, registration_url: regUrl, http: rr.status });
            continue;
          }

          var campName = extractTitleFromHtml(rr.html) || "Camp";
          campName = stripNonAscii(campName);

          var dateHint = extractTextSnippetNear(rr.html, "date", 1400) || extractTextSnippetNear(rr.html, "dates", 1400);
          var parsedDates = parseDateFromText(dateHint || rr.html);

          var startDate = parsedDates.start_date;
          var endDate = parsedDates.end_date;

          if (!startDate) {
            siteDebug.campsRejected += 1;
            rejected.push({ reason: "missing_start_date", school_id: schoolId, registration_url: regUrl, camp_name_guess: campName });
            continue;
          }

          var allPrices = extractAllMoney(rr.html);
          var pr = parsePriceRange(allPrices);
          var priceBest = pr.price_best;

          var gradesRaw = extractTextSnippetNear(rr.html, "grades", 900);
          var registerByRaw = extractTextSnippetNear(rr.html, "register", 900);

          var ryzerId = parseRyzerIdFromUrl(regUrl);
          var programId = ryzerId ? ("ryzerid:" + ryzerId) : ("site:" + slugify(siteUrl) + ":" + slugify(campName));

          var seasonYear = null;
          if (lc(sportName) === "football") {
            seasonYear = computeSeasonYearFootball(startDate);
          } else {
            var y = startDate.match(/^(\d{4})-/);
            seasonYear = y && y[1] ? Number(y[1]) : null;
          }
          if (!isFinite(seasonYear)) seasonYear = null;

          var eventKey = buildEventKey("sportsusa", programId, startDate, regUrl);
          var runIso = new Date().toISOString();

          var payload = {
            school_id: schoolId,
            sport_id: sportId,
            camp_name: campName,
            start_date: startDate,
            end_date: endDate || null,
            city: null,
            state: null,
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
