// functions/ryzerIngest.js
// Base44 Backend Function (Deno)
//
// Goal:
// - Call Ryzer eventSearch endpoint
// - Return normalized events with host_name_guess (best effort)
// - Fail-closed filters:
//    - Sport gate (enforce requested sport)
//    - Host guardrails (avoid junk/non-college hosts)
// - IMPORTANT FIX:
//    - Scan rows until we ACCEPT maxAccepted (not until we SCAN maxAccepted)
//
// Editor-safe:
// - No optional chaining (?.)
// - No nullish coalescing (??)

const VERSION = "ryzerIngest_2026-02-02_v13_scan_until_accepted_editor_safe";

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

// --- JWT exp (debug only, does NOT log the token) ---
function tryGetJwtExpSeconds(jwt) {
  try {
    if (!jwt) return null;
    var parts = String(jwt).split(".");
    if (parts.length < 2) return null;
    var payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    // pad base64
    while (payloadB64.length % 4 !== 0) payloadB64 += "=";
    var json = atob(payloadB64);
    var obj = JSON.parse(json);
    if (obj && typeof obj.exp === "number") return obj.exp;
    return null;
  } catch (e) {
    return null;
  }
}

// ✅ Handles nested response { success:true, data:"{...json...}" }
function normalizeRyzerResponse(respJson) {
  if (!respJson || typeof respJson !== "object") {
    return { normalized: respJson, dataWasString: false, innerKeys: [] };
  }

  if (typeof respJson.data === "string") {
    var inner = tryParseJsonString(respJson.data);
    if (inner && typeof inner === "object") {
      var keys = [];
      try {
        keys = Object.keys(inner);
      } catch (e) {
        keys = [];
      }
      return { normalized: { success: respJson.success, data: inner }, dataWasString: true, innerKeys: keys };
    }
  }

  return { normalized: respJson, dataWasString: false, innerKeys: [] };
}

// ✅ Find rows in MANY places (including data.events)
function extractRowsAndMeta(respJson) {
  var rows = [];
  var total = null;
  var path = "not_found";

  function isArr(a) {
    return Array.isArray(a);
  }

  // direct
  if (isArr(respJson && respJson.events)) {
    rows = respJson.events;
    total = respJson.total || respJson.count || respJson.Total || null;
    path = "events";
    return { rows: rows, total: total, rowsArrayPath: path };
  }

  // nested data
  if (respJson && respJson.data && isArr(respJson.data.events)) {
    rows = respJson.data.events;
    total = respJson.data.totalresults || respJson.data.total || respJson.data.count || null;
    path = "data.events";
    return { rows: rows, total: total, rowsArrayPath: path };
  }

  // fallbacks
  if (isArr(respJson && respJson.Records)) {
    rows = respJson.Records;
    total = respJson.TotalRecords || respJson.total || respJson.Total || null;
    path = "Records";
    return { rows: rows, total: total, rowsArrayPath: path };
  }

  if (respJson && respJson.data && isArr(respJson.data.Records)) {
    rows = respJson.data.Records;
    total = respJson.data.TotalRecords || respJson.data.total || null;
    path = "data.Records";
    return { rows: rows, total: total, rowsArrayPath: path };
  }

  // generic: find first array value at top level
  if (respJson && typeof respJson === "object") {
    try {
      var keys = Object.keys(respJson);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (Array.isArray(respJson[k])) {
          rows = respJson[k];
          total = null;
          path = k;
          return { rows: rows, total: total, rowsArrayPath: path };
        }
      }
    } catch (e) {}
  }

  // generic: find first array value inside data
  if (respJson && respJson.data && typeof respJson.data === "object") {
    try {
      var dkeys = Object.keys(respJson.data);
      for (var j = 0; j < dkeys.length; j++) {
        var dk = dkeys[j];
        if (Array.isArray(respJson.data[dk])) {
          rows = respJson.data[dk];
          total = null;
          path = "data." + dk;
          return { rows: rows, total: total, rowsArrayPath: path };
        }
      }
    } catch (e) {}
  }

  return { rows: [], total: null, rowsArrayPath: "not_found" };
}

// Title
function titleText(row) {
  var t =
    safeString(row && (row.eventTitle || row.EventTitle || row.title || row.Title || row.name || row.Name)) || "";
  return stripNonAscii(t);
}

// URL
function pickUrl(row) {
  return (
    safeString(row && (row.registrationUrl || row.RegistrationUrl || row.registration_url)) ||
    safeString(row && (row.eventUrl || row.EventUrl || row.url || row.Url)) ||
    safeString(row && (row.rlink || row.RLink)) ||
    null
  );
}

// city/state
function pickCity(row) {
  return safeString(row && (row.city || row.City || row.locationCity || row.LocationCity)) || null;
}
function pickState(row) {
  return safeString(row && (row.state || row.State || row.locationState || row.LocationState)) || null;
}

// activity type name/id (for sport gate + debug)
function rowActivityTypeName(row) {
  return (
    safeString(row && (row.activitytype || row.activityType || row.ActivityType || row.ActivityTypeName || row.activityTypeName)) ||
    null
  );
}
function rowActivityTypeId(row) {
  return (
    safeString(row && (row.activityTypeId || row.ActivityTypeId || row.activitytypeid || row.ActivityTypeID)) ||
    null
  );
}

// ---------------------------
// Host derivation + guardrails
// ---------------------------

function rejectHostReason(hostGuess) {
  var h = lc(stripNonAscii(hostGuess || ""));
  if (!h) return "missing_host";
  if (h.length < 4) return "host_too_short";

  // Strong reject terms (K-12 + clubs + vendors)
  var rejectContains = [
    "middle school",
    "high school",
    "elementary",
    "academy",
    "school district",
    "public schools",
    "community schools",
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
    if (h.indexOf(term) >= 0) return "host_reject_term:" + term;
  }

  // Person-ish hints (light heuristic)
  var personHints = ["coach ", "trainer", "director", "private", "personal"];
  for (var j = 0; j < personHints.length; j++) {
    var p = personHints[j];
    if (h.indexOf(p) >= 0) return "host_person_hint:" + p;
  }

  // Too generic by itself
  var genericOnly = {
    "prospect camp": true,
    "elite camp": true,
    "skills camp": true,
    "clinic": true,
    "camp": true,
    "showcase": true
  };
  if (genericOnly[h]) return "host_generic";

  return null;
}

function deriveHostGuess(row) {
  var candidates = [];
  function pushIf(val) {
    var s = safeString(val);
    if (s) candidates.push(stripNonAscii(s));
  }

  // ✅ organizer is present in your sample Ryzer data
  pushIf(row && (row.organizer || row.Organizer || row.organiser || row.Organiser));

  // other possible fields
  pushIf(row && (row.accountName || row.AccountName || row.accountname || row.Accountname));
  pushIf(row && (row.hostName || row.HostName || row.hostname));
  pushIf(row && (row.organizationName || row.OrganizationName || row.organizationname));
  pushIf(row && (row.eventHostName || row.EventHostName));
  pushIf(row && (row.hostedBy || row.HostedBy));
  pushIf(row && (row.schoolName || row.SchoolName));
  pushIf(row && (row.accountDisplayName || row.AccountDisplayName));

  // 1) pick first viable
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var reason = rejectHostReason(c);
    if (!reason) {
      return { host_name_guess: c, host_source: "row_field", rejectedReason: null };
    }
  }

  // 2) title parse
  var t = titleText(row);

  if (t.indexOf(" @ ") >= 0) {
    var parts = t.split(" @ ");
    var last = stripNonAscii(parts[parts.length - 1] || "");
    var r1 = rejectHostReason(last);
    if (!r1) return { host_name_guess: last, host_source: "title_at_pattern", rejectedReason: null };
  }

  var dashMatch = t.match(/^(.+?)\s*[-–]\s*(prospect|elite|camp|clinic)/i);
  if (dashMatch && dashMatch[1]) {
    var host = stripNonAscii(dashMatch[1]);
    var r2 = rejectHostReason(host);
    if (!r2) return { host_name_guess: host, host_source: "title_dash_pattern", rejectedReason: null };
  }

  var best = candidates.length ? candidates[0] : null;
  return {
    host_name_guess: best,
    host_source: best ? "row_field_rejected" : "unknown",
    rejectedReason: rejectHostReason(best) || "missing_host"
  };
}

// ---------------------------
// Sport gate helper
// ---------------------------
function sportGateReason(row, requestedSportName, requestedActivityTypeId) {
  var wantName = lc(requestedSportName || "");
  var wantId = lc(requestedActivityTypeId || "");

  var gotName = lc(rowActivityTypeName(row) || "");
  var gotId = lc(rowActivityTypeId(row) || "");

  // If API returns an activity type ID, prefer matching that exactly
  if (wantId && gotId) {
    if (gotId === wantId) return null;
    return "wrong_sport_id";
  }

  // Else fall back to name match
  if (wantName && gotName) {
    if (gotName === wantName) return null;
    return "wrong_sport_name";
  }

  // If neither field is present, fail closed
  return "missing_activitytype";
}

// ---------------------------
// Deno handler
// ---------------------------

Deno.serve(async (req) => {
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

    var recordsPerPage = Number(body && body.recordsPerPage);
    if (!isFinite(recordsPerPage) || recordsPerPage <= 0) recordsPerPage = 25;

    var maxPages = Number(body && body.maxPages);
    if (!isFinite(maxPages) || maxPages <= 0) maxPages = 1;

    // maxAccepted = how many ACCEPTED events to return (target)
    var maxAccepted = Number(body && body.maxEvents);
    if (!isFinite(maxAccepted) || maxAccepted <= 0) maxAccepted = 100;

    // maxScanned = safety cap on how many rows we will scan total
    var maxScanned = Number(body && body.maxScanned);
    if (!isFinite(maxScanned) || maxScanned <= 0) maxScanned = maxAccepted * 25; // default scan budget

    var dryRun = !!(body && body.dryRun);

    if (!sportId || !activityTypeId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId/activityTypeId", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    var auth = Deno.env.get("RYZER_AUTH");
    if (!auth) {
      debug.notes.push("Missing env secret RYZER_AUTH (Base44 Secrets).");
      return new Response(JSON.stringify({ error: "Missing secret RYZER_AUTH", debug: debug }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // JWT exp debug (helps catch “token is stale but still returns 200 weirdness”)
    var exp = tryGetJwtExpSeconds(auth);
    if (exp) {
      debug.notes.push("auth_jwt_exp_utc=" + new Date(exp * 1000).toISOString());
    } else {
      debug.notes.push("auth_jwt_exp_utc=unknown");
    }

    var endpoint = "https://ryzer.com/rest/controller/connect/event/eventSearch/";

    var accepted = [];
    var rejected = [];
    var errors = [];

    var scanned = 0;

    var rejectedMissingHost = 0;
    var rejectedJunkHost = 0;
    var rejectedWrongSport = 0;

    for (var page = 0; page < maxPages; page++) {
      if (accepted.length >= maxAccepted) break;
      if (scanned >= maxScanned) break;

      var reqPayload = {
        Page: page,
        RecordsPerPage: recordsPerPage,
        SoldOut: 0,
        ActivityTypes: [activityTypeId],
        Proximity: "10000",
        accountTypeList: ["A7FA36E0-87BE-4750-9DE3-CB60DE133648"] // College/University
      };

      var http = 0;
      var respText = "";
      var rawJson = null;

      try {
        var r = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            "Accept": "*/*",
            "authorization": auth,
            "Origin": "https://ryzer.com",
            "Referer": "https://ryzer.com/Events/?tab=eventSearch"
          },
          body: JSON.stringify(reqPayload)
        });

        http = r.status;
        try {
          respText = await r.text();
        } catch (e) {
          respText = "";
        }

        rawJson = tryParseJsonString(respText);

        var topKeys = [];
        if (rawJson && typeof rawJson === "object" && !Array.isArray(rawJson)) {
          try { topKeys = Object.keys(rawJson); } catch (e) { topKeys = []; }
        }

        var norm = normalizeRyzerResponse(rawJson);
        var normalized = norm.normalized;

        var respKeys = [];
        if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
          try { respKeys = Object.keys(normalized); } catch (e) { respKeys = []; }
        }

        var extracted = extractRowsAndMeta(normalized);
        var rows = extracted.rows;
        var total = extracted.total;
        var rowsArrayPath = extracted.rowsArrayPath;

        var uniqueActivityNames = [];
        try {
          var set = {};
          for (var u = 0; u < rows.length; u++) {
            var nm = rowActivityTypeName(rows[u]);
            if (nm) set[nm] = true;
          }
          uniqueActivityNames = Object.keys(set);
        } catch (e) {
          uniqueActivityNames = [];
        }

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
          respSnippet: truncate(respText, 1400)
        });

        if (http === 401 || http === 403) {
          errors.push({ page: page, error: "Auth failed (HTTP " + http + ")" });
          break;
        }

        if (!rows || !rows.length) {
          break;
        }

        for (var i = 0; i < rows.length; i++) {
          if (accepted.length >= maxAccepted) break;
          if (scanned >= maxScanned) break;

          var row = rows[i];
          scanned += 1;

          var title = titleText(row);
          var url = pickUrl(row);
          var city = pickCity(row);
          var state = pickState(row);

          // Sport gate
          var sg = sportGateReason(row, sportName, activityTypeId);
          if (sg) {
            rejectedWrongSport += 1;
            rejected.push({
              reason: "wrong_sport",
              sport_gate: sg,
              expected: { sportName: sportName, activityTypeId: activityTypeId },
              got: { rowTypeName: rowActivityTypeName(row), rowTypeId: rowActivityTypeId(row) },
              title: title,
              registrationUrl: url
            });
            continue;
          }

          // Host derivation
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
            continue;
          }

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
              activitytype_returned: rowActivityTypeName(row) || null,
              activitytype_id_returned: rowActivityTypeId(row) || null
            },
            debug: {
              host_rejected_reason: derived.rejectedReason || null
            }
          });
        }
      } catch (e) {
        var msg = String((e && e.message) || e);
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
          respSnippet: truncate(respText || msg, 1400)
        });

        break;
      }
    }

    var response = {
      stats: {
        scanned: scanned,
        accepted: accepted.length,
        rejected: rejected.length,
        errors: errors.length,
        rejectedMissingHost: rejectedMissingHost,
        rejectedJunkHost: rejectedJunkHost,
        rejectedWrongSport: rejectedWrongSport,
        maxAccepted: maxAccepted,
        maxScanned: maxScanned
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
  } catch (e) {
    debug.notes.push("top-level error: " + String((e && e.message) || e));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
