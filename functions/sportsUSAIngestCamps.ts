// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Given a SchoolSportSite camp_site_url (e.g., https://www.hardingfootballcamps.com/)
// - Fetch the site, discover Ryzer registration links (register.ryzer.com/camp.cfm?...id=...)
// - For each registration link, fetch the Ryzer page and parse:
//   - camp_name
//   - start_date / end_date (from "Event Date(s)")
//   - city/state (from "Location ... | City, ST")
//   - grades_raw, register_by_raw, price_raw, price
// - Return normalized events for AdminImport to write to CampDemo
//
// Editor-safe constraints:
// - No optional chaining
// - No external imports
// - Best-effort regex parsing
//
// Version: v4 adds deep parse of Ryzer registration pages to fix single-date events (n/a issue)

const VERSION = "sportsUSAIngestCamps_2026-02-03_v4_parse_ryzer_registration_pages_editor_safe";

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
  var lim = n || 1400;
  return str.length > lim ? str.slice(0, lim) + "…(truncated)" : str;
}

function absUrl(baseUrl, maybeRelative) {
  var u = safeString(maybeRelative);
  if (!u) return null;
  if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
  if (u.indexOf("//") === 0) return "https:" + u;

  try {
    // join relative to base
    return new URL(u, baseUrl).toString();
  } catch (e) {
    return u;
  }
}

function parseQueryParam(url, key) {
  try {
    var u = new URL(url);
    return safeString(u.searchParams.get(key));
  } catch (e) {
    return null;
  }
}

function pad2(n) {
  var x = Number(n);
  if (!isFinite(x)) return null;
  return x < 10 ? "0" + x : String(x);
}

function monthToNumber(m) {
  var t = lc(m || "");
  if (!t) return null;

  var map = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  return map[t] || null;
}

function ymdFromParts(year, monthNum, day) {
  var y = Number(year);
  var m = Number(monthNum);
  var d = Number(day);
  if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return null;
  if (y < 2000 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  return String(y) + "-" + pad2(m) + "-" + pad2(d);
}

// Parse "Feb 21, 2026" or "May 16, 2026"
function parseMonthNameDate(s) {
  var txt = stripNonAscii(s || "");
  if (!txt) return null;

  // Month Day, Year
  var re = /([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\,?\s+(\d{4})/i;
  var m = re.exec(txt);
  if (!m) return null;

  var mon = monthToNumber(m[1]);
  var day = m[2];
  var year = m[3];
  if (!mon) return null;

  return ymdFromParts(year, mon, day);
}

// Parse the Ryzer "Event Date(s) X to Y" line
function parseRyzerEventDatesLine(line) {
  var txt = stripNonAscii(line || "");
  if (!txt) return { start: null, end: null };

  // Example:
  // "Event Date(s) Feb 21, 2026 to Feb 22, 2026"
  // "Event Date(s) May 16, 2026"
  txt = txt.replace(/^Event Date\(s\)\s*/i, "").trim();

  // Split on " to " (Ryzer uses "to" on registration pages)
  var parts = txt.split(/\s+to\s+/i);

  if (parts.length === 1) {
    var one = parseMonthNameDate(parts[0]);
    return { start: one, end: one };
  }

  var a = parseMonthNameDate(parts[0]);
  var b = parseMonthNameDate(parts[1]);

  // If second parse fails but first succeeds, treat as single
  if (a && !b) return { start: a, end: a };

  return { start: a, end: b || a };
}

function parseRyzerLocationLine(line) {
  // "Location Huckeba Indoor Facility | Searcy, AR"
  var txt = stripNonAscii(line || "");
  if (!txt) return { city: null, state: null, location_raw: null };

  txt = txt.replace(/^Location\s*/i, "").trim();

  // Take part after "|" if present
  var cityStatePart = txt;
  if (txt.indexOf("|") >= 0) {
    var split = txt.split("|");
    cityStatePart = stripNonAscii(split[split.length - 1]);
  }

  // City, ST
  var m = /(.+)\,\s*([A-Z]{2})\b/.exec(cityStatePart);
  if (m) {
    return { city: stripNonAscii(m[1]), state: stripNonAscii(m[2]), location_raw: txt };
  }

  return { city: null, state: null, location_raw: txt };
}

function parseFirstPriceFromText(s) {
  var txt = stripNonAscii(s || "");
  if (!txt) return { price: null, price_raw: null };

  // Find first $XX.XX
  var m = /\$([0-9]{1,5})(?:\.[0-9]{2})?/.exec(txt);
  if (!m) return { price: null, price_raw: null };

  var p = Number(m[1]);
  if (!isFinite(p)) return { price: null, price_raw: null };

  return { price: p, price_raw: "$" + m[1] };
}

function extractRyzerFieldsFromHtml(html) {
  // We will parse from rendered text-ish lines using simple tag stripping.
  // Ryzer pages are fairly consistent.
  var raw = String(html || "");

  // Convert <br> to newlines then strip tags
  var txt = raw.replace(/<br\s*\/?>/gi, "\n");
  txt = txt.replace(/<\/(p|div|h1|h2|h3|li|tr|td|section|article)>/gi, "\n");
  txt = txt.replace(/<[^>]+>/g, " ");
  txt = stripNonAscii(txt);

  // Create "lines" by splitting on known separators
  var lines = txt.split(/\s{2,}|\n+/g);
  var i;

  var campName = null;
  var eventDatesLine = null;
  var locationLine = null;
  var gradesLine = null;
  var registerByLine = null;

  // We also want price; it often appears as "$85.00" near "Register Now"
  var priceHit = null;

  for (i = 0; i < lines.length; i++) {
    var line = stripNonAscii(lines[i]);

    if (!line) continue;

    // Camp title is usually the first big title line; we can detect by presence after the sport header,
    // but easiest: take the first line that is not cookie/legal and not the sport breadcrumb and not "Register..."
    if (!campName) {
      if (
        lc(line).indexOf("we use cookies") === 0 ||
        lc(line).indexOf("learn more") === 0 ||
        lc(line).indexOf("terms of use") >= 0 ||
        lc(line).indexOf("privacy policy") >= 0 ||
        lc(line).indexOf("register for this event") >= 0
      ) {
        // skip
      } else {
        // If the line contains " - Football" and is short, it might be breadcrumb like "Harding University - Football"
        if (!(line.indexOf(" - Football") > 0 && line.length < 60)) {
          // Keep first plausible title
          campName = line;
        }
      }
    }

    if (!locationLine && /^Location\s/i.test(line)) locationLine = line;
    if (!eventDatesLine && /^Event Date\(s\)\s/i.test(line)) eventDatesLine = line;
    if (!gradesLine && /^Grades\s/i.test(line)) gradesLine = line;
    if (!registerByLine && /^Register By\s/i.test(line)) registerByLine = line;

    if (!priceHit && line.indexOf("$") >= 0) {
      // Heuristic: prefer price near "Register Now"
      if (lc(line).indexOf("register now") >= 0 || lc(line).indexOf("select a price") >= 0) {
        priceHit = line;
      }
    }
  }

  // Fallback: if we didn't find a priceHit, scan entire text for a dollar amount
  if (!priceHit && txt.indexOf("$") >= 0) priceHit = txt;

  var dates = parseRyzerEventDatesLine(eventDatesLine || "");
  var loc = parseRyzerLocationLine(locationLine || "");
  var priceParsed = parseFirstPriceFromText(priceHit || "");

  // Grades line: "Grades 2nd to 7th"
  var gradesRaw = null;
  if (gradesLine) gradesRaw = stripNonAscii(gradesLine.replace(/^Grades\s*/i, "").trim());

  // Register by raw: "Register By Feb 20, 2026 11:59pm CST"
  var registerByRaw = null;
  if (registerByLine) registerByRaw = stripNonAscii(registerByLine.replace(/^Register By\s*/i, "").trim());

  return {
    camp_name: campName,
    start_date: dates.start,
    end_date: dates.end,
    city: loc.city,
    state: loc.state,
    location_raw: loc.location_raw,
    grades_raw: gradesRaw,
    register_by_raw: registerByRaw,
    price: priceParsed.price,
    price_raw: priceParsed.price_raw
  };
}

function discoverRyzerRegistrationLinks(siteHtml, siteUrl, maxLinks) {
  // Find register.ryzer.com camp links; include variants with id= and sport=
  // Example: https://register.ryzer.com/camp.cfm?sport=1&id=323894
  var html = String(siteHtml || "");
  var out = [];
  var seen = {};

  // Capture href links
  var hrefRe = /href="([^"]+)"/gi;
  var m;
  while ((m = hrefRe.exec(html)) !== null) {
    var href = m[1];
    if (!href) continue;

    var abs = absUrl(siteUrl, href);
    if (!abs) continue;

    var low = lc(abs);
    if (low.indexOf("register.ryzer.com/camp.cfm") < 0) continue;

    // Ensure it has an id=
    var idVal = parseQueryParam(abs, "id");
    if (!idVal) continue;

    var key = "id:" + idVal;
    if (seen[key]) continue;
    seen[key] = true;

    out.push(abs);

    if (maxLinks && out.length >= maxLinks) break;
  }

  return out;
}

Deno.serve(async (req) => {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    notes: [],
    siteDebug: [],
    firstSiteHtmlSnippet: null
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    var body = await req.json().catch(function () { return null; });

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var maxSites = Number(body && body.maxSites !== undefined ? body.maxSites : 5);
    var maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 5);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 25);
    var dryRun = !!(body && body.dryRun);

    // Optional: provide a direct test URL (bypasses loading from DB on the client side)
    var testSiteUrl = safeString(body && body.testSiteUrl);

    // AdminImport typically loads SchoolSportSite rows client-side and sends selected site URLs.
    // But we support a server-driven approach too: accept a list of site URLs to crawl.
    var siteUrls = body && body.siteUrls && Array.isArray(body.siteUrls) ? body.siteUrls : [];

    if (!sportId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // If testSiteUrl provided, use it as the only site
    if (testSiteUrl) {
      siteUrls = [testSiteUrl];
    }

    if (!siteUrls || siteUrls.length === 0) {
      return new Response(JSON.stringify({
        error: "Missing required: siteUrls (or testSiteUrl)",
        debug: debug
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Bound sites
    var boundedSites = siteUrls.slice(0, maxSites);

    var processedSites = 0;
    var processedRegs = 0;
    var accepted = [];
    var rejected = [];
    var errors = [];

    for (var i = 0; i < boundedSites.length; i++) {
      if (accepted.length >= maxEvents) break;

      var siteUrl = safeString(boundedSites[i]);
      if (!siteUrl) continue;

      processedSites += 1;

      var siteHttp = 0;
      var siteHtml = "";

      try {
        var sr = await fetch(siteUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
            Accept: "text/html,*/*"
          }
        });

        siteHttp = sr.status;
        siteHtml = await sr.text();

        if (!debug.firstSiteHtmlSnippet) {
          debug.firstSiteHtmlSnippet = truncate(siteHtml, 1600);
        }

        if (!sr.ok) {
          errors.push({ siteUrl: siteUrl, error: "site_fetch_failed_http_" + siteHttp });
          debug.siteDebug.push({
            siteUrl: siteUrl,
            http: siteHttp,
            htmlType: safeString(sr.headers.get("content-type")),
            regLinks: 0,
            notes: "site_fetch_failed"
          });
          continue;
        }

        var regLinks = discoverRyzerRegistrationLinks(siteHtml, siteUrl, maxRegsPerSite);

        debug.siteDebug.push({
          siteUrl: siteUrl,
          http: siteHttp,
          htmlType: safeString(sr.headers.get("content-type")),
          regLinks: regLinks.length,
          sample: regLinks.length ? regLinks[0] : "",
          notes: regLinks.length ? "" : "no_registration_links_found"
        });

        if (!regLinks.length) continue;

        // For each registration link, fetch Ryzer page and parse fields
        for (var j = 0; j < regLinks.length; j++) {
          if (accepted.length >= maxEvents) break;

          var regUrl = regLinks[j];
          processedRegs += 1;

          try {
            var rr = await fetch(regUrl, {
              method: "GET",
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
                Accept: "text/html,*/*"
              }
            });

            var regHttp = rr.status;
            var regHtml = await rr.text();

            if (!rr.ok) {
              rejected.push({ reason: "reg_fetch_failed_http_" + regHttp, registrationUrl: regUrl });
              continue;
            }

            var fields = extractRyzerFieldsFromHtml(regHtml);

            // If we still can't parse a start_date, fail-closed (don’t write junk)
            if (!fields || !fields.start_date) {
              rejected.push({
                reason: "missing_start_date",
                registrationUrl: regUrl,
                camp_name_guess: fields ? fields.camp_name : null
              });
              continue;
            }

            // program_id / event_key based on Ryzer id
            var ryzerId = parseQueryParam(regUrl, "id");
            var programId = ryzerId ? "ryzer:" + ryzerId : ("url:" + lc(regUrl));
            var eventKey = programId + ":" + fields.start_date;

            accepted.push({
              event: {
                sportId: sportId,
                sportName: sportName,
                camp_name: fields.camp_name || "Camp",
                start_date: fields.start_date,
                end_date: fields.end_date || fields.start_date,
                city: fields.city,
                state: fields.state,
                price: fields.price,
                link_url: regUrl,
                notes: null,

                // Extended / staging fields
                season_year: Number(String(fields.start_date).slice(0, 4)),
                program_id: programId,
                event_key: eventKey,
                source_platform: "ryzer",
                source_url: regUrl,
                last_seen_at: new Date().toISOString(),
                content_hash: null,

                event_dates_raw: null,
                grades_raw: fields.grades_raw,
                register_by_raw: fields.register_by_raw,
                price_raw: fields.price_raw,
                price_min: null,
                price_max: null,
                sections_json: null
              },
              debug: {
                discovered_from_site: siteUrl,
                ryzer_id: ryzerId,
                location_raw: fields.location_raw
              }
            });
          } catch (e2) {
            errors.push({ registrationUrl: regUrl, error: String((e2 && e2.message) || e2) });
          }
        }
      } catch (e) {
        errors.push({ siteUrl: siteUrl, error: String((e && e.message) || e) });
      }
    }

    return new Response(JSON.stringify({
      stats: {
        processedSites: processedSites,
        processedRegs: processedRegs,
        accepted: accepted.length,
        rejected: rejected.length,
        errors: errors.length,
        dryRun: dryRun
      },
      debug: debug,
      errors: errors.slice(0, 10),
      accepted: dryRun ? accepted.slice(0, 25) : accepted,
      rejected_samples: rejected.slice(0, 25)
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    debug.notes.push("top-level error: " + String((e && e.message) || e));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
