// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Input: sportId, sportName, list of SchoolSportSite URLs OR a testSiteUrl
// - Fetch each camp site (e.g., https://www.hardingfootballcamps.com/)
// - Discover registration links (Ryzer register.ryzer.com camp.cfm links)
// - Return normalized "event candidates" with best-effort parsed dates + metadata
//
// Notes:
// - No optional chaining (Base44 editor-safe).
// - No external imports.
// - This function DOES NOT write to DB. AdminImport writes CampDemo.
//
// Versioning:
// - version is returned at TOP LEVEL and also in debug.version to prevent "MISSING" logs.

const VERSION = "sportsUSAIngestCamps_2026-02-03_v6_better_errors_date_parse_editor_safe";

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
  var lim = n || 1200;
  return str.length > lim ? str.slice(0, lim) + "…(truncated)" : str;
}

function absUrl(baseUrl, maybeRelative) {
  var u = safeString(maybeRelative);
  if (!u) return null;

  if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) return u;
  if (u.indexOf("//") === 0) return "https:" + u;

  // root-relative
  if (u.indexOf("/") === 0) {
    try {
      var b = new URL(baseUrl);
      return b.origin + u;
    } catch (e) {
      return u;
    }
  }

  // relative
  try {
    return new URL(u, baseUrl).toString();
  } catch (e2) {
    return u;
  }
}

function isRyzerRegLink(url) {
  var u = lc(url || "");
  if (!u) return false;
  if (u.indexOf("register.ryzer.com/camp.cfm") === -1) return false;
  if (u.indexOf("sport=") === -1 && u.indexOf("id=") === -1) return false;
  return true;
}

function extractRyzerLinksFromHtml(html, baseUrl, maxLinks) {
  var out = [];
  if (!html) return out;

  // Find all href="..."
  var re = /href="([^"]+)"/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    if (maxLinks && out.length >= maxLinks) break;
    var href = m[1];
    var u = absUrl(baseUrl, href);
    if (!u) continue;
    if (!isRyzerRegLink(u)) continue;

    // dedupe
    var key = lc(u);
    var found = false;
    for (var i = 0; i < out.length; i++) {
      if (lc(out[i]) === key) {
        found = true;
        break;
      }
    }
    if (!found) out.push(u);
  }

  return out;
}

// Try to grab a "camp title" nearby the link by scanning backward around the href match
function bestEffortTitleNearLink(html, linkUrl) {
  if (!html || !linkUrl) return null;

  // We’ll search for the id=xxxxx fragment in the HTML to anchor position
  var idMatch = /[?&]id=([0-9]+)/i.exec(linkUrl);
  var needle = null;
  if (idMatch && idMatch[1]) needle = "id=" + idMatch[1];
  if (!needle) needle = linkUrl;

  var idx = html.indexOf(needle);
  if (idx < 0) return null;

  var start = idx - 1800;
  if (start < 0) start = 0;
  var windowText = html.slice(start, idx + 200);

  // Try to find the nearest preceding <a ...>TEXT</a>
  var aRe = /<a[^>]*>([^<]{3,180})<\/a>/gi;
  var lastText = null;
  var m;
  while ((m = aRe.exec(windowText)) !== null) {
    var t = stripNonAscii(m[1]);
    if (t && lc(t).indexOf("view") !== 0 && lc(t).indexOf("register") !== 0) {
      lastText = t;
    } else if (t) {
      // keep it anyway if we have nothing better
      if (!lastText) lastText = t;
    }
  }

  // Some sites use "View XYZ Details" as the link text; that’s still useful.
  if (lastText) return lastText;

  return null;
}

// --------------------
// Date parsing helpers
// --------------------

var MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
};

function pad2(n) {
  var s = String(n);
  return s.length === 1 ? "0" + s : s;
}

function ymd(y, m, d) {
  return String(y) + "-" + pad2(m) + "-" + pad2(d);
}

// Parses things like:
// - "February 21st - 22nd"
// - "June 12th-13th"
// - "February 21st" (single day)
// - "06/12/2026 - 06/13/2026"
// - "06/12/2026"
// Returns { start_date, end_date, notes }
function parseDatesFromText(text, defaultYear) {
  var t = stripNonAscii(text || "");
  if (!t) return { start_date: null, end_date: null, notes: "no_text" };

  // Prefer explicit YYYY in numeric formats
  // 06/12/2026 - 06/13/2026
  var numRange = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(t);
  if (numRange) {
    var m1 = Number(numRange[1]), d1 = Number(numRange[2]), y1 = Number(numRange[3]);
    var m2 = Number(numRange[4]), d2 = Number(numRange[5]), y2 = Number(numRange[6]);
    return { start_date: ymd(y1, m1, d1), end_date: ymd(y2, m2, d2), notes: "numeric_range" };
  }

  // 06/12/2026
  var numSingle = /(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(t);
  if (numSingle) {
    var ms = Number(numSingle[1]), ds = Number(numSingle[2]), ys = Number(numSingle[3]);
    return { start_date: ymd(ys, ms, ds), end_date: null, notes: "numeric_single" };
  }

  // Month name range: February 21st - 22nd (year missing)
  // Also supports "June 12th-13th"
  var monthRange = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(st|nd|rd|th)?\s*[-–]\s*(\d{1,2})(st|nd|rd|th)?/i.exec(t);
  if (monthRange) {
    var monName = lc(monthRange[1]);
    var mNum = MONTHS[monName] || null;
    var dStart = Number(monthRange[2]);
    var dEnd = Number(monthRange[4]);
    var yr = Number(defaultYear || new Date().getFullYear());
    if (mNum) {
      return { start_date: ymd(yr, mNum, dStart), end_date: ymd(yr, mNum, dEnd), notes: "monthname_range" };
    }
  }

  // Month name single: February 21st
  var monthSingle = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(st|nd|rd|th)?/i.exec(t);
  if (monthSingle) {
    var monName2 = lc(monthSingle[1]);
    var mNum2 = MONTHS[monName2] || null;
    var dOne = Number(monthSingle[2]);
    var yr2 = Number(defaultYear || new Date().getFullYear());
    if (mNum2) {
      return { start_date: ymd(yr2, mNum2, dOne), end_date: null, notes: "monthname_single" };
    }
  }

  // If no explicit date found
  return { start_date: null, end_date: null, notes: "no_date_pattern" };
}

// Extract a "date line" from camp title patterns like:
// "View HS Prospect Camp 1 Details" (no date in title) -> return null
// "View D-Line Training Camp | June 12th-13th Details" -> returns "June 12th-13th"
function extractDateLineFromTitle(title) {
  var t = stripNonAscii(title || "");
  if (!t) return null;

  // Split on pipe and take the segment that looks like it contains a month or numeric date
  var parts = t.split("|");
  if (parts.length >= 2) {
    var candidate = stripNonAscii(parts[1]);
    if (candidate) return candidate;
  }

  // fallback: find a month name anywhere
  var monthAny = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i.exec(t);
  if (monthAny) return monthAny[0];

  // fallback: numeric date
  var numAny = /\d{1,2}\/\d{1,2}\/\d{4}/i.exec(t);
  if (numAny) return numAny[0];

  return null;
}

function deriveProgramIdFromRyzerUrl(regUrl) {
  // Use the Ryzer "id" as stable program_id
  var m = /[?&]id=([0-9]+)/i.exec(regUrl || "");
  if (m && m[1]) return "ryzer:" + m[1];
  return "ryzer:" + lc(regUrl || "");
}

function makeEventKey(platform, programId, startDate, discriminator) {
  var s = safeString(startDate) || "unknown";
  var d = safeString(discriminator) || "0";
  return String(platform) + ":" + String(programId) + ":" + String(s) + ":" + String(d);
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
      return new Response(JSON.stringify({ error: "Method not allowed", version: VERSION, debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    var body = await req.json().catch(function () { return null; });

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var dryRun = !!(body && body.dryRun);

    var maxSites = Number(body && body.maxSites !== undefined ? body.maxSites : 5);
    var maxRegsPerSite = Number(body && body.maxRegsPerSite !== undefined ? body.maxRegsPerSite : 10);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 50);

    var testSiteUrl = safeString(body && body.testSiteUrl);
    var siteUrls = (body && body.siteUrls && Array.isArray(body.siteUrls)) ? body.siteUrls : null;

    if (!sportId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId", version: VERSION, debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    var urlsToProcess = [];
    if (testSiteUrl) {
      urlsToProcess = [testSiteUrl];
    } else if (siteUrls && siteUrls.length) {
      urlsToProcess = siteUrls.slice(0, maxSites);
    } else {
      return new Response(JSON.stringify({
        error: "Missing required: testSiteUrl OR siteUrls[]",
        version: VERSION,
        debug: debug
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    var accepted = [];
    var rejected = [];
    var errors = [];

    var processedSites = 0;
    var processedRegs = 0;

    for (var si = 0; si < urlsToProcess.length; si++) {
      if (processedSites >= maxSites) break;
      if (accepted.length >= maxEvents) break;

      var siteUrl = safeString(urlsToProcess[si]);
      if (!siteUrl) continue;

      var siteHttp = 0;
      var html = "";
      var htmlType = "";
      var regLinks = [];
      var siteNotes = [];

      try {
        var r = await fetch(siteUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
            Accept: "text/html,*/*"
          }
        });

        siteHttp = r.status;
        htmlType = safeString(r.headers.get("content-type")) || "";
        html = await r.text();

        if (!r.ok) {
          siteNotes.push("site_fetch_non_200");
          errors.push({ siteUrl: siteUrl, error: "site_fetch_failed", http: siteHttp });
        } else {
          regLinks = extractRyzerLinksFromHtml(html, siteUrl, maxRegsPerSite);

          if (!regLinks.length) {
            siteNotes.push("no_registration_links_found");
          } else {
            // Build candidates
            for (var li = 0; li < regLinks.length; li++) {
              if (accepted.length >= maxEvents) break;

              var regUrl = regLinks[li];
              processedRegs += 1;

              var title = bestEffortTitleNearLink(html, regUrl) || "Camp Registration";
              title = stripNonAscii(title);

              // Attempt date parse from title
              var dateLine = extractDateLineFromTitle(title);
              var parsed = parseDatesFromText(dateLine, new Date().getFullYear());

              // If still no date, we keep it but mark start_date null. AdminImport can optionally fetch Ryzer page later.
              // BUT CampDemo requires start_date. So we *reject* if no start_date (fail-closed).
              if (!parsed.start_date) {
                rejected.push({
                  reason: "missing_start_date",
                  registrationUrl: regUrl,
                  title: title,
                  event_dates_line: dateLine || null,
                  parse_notes: parsed.notes
                });
                continue;
              }

              var programId = deriveProgramIdFromRyzerUrl(regUrl);
              var evKey = makeEventKey("sportsusa", programId, parsed.start_date, String(li));

              accepted.push({
                event: {
                  sportId: sportId,
                  sportName: sportName,
                  camp_name: title,
                  start_date: parsed.start_date,
                  end_date: parsed.end_date,
                  link_url: regUrl,
                  source_platform: "sportsusa",
                  source_url: regUrl,
                  event_dates_raw: dateLine || null
                },
                derived: {
                  program_id: programId,
                  event_key: evKey,
                  parse_notes: parsed.notes,
                  site_url: siteUrl
                }
              });
            }
          }
        }

        // Save debug for this site
        debug.siteDebug.push({
          siteUrl: siteUrl,
          http: siteHttp,
          htmlType: htmlType,
          regLinks: regLinks.length,
          sample: regLinks.length ? regLinks[0] : "",
          notes: siteNotes.join(",")
        });

        if (!debug.firstSiteHtmlSnippet) {
          debug.firstSiteHtmlSnippet = truncate(html, 1600);
        }
      } catch (e) {
        var msg = String((e && e.message) || e);
        errors.push({ siteUrl: siteUrl, error: "exception", message: msg });
        debug.siteDebug.push({
          siteUrl: siteUrl,
          http: siteHttp,
          htmlType: htmlType,
          regLinks: 0,
          sample: "",
          notes: "exception:" + msg
        });
        if (!debug.firstSiteHtmlSnippet) {
          debug.firstSiteHtmlSnippet = truncate(msg, 1600);
        }
      }

      processedSites += 1;
    }

    var response = {
      version: VERSION,
      stats: {
        processedSites: processedSites,
        processedRegs: processedRegs,
        accepted: accepted.length,
        rejected: rejected.length,
        errors: errors.length
      },
      debug: debug,
      errors: errors.slice(0, 10),
      accepted: accepted.slice(0, maxEvents),
      rejected_samples: rejected.slice(0, 25)
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (eTop) {
    debug.notes.push("top-level error: " + String((eTop && eTop.message) || eTop));
    return new Response(JSON.stringify({ error: "Unhandled error", version: VERSION, debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
