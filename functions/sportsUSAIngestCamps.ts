// functions/sportsUSAIngestCamps.js
// Base44 Backend Function (Deno)
//
// Purpose:
// - Fetch each school camp site (e.g., hardingfootballcamps.com)
// - Discover Ryzer registration links
// - For each registration link:
//    - Try parse dates from the camp-site link title text
//    - If missing, fetch the Ryzer registration page and parse dates there
// - Return normalized candidates with start_date/end_date (fail-closed)
//
// Editor-safe: no optional chaining, no external imports.

const VERSION = "sportsUSAIngestCamps_2026-02-03_v7_fetch_ryzer_page_for_dates_editor_safe";

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
  var lim = n || 1400;
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

function isRyzerRegLink(url) {
  var u = lc(url || "");
  if (!u) return false;
  if (u.indexOf("register.ryzer.com/camp.cfm") === -1) return false;
  if (u.indexOf("id=") === -1) return false;
  return true;
}

function extractRyzerLinksFromHtml(html, baseUrl, maxLinks) {
  var out = [];
  if (!html) return out;

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

// Best-effort pull of title near the reg link in the camp site HTML
function bestEffortTitleNearLink(html, regUrl) {
  if (!html || !regUrl) return null;

  var idMatch = /[?&]id=([0-9]+)/i.exec(regUrl);
  var needle = null;
  if (idMatch && idMatch[1]) needle = "id=" + idMatch[1];
  if (!needle) needle = regUrl;

  var idx = html.indexOf(needle);
  if (idx < 0) return null;

  var start = idx - 2000;
  if (start < 0) start = 0;
  var windowText = html.slice(start, idx + 200);

  // Try to find last <a ...>TEXT</a> in that window
  var aRe = /<a[^>]*>([^<]{3,220})<\/a>/gi;
  var lastText = null;
  var m;
  while ((m = aRe.exec(windowText)) !== null) {
    var t = stripNonAscii(m[1]);
    if (!t) continue;
    lastText = t;
  }

  return lastText;
}

// --------------------
// Date parsing helpers
// --------------------

var MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

function pad2(n) {
  var s = String(n);
  return s.length === 1 ? "0" + s : s;
}

function ymd(y, m, d) {
  return String(y) + "-" + pad2(m) + "-" + pad2(d);
}

// Parse numeric and month-name date patterns from a text blob.
// Returns { start_date, end_date, notes }
function parseDatesFromText(text, defaultYear) {
  var t = stripNonAscii(text || "");
  if (!t) return { start_date: null, end_date: null, notes: "no_text" };

  // Numeric range: 06/12/2026 - 06/13/2026
  var numRange = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(t);
  if (numRange) {
    var m1 = Number(numRange[1]), d1 = Number(numRange[2]), y1 = Number(numRange[3]);
    var m2 = Number(numRange[4]), d2 = Number(numRange[5]), y2 = Number(numRange[6]);
    return { start_date: ymd(y1, m1, d1), end_date: ymd(y2, m2, d2), notes: "numeric_range" };
  }

  // Numeric single: 06/12/2026
  var numSingle = /(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(t);
  if (numSingle) {
    var ms = Number(numSingle[1]), ds = Number(numSingle[2]), ys = Number(numSingle[3]);
    return { start_date: ymd(ys, ms, ds), end_date: null, notes: "numeric_single" };
  }

  // Month range: February 21st - 22nd  (year implied)
  var monthRange = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(st|nd|rd|th)?\s*[-–]\s*(\d{1,2})(st|nd|rd|th)?/i.exec(t);
  if (monthRange) {
    var monName = lc(monthRange[1]);
    var mNum = MONTHS[monName] || null;
    var dStart = Number(monthRange[2]);
    var dEnd = Number(monthRange[4]);
    var yr = Number(defaultYear || new Date().getFullYear());
    if (mNum) return { start_date: ymd(yr, mNum, dStart), end_date: ymd(yr, mNum, dEnd), notes: "monthname_range" };
  }

  // Month single: February 21st
  var monthSingle = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(st|nd|rd|th)?/i.exec(t);
  if (monthSingle) {
    var monName2 = lc(monthSingle[1]);
    var mNum2 = MONTHS[monName2] || null;
    var dOne = Number(monthSingle[2]);
    var yr2 = Number(defaultYear || new Date().getFullYear());
    if (mNum2) return { start_date: ymd(yr2, mNum2, dOne), end_date: null, notes: "monthname_single" };
  }

  return { start_date: null, end_date: null, notes: "no_date_pattern" };
}

// Extract likely date line from a title like:
// "View Youth Camp Session | February 21st - 22nd Details"
function extractDateLineFromTitle(title) {
  var t = stripNonAscii(title || "");
  if (!t) return null;

  // Pipe segment usually contains the date
  var parts = t.split("|");
  if (parts.length >= 2) {
    var candidate = stripNonAscii(parts[1]);
    return candidate || null;
  }

  // Month name anywhere
  var monthAny = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i.exec(t);
  if (monthAny) return monthAny[0];

  // Numeric any
  var numAny = /\d{1,2}\/\d{1,2}\/\d{4}/i.exec(t);
  if (numAny) return numAny[0];

  return null;
}

// Fetch Ryzer registration page and try to extract a date-like line.
// This is the critical fix for "Prospect Camp 1" type links.
async function fetchAndParseRyzerDates(regUrl) {
  var debug = { http: 0, snippet: null, foundLine: null, parseNotes: null };

  try {
    var r = await fetch(regUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
        Accept: "text/html,*/*"
      }
    });

    debug.http = r.status;

    var html = await r.text();
    debug.snippet = truncate(html, 900);

    if (!r.ok) {
      debug.parseNotes = "ryzer_fetch_non_200";
      return { start_date: null, end_date: null, notes: "ryzer_fetch_failed", debug: debug };
    }

    // Look for common date labels in Ryzer pages.
    // We capture a window after the label and attempt to parse dates from it.
    var labelRe = /(camp\s*dates|dates|date)\s*[:\-]\s*([^<\n\r]{6,80})/i;
    var lm = labelRe.exec(html);
    var line = null;

    if (lm && lm[2]) {
      line = stripNonAscii(lm[2]);
    }

    // If label not found, brute force: find first month-name date sequence
    if (!line) {
      var monthLine = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}[^<\n\r]{0,40}/i.exec(html);
      if (monthLine && monthLine[0]) line = stripNonAscii(monthLine[0]);
    }

    // Or numeric date
    if (!line) {
      var numLine = /\d{1,2}\/\d{1,2}\/\d{4}[^<\n\r]{0,40}/i.exec(html);
      if (numLine && numLine[0]) line = stripNonAscii(numLine[0]);
    }

    debug.foundLine = line;

    var parsed = parseDatesFromText(line, new Date().getFullYear());
    debug.parseNotes = parsed.notes;

    return { start_date: parsed.start_date, end_date: parsed.end_date, notes: "ryzer_page:" + parsed.notes, debug: debug };
  } catch (e) {
    debug.parseNotes = "ryzer_exception";
    return { start_date: null, end_date: null, notes: "ryzer_exception", debug: debug };
  }
}

function deriveProgramIdFromRyzerUrl(regUrl) {
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
    firstSiteHtmlSnippet: null,
    ryzerDebugSamples: []
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
    if (testSiteUrl) urlsToProcess = [testSiteUrl];
    else if (siteUrls && siteUrls.length) urlsToProcess = siteUrls.slice(0, maxSites);
    else {
      return new Response(JSON.stringify({
        error: "Missing required: testSiteUrl OR siteUrls[]",
        version: VERSION,
        debug: debug
      }), { status: 400, headers: { "Content-Type": "application/json" } });
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

        if (!debug.firstSiteHtmlSnippet) debug.firstSiteHtmlSnippet = truncate(html, 1600);

        if (!r.ok) {
          siteNotes.push("site_fetch_non_200");
          errors.push({ siteUrl: siteUrl, error: "site_fetch_failed", http: siteHttp });
        } else {
          regLinks = extractRyzerLinksFromHtml(html, siteUrl, maxRegsPerSite);

          if (!regLinks.length) {
            siteNotes.push("no_registration_links_found");
          } else {
            for (var li = 0; li < regLinks.length; li++) {
              if (accepted.length >= maxEvents) break;

              var regUrl = regLinks[li];
              processedRegs += 1;

              var title = bestEffortTitleNearLink(html, regUrl) || "Camp Registration";
              title = stripNonAscii(title);

              // 1) Parse dates from title
              var dateLine = extractDateLineFromTitle(title);
              var parsed = parseDatesFromText(dateLine, new Date().getFullYear());

              var startDate = parsed.start_date;
              var endDate = parsed.end_date;
              var parseSource = "title:" + parsed.notes;

              // 2) If missing, fetch Ryzer registration page and parse there
              if (!startDate) {
                var ryzerParsed = await fetchAndParseRyzerDates(regUrl);
                startDate = ryzerParsed.start_date;
                endDate = ryzerParsed.end_date;
                parseSource = ryzerParsed.notes;

                // capture a few debug samples (bounded)
                if (debug.ryzerDebugSamples.length < 3) {
                  debug.ryzerDebugSamples.push({
                    regUrl: regUrl,
                    title: title,
                    ryzer_http: (ryzerParsed.debug && ryzerParsed.debug.http) || 0,
                    foundLine: (ryzerParsed.debug && ryzerParsed.debug.foundLine) || null,
                    parseNotes: (ryzerParsed.debug && ryzerParsed.debug.parseNotes) || null,
                    snippet: (ryzerParsed.debug && ryzerParsed.debug.snippet) || null
                  });
                }
              }

              // Fail-closed if still missing
              if (!startDate) {
                rejected.push({
                  reason: "missing_start_date",
                  title: title,
                  registrationUrl: regUrl,
                  event_dates_line: dateLine || null,
                  parse_source: parseSource
                });
                continue;
              }

              var programId = deriveProgramIdFromRyzerUrl(regUrl);
              var evKey = makeEventKey("sportsusa", programId, startDate, String(li));

              accepted.push({
                event: {
                  sportId: sportId,
                  sportName: sportName,
                  camp_name: title,
                  start_date: startDate,
                  end_date: endDate,
                  link_url: regUrl,
                  source_platform: "sportsusa",
                  source_url: regUrl,
                  event_dates_raw: dateLine || null
                },
                derived: {
                  program_id: programId,
                  event_key: evKey,
                  parse_source: parseSource,
                  site_url: siteUrl
                }
              });
            }
          }
        }

        debug.siteDebug.push({
          siteUrl: siteUrl,
          http: siteHttp,
          htmlType: htmlType,
          regLinks: regLinks.length,
          sample: regLinks.length ? regLinks[0] : "",
          notes: siteNotes.join(",")
        });
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
