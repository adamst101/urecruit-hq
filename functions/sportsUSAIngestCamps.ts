// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Updates in v3:
// - Better date parsing from title/body patterns like:
//   "February 21st - 22nd", "June 12th-13th", "Feb 3rd", etc.
// - Returns start_date + end_date when possible
// - Still editor-safe (no optional chaining, no external imports)

const VERSION = "sportsUSAIngestCamps_2026-02-03_v3_parse_monthname_dates_editor_safe";

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
  if (s.indexOf("register.ryzer.com/camp.cfm") >= 0 && s.indexOf("id=") >= 0) return true;
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

function extractLikelyIndexLinks(html, baseUrl) {
  var hrefs = extractHrefs(html);
  var out = [];
  for (var i = 0; i < hrefs.length; i++) {
    var raw = hrefs[i];
    var u = absUrl(baseUrl, raw);
    if (!u) continue;

    var s = lc(u);
    if (s.indexOf("mailto:") === 0) continue;
    if (s.indexOf("javascript:") === 0) continue;

    try {
      var b = new URL(baseUrl);
      var x = new URL(u);
      if (x.host && b.host && x.host !== b.host) continue;
    } catch (e) {
      // ignore
    }

    if (
      s.indexOf("camps") >= 0 ||
      s.indexOf("camp.cfm") >= 0 ||
      (s.indexOf("camp") >= 0 && s.indexOf("id=") < 0) ||
      s.indexOf("events") >= 0 ||
      s.indexOf("registration") >= 0 ||
      s.indexOf("register") >= 0 ||
      s.indexOf("clinics") >= 0
    ) {
      out.push(u);
    }
  }
  return uniq(out).slice(0, 12);
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Return YYYY-MM-DD (UTC) or null
function toISODateFromParts(year, month1to12, day1to31) {
  if (!year || !month1to12 || !day1to31) return null;
  var yyyy = String(year);
  var mm = String(month1to12).padStart(2, "0");
  var dd = String(day1to31).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

function computeSeasonYearFootball(startDateISO) {
  if (!startDateISO) return null;
  var d = new Date(startDateISO + "T00:00:00.000Z");
  if (isNaN(d.getTime())) return null;

  var y = d.getUTCFullYear();
  var feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
  return d >= feb1 ? y : y - 1;
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

function extractTitleFromHtml(html) {
  if (!html) return null;
  var m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  if (m && m[1] !== undefined) return stripNonAscii(m[1]);
  var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1 && h1[1] !== undefined) return stripNonAscii(h1[1].replace(/<[^>]+>/g, " "));
  return null;
}

function monthToNum(m) {
  var s = lc(m || "");
  if (s.indexOf("jan") === 0) return 1;
  if (s.indexOf("feb") === 0) return 2;
  if (s.indexOf("mar") === 0) return 3;
  if (s.indexOf("apr") === 0) return 4;
  if (s.indexOf("may") === 0) return 5;
  if (s.indexOf("jun") === 0) return 6;
  if (s.indexOf("jul") === 0) return 7;
  if (s.indexOf("aug") === 0) return 8;
  if (s.indexOf("sep") === 0) return 9;
  if (s.indexOf("oct") === 0) return 10;
  if (s.indexOf("nov") === 0) return 11;
  if (s.indexOf("dec") === 0) return 12;
  return null;
}

// Extract date range from strings like:
// "February 21st - 22nd", "June 12th-13th", "Feb 3rd", "March 1 - 2"
function extractMonthNameDateRange(text) {
  var t = stripNonAscii(text || "");
  if (!t) return { start: null, end: null, raw: null };

  // Look for "Month D{suffix} - D{suffix}" (same month)
  var reRange = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*(\d{1,2})(?:st|nd|rd|th)?\b/i;
  var m = reRange.exec(t);
  if (m) {
    var mon = monthToNum(m[1]);
    var d1 = parseInt(m[2], 10);
    var d2 = parseInt(m[3], 10);
    if (mon && d1 && d2) {
      return { start: { mon: mon, day: d1 }, end: { mon: mon, day: d2 }, raw: m[0] };
    }
  }

  // Look for "Month D{suffix}" single
  var reSingle = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
  var m2 = reSingle.exec(t);
  if (m2) {
    var mon2 = monthToNum(m2[1]);
    var d = parseInt(m2[2], 10);
    if (mon2 && d) {
      return { start: { mon: mon2, day: d }, end: null, raw: m2[0] };
    }
  }

  return { start: null, end: null, raw: null };
}

function inferYearFromHtmlOrNow(html) {
  // Try to find a 4-digit year in the page, otherwise use current year.
  var y = null;
  if (html) {
    var m = /\b(20\d{2})\b/.exec(html);
    if (m && m[1]) y = parseInt(m[1], 10);
  }
  if (!y) {
    y = new Date().getUTCFullYear();
  }
  return y;
}

function deriveDatesFromTitleAndHtml(title, html) {
  var year = inferYearFromHtmlOrNow(html);

  // 1) title
  var fromTitle = extractMonthNameDateRange(title || "");
  if (fromTitle && fromTitle.start) {
    var startISO = toISODateFromParts(year, fromTitle.start.mon, fromTitle.start.day);
    var endISO = null;
    if (fromTitle.end) endISO = toISODateFromParts(year, fromTitle.end.mon, fromTitle.end.day);
    return { start_date: startISO, end_date: endISO, raw: fromTitle.raw || title };
  }

  // 2) body: common "Dates:" labels
  var snippet = stripNonAscii(html || "");
  if (snippet) {
    // search a smaller window to avoid noise
    var small = snippet.slice(0, 6000);

    var fromBody = extractMonthNameDateRange(small);
    if (fromBody && fromBody.start) {
      var s2 = toISODateFromParts(year, fromBody.start.mon, fromBody.start.day);
      var e2 = null;
      if (fromBody.end) e2 = toISODateFromParts(year, fromBody.end.mon, fromBody.end.day);
      return { start_date: s2, end_date: e2, raw: fromBody.raw || null };
    }
  }

  return { start_date: null, end_date: null, raw: null };
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

    var maxSites = Number(body && body.maxSites !== undefined ? body.maxSites : 5);
    var maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 5);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 25);

    var testSiteUrl = safeString(body && body.testSiteUrl);
    var testSchoolId = safeString(body && body.testSchoolId);

    if (!sportId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (testSiteUrl) {
      sites = [
        {
          school_id: testSchoolId || null,
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
        var r = await fetch(campSiteUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
            Accept: "text/html,*/*",
          },
        });

        siteDbg.http = r.status;
        siteDbg.htmlType = r.headers.get("content-type") || "";

        var html = await r.text();
        siteDbg.htmlSnippet = truncate(html, 1200);

        if (!r.ok) {
          siteDbg.notes.push("non_200_fetch");
          debug.site_debug.push(siteDbg);
          processedSites += 1;
          continue;
        }

        var regLinks = extractRegLinksFromHtml(html, campSiteUrl);

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
              // ignore per-page
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

            // ✅ improved date derivation
            var d = deriveDatesFromTitleAndHtml(regTitle, regHtml);
            var startISO = d && d.start_date ? d.start_date : null;
            var endISO = d && d.end_date ? d.end_date : null;
            var datesRaw = d && d.raw ? d.raw : null;

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

              camp_name: regTitle,
              start_date: startISO,
              end_date: endISO,

              city: null,
              state: null,

              season_year: seasonYear,
              program_id: programId,
              event_key: eventKey,
              source_platform: "sportsusa",
              source_url: regUrl,
              last_seen_at: new Date().toISOString(),
              content_hash: simpleHash({ campSiteUrl: campSiteUrl, regUrl: regUrl, title: regTitle, start: startISO, end: endISO }),

              event_dates_raw: datesRaw,
              grades_raw: null,
              register_by_raw: null,
              price_raw: null,
              price_min: null,
              price_max: null,
              sections_json: null,

              debug: {
                reg_title: regTitle,
                derived_start: startISO,
                derived_end: endISO,
                derived_raw: datesRaw,
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
