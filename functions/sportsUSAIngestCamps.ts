// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - For each SchoolSportSite.camp_site_url:
//   - Fetch the camp site HTML (e.g., https://www.hardingfootballcamps.com/)
//   - Parse the event listing table and extract rows that contain register.ryzer.com links
//   - Return normalized "events" list to AdminImport (AdminImport writes CampDemo)
//
// Editor-safe:
// - No optional chaining
// - No external imports
// - Regex-based parsing
//
// Version notes:
// - v2 parses <tr> rows that contain register.ryzer.com/camp.cfm?id=...
// - v2 also attempts to extract City/State from <title> "... | City, ST"

const VERSION = "sportsUSAIngestCamps_2026-02-03_v2_row_parser_editor_safe";

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

function textContent(html) {
  // Very small HTML -> text helper (good enough for table cells)
  var s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&#39;/gi, "'");
  s = s.replace(/\s+/g, " ");
  return stripNonAscii(s);
}

function extractTitle(html) {
  var m = /<title[^>]*>([^<]+)<\/title>/i.exec(String(html || ""));
  return m && m[1] ? stripNonAscii(m[1]) : null;
}

function extractCityStateFromTitle(title) {
  // Example: "Walt Wells Football Camps | Eastern Kentucky University | Richmond, KY"
  var t = safeString(title);
  if (!t) return { city: null, state: null };
  var parts = t.split("|").map(function (x) {
    return stripNonAscii(x);
  });
  if (!parts.length) return { city: null, state: null };

  var last = stripNonAscii(parts[parts.length - 1] || "");
  var m = /([^,]+),\s*([A-Z]{2})\b/.exec(last);
  if (m && m[1] && m[2]) {
    return { city: stripNonAscii(m[1]), state: stripNonAscii(m[2]) };
  }
  return { city: null, state: null };
}

function extractRegisterLinks(html) {
  // Find ALL register.ryzer.com camp registration links
  // We capture href and later use table row parsing to get metadata.
  var out = [];
  var re = /<a[^>]*href="([^"]*register\.ryzer\.com[^"]*)"[^>]*>/gi;
  var m;
  while ((m = re.exec(String(html || ""))) !== null) {
    if (m[1]) out.push(m[1]);
  }
  // Dedup
  var uniq = {};
  var dedup = [];
  for (var i = 0; i < out.length; i++) {
    var u = stripNonAscii(out[i]);
    if (!u) continue;
    if (!uniq[u]) {
      uniq[u] = true;
      dedup.push(u);
    }
  }
  return dedup;
}

function parseEventRowsFromHtml(html, siteUrl, maxRegsPerSite) {
  var events = [];
  var s = String(html || "");

  // Pull all table rows and keep those containing register.ryzer.com
  var trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  var m;
  while ((m = trRe.exec(s)) !== null) {
    var rowHtml = m[1] || "";
    if (rowHtml.toLowerCase().indexOf("register.ryzer.com") === -1) continue;

    // registration link
    var hrefM = /<a[^>]*href="([^"]*register\.ryzer\.com[^"]*)"[^>]*>\s*Register\s*<\/a>/i.exec(rowHtml);
    if (!hrefM || !hrefM[1]) {
      // fallback: any anchor with register.ryzer.com
      var hrefM2 = /<a[^>]*href="([^"]*register\.ryzer\.com[^"]*)"[^>]*>/i.exec(rowHtml);
      if (hrefM2 && hrefM2[1]) hrefM = hrefM2;
    }
    var regUrl = hrefM && hrefM[1] ? absUrl(siteUrl, hrefM[1]) : null;

    // Extract TD cells in order
    var tds = [];
    var tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    var tdM;
    while ((tdM = tdRe.exec(rowHtml)) !== null) {
      tds.push(stripNonAscii(textContent(tdM[1] || "")));
    }

    // Expected columns (often):
    // [0]=Event Name, [1]=Dates, [2]=Grades, [3]=Cost, [4]=Register (ignored)
    var campName = tds.length > 0 ? safeString(tds[0]) : null;
    var dateRaw = tds.length > 1 ? safeString(tds[1]) : null;
    var gradesRaw = tds.length > 2 ? safeString(tds[2]) : null;
    var priceRaw = tds.length > 3 ? safeString(tds[3]) : null;

    // Some sites have extra columns; keep best effort
    if (!campName) continue;

    events.push({
      camp_name: campName,
      event_dates_raw: dateRaw,
      grades_raw: gradesRaw,
      price_raw: priceRaw,
      link_url: regUrl,
    });

    if (maxRegsPerSite && events.length >= maxRegsPerSite) break;
  }

  return events;
}

Deno.serve(async (req) => {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    notes: [],
    siteDebug: [],
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

    var maxSites = Number(body && body.maxSites !== undefined ? body.maxSites : 5);
    var maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 5);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 25);

    // Input sites array: [{ school_id, camp_site_url, logo_url, source_key }]
    var sites = body && body.sites ? body.sites : [];

    // Optional: force a single test site
    var testSiteUrl = safeString(body && body.testSiteUrl);
    var testSchoolId = safeString(body && body.testSchoolId);

    if (!sportId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    var filteredSites = [];

    if (testSiteUrl) {
      if (!testSchoolId) {
        return new Response(
          JSON.stringify({
            error: "Missing required when testSiteUrl provided: testSchoolId",
            debug: debug,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
      filteredSites = [
        {
          school_id: testSchoolId,
          camp_site_url: testSiteUrl,
        },
      ];
      debug.notes.push("Using testSiteUrl override");
    } else {
      // Normal mode: use sites list
      for (var i = 0; i < sites.length; i++) {
        var row = sites[i] || {};
        var sid = safeString(row.school_id);
        var url = safeString(row.camp_site_url);
        if (!sid || !url) continue;
        filteredSites.push({ school_id: sid, camp_site_url: url });
      }
    }

    // Bound maxSites
    if (maxSites && filteredSites.length > maxSites) {
      filteredSites = filteredSites.slice(0, maxSites);
    }

    var accepted = [];
    var rejected = [];
    var errors = [];

    var processedSites = 0;
    var processedRegs = 0;

    for (var sidx = 0; sidx < filteredSites.length; sidx++) {
      if (accepted.length >= maxEvents) break;

      var site = filteredSites[sidx];
      var schoolId = safeString(site.school_id);
      var siteUrl = safeString(site.camp_site_url);

      processedSites += 1;

      if (!schoolId || !siteUrl) continue;

      var http = 0;
      var html = "";
      var title = null;

      try {
        var r = await fetch(siteUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
            Accept: "text/html,*/*",
          },
        });

        http = r.status;
        html = await r.text();

        title = extractTitle(html);
        var loc = extractCityStateFromTitle(title);

        if (!r.ok) {
          errors.push({ school_id: schoolId, site_url: siteUrl, http: http, error: "Fetch failed" });
          debug.siteDebug.push({
            school_id: schoolId,
            site_url: siteUrl,
            http: http,
            regLinks: 0,
            eventsParsed: 0,
            notes: "non_200_fetch",
          });
          continue;
        }

        // Parse events from table rows
        var events = parseEventRowsFromHtml(html, siteUrl, maxRegsPerSite);

        // Track reg links found (raw)
        var regLinks = extractRegisterLinks(html);

        debug.siteDebug.push({
          school_id: schoolId,
          site_url: siteUrl,
          http: http,
          pageTitle: title,
          city: loc.city,
          state: loc.state,
          regLinks: regLinks.length,
          eventsParsed: events.length,
          sampleRegLink: regLinks.length ? regLinks[0] : "",
          notes: events.length ? "" : "no_event_rows_with_register_links",
        });

        if (!events.length) {
          continue;
        }

        for (var eidx = 0; eidx < events.length; eidx++) {
          if (accepted.length >= maxEvents) break;
          var ev = events[eidx] || {};

          var campName = safeString(ev.camp_name);
          var linkUrl = safeString(ev.link_url);
          var eventDatesRaw = safeString(ev.event_dates_raw);
          var gradesRaw = safeString(ev.grades_raw);
          var priceRaw = safeString(ev.price_raw);

          // If no registration link, reject (fail closed)
          if (!linkUrl) {
            rejected.push({
              reason: "missing_registration_url",
              school_id: schoolId,
              camp_site_url: siteUrl,
              camp_name: campName,
            });
            continue;
          }

          processedRegs += 1;

          accepted.push({
            school_id: schoolId,
            sport_id: sportId,
            source_platform: "sportsusa",
            source_url: siteUrl,
            camp_name: campName,
            link_url: linkUrl,
            event_dates_raw: eventDatesRaw,
            grades_raw: gradesRaw,
            price_raw: priceRaw,
            city: loc.city,
            state: loc.state,
            raw: {
              page_title: title,
            },
          });
        }
      } catch (e) {
        var msg = String((e && e.message) || e);
        errors.push({ school_id: schoolId, site_url: siteUrl, http: http, error: msg });
        debug.siteDebug.push({
          school_id: schoolId,
          site_url: siteUrl,
          http: http || 0,
          regLinks: 0,
          eventsParsed: 0,
          notes: "exception: " + truncate(msg, 250),
        });
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
          sportName: sportName,
        },
        debug: debug,
        accepted: dryRun ? accepted.slice(0, 50) : accepted,
        rejected: rejected.slice(0, 50),
        errors: errors.slice(0, 20),
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
