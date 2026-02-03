// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Given a list of SchoolSportSite rows (camp_site_url per school for a sport),
//   fetch each camp site and extract Ryzer registration links.
// - Skip sites that clearly have "no upcoming events".
// - For each registration link, fetch the Ryzer register page and extract:
//   camp name, date text, location, grades, price, description (best-effort).
// - Return normalized CampDemo-ready payloads to AdminImport (AdminImport writes).
//
// v2 changes:
// - Scan MANY sites, but only PROCESS the first K sites that actually have events.
// - Adds explicit "no_upcoming_events" detection (common on these sites).
// - Broader registration link detection (camp.cfm + register.ryzer.com variants).
// - Editor-safe: no optional chaining, no external imports.

const VERSION = "sportsUSAIngestCamps_2026-02-03_v2_scan_skip_empty_editor_safe";

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

function uniq(arr) {
  var out = [];
  var seen = {};
  for (var i = 0; i < arr.length; i++) {
    var v = arr[i];
    if (!v) continue;
    if (seen[v]) continue;
    seen[v] = true;
    out.push(v);
  }
  return out;
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

function htmlToText(html) {
  if (!html) return "";
  var h = String(html);

  // remove script/style
  h = h.replace(/<script[\s\S]*?<\/script>/gi, " ");
  h = h.replace(/<style[\s\S]*?<\/style>/gi, " ");

  // convert <br> and </p> to newlines
  h = h.replace(/<br\s*\/?>/gi, "\n");
  h = h.replace(/<\/p>/gi, "\n");
  h = h.replace(/<\/div>/gi, "\n");
  h = h.replace(/<\/li>/gi, "\n");

  // strip tags
  h = h.replace(/<[^>]+>/g, " ");

  // decode a few entities
  h = h.replace(/&nbsp;/gi, " ");
  h = h.replace(/&amp;/gi, "&");
  h = h.replace(/&quot;/gi, '"');
  h = h.replace(/&#39;/gi, "'");

  // collapse whitespace
  h = h.replace(/\r/g, "\n");
  h = h.replace(/[ \t]+/g, " ");
  h = h.replace(/\n\s*\n+/g, "\n");
  return stripNonAscii(h);
}

function containsNoUpcomingEvents(htmlOrText) {
  var t = lc(String(htmlOrText || ""));
  // common phrase on these SportsConnect camp sites
  if (t.indexOf("currently there are no upcoming events") >= 0) return true;
  if (t.indexOf("no upcoming events") >= 0) return true;
  if (t.indexOf("check back soon") >= 0 && t.indexOf("upcoming") >= 0) return true;
  return false;
}

function extractRegistrationLinks(siteHtml, siteUrl) {
  var html = String(siteHtml || "");
  var links = [];

  // 1) explicit Ryzer camp register links
  // example: https://register.ryzer.com/camp.cfm?id=321054&ryzer=1
  var re1 = /href="([^"]*register\.ryzer\.com[^"]*)"/gi;
  var m;
  while ((m = re1.exec(html)) !== null) {
    var u = absUrl(siteUrl, m[1]);
    if (u) links.push(u);
  }

  // 2) camp.cfm links even if not on register.ryzer.com
  var re2 = /href="([^"]*camp\.cfm[^"]*)"/gi;
  while ((m = re2.exec(html)) !== null) {
    var u2 = absUrl(siteUrl, m[1]);
    if (u2) links.push(u2);
  }

  // 3) Sometimes links appear in JS/JSON blobs (not href)
  var re3 = /(https?:\/\/register\.ryzer\.com\/[^"' \n<>]+id=\d+[^"' \n<>]*)/gi;
  while ((m = re3.exec(html)) !== null) {
    var u3 = stripNonAscii(m[1]);
    if (u3) links.push(u3);
  }

  links = uniq(links);

  // Filter to likely registration links (must have id=NUMBER)
  var out = [];
  for (var i = 0; i < links.length; i++) {
    var u = links[i];
    if (!u) continue;
    if (lc(u).indexOf("ryzer.com") < 0 && lc(u).indexOf("camp.cfm") < 0) continue;
    if (!/[\?&]id=\d+/i.test(u)) continue;
    out.push(u);
  }

  return uniq(out);
}

function extractRyzerId(url) {
  var u = safeString(url);
  if (!u) return null;
  var m = /[\?&]id=(\d+)/i.exec(u);
  return m && m[1] ? m[1] : null;
}

// Parse a first date and optional second date from a line like:
// "Jan 30th, 2026" or "Jan 30th, 2026 - Jan 31st, 2026"
function parseDateIsoFromText(text) {
  var t = stripNonAscii(text || "");
  if (!t) return { start: null, end: null };

  // Prefer ISO if present anywhere
  var iso = /(\d{4}-\d{2}-\d{2})/.exec(t);
  if (iso && iso[1]) return { start: iso[1], end: iso[1] };

  // Month name parsing
  var months = {
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

  function toIso(mon, day, year) {
    var mm = String(mon).padStart(2, "0");
    var dd = String(day).padStart(2, "0");
    return year + "-" + mm + "-" + dd;
  }

  // capture sequences like "Jan 30, 2026" (supports "30th")
  var re = /\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\,?\s+(\d{4})\b/g;
  var found = [];
  var m;
  while ((m = re.exec(t)) !== null) {
    var monTxt = lc(m[1]);
    var mon = months[monTxt];
    var day = parseInt(m[2], 10);
    var year = parseInt(m[3], 10);
    if (!mon || !day || !year) continue;
    found.push(toIso(mon, day, year));
    if (found.length >= 2) break;
  }

  if (found.length === 1) return { start: found[0], end: found[0] };
  if (found.length >= 2) return { start: found[0], end: found[1] };

  return { start: null, end: null };
}

function deriveSeasonYear(sportName, startDateIso) {
  // Default: season_year = year(start_date)
  // Football rule (your earlier decision): rollover Feb 1
  var d = safeString(startDateIso);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;

  var year = parseInt(d.slice(0, 4), 10);
  var month = parseInt(d.slice(5, 7), 10);

  var sn = lc(sportName || "");

  if (sn === "football") {
    // Jan belongs to prior season; Feb+ is current year
    return month === 1 ? year - 1 : year;
  }

  return year;
}

function djb2Hash(str) {
  var s = String(str || "");
  var h = 5381;
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h & 0xffffffff;
  }
  // unsigned hex
  var u = (h >>> 0).toString(16);
  return u;
}

function parseRyzerRegisterPage(regHtml) {
  var html = String(regHtml || "");
  var text = htmlToText(html);

  // camp name: prefer <h1>, else use <title>
  var campName = null;
  var m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (m && m[1]) campName = stripNonAscii(m[1].replace(/<[^>]+>/g, " "));
  if (!campName) {
    var t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (t && t[1]) campName = stripNonAscii(t[1]);
  }

  // pull labeled fields from text (matches what Ryzer pages render)
  function pickAfter(label) {
    var re = new RegExp(label + "\\s*:\\s*([^\\n]+)", "i");
    var mm = re.exec(text);
    if (mm && mm[1]) return stripNonAscii(mm[1]);
    return null;
  }

  var eventDatesRaw = pickAfter("Event Date\\(s\\)") || pickAfter("Event Dates") || null;
  var locationRaw = pickAfter("Location") || null;
  var gradesRaw = pickAfter("Grades") || null;
  var priceRaw = pickAfter("Price") || null;

  // sometimes price appears as "$200.00"
  if (!priceRaw) {
    var pm = /\$\s*\d+(\.\d{2})?/.exec(text);
    if (pm && pm[0]) priceRaw = stripNonAscii(pm[0]);
  }

  // basic price number
  var price = null;
  if (priceRaw) {
    var n = /(\d+(?:\.\d{1,2})?)/.exec(priceRaw.replace(/,/g, ""));
    if (n && n[1]) price = Number(n[1]);
  }

  // parse dates (best-effort)
  var dates = parseDateIsoFromText(eventDatesRaw || "");
  var startDate = dates.start;
  var endDate = dates.end;

  // parse city/state from location like "Hardin-Simmons University - Abilene, TX"
  var city = null;
  var state = null;
  if (locationRaw) {
    var lm = /,\s*([A-Z]{2})\b/.exec(locationRaw);
    if (lm && lm[1]) state = lm[1];
    var cm = /-\s*([^,]+)\,\s*[A-Z]{2}\b/.exec(locationRaw);
    if (cm && cm[1]) city = stripNonAscii(cm[1]);
  }

  // pull a short description block if present
  var desc = null;
  var dm = /Event Description\s*:\s*([\s\S]{0,1200})/i.exec(text);
  if (dm && dm[1]) desc = stripNonAscii(dm[1]).slice(0, 800);

  return {
    camp_name: safeString(campName),
    event_dates_raw: safeString(eventDatesRaw),
    start_date: safeString(startDate),
    end_date: safeString(endDate),
    location_raw: safeString(locationRaw),
    city: safeString(city),
    state: safeString(state),
    grades_raw: safeString(gradesRaw),
    price_raw: safeString(priceRaw),
    price: price,
    notes: safeString(desc)
  };
}

function looksLikeUniversityHost(s) {
  // Conservative: enforce "university" or "college" in the register page title/host string.
  // This is a guardrail to meet your "university only" requirement.
  var t = lc(s || "");
  if (!t) return false;
  if (t.indexOf("university") >= 0) return true;
  if (t.indexOf("college") >= 0) return true;
  return false;
}

Deno.serve(async (req) => {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    notes: [],
    siteDebug: [],
    params: {}
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
    var dryRun = !!(body && body.dryRun);

    // AdminImport passes in active sites (subset)
    var sites = (body && body.sites && Array.isArray(body.sites)) ? body.sites : [];

    // Scan behavior
    var maxSitesToScan = Number(body && body.maxSitesToScan !== undefined ? body.maxSitesToScan : sites.length);
    var maxSitesWithEvents = Number(body && body.maxSitesWithEvents !== undefined ? body.maxSitesWithEvents : 5);
    var maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 10);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 100);

    // default: enforce "university only" based on register page title/host string
    var enforceUniversityOnly = (body && body.enforceUniversityOnly === false) ? false : true;

    debug.params = {
      sportId: sportId,
      sportName: sportName,
      dryRun: dryRun,
      sitesProvided: sites.length,
      maxSitesToScan: maxSitesToScan,
      maxSitesWithEvents: maxSitesWithEvents,
      maxRegsPerSite: maxRegsPerSite,
      maxEvents: maxEvents,
      enforceUniversityOnly: enforceUniversityOnly
    };

    if (!sportId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!sites.length) {
      return new Response(JSON.stringify({
        stats: { processedSites: 0, processedRegs: 0, accepted: 0, rejected: 0, errors: 0 },
        debug: debug,
        accepted: [],
        rejected: []
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    var accepted = [];
    var rejected = [];
    var errors = [];

    var processedSites = 0;
    var sitesWithEventsProcessed = 0;
    var processedRegs = 0;

    var skippedNoUpcoming = 0;
    var skippedNoRegLinks = 0;

    // scan in the order AdminImport provides (AdminImport should shuffle for better coverage)
    for (var i = 0; i < sites.length; i++) {
      if (processedSites >= maxSitesToScan) break;
      if (accepted.length >= maxEvents) break;
      if (sitesWithEventsProcessed >= maxSitesWithEvents) break;

      var s = sites[i] || {};
      var schoolId = safeString(s.school_id || s.schoolId || s.school);
      var campSiteUrl = safeString(s.camp_site_url || s.campSiteUrl || s.site_url || s.siteUrl);
      var siteLogo = safeString(s.logo_url || s.logoUrl);

      processedSites += 1;

      if (!schoolId || !campSiteUrl) {
        rejected.push({
          reason: "missing_site_fields",
          school_id: schoolId,
          camp_site_url: campSiteUrl
        });
        continue;
      }

      var siteHttp = 0;
      var siteHtml = "";
      var siteNotes = [];
      var regLinks = [];

      try {
        var r = await fetch(campSiteUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
            Accept: "text/html,*/*"
          }
        });

        siteHttp = r.status;
        siteHtml = await r.text();

        if (!r.ok) {
          siteNotes.push("fetch_failed");
          errors.push({ stage: "site_fetch", school_id: schoolId, url: campSiteUrl, http: siteHttp });
          debug.siteDebug.push({
            school_id: schoolId,
            camp_site_url: campSiteUrl,
            http: siteHttp,
            regLinks: 0,
            notes: "fetch_failed"
          });
          continue;
        }

        // fast skip empties
        if (containsNoUpcomingEvents(siteHtml)) {
          skippedNoUpcoming += 1;
          debug.siteDebug.push({
            school_id: schoolId,
            camp_site_url: campSiteUrl,
            http: siteHttp,
            regLinks: 0,
            notes: "no_upcoming_events"
          });
          continue;
        }

        regLinks = extractRegistrationLinks(siteHtml, campSiteUrl);

        if (!regLinks.length) {
          skippedNoRegLinks += 1;
          debug.siteDebug.push({
            school_id: schoolId,
            camp_site_url: campSiteUrl,
            http: siteHttp,
            regLinks: 0,
            notes: "no_registration_links_found"
          });
          continue;
        }

        sitesWithEventsProcessed += 1;

        // cap reg links per site
        if (regLinks.length > maxRegsPerSite) regLinks = regLinks.slice(0, maxRegsPerSite);

        // For each registration page
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
              rejected.push({
                reason: "reg_fetch_failed",
                school_id: schoolId,
                registration_url: regUrl,
                http: regHttp
              });
              continue;
            }

            var parsed = parseRyzerRegisterPage(regHtml);

            // enforce "university only" based on page title or host string
            if (enforceUniversityOnly) {
              var titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(regHtml);
              var titleTxt = titleM && titleM[1] ? stripNonAscii(titleM[1]) : "";
              var hostHint = titleTxt || "";
              if (!looksLikeUniversityHost(hostHint)) {
                rejected.push({
                  reason: "not_university_host",
                  school_id: schoolId,
                  registration_url: regUrl,
                  host_hint: truncate(hostHint, 120)
                });
                continue;
              }
            }

            if (!parsed.camp_name) {
              rejected.push({
                reason: "missing_camp_name",
                school_id: schoolId,
                registration_url: regUrl
              });
              continue;
            }

            // must have a start_date for CampDemo required fields
            if (!parsed.start_date) {
              rejected.push({
                reason: "missing_start_date",
                school_id: schoolId,
                registration_url: regUrl,
                event_dates_raw: parsed.event_dates_raw || null
              });
              continue;
            }

            var ryzerId = extractRyzerId(regUrl);
            var programId = ryzerId ? ("ryzer:" + ryzerId) : ("ryzer:url:" + lc(regUrl));
            var seasonYear = deriveSeasonYear(sportName, parsed.start_date);

            // event_key unique per occurrence
            var eventKey = programId + ":" + parsed.start_date;

            var nowIso = new Date().toISOString();

            // content hash for change detection
            var hashPayload = JSON.stringify({
              camp_name: parsed.camp_name,
              start_date: parsed.start_date,
              end_date: parsed.end_date,
              location_raw: parsed.location_raw,
              grades_raw: parsed.grades_raw,
              price_raw: parsed.price_raw,
              notes: parsed.notes
            });
            var contentHash = djb2Hash(hashPayload);

            accepted.push({
              campdemo: {
                school_id: schoolId,
                sport_id: sportId,
                camp_name: parsed.camp_name,
                start_date: parsed.start_date,
                end_date: parsed.end_date || parsed.start_date,
                city: parsed.city,
                state: parsed.state,
                position_ids: [],

                price: parsed.price,
                link_url: regUrl,
                notes: parsed.notes,

                season_year: seasonYear,
                program_id: programId,
                event_key: eventKey,
                source_platform: "sportsusa",
                source_url: regUrl,
                last_seen_at: nowIso,
                content_hash: contentHash,

                event_dates_raw: parsed.event_dates_raw,
                grades_raw: parsed.grades_raw,
                register_by_raw: null,
                price_raw: parsed.price_raw,
                price_min: null,
                price_max: null,
                sections_json: {}
              },
              debug: {
                site_url: campSiteUrl,
                site_logo: siteLogo,
                reg_http: regHttp,
                ryzer_id: ryzerId
              }
            });
          } catch (eReg) {
            errors.push({
              stage: "reg_exception",
              school_id: schoolId,
              registration_url: regUrl,
              error: String((eReg && eReg.message) || eReg)
            });
          }
        }

      } catch (eSite) {
        errors.push({
          stage: "site_exception",
          school_id: schoolId,
          url: campSiteUrl,
          error: String((eSite && eSite.message) || eSite)
        });
      }

      // Keep debug bounded
      if (debug.siteDebug.length < 25) {
        debug.siteDebug.push({
          school_id: schoolId,
          camp_site_url: campSiteUrl,
          http: siteHttp,
          regLinks: regLinks.length,
          notes: siteNotes.join(",") || null,
          regLinksSample: regLinks.slice(0, 3)
        });
      }
    }

    return new Response(JSON.stringify({
      stats: {
        processedSites: processedSites,
        sitesWithEventsProcessed: sitesWithEventsProcessed,
        processedRegs: processedRegs,
        accepted: accepted.length,
        rejected: rejected.length,
        errors: errors.length,
        skippedNoUpcoming: skippedNoUpcoming,
        skippedNoRegLinks: skippedNoRegLinks
      },
      debug: debug,
      accepted: accepted,
      rejected: rejected.slice(0, 50),
      errors: errors.slice(0, 25)
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
