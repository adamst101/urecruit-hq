// functions/ryzerIngest.js
// Base44 Backend Function (Deno)
//
// Goal:
// - Call Ryzer eventSearch
// - Return normalized events with host_name_guess (best effort)
// - Fail-closed sport gate (prevents cross-sport leakage from being accepted)
// - Strong host guardrails to prevent junk schools (K-12, clubs, training, etc)
// - NO optional chaining / NO nullish coalescing (editor-safe)

var VERSION = "ryzerIngest_2026-02-02_v12_fail_closed_sport_and_host";

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
  // Note: Ryzer returns data.events + data.totalresults in your logs
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

// Fail-closed: if host is missing or looks like K-12 / club / training / generic, reject.
function rejectHostReason(hostGuess) {
  var h = lc(stripNonAscii(hostGuess || ""));
  if (!h) return "missing_host";
  if (h.length < 4) return "host_too_short";

  // Strong reject terms (include your list + K-12 "school(s)")
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
    "performance",
    " facility",
    " complex"
  ];

  for (var i = 0; i < rejectContains.length; i++) {
    var term = rejectContains[i];
    if (term && h.indexOf(term) !== -1) return "host_reject_term:" + term;
  }

  // Generic-only host strings we never want to auto-create
  var genericOnly = ["prospect camp", "elite camp", "skills camp", "clinic", "camp", "showcase"];
  for (var j = 0; j < genericOnly.length; j++) {
    if (h === genericOnly[j]) return "host_generic";
  }

  // College keyword gate (conservative)
  // We only auto-create if host looks like an actual college/university program.
  // This prevents “Franklin Community Schools” and similar from creating junk Schools.
  var hasCollegeSignal =
    h.indexOf("university") !== -1 ||
    h.indexOf("college") !== -1 ||
    h.indexOf("univ") !== -1 ||
    h.indexOf("u of ") !== -1 ||
    h.indexOf(" u-") !== -1;

  if (!hasCollegeSignal) return "host_not_college_keyword";

  return null;
}

function deriveHostGuess(row) {
  var candidates = [];

  // organizer is present in your earlier raw payloads
  if (row && row.organizer) candidates.push(row.organizer);
  if (row && row.Organizer) candidates.push(row.Organizer);

  // other possible fields
  if (row && row.accountName) candidates.push(row.accountName);
  if (row && row.AccountName) candidates.push(row.AccountName);
  if (row && row.hostName) candidates.push(row.hostName);
  if (row && row.HostName) candidates.push(row.HostName);
  if (row && row.organizationName) candidates.push(row.organizationName);
  if (row && row.OrganizationName) candidates.push(row.OrganizationName);
  if (row && row.schoolName) candidates.push(row.schoolName);
  if (row && row.SchoolName) candidates.push(row.SchoolName);
  if (row && row.accountDisplayName) candidates.push(row.accountDisplayName);
  if (row && row.AccountDisplayName) candidates.push(row.AccountDisplayName);

  // Normalize + pick first that passes host guardrails
  for (var i = 0; i < candidates.length; i++) {
    var c = stripNonAscii(safeString(candidates[i]) || "");
    if (!c) continue;
    var reason = rejectHostReason(c);
    if (!reason) {
      return { host_name_guess: c, host_source: "row_field" };
    }
  }

  // fallback: title parsing
  var t = titleText(row);

  if (t && t.indexOf(" @ ") !== -1) {
    var parts = t.split(" @ ");
    var last = stripNonAscii(parts[parts.length - 1] || "");
    var r1 = rejectHostReason(last);
    if (!r1) return { host_name_guess: last, host_source: "title_at_pattern" };
  }

  // give best effort rejectedReason for debug
  var best = candidates.length ? stripNonAscii(safeString(candidates[0]) || "") : null;
  return {
    host_name_guess: best,
    host_source: best ? "row_field_rejected" : "unknown",
    rejectedReason: rejectHostReason(best) || "missing_host"
  };
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
    try {
      body = await req.json();
    } catch (e) {
      body = null;
    }

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var activityTypeId = safeString(body && body.activityTypeId);

    var recordsPerPage = Number((body && body.recordsPerPage) || 25);
    var maxPages = Number((body && body.maxPages) || 1);
    var maxEvents = Number((body && body.maxEvents) || 100);
    var dryRun = !!(body && body.dryRun);

    // Default true (fail-closed)
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

    for (var page = 0; page < maxPages; page++) {
      if (processed >= maxEvents) break;

      // Match DevTools payload fields
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
        try {
          respText = await r.text();
        } catch (e2) {
          respText = "";
        }

        rawJson = tryParseJsonString(respText);

        var topKeys = [];
        if (rawJson && typeof rawJson === "object" && !Array.isArray(rawJson)) topKeys = Object.keys(rawJson);

        var norm = normalizeRyzerResponse(rawJson);
        var normalized = norm.normalized;
        var dataWasString = norm.dataWasString;
        var innerKeys = norm.innerKeys;

        var respKeys = [];
        if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) respKeys = Object.keys(normalized);

        var extracted = extractRowsAndMeta(normalized);
        var rows = extracted.rows;
        var total = extracted.total;
        var rowsArrayPath = extracted.rowsArrayPath;

        // unique activity names (for diagnostics)
        var uniq = {};
        for (var u = 0; u < rows.length; u++) {
          var nm = rowActivityTypeName(rows[u]);
          if (nm) uniq[nm] = true;
        }
        var uniqueActivityNames = Object.keys(uniq);

        // sample keys (helps us see if activityTypeId exists per row)
        var sampleRowKeys = [];
        if (rows && rows.length && rows[0] && typeof rows[0] === "object") {
          sampleRowKeys = Object.keys(rows[0]).slice(0, 80);
        }

        debug.pages.push({
          version: VERSION,
          page: page,
          http: http,
          reqPayload: reqPayload,
          respKeys: respKeys.length ? respKeys : topKeys,
          dataWasString: dataWasString,
          innerKeys: innerKeys,
          rowsArrayPath: rowsArrayPath,
          rowCount: Array.isArray(rows) ? rows.length : 0,
          total: total || null,
          uniqueActivityNames: uniqueActivityNames,
          sampleRowKeys: sampleRowKeys,
          respSnippet: truncate(respText, 1400)
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

          // FAIL-CLOSED sport gate:
          // If enforceSportNameGate and sportName provided, require row.activitytype to exist AND match.
          if (enforceSportNameGate && sportName) {
            var rowTypeName = rowActivityTypeName(row);
            if (!rowTypeName) {
              rejectedMissingActivityType += 1;
              rejected.push({
                reason: "missing_activitytype",
                expected: { sportName: sportName, activityTypeId: activityTypeId },
                title: title,
                registrationUrl: url
              });
              processed += 1;
              continue;
            }
            if (lc(rowTypeName) !== lc(sportName)) {
              rejectedWrongSport += 1;
              rejected.push({
                reason: "wrong_sport",
                expected: { sportName: sportName, activityTypeId: activityTypeId },
                got: { rowTypeName: rowTypeName },
                title: title,
                registrationUrl: url
              });
              processed += 1;
              continue;
            }
          }

          // Host derivation + guardrails (fail-closed)
          var derived = deriveHostGuess(row);
          var hostGuess = derived.host_name_guess;

          var hostReject = rejectHostReason(hostGuess);
          if (hostReject) {
            if (hostReject === "missing_host") rejectedMissingHost += 1;
            else rejectedJunkHost += 1;

            rejected.push({
              reason: hostReject,
              title: title,
              registrationUrl: url,
              host_guess: hostGuess
            });

            processed += 1;
            continue;
          }

          // Accepted
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
              city: city,
              state: state,
              activitytype_returned: rowActivityTypeName(row)
            },
            debug: {
              host_rejected_reason: derived.rejectedReason || null
            }
          });

          processed += 1;
        }
      } catch (e3) {
        var msg = String((e3 && e3.message) || e3);
        errors.push({ page: page, error: msg });
        debug.pages.push({
          version: VERSION,
          page: page,
          http: http || 0,
          reqPayload: reqPayload,
          respKeys: [],
          dataWasString: false,
          innerKeys: [],
          rowsArrayPath: "exception",
          rowCount: 0,
          total: null,
          uniqueActivityNames: [],
          sampleRowKeys: [],
          respSnippet: truncate(respText || msg, 1400)
        });
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
        rejectedMissingActivityType: rejectedMissingActivityType
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
