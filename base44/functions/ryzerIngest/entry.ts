// functions/ryzerIngest.js
import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
// Base44 Backend Function (Deno)
//
// v14 goals:
// - FIX: sport gating uses activityTypeId first (not only activitytype name)
// - FIX: return stats in the shape AdminImport expects (processed, missingHost, junkHost, wrongSport)
// - Keep editor-safe syntax: NO optional chaining, NO ??, no TS
// - Still supports nested { success:true, data:"{...}" } response

var VERSION = "ryzerIngest_2026-02-02_v14_sport_gate_by_id_stats_compatible_editor_safe";

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
  return String(s || "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(s, n) {
  var limit = typeof n === "number" ? n : 1200;
  var str = String(s || "");
  return str.length > limit ? str.slice(0, limit) + "…(truncated)" : str;
}

function tryParseJsonString(s) {
  if (typeof s !== "string") return null;
  var t = s.trim();
  if (!t) return null;
  if (!(t.charAt(0) === "{" || t.charAt(0) === "[")) return null;
  try {
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

function isObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

// ---------------------------
// response normalization
// ---------------------------
function normalizeRyzerResponse(respJson) {
  if (!isObject(respJson)) return { normalized: respJson, dataWasString: false, innerKeys: [] };

  if (typeof respJson.data === "string") {
    var inner = tryParseJsonString(respJson.data);
    if (isObject(inner)) {
      return {
        normalized: { success: respJson.success, data: inner },
        dataWasString: true,
        innerKeys: Object.keys(inner),
      };
    }
  }

  return { normalized: respJson, dataWasString: false, innerKeys: [] };
}

// ---------------------------
// row extraction
// ---------------------------
function extractRowsAndMeta(respJson) {
  if (isObject(respJson) && isObject(respJson.data) && Array.isArray(respJson.data.events)) {
    return {
      rows: respJson.data.events,
      total: respJson.data.totalresults || respJson.data.total || respJson.data.count || null,
      rowsArrayPath: "data.events",
    };
  }

  if (isObject(respJson) && Array.isArray(respJson.events)) {
    return {
      rows: respJson.events,
      total: respJson.total || respJson.count || null,
      rowsArrayPath: "events",
    };
  }

  if (isObject(respJson)) {
    var keys = Object.keys(respJson);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (Array.isArray(respJson[k])) return { rows: respJson[k], total: null, rowsArrayPath: k };
    }
    if (isObject(respJson.data)) {
      var dk = Object.keys(respJson.data);
      for (var j = 0; j < dk.length; j++) {
        var dkey = dk[j];
        if (Array.isArray(respJson.data[dkey])) return { rows: respJson.data[dkey], total: null, rowsArrayPath: "data." + dkey };
      }
    }
  }

  return { rows: [], total: null, rowsArrayPath: "not_found" };
}

// ---------------------------
// field helpers
// ---------------------------
function titleText(row) {
  return stripNonAscii(
    safeString(row && (row.eventTitle || row.EventTitle || row.title || row.Title || row.name || row.Name)) || ""
  );
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
  return safeString(
    row && (row.activitytype || row.activityType || row.ActivityType || row.ActivityTypeName || row.activityTypeName)
  ) || null;
}

function rowActivityTypeId(row) {
  return safeString(
    row && (row.activityTypeId || row.ActivityTypeId || row.activitytypeid || row.ActivityTypeID || row.activity_type_id)
  ) || null;
}

// ---------------------------
// host derivation + guardrails
// ---------------------------
function deriveHostGuess(row) {
  var candidates = [
    safeString(row && row.organizer),
    safeString(row && row.Organizer),
    safeString(row && row.accountName),
    safeString(row && row.AccountName),
    safeString(row && row.hostName),
    safeString(row && row.HostName),
    safeString(row && row.organizationName),
    safeString(row && row.OrganizationName),
    safeString(row && row.schoolName),
    safeString(row && row.SchoolName),
  ];

  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    if (c) return { host: stripNonAscii(c), source: "row_field" };
  }

  var t = titleText(row);
  if (t.indexOf(" @ ") >= 0) {
    var parts = t.split(" @ ");
    var last = stripNonAscii(parts[parts.length - 1] || "");
    if (last) return { host: last, source: "title_at_pattern" };
  }

  return { host: "", source: "missing" };
}

// fail-closed: reject junk/non-college hosts
function rejectHostReason(hostGuess) {
  var h = lc(stripNonAscii(hostGuess || ""));
  if (!h) return "missing_host";
  if (h.length < 4) return "host_too_short";

  // Obvious non-college patterns (tune this list as you see data)
  var rejectContains = [
    "middle school",
    "high school",
    "elementary",
    "community schools",
    "cub quest",
    "yoga",
    "dance",
    "cheer",
    "clinic", // (optional: you can remove if this is too strict)
  ];

  for (var i = 0; i < rejectContains.length; i++) {
    if (h.indexOf(rejectContains[i]) >= 0) return "junk_host";
  }

  // Allow only if it looks like a college program (heuristic)
  if (h.indexOf("university") >= 0) return null;
  if (h.indexOf("college") >= 0) return null;

  // If you want to be slightly looser: allow "state" or "athletics"
  if (h.indexOf("athletics") >= 0) return null;
  if (h.indexOf("state") >= 0 && h.indexOf("university") >= 0) return null;

  return "junk_host";
}

// ---------------------------
// sport gate (FIXED)
// ---------------------------
// Accept if row activity type ID matches requested activityTypeId.
// If missing, fall back to activity type NAME match.
// If still missing, (optional) fall back to title contains "football" when sportName is Football.
function sportGate(row, sportName, requestedActivityTypeId) {
  var wantId = safeString(requestedActivityTypeId);
  var gotId = rowActivityTypeId(row);

  if (wantId && gotId) {
    if (lc(gotId) === lc(wantId)) return { ok: true, reason: null };
    return { ok: false, reason: "wrong_sport" };
  }

  var wantName = lc(sportName || "");
  var gotName = lc(rowActivityTypeName(row) || "");

  if (wantName && gotName) {
    if (gotName === wantName) return { ok: true, reason: null };
    return { ok: false, reason: "wrong_sport" };
  }

  // optional heuristic: if user asked Football, allow title contains football
  if (wantName === "football") {
    var t = lc(titleText(row));
    if (t.indexOf("football") >= 0) return { ok: true, reason: null };
  }

  return { ok: false, reason: "missing_activitytype" };
}

// ---------------------------
// Deno handler
// ---------------------------
Deno.serve(async function (req) {
  var debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    pages: [],
    notes: [],
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    var base44 = createClientFromRequest(req);
    var user = await base44.auth.me().catch(function() { return null; });
    if (!user || user.role !== "admin") {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
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
    var maxPages = Number((body && body.maxPages) || 10);
    var maxEvents = Number((body && body.maxEvents) || 200);
    var dryRun = !!(body && body.dryRun);

    if (!sportId || !activityTypeId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId/activityTypeId", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    var auth = Deno.env.get("RYZER_AUTH");
    if (!auth) {
      debug.notes.push("Missing env secret RYZER_AUTH (set in Base44 Secrets).");
      return new Response(JSON.stringify({ error: "Missing secret RYZER_AUTH", debug: debug }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    var endpoint = "https://ryzer.com/rest/controller/connect/event/eventSearch/";

    var accepted = [];
    var rejected = [];
    var errors = [];

    // STATS — keep compatible with your existing AdminImport logging
    var processed = 0; // how many rows evaluated
    var missingHost = 0;
    var junkHost = 0;
    var wrongSport = 0;

    // Collector behavior: keep paging until we collect enough accepted rows
    for (var page = 0; page < maxPages; page++) {
      if (accepted.length >= maxEvents) break;

      var reqPayload = {
        Page: page,
        RecordsPerPage: recordsPerPage,
        SoldOut: 0,
        ActivityTypes: [activityTypeId],
        Proximity: "10000",
        accountTypeList: ["A7FA36E0-87BE-4750-9DE3-CB60DE133648"],
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
            Referer: "https://ryzer.com/Events/?tab=eventSearch",
          },
          body: JSON.stringify(reqPayload),
        });

        http = r.status;

        try {
          respText = await r.text();
        } catch (e2) {
          respText = "";
        }

        rawJson = tryParseJsonString(respText);

        var topKeys = isObject(rawJson) ? Object.keys(rawJson) : [];

        var norm = normalizeRyzerResponse(rawJson);
        var normalized = norm.normalized;

        var respKeys = isObject(normalized) ? Object.keys(normalized) : [];

        var extracted = extractRowsAndMeta(normalized);
        var rows = extracted.rows;
        var total = extracted.total;
        var rowsArrayPath = extracted.rowsArrayPath;

        // Unique activity names observed (helps prove leakage)
        var uniq = {};
        for (var ui = 0; ui < rows.length; ui++) {
          var nm = rowActivityTypeName(rows[ui]);
          if (nm) uniq[nm] = true;
        }
        var uniqueActivityNames = Object.keys(uniq);

        debug.pages.push({
          version: VERSION,
          page: page,
          http: http,
          reqPayload: reqPayload,
          respKeys: respKeys.length ? respKeys : topKeys,
          dataWasString: norm.dataWasString,
          innerKeys: norm.innerKeys,
          rowsArrayPath: rowsArrayPath,
          rowCount: Array.isArray(rows) ? rows.length : 0,
          total: total,
          uniqueActivityNames: uniqueActivityNames,
          respSnippet: truncate(respText, 1400),
        });

        if (http === 401 || http === 403) {
          errors.push({ page: page, error: "Auth failed (HTTP " + http + ")" });
          break;
        }

        if (!rows || !rows.length) break;

        for (var i = 0; i < rows.length; i++) {
          if (accepted.length >= maxEvents) break;

          var row = rows[i];
          processed += 1;

          var title = titleText(row);
          var url = pickUrl(row);

          // 1) sport gate (fixed)
          var sg = sportGate(row, sportName, activityTypeId);
          if (!sg.ok) {
            if (sg.reason === "wrong_sport") wrongSport += 1;

            rejected.push({
              reason: sg.reason,
              title: title,
              registrationUrl: url,
              rowTypeName: rowActivityTypeName(row),
              rowTypeId: rowActivityTypeId(row),
            });
            continue;
          }

          // 2) host gate (fail-closed)
          var d = deriveHostGuess(row);
          var hostGuess = d.host;

          var hr = rejectHostReason(hostGuess);
          if (hr) {
            if (hr === "missing_host" || hr === "host_too_short") missingHost += 1;
            else junkHost += 1;

            rejected.push({
              reason: hr,
              host_guess: hostGuess,
              title: title,
              registrationUrl: url,
              rowTypeName: rowActivityTypeName(row),
              rowTypeId: rowActivityTypeId(row),
            });
            continue;
          }

          // Accepted
          accepted.push({
            derived: {
              host_name_guess: hostGuess,
              host_source: d.source,
              activitytype_returned: rowActivityTypeName(row),
              activitytypeid_returned: rowActivityTypeId(row),
              city: pickCity(row),
              state: pickState(row),
            },
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
              source_event_id: safeString(row && row.id) || null,
              raw: row,
            },
          });
        }
      } catch (e) {
        var msg = String((e && e.message) || e);
        errors.push({ page: page, error: msg });
        break;
      }
    }

    // Return keys that your AdminImport already prints
    var response = {
      stats: {
        accepted: accepted.length,
        rejected: rejected.length,
        errors: errors.length,
        processed: processed,       // ✅ back to processed
        missingHost: missingHost,   // ✅ back to missingHost
        junkHost: junkHost,         // ✅ back to junkHost
        wrongSport: wrongSport,     // ✅ back to wrongSport
      },
      debug: debug,
      errors: errors.slice(0, 10),
      accepted: dryRun ? accepted.slice(0, 25) : accepted,
      rejected: rejected.slice(0, 25),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (eTop) {
    debug.notes.push("top-level error: " + String((eTop && eTop.message) || eTop));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
