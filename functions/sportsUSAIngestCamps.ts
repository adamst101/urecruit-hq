// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Given SchoolSportSite rows (camp_site_url per school), fetch each camp site
// - Extract registration links (primarily register.ryzer.com/camp.cfm?id=...)
// - Fetch each registration page and parse best-effort camp details
// - Return accepted events + rich debug so AdminImport can write to CampDemo
//
// Editor-safe:
// - No optional chaining
// - No external imports
//
// Version: adds deep per-site diagnostics so you can see exactly why processedRegs=0.

const VERSION = "sportsUSAIngestCamps_2026-02-03_v1_deep_debug_editor_safe";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

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

function truncate(s, n) {
  var str = String(s || "");
  var lim = n || 1600;
  return str.length > lim ? str.slice(0, lim) + "…(truncated)" : str;
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function simpleHash(str) {
  var v = typeof str === "string" ? str : JSON.stringify(str || {});
  var h = 0;
  for (var i = 0; i < v.length; i++) {
    h = (h << 5) - h + v.charCodeAt(i);
    h |= 0;
  }
  return "h" + Math.abs(h);
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

function isProbablyHtml(text) {
  var t = String(text || "");
  return t.indexOf("<html") >= 0 || t.indexOf("<!DOCTYPE") >= 0 || t.indexOf("<body") >= 0;
}

// Extract registration links from a camp-site home page.
// We look for:
// - https://register.ryzer.com/camp.cfm?id=123456
// - //register.ryzer.com/camp.cfm?id=123456
// - camp.cfm?id=123456 (relative or embedded in scripts)
function extractRegistrationLinksFromCampSite(html, baseUrl, maxLinks) {
  var out = [];
  if (!html) return out;

  var seen = {};
  var max = maxLinks || 50;

  // Broad match for camp.cfm?id=digits (captures embedded JS too)
  var re = /(?:https?:\/\/|\/\/)?register\.ryzer\.com\/camp\.cfm\?[^"'\s<>]*id=(\d+)/gi;
  var m;

  while ((m = re.exec(html)) !== null) {
    if (out.length >= max) break;
    var id = m[1];
    if (!id) continue;
    var url = "https://register.ryzer.com/camp.cfm?id=" + id + "&ryzer=1";
    if (!seen[url]) {
      seen[url] = true;
      out.push(url);
    }
  }

  // Fallback: camp.cfm?id=digits anywhere (may be without domain)
  var re2 = /camp\.cfm\?[^"'\s<>]*id=(\d+)/gi;
  while ((m = re2.exec(html)) !== null) {
    if (out.length >= max) break;
    var id2 = m[1];
    if (!id2) continue;
    var url2 = "https://register.ryzer.com/camp.cfm?id=" + id2 + "&ryzer=1";
    if (!seen[url2]) {
      seen[url2] = true;
      out.push(url2);
    }
  }

  // Also capture explicit anchors that might be relative (rare)
  var hrefRe = /<a[^>]*href="([^"]+)"[^>]*>/gi;
  while ((m = hrefRe.exec(html)) !== null) {
    if (out.length >= max) break;
    var href = m[1];
    var abs = absUrl(baseUrl, href);
    if (!abs) continue;
    if (lc(abs).indexOf("camp.cfm") >= 0 && lc(abs).indexOf("id=") >= 0) {
      // Normalize to register.ryzer format if possible
      var idMatch = /id=(\d+)/i.exec(abs);
      if (idMatch && idMatch[1]) {
        var url3 = "https://register.ryzer.com/camp.cfm?id=" + idMatch[1] + "&ryzer=1";
        if (!seen[url3]) {
          seen[url3] = true;
          out.push(url3);
        }
      }
    }
  }

  return out;
}

// Parse a registration page HTML for best-effort fields.
function parseRegistrationPage(html) {
  var t = String(html || "");
  var title = null;

  // Title tag
  var m = /<title[^>]*>([^<]+)<\/title>/i.exec(t);
  if (m && m[1]) title = stripNonAscii(m[1]);

  // Sometimes the real camp name is in H1
  var h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(t);
  if (h1 && h1[1]) {
    var h1Text = stripNonAscii(h1[1].replace(/<[^>]+>/g, " "));
    if (h1Text && h1Text.length >= 4) title = h1Text;
  }

  // Dates: grab first MM/DD/YYYY and try to detect range
  var dateRe = /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g;
  var dates = [];
  var dm;
  while ((dm = dateRe.exec(t)) !== null) {
    if (dates.length >= 6) break;
    dates.push(dm[1]);
  }

  // Raw dates snippet (small window around first date)
  var event_dates_raw = null;
  if (dates.length) {
    var idx = t.indexOf(dates[0]);
    if (idx >= 0) {
      var start = idx - 60;
      var end = idx + 120;
      if (start < 0) start = 0;
      if (end > t.length) end = t.length;
      event_dates_raw = stripNonAscii(t.slice(start, end));
    }
  }

  // Grades (best effort)
  var grades_raw = null;
  var g = /Grades[^<]{0,40}<\/?[^>]*>\s*([^<]{1,80})/i.exec(t);
  if (g && g[1]) grades_raw = stripNonAscii(g[1]);

  // Location (very best-effort)
  var loc = null;
  var locM = /Location[^<]{0,40}<\/?[^>]*>\s*([^<]{1,120})/i.exec(t);
  if (locM && locM[1]) loc = stripNonAscii(locM[1]);

  return {
    camp_name: title ? title.replace(/\s*\|\s*Ryzer.*$/i, "").trim() : null,
    dates: dates,
    event_dates_raw: event_dates_raw,
    grades_raw: grades_raw,
    location_raw: loc,
  };
}

// Convert MM/DD/YYYY to YYYY-MM-DD
function toISODateFromMDY(mdy) {
  var s = safeString(mdy);
  if (!s) return null;
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  var mm = String(m[1]).padStart(2, "0");
  var dd = String(m[2]).padStart(2, "0");
  var yyyy = String(m[3]);
  return yyyy + "-" + mm + "-" + dd;
}

// Football rollover: Feb 1 UTC
function computeSeasonYearFootball(startIso) {
  if (!startIso) return null;
  var d = new Date(startIso + "T00:00:00.000Z");
  if (isNaN(d.getTime())) return null;

  var y = d.getUTCFullYear();
  var feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
  return d >= feb1 ? y : y - 1;
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

    var body = await req.json().catch(function () {
      return null;
    });

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var dryRun = !!(body && body.dryRun);

    var maxSites = Number(body && body.maxSites !== undefined ? body.maxSites : 10);
    var maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 10);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 200);

    var sites = asArray(body && body.sites);

    if (!sportId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!sites.length) {
      return new Response(
        JSON.stringify({
          stats: { processedSites: 0, processedRegs: 0, accepted: 0, rejected: 0, errors: 0 },
          debug: debug,
          accepted: [],
          rejected: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Core outputs
    var accepted = [];
    var rejected = [];
    var errors = [];

    var processedSites = 0;
    var processedRegs = 0;

    var seenEventKey = {};

    for (var i = 0; i < sites.length; i++) {
      if (processedSites >= maxSites) break;
      if (accepted.length >= maxEvents) break;

      var s = sites[i] || {};
      var school_id = safeString(s.school_id);
      var camp_site_url = safeString(s.camp_site_url || s.site_url || s.view_site_url);
      var logo_url = safeString(s.logo_url);

      if (!school_id || !camp_site_url) {
        rejected.push({ reason: "missing_school_or_site_url", school_id: school_id, camp_site_url: camp_site_url });
        continue;
      }

      var siteDebug = {
        school_id: school_id,
        camp_site_url: camp_site_url,
        http: null,
        htmlLooksLike: null,
        foundRegLinks: 0,
        regLinksSample: [],
        notes: [],
        snippet: null,
      };

      try {
        var r = await fetch(camp_site_url, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
            Accept: "text/html,*/*",
          },
          redirect: "follow",
        });

        siteDebug.http = r.status;

        var html = await r.text().catch(function () {
          return "";
        });

        siteDebug.htmlLooksLike = isProbablyHtml(html) ? "html" : "non_html";
        siteDebug.snippet = truncate(html, 900);

        if (!r.ok) {
          siteDebug.notes.push("non_200_fetch");
          debug.sites.push(siteDebug);
          processedSites += 1;
          continue;
        }

        var regLinks = extractRegistrationLinksFromCampSite(html, camp_site_url, maxRegsPerSite);

        siteDebug.foundRegLinks = regLinks.length;
        siteDebug.regLinksSample = regLinks.slice(0, 5);

        // If no links, we still record debug so you can see whether HTML is empty / JS-driven.
        if (!regLinks.length) {
          siteDebug.notes.push("no_registration_links_found");
          debug.sites.push(siteDebug);
          processedSites += 1;
          continue;
        }

        // Parse each registration link
        for (var j = 0; j < regLinks.length; j++) {
          if (accepted.length >= maxEvents) break;

          var regUrl = regLinks[j];
          processedRegs += 1;

          try {
            var rr = await fetch(regUrl, {
              method: "GET",
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
                Accept: "text/html,*/*",
              },
              redirect: "follow",
            });

            var regHtml = await rr.text().catch(function () {
              return "";
            });

            if (!rr.ok) {
              rejected.push({ reason: "registration_fetch_failed", school_id: school_id, url: regUrl, http: rr.status });
              continue;
            }

            var parsed = parseRegistrationPage(regHtml);
            var camp_name = safeString(parsed.camp_name) || "Camp";

            // start/end date from first 1-2 dates found
            var start_date = parsed.dates && parsed.dates.length ? toISODateFromMDY(parsed.dates[0]) : null;
            var end_date = null;
            if (parsed.dates && parsed.dates.length >= 2) {
              end_date = toISODateFromMDY(parsed.dates[1]);
            }

            // If we can't find a date, reject (you require start_date)
            if (!start_date) {
              rejected.push({
                reason: "missing_start_date",
                school_id: school_id,
                url: regUrl,
                camp_name: camp_name,
                event_dates_raw: parsed.event_dates_raw,
              });
              continue;
            }

            var season_year = computeSeasonYearFootball(start_date);

            var program_id = "sportsusa:" + String(school_id) + ":" + slugify(camp_name);
            var event_key = "sportsusa:" + program_id + ":" + start_date + ":" + lc(regUrl);

            if (seenEventKey[event_key]) continue;
            seenEventKey[event_key] = true;

            accepted.push({
              school_id: school_id,
              sport_id: sportId,
              camp_name: camp_name,
              start_date: start_date,
              end_date: end_date,
              city: null,
              state: null,
              position_ids: [],
              price: null,
              link_url: regUrl,
              notes: null,

              season_year: season_year,
              program_id: program_id,
              event_key: event_key,
              source_platform: "sportsusa",
              source_url: camp_site_url,
              last_seen_at: new Date().toISOString(),
              content_hash: simpleHash({
                school_id: school_id,
                camp_name: camp_name,
                start_date: start_date,
                end_date: end_date,
                link_url: regUrl,
                source_url: camp_site_url,
              }),

              event_dates_raw: safeString(parsed.event_dates_raw),
              grades_raw: safeString(parsed.grades_raw),
              register_by_raw: null,
              price_raw: null,
              price_min: null,
              price_max: null,
              sections_json: null,

              // not part of CampDemo schema, but useful to bubble up
              _logo_url_hint: logo_url,
            });
          } catch (e2) {
            errors.push({ reason: "registration_exception", school_id: school_id, url: regUrl, error: String((e2 && e2.message) || e2) });
          }
        }

        debug.sites.push(siteDebug);
        processedSites += 1;
      } catch (e) {
        siteDebug.notes.push("exception_fetch_site:" + String((e && e.message) || e));
        debug.sites.push(siteDebug);
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
          dryRun: dryRun,
          maxSites: maxSites,
          maxRegsPerSite: maxRegsPerSite,
          maxEvents: maxEvents,
        },
        debug: debug,
        accepted: dryRun ? accepted.slice(0, 25) : accepted,
        rejected_samples: rejected.slice(0, 25),
        errors: errors.slice(0, 10),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (eTop) {
    debug.notes.push("top-level error: " + String((eTop && eTop.message) || eTop));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
