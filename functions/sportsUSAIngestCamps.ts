// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Given a list of SchoolSportSite rows (school_id, sport_id, camp_site_url),
//   fetch each camp site and discover Ryzer registration links.
// - For each registration link (register.ryzer.com/camp.cfm?id=####), fetch the page
//   and extract basic fields needed for CampDemo staging.
//
// Key updates:
// - Editor-safe (no optional chaining, no external imports)
// - Supports testSiteUrl (even if not in SchoolSportSite) for DRY RUN
// - Two-step reg link discovery:
//   A) direct links on homepage
//   B) fallback: crawl 1 level deep into likely pages (camps, camp.cfm, registration, events)
//
// Returns: accepted[] events (normalized) + debug per site.

const VERSION = "sportsUSAIngestCamps_2026-02-03_v2_reglink_discovery_plus_test_url_editor_safe";

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

function uniq(list) {
  var out = [];
  var seen = {};
  for (var i = 0; i < list.length; i++) {
    var v = list[i];
    if (!v) continue;
    if (seen[v]) continue;
    seen[v] = true;
    out.push(v);
  }
  return out;
}

function extractHrefs(html) {
  var out = [];
  if (!html) return out;

  var re = /<a[^>]*href="([^"]+)"[^>]*>/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] !== undefined) out.push(stripNonAscii(m[1]));
  }
  return out;
}

function looksLikeRegUrl(u) {
  var s = lc(u || "");
  if (!s) return false;
  // Ryzer canonical
  if (s.indexOf("register.ryzer.com/camp.cfm") >= 0 && s.indexOf("id=") >= 0) return true;

  // Some sites include register.ryzer.com links with extra params
  if (s.indexOf("register.ryzer.com") >= 0 && s.indexOf("camp.cfm") >= 0 && s.indexOf("id=") >= 0) return true;

  return false;
}

function extractRegLinksFromHtml(html, baseUrl) {
  var hrefs = extractHrefs(html);
  var out = [];
  for (var i = 0; i < hrefs.length; i++) {
    var u = absUrl(baseUrl, hrefs[i]);
    if (u && looksLikeRegUrl(u)) out.push(u);
  }
  return uniq(out);
}

// One-level crawl candidates
function extractLikelyIndexLinks(html, baseUrl) {
  var hrefs = extractHrefs(html);
  var out = [];
  for (var i = 0; i < hrefs.length; i++) {
    var raw = hrefs[i];
    var u = absUrl(baseUrl, raw);
    if (!u) continue;

    var s = lc(u);
    // avoid external noise and mailto/js
    if (s.indexOf("mailto:") === 0) continue;
    if (s.indexOf("javascript:") === 0) continue;

    // keep on same host if possible
    try {
      var b = new URL(baseUrl);
      var x = new URL(u);
      if (x.host && b.host && x.host !== b.host) continue;
    } catch (e) {
      // ignore
    }

    // likely pages where reg links live
    if (
      s.indexOf("camps") >= 0 ||
      s.indexOf("camp.cfm") >= 0 ||
      s.indexOf("camp") >= 0 && s.indexOf("id=") < 0 || // index pages often include "camp" but not camp.cfm?id
      s.indexOf("events") >= 0 ||
      s.indexOf("registration") >= 0 ||
      s.indexOf("register") >= 0 ||
      s.indexOf("clinics") >= 0
    ) {
      out.push(u);
    }
  }
  return uniq(out).slice(0, 12); // keep bounded
}

function safeJsonParseMaybe(s) {
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

function computeSeasonYearFootball(startDateISO) {
  if (!startDateISO) return null;
  var d = new Date(startDateISO + "T00:00:00.000Z");
  if (isNaN(d.getTime())) return null;

  var y = d.getUTCFullYear();
  var feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0)); // Feb 1 UTC
  return d >= feb1 ? y : y - 1;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Return YYYY-MM-DD (UTC) or null
function toISODate(dateInput) {
  if (!dateInput) return null;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  if (typeof dateInput === "string") {
    var s = dateInput.trim();
    var mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      var mm = String(mdy[1]).padStart(2, "0");
      var dd = String(mdy[2]).padStart(2, "0");
      var yyyy = String(mdy[3]);
      return yyyy + "-" + mm + "-" + dd;
    }
  }

  var d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  var yyyy2 = d.getUTCFullYear();
  var mm2 = String(d.getUTCMonth() + 1).padStart(2, "0");
  var dd2 = String(d.getUTCDate()).padStart(2, "0");
  return yyyy2 + "-" + mm2 + "-" + dd2;
}

// Extract camp name from registration HTML
function extractTitleFromHtml(html) {
  if (!html) return null;
  var m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  if (m && m[1] !== undefined) return stripNonAscii(m[1]);
  var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1 && h1[1] !== undefined) return stripNonAscii(h1[1].replace(/<[^>]+>/g, " "));
  return null;
}

// Try to find first date in HTML, like 02/15/2026 or 2/15/2026
function extractFirstMDY(html) {
  if (!html) return null;
  var m = /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/.exec(html);
  if (m && m[1] !== undefined) return m[1];
  return null;
}

// Simple stable hash (not cryptographic)
function simpleHash(obj) {
  var str = typeof obj === "string" ? obj : JSON.stringify(obj || {});
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return "h" + String(Math.abs(h));
}

Deno.serve(async (req) => {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    notes: [],
    site_debug: [],
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    var body = await req.json().catch(function () {
      return null;
    });

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var sites = asArray(body && body.sites);

    // Limits
    var dryRun = !!(body && body.dryRun);
    var maxSites = Number(body && body.maxSites !== undefined ? body.maxSites : 5);
    var maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 5);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 25);

    // Test mode
    var testSiteUrl = safeString(body && body.testSiteUrl);
    var testSchoolId = safeString(body && body.testSchoolId);

    if (!sportId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // If testSiteUrl provided, override sites list with single synthetic site
    if (testSiteUrl) {
      sites = [
        {
          school_id: testSchoolId || null, // may be null for DRY RUN
          sport_id: sportId,
          camp_site_url: testSiteUrl,
        },
      ];
      maxSites = 1;
      debug.notes.push("testSiteUrl provided: running single-site mode");
    }

    var accepted = [];
    var rejected = [];
    var errors = [];

    var processedSites = 0;
    var processedRegs = 0;

    // pick sites to process
    var picked = [];
    for (var i = 0; i < sites.length; i++) {
      if (picked.length >= maxSites) break;
      var row = sites[i] || {};
      var u = safeString(row.camp_site_url || row.site_url || row.url);
      if (!u) continue;
      picked.push(row);
    }

    for (var si = 0; si < picked.length; si++) {
      if (accepted.length >= maxEvents) break;

      var siteRow = picked[si] || {};
      var schoolId = safeString(siteRow.school_id);
      var campSiteUrl = safeString(siteRow.camp_site_url || siteRow.site_url || siteRow.url);

      var siteDbg = {
        school_id: schoolId || null,
        site_url: campSiteUrl || null,
        http: null,
        htmlType: null,
        regLinks: 0,
        regLinksSample: "",
        notes: [],
        crawledPages: [],
        htmlSnippet: null,
      };

      if (!campSiteUrl) {
        siteDbg.notes.push("missing_site_url");
        debug.site_debug.push(siteDbg);
        continue;
      }

      try {
        // Fetch site home
        var r = await fetch(campSiteUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
            Accept: "text/html,*/*",
          },
        });

        siteDbg.http = r.status;

        var ctype = r.headers.get("content-type") || "";
        siteDbg.htmlType = ctype;

        var html = await r.text();
        siteDbg.htmlSnippet = truncate(html, 1200);

        if (!r.ok) {
          siteDbg.notes.push("non_200_fetch");
          debug.site_debug.push(siteDbg);
          processedSites += 1;
          continue;
        }

        // Step A: direct reg links on homepage
        var regLinks = extractRegLinksFromHtml(html, campSiteUrl);

        // Step B: 1-level crawl into likely pages
        if (!regLinks.length) {
          var likelyPages = extractLikelyIndexLinks(html, campSiteUrl);
          siteDbg.crawledPages = likelyPages.slice(0);

          for (var pi = 0; pi < likelyPages.length; pi++) {
            if (regLinks.length >= maxRegsPerSite) break;

            var pageUrl = likelyPages[pi];
            try {
              var r2 = await fetch(pageUrl, {
                method: "GET",
                headers: {
                  "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
                  Accept: "text/html,*/*",
                },
              });
              if (!r2.ok) continue;
              var html2 = await r2.text();
              var found = extractRegLinksFromHtml(html2, pageUrl);
              for (var fi = 0; fi < found.length; fi++) {
                if (regLinks.length >= maxRegsPerSite) break;
                regLinks.push(found[fi]);
              }
              regLinks = uniq(regLinks);
            } catch (e2) {
              // ignore crawl errors per page
            }
          }
        }

        regLinks = uniq(regLinks).slice(0, maxRegsPerSite);

        siteDbg.regLinks = regLinks.length;
        siteDbg.regLinksSample = regLinks.length ? regLinks[0] : "";

        if (!regLinks.length) {
          siteDbg.notes.push("no_registration_links_found");
          debug.site_debug.push(siteDbg);
          processedSites += 1;
          continue;
        }

        // For each reg link: fetch registration page and parse basics
        for (var ri = 0; ri < regLinks.length; ri++) {
          if (accepted.length >= maxEvents) break;

          var regUrl = regLinks[ri];
          processedRegs += 1;

          try {
            var rr = await fetch(regUrl, {
              method: "GET",
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
                Accept: "text/html,*/*",
              },
            });

            if (!rr.ok) {
              rejected.push({ reason: "reg_fetch_failed", url: regUrl, http: rr.status, site: campSiteUrl });
              continue;
            }

            var regHtml = await rr.text();
            var regTitle = extractTitleFromHtml(regHtml) || "Camp";
            var firstDate = extractFirstMDY(regHtml);
            var startISO = firstDate ? toISODate(firstDate) : null;

            // If we can't find a date, still return it (many sites post details late),
            // but mark needs_review and let AdminImport decide whether to write.
            var seasonYear = startISO ? computeSeasonYearFootball(startISO) : null;

            var programId = "sportsusa:" + slugify(campSiteUrl) + ":" + slugify(regTitle);
            var discriminator = regUrl;
            var eventKey = "sportsusa:" + programId + ":" + (startISO || "na") + ":" + discriminator;

            accepted.push({
              school_id: schoolId || null,
              sport_id: sportId,
              sport_name: sportName,
              camp_site_url: campSiteUrl,
              registration_url: regUrl,

              // normalized event-ish fields
              camp_name: regTitle,
              start_date: startISO,
              end_date: null,

              city: null,
              state: null,

              // staging metadata
              season_year: seasonYear,
              program_id: programId,
              event_key: eventKey,
              source_platform: "sportsusa",
              source_url: regUrl,
              last_seen_at: new Date().toISOString(),
              content_hash: simpleHash({ campSiteUrl: campSiteUrl, regUrl: regUrl, title: regTitle, start: startISO }),

              // raw/debug
              event_dates_raw: firstDate || null,
              grades_raw: null,
              register_by_raw: null,
              price_raw: null,
              price_min: null,
              price_max: null,
              sections_json: null,

              debug: {
                reg_title: regTitle,
                first_date_mdy: firstDate || null,
                reg_html_snippet: truncate(regHtml, 800),
              },
            });
          } catch (e3) {
            errors.push({ error: String((e3 && e3.message) || e3), url: regUrl, site: campSiteUrl });
          }
        }

        debug.site_debug.push(siteDbg);
        processedSites += 1;
      } catch (e1) {
        siteDbg.notes.push("site_fetch_exception");
        errors.push({ error: String((e1 && e1.message) || e1), site: campSiteUrl });
        debug.site_debug.push(siteDbg);
        processedSites += 1;
      }
    }

    return new Response(
      JSON.stringify({
        stats: {
          processedSites: processedSites,
          processedRegs: processedRegs,
          accepted: accepted.length,
          rejected: rejected.length,
          errors: errors.length,
        },
        version: VERSION,
        debug: debug,
        accepted: accepted,
        rejected_samples: rejected.slice(0, 25),
        errors: errors.slice(0, 10),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    debug.notes.push("top-level error: " + String((e && e.message) || e));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
