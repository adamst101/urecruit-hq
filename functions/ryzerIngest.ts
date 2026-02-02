// functions/ryzerIngest.js
// Base44 Backend Function (Deno)
//
// v13: verify sport via registration page when eventSearch returns cross-sport rows
// - Editor-safe: no optional chaining, no ??, no trailing commas
// - Fail-closed sport gate:
//    * if row.activitytype matches -> OK
//    * else fetch registration page and require it contains sport needle (e.g., "football")
// - Host guardrails reject K-12 / clubs, but allow legit college programs even without "University"

var VERSION = "ryzerIngest_2026-02-02_v13_verify_registration_page_editor_safe";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

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
  var lim = typeof n === "number" ? n : 1200;
  var str = String(s || "");
  return str.length > lim ? str.slice(0, lim) + "…(truncated)" : str;
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

function normalizeRyzerResponse(respJson) {
  if (!respJson || typeof respJson !== "object") {
    return { normalized: respJson, dataWasString: false, innerKeys: [] };
  }

  if (typeof respJson.data === "string") {
    var inner = tryParseJsonString(respJson.data);
    if (inner && typeof inner === "object") {
      var innerKeys = Object.keys(inner);
      return { normalized: { success: respJson.success, data: inner }, dataWasString: true, innerKeys: innerKeys };
    }
  }

  return { normalized: respJson, dataWasString: false, innerKeys: [] };
}

function extractRowsAndMeta(respJson) {
  var rows = null;
  var total = null;
  var path = "not_found";

  if (respJson && typeof respJson === "object") {
    if (Array.isArray(respJson.events)) {
      rows = respJson.events;
      total = respJson.total || respJson.count || respJson.Total || null;
      path = "events";
    } else if (respJson.data && typeof respJson.data === "object") {
      if (Array.isArray(respJson.data.events)) {
        rows = respJson.data.events;
        total = respJson.data.totalresults || respJson.data.total || respJson.data.count || null;
        path = "data.events";
      } else if (Array.isArray(respJson.data.Records)) {
        rows = respJson.data.Records;
        total = respJson.data.TotalRecords || respJson.data.total || null;
        path = "data.Records";
      }
    }
  }

  if (!rows) rows = [];
  return { rows: rows, total: total, rowsArrayPath: path };
}

function titleText(row) {
  var t =
    safeString(row && (row.eventTitle || row.EventTitle || row.title || row.Title || row.name || row.Name)) || "";
  return stripNonAscii(t);
}

function pickUrl(row) {
  return (
    safeString(row && (row.registrationUrl || row.RegistrationUrl || row.registration_url)) ||
    safeString(row && (row.eventUrl || row.EventUrl || row.url || row.Url)) ||
    safeString(row && (row.rlink || row.RLink)) ||
    null
  );
}

function pickCity(row) {
  return safeString(row && (row.city || row.City || row.locationCity || row.LocationCity)) || null;
}

function pickState(row) {
  return safeString(row && (row.state || row.State || row.locationState || row.LocationState)) || null;
}

function rowActivityTypeName(row) {
  return (
    safeString(
      row &&
        (row.activitytype ||
          row.activityType ||
          row.ActivityType ||
          row.ActivityTypeName ||
          row.activityTypeName)
    ) || null
  );
}

// ---------------------------
// Host derivation + guardrails
// ---------------------------

// Host guess: pick first non-empty candidate (DO NOT reject during guessing)
// We want a host guess even if it will later be rejected, so debug isn't blank.
function deriveHostGuess(row) {
  var candidates = [];

  if (row && row.organizer) candidates.push(row.organizer);
  if (row && row.Organizer) candidates.push(row.Organizer);

  if (row && row.accountName) candidates.push(row.accountName);
  if (row && row.AccountName) candidates.push(row.AccountName);

  if (row && row.organizationName) candidates.push(row.organizationName);
  if (row && row.OrganizationName) candidates.push(row.OrganizationName);

  if (row && row.hostName) candidates.push(row.hostName);
  if (row && row.HostName) candidates.push(row.HostName);

  if (row && row.schoolName) candidates.push(row.schoolName);
  if (row && row.SchoolName) candidates.push(row.SchoolName);

  if (row && row.accountDisplayName) candidates.push(row.accountDisplayName);
  if (row && row.AccountDisplayName) candidates.push(row.AccountDisplayName);

  for (var i = 0; i < candidates.length; i++) {
    var c = stripNonAscii(safeString(candidates[i]) || "");
    if (c) return { host_name_guess: c, host_source: "row_field" };
  }

  // fallback: title parsing "X @ Host"
  var t = titleText(row);
  if (t && t.indexOf(" @ ") !== -1) {
    var parts = t.split(" @ ");
    var last = stripNonAscii(parts[parts.length - 1] || "");
    if (last) return { host_name_guess: last, host_source: "title_at_pattern" };
  }

  return { host_name_guess: null, host_source: "unknown" };
}

// Reject K-12 / clubs / junk.
// Allow college programs that may not include "University" by allowing sport keyword or athletics/state.
function rejectHostReason(hostGuess, sportNeedleLc) {
  var h = lc(stripNonAscii(hostGuess || ""));
  if (!h) return "missing_host";
  if (h.length < 4) return "host_too_short";

  // Strong reject terms (K-12 + non-college orgs)
  var rejectContains = [
    "middle school",
    "high school",
    "elementary",
    "academy",
    "school",
    "schools",
    "club",
    "training",
    " llc",
    " llc.",
    " inc",
    " inc.",
    " company",
    " performance",
    " facility",
    " complex"
  ];

  for (var i = 0; i < rejectContains.length; i++) {
    var term = rejectContains[i];
    if (term && h.indexOf(term) !== -1) return "host_reject_term:" + term;
  }

  // Generic-only host strings we never want
  var genericOnly = ["prospect camp", "elite camp", "skills camp", "clinic", "camp", "showcase"];
  for (var j = 0; j < genericOnly.length; j++) {
    if (h === genericOnly[j]) return "host_generic";
  }

  // Positive signals (any one is enough)
  var hasUniversitySignal =
    h.indexOf("university") !== -1 ||
    h.indexOf("college") !== -1 ||
    h.indexOf("univ") !== -1;

  var hasAthleticsSignal = h.indexOf("athletics") !== -1 || h.indexOf("athletic") !== -1;

  var hasStateSignal = h.indexOf(" state") !== -1 || h.indexOf("state ") !== -1;

  var hasSportSignal = false;
  if (sportNeedleLc) {
    if (h.indexOf(sportNeedleLc) !== -1) hasSportSignal = true;
  }

  if (!(hasUniversitySignal || hasAthleticsSignal || hasStateSignal || hasSportSignal)) {
    return "host_not_college_signal";
  }

  return null;
}

// ---------------------------
// Registration page sport verification
// ---------------------------

async function fetchHtmlSnippet(url, msTimeout, maxChars) {
  if (!url) return { ok: false, reason: "missing_url", snippet: "" };

  var timeoutMs = typeof msTimeout === "number" ? msTimeout : 6500;
  var maxLen = typeof maxChars === "number" ? maxChars : 180000;

  var controller = new AbortController();
  var t = setTimeout(function () {
    try { controller.abort(); } catch (e) {}
  }, timeoutMs);

  try {
    var resp = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0"
      },
      signal: controller.signal
    });

    var text = "";
    try {
      text = await resp.text();
    } catch (e2) {
      text = "";
    }

    if (!resp.ok) {
      clearTimeout(t);
      return { ok: false, reason: "http_" + resp.status, snippet: truncate(text, 800) };
    }

    // cap size
    if (text.length > maxLen) text = text.slice(0, maxLen);
    clearTimeout(t);
    return { ok: true, reason: "ok", snippet: text };
  } catch (e3) {
    clearTimeout(t);
    return { ok: false, reason: "fetch_error", snippet: truncate(String((e3 && e3.message) || e3), 400) };
  }
}

function pageMentionsSport(html, sportNeedleLc) {
  if (!html || !sportNeedleLc) return false;
  var h = lc(html);
  return h.indexOf(sportNeedleLc) !== -1;
}

// ---------------------------
// Deno handler
// ---------------------------

Deno.serve(async function (req) {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    pages: [],
    notes: []
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    var body = null;
    try { body = await req.json(); } catch (e) { body = null; }

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var activityTypeId = safeString(body && body.activityTypeId);

    var recordsPerPage = Number((body && body.recordsPerPage) || 25);
    var maxPages = Number((body && body.maxPages) || 1);
    var maxEvents = Number((body && body.maxEvents) || 100);
    var dryRun = !!(body && body.dryRun);

    // NEW controls
    var sportNeedle = safeString(body && body.sportNeedle) || (sportName ? lc(sportName) : "");
    var sportNeedleLc = lc(sportNeedle);

    var verifySportOnRegistrationPage = true;
    if (body && body.verifySportOnRegistrationPage === false) verifySportOnRegistrationPage = false;

    var enforceSportNameGate = true;
    if (body && body.enforceSportNameGate === false) enforceSportNameGate = false;

    if (!sportId || !activityTypeId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId/activityTypeId", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    var auth = Deno.env.get("RYZER_AUTH");
    if (!auth) {
      debug.notes.push("Missing env secret RYZER_AUTH.");
      return new Response(JSON.stringify({ error: "Missing secret RYZER_AUTH", debug: debug }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    var endpoint = "https://ryzer.com/rest/controller/connect/event/eventSearch/";

    var accepted = [];
    var rejected = [];
    var errors = [];

    var processed = 0;

    var rejectedMissingHost = 0;
    var rejectedJunkHost = 0;
    var rejectedWrongSport = 0;
    var rejectedMissingActivityType = 0;
    var rejectedSportVerifyFailed = 0;
    var verifiedByPage = 0;

    for (var page = 0; page < maxPages; page++) {
      if (processed >= maxEvents) break;

      var reqPayload = {
        Page: page,
        RecordsPerPage: recordsPerPage,
        SoldOut: 0,
        ActivityTypes: [activityTypeId],
        Proximity: "10000",
        accountTypeList: ["A7FA36E0-87BE-4750-9DE3-CB60DE133648"]
      };

      var http = 0;
      var respText = "";
      var rawJson = null;

      try {
        var r = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            Accept: "*/*",
            authorization: auth,
            Origin: "https://ryzer.com",
            Referer: "https://ryzer.com/Events/?tab=eventSearch"
          },
          body: JSON.stringify(reqPayload)
        });

        http = r.status;
        try { respText = await r.text(); } catch (e2) { respText = ""; }

        rawJson = tryParseJsonString(respText);

        var topKeys = [];
        if (rawJson && typeof rawJson === "object" && !Array.isArray(rawJson)) topKeys = Object.keys(rawJson);

        var norm = normalizeRyzerResponse(rawJson);
        var normalized = norm.normalized;

        var extracted = extractRowsAndMeta(normalized);
        var rows = extracted.rows;
        var total = extracted.total;
        var rowsArrayPath = extracted.rowsArrayPath;

        // unique activity names
        var uniq = {};
        for (var u = 0; u < rows.length; u++) {
          var nm = rowActivityTypeName(rows[u]);
          if (nm) uniq[nm] = true;
        }
        var uniqueActivityNames = Object.keys(uniq);

        debug.pages.push({
          version: VERSION,
          page: page,
          http: http,
          reqPayload: reqPayload,
          respKeys: topKeys,
          dataWasString: norm.dataWasString,
          innerKeys: norm.innerKeys,
          rowsArrayPath: rowsArrayPath,
          rowCount: Array.isArray(rows) ? rows.length : 0,
          total: total || null,
          uniqueActivityNames: uniqueActivityNames,
          respSnippet: truncate(respText, 900)
        });

        if (http === 401 || http === 403) {
          errors.push({ page: page, error: "Auth failed (HTTP " + http + ")" });
          break;
        }

        if (!rows || !rows.length) break;

        for (var i = 0; i < rows.length; i++) {
          if (processed >= maxEvents) break;

          var row = rows[i];
          var title = titleText(row);
          var url = pickUrl(row);
          var city = pickCity(row);
          var state = pickState(row);

          // ---- sport gate (fail-closed) ----
          var rowTypeName = rowActivityTypeName(row);
          var sportOk = true;

          if (enforceSportNameGate && sportName) {
            if (!rowTypeName) {
              // missing activity type; verify via page if enabled
              rejectedMissingActivityType += 1;
              sportOk = false;
            } else if (lc(rowTypeName) !== lc(sportName)) {
              rejectedWrongSport += 1;
              sportOk = false;
            }
          }

          var verifiedViaPage = false;
          var verifyNote = null;

          if (!sportOk) {
            if (verifySportOnRegistrationPage && url) {
              var fetched = await fetchHtmlSnippet(url, 6500, 180000);
              if (fetched.ok) {
                if (pageMentionsSport(fetched.snippet, sportNeedleLc)) {
                  sportOk = true;
                  verifiedViaPage = true;
                  verifiedByPage += 1;
                } else {
                  rejectedSportVerifyFailed += 1;
                  verifyNote = "page_missing_sport_keyword";
                }
              } else {
                rejectedSportVerifyFailed += 1;
                verifyNote = "page_fetch_failed:" + fetched.reason;
              }
            }
          }

          if (!sportOk) {
            rejected.push({
              reason: rowTypeName ? "wrong_sport" : "missing_activitytype",
              title: title,
              registrationUrl: url,
              rowTypeName: rowTypeName || null,
              verifyNote: verifyNote
            });
            processed += 1;
            continue;
          }

          // ---- host gate ----
          var derived = deriveHostGuess(row);
          var hostGuess = derived.host_name_guess;

          var hostReject = rejectHostReason(hostGuess, sportNeedleLc);
          if (hostReject) {
            if (hostReject === "missing_host") rejectedMissingHost += 1;
            else rejectedJunkHost += 1;

            rejected.push({
              reason: hostReject,
              title: title,
              registrationUrl: url,
              host_guess: hostGuess || ""
            });

            processed += 1;
            continue;
          }

          // accepted
          accepted.push({
            event: {
              sportId: sportId,
              sportName: sportName,
              activityTypeId: activityTypeId,
              eventTitle: title,
              eventDates: safeString(row && (row.daterange || row.startdate)) || null,
              grades: safeString(row && row.graderange) || null,
              registerBy: safeString(row && row.regEndDate) || null,
              price: safeString(row && row.cost) || null,
              registrationUrl: url,
              city: city,
              state: state,
              source_event_id: safeString(row && row.id) || null,
              raw: row
            },
            derived: {
              host_name_guess: hostGuess,
              host_source: derived.host_source,
              activitytype_returned: rowTypeName || null,
              verified_via_page: verifiedViaPage
            }
          });

          processed += 1;
        }
      } catch (e3) {
        var msg = String((e3 && e3.message) || e3);
        errors.push({ page: page, error: msg });
        break;
      }
    }

    var response = {
      stats: {
        processed: processed,
        accepted: accepted.length,
        rejected: rejected.length,
        errors: errors.length,
        rejectedMissingHost: rejectedMissingHost,
        rejectedJunkHost: rejectedJunkHost,
        rejectedWrongSport: rejectedWrongSport,
        rejectedMissingActivityType: rejectedMissingActivityType,
        rejectedSportVerifyFailed: rejectedSportVerifyFailed,
        verifiedByPage: verifiedByPage
      },
      debug: debug,
      errors: errors.slice(0, 10),
      accepted: dryRun ? accepted.slice(0, 25) : accepted,
      rejected_samples: rejected.slice(0, 25)
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (eTop) {
    debug.notes.push("top-level error: " + String((eTop && eTop.message) || eTop));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
