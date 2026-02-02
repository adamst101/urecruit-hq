// functions/ryzerIngest.js
// Base44 Backend Function (Deno)
//
// Goal:
// - Call Ryzer eventSearch
// - Return normalized events WITH host_name_guess (best effort)
// - Fail-closed: reject junk/non-college hosts
// - Enforce sport gate client-safe (reject wrong sport rows)
// - Add a single fallback payload attempt if Ryzer ignores ActivityTypes
//
// Base44 editor-safe:
// - No optional chaining
// - No external imports
// - Uses Deno.serve(async (req) => ...)

const VERSION = "ryzerIngest_2026-02-02_v11_payload_fallback_editor_safe";

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
  if (!(t[0] === "{" || t[0] === "[")) return null;
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

  // If { success:true, data:"{...json...}" }, parse inner JSON string
  if (typeof respJson.data === "string") {
    var inner = tryParseJsonString(respJson.data);
    if (inner && typeof inner === "object") {
      return {
        normalized: { success: respJson.success, data: inner },
        dataWasString: true,
        innerKeys: Object.keys(inner || {})
      };
    }
  }

  return { normalized: respJson, dataWasString: false, innerKeys: Object.keys(respJson || {}) };
}

function extractRowsAndMeta(respJson) {
  var candidates = [
    { path: "events", rows: respJson && respJson.events, total: respJson && (respJson.total || respJson.count || respJson.Total) },
    { path: "Events", rows: respJson && respJson.Events, total: respJson && (respJson.total || respJson.Total) },
    { path: "Records", rows: respJson && respJson.Records, total: respJson && (respJson.TotalRecords || respJson.total || respJson.Total) },
    { path: "records", rows: respJson && respJson.records, total: respJson && (respJson.totalRecords || respJson.total || respJson.Total) },

    // nested data
    { path: "data.events", rows: respJson && respJson.data && respJson.data.events, total: respJson && respJson.data && (respJson.data.totalresults || respJson.data.total || respJson.data.count) },
    { path: "data.Records", rows: respJson && respJson.data && respJson.data.Records, total: respJson && respJson.data && (respJson.data.TotalRecords || respJson.data.total) },
    { path: "data.records", rows: respJson && respJson.data && respJson.data.records, total: respJson && respJson.data && (respJson.data.totalRecords || respJson.data.total) }
  ];

  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    if (Array.isArray(c.rows)) {
      return { rows: c.rows, total: c.total !== undefined ? c.total : null, rowsArrayPath: c.path };
    }
  }

  // Sometimes API returns an object with a single array
  if (respJson && typeof respJson === "object") {
    var keys = Object.keys(respJson);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (Array.isArray(respJson[key])) {
        return { rows: respJson[key], total: null, rowsArrayPath: key };
      }
    }
  }

  // Also check respJson.data for single array
  if (respJson && respJson.data && typeof respJson.data === "object") {
    var dkeys = Object.keys(respJson.data);
    for (var dk = 0; dk < dkeys.length; dk++) {
      var dkey = dkeys[dk];
      if (Array.isArray(respJson.data[dkey])) {
        return { rows: respJson.data[dkey], total: null, rowsArrayPath: "data." + dkey };
      }
    }
  }

  return { rows: [], total: null, rowsArrayPath: "not_found" };
}

// Row helpers
function titleText(row) {
  var t =
    safeString(row && (row.eventTitle || row.EventTitle || row.title || row.Title || row.name || row.Name)) ||
    "";
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

  var rejectContains = [
    "middle school",
    "high school",
    "elementary",
    "academy",
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
    if (h.indexOf(term) >= 0) return "host_reject_term:" + term.trim();
  }

  var personHints = ["coach ", "trainer", "director", "private", "personal"];
  for (var j = 0; j < personHints.length; j++) {
    var p = personHints[j];
    if (h.indexOf(p) >= 0) return "host_person_hint:" + p.trim();
  }

  var genericOnly = ["prospect camp", "elite camp", "skills camp", "clinic", "camp", "showcase"];
  for (var g = 0; g < genericOnly.length; g++) {
    if (h === genericOnly[g]) return "host_generic";
  }

  return null;
}

function deriveHostGuess(row) {
  var candidates = [
    row && row.organizer,
    row && row.Organizer,
    row && row.organiser,
    row && row.Organiser,

    row && row.accountName,
    row && row.AccountName,
    row && row.hostName,
    row && row.HostName,
    row && row.organizationName,
    row && row.OrganizationName,
    row && row.eventHostName,
    row && row.EventHostName,
    row && row.hostedBy,
    row && row.HostedBy,
    row && row.schoolName,
    row && row.SchoolName,
    row && row.accountDisplayName,
    row && row.AccountDisplayName
  ];

  // 1) pick first viable candidate
  for (var i = 0; i < candidates.length; i++) {
    var c = safeString(candidates[i]);
    if (!c) continue;
    var cleaned = stripNonAscii(c);
    var reason = rejectHostReason(cleaned);
    if (!reason) {
      return { host_name_guess: cleaned, host_source: "row_field", rejectedReason: null };
    }
  }

  // 2) fallback: title patterns
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

  // Return best-effort rejected
  var best = null;
  for (var k = 0; k < candidates.length; k++) {
    var b = safeString(candidates[k]);
    if (b) {
      best = stripNonAscii(b);
      break;
    }
  }

  return {
    host_name_guess: best,
    host_source: best ? "row_field_rejected" : "unknown",
    rejectedReason: rejectHostReason(best) || "missing_host"
  };
}

// ---------------------------
// Ryzer fetch helpers
// ---------------------------

async function fetchRyzerPage(endpoint, auth, reqPayload) {
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

  var http = r.status;
  var respText = await r.text().catch(function () { return ""; });

  var rawJson = tryParseJsonString(respText);
  var norm = normalizeRyzerResponse(rawJson);
  var normalized = norm.normalized;

  var extracted = extractRowsAndMeta(normalized);
  var rows = extracted.rows;
  var total = extracted.total;
  var rowsArrayPath = extracted.rowsArrayPath;

  // activity summary (names + ids)
  var pairs = {}; // name -> { ids: Set-like object }
  var uniqueNames = [];

  for (var i = 0; i < asArray(rows).length; i++) {
    var rr = rows[i];
    var nm = rowActivityTypeName(rr);
    var id = rowActivityTypeId(rr);
    if (!nm) continue;

    if (!pairs[nm]) pairs[nm] = { ids: {} };
    if (id) pairs[nm].ids[id] = true;
  }

  var nameKeys = Object.keys(pairs);
  for (var k = 0; k < nameKeys.length; k++) {
    uniqueNames.push(nameKeys[k]);
  }
  uniqueNames.sort();

  // convert ids map -> array
  var activityPairs = [];
  for (var n = 0; n < nameKeys.length; n++) {
    var name = nameKeys[n];
    var idsMap = pairs[name].ids || {};
    activityPairs.push({ name: name, ids: Object.keys(idsMap).sort() });
  }
  activityPairs.sort(function (a, b) { return a.name.localeCompare(b.name); });

  return {
    http: http,
    respText: respText,
    normalizedKeys: (normalized && typeof normalized === "object" && !Array.isArray(normalized)) ? Object.keys(normalized) : [],
    dataWasString: !!norm.dataWasString,
    innerKeys: asArray(norm.innerKeys),
    rowsArrayPath: rowsArrayPath,
    rowCount: Array.isArray(rows) ? rows.length : 0,
    total: total !== undefined ? total : null,
    rows: rows,
    uniqueActivityNames: uniqueNames,
    activityPairs: activityPairs
  };
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

    var body = await req.json().catch(function () { return null; });

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var activityTypeId = safeString(body && body.activityTypeId);

    var recordsPerPage = Number(body && body.recordsPerPage !== undefined ? body.recordsPerPage : 25);
    var maxPages = Number(body && body.maxPages !== undefined ? body.maxPages : 1);
    var maxEvents = Number(body && body.maxEvents !== undefined ? body.maxEvents : 100);
    var dryRun = !!(body && body.dryRun);

    // default true
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
      debug.notes.push("Missing env secret RYZER_AUTH (set in Base44 Secrets).");
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
    var usedFallbackPages = 0;

    for (var page = 0; page < maxPages; page++) {
      if (processed >= maxEvents) break;

      // Primary payload (matches your screenshot)
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

      try {
        // Primary attempt
        var p = await fetchRyzerPage(endpoint, auth, reqPayload);

        http = p.http;
        respText = p.respText;

        // If auth failure, stop
        if (http === 401 || http === 403) {
          errors.push({ page: page, error: "Auth failed (HTTP " + http + ")" });
          debug.pages.push({
            version: VERSION,
            page: page,
            http: http,
            attempt: "primary",
            reqPayload: reqPayload,
            respKeys: p.normalizedKeys,
            dataWasString: p.dataWasString,
            innerKeys: p.innerKeys,
            rowsArrayPath: p.rowsArrayPath,
            rowCount: p.rowCount,
            total: p.total,
            uniqueActivityNames: p.uniqueActivityNames,
            activityPairs: p.activityPairs,
            respSnippet: truncate(respText, 1400)
          });
          break;
        }

        // Decide whether to fallback:
        // If user expects Football and page 0 comes back with no Football in activity names,
        // try a single fallback payload with alternate keys (some APIs require these).
        var shouldFallback = false;
        if (page === 0 && sportName) {
          var want = lc(sportName);
          var found = false;
          for (var ui = 0; ui < asArray(p.uniqueActivityNames).length; ui++) {
            if (lc(p.uniqueActivityNames[ui]) === want) { found = true; break; }
          }
          if (!found && p.rowCount > 0) shouldFallback = true;
        }

        var used = p;
        var attemptLabel = "primary";

        if (shouldFallback) {
          // Fallback payload: keep ActivityTypes but also add common alternate parameter names.
          var reqPayload2 = {
            Page: page,
            RecordsPerPage: recordsPerPage,
            SoldOut: 0,
            ActivityTypes: [activityTypeId],

            // Alternate keys (harmless if ignored)
            ActivityTypeId: activityTypeId,
            ActivityTypeIds: [activityTypeId],
            activityTypeId: activityTypeId,
            activityTypes: [activityTypeId],

            Proximity: "10000",
            accountTypeList: ["A7FA36E0-87BE-4750-9DE3-CB60DE133648"]
          };

          var f = await fetchRyzerPage(endpoint, auth, reqPayload2);

          // If fallback includes the expected sport name, prefer it.
          var want2 = lc(sportName);
          var found2 = false;
          for (var uf = 0; uf < asArray(f.uniqueActivityNames).length; uf++) {
            if (lc(f.uniqueActivityNames[uf]) === want2) { found2 = true; break; }
          }

          if (found2) {
            used = f;
            attemptLabel = "fallback";
            usedFallbackPages += 1;
          }
        }

        debug.pages.push({
          version: VERSION,
          page: page,
          http: used.http,
          attempt: attemptLabel,
          reqPayload: attemptLabel === "fallback" ? {
            Page: page,
            RecordsPerPage: recordsPerPage,
            SoldOut: 0,
            ActivityTypes: [activityTypeId],
            ActivityTypeId: activityTypeId,
            ActivityTypeIds: [activityTypeId],
            activityTypeId: activityTypeId,
            activityTypes: [activityTypeId],
            Proximity: "10000",
            accountTypeList: ["A7FA36E0-87BE-4750-9DE3-CB60DE133648"]
          } : reqPayload,
          respKeys: used.normalizedKeys,
          dataWasString: used.dataWasString,
          innerKeys: used.innerKeys,
          rowsArrayPath: used.rowsArrayPath,
          rowCount: used.rowCount,
          total: used.total,
          uniqueActivityNames: used.uniqueActivityNames,
          activityPairs: used.activityPairs,
          respSnippet: truncate(used.respText, 1400)
        });

        var rows = asArray(used.rows);
        if (!rows.length) break;

        for (var i = 0; i < rows.length; i++) {
          if (processed >= maxEvents) break;

          var row = rows[i];

          var title = titleText(row);
          var url = pickUrl(row);
          var city = pickCity(row);
          var state = pickState(row);

          // Sport gate
          if (enforceSportNameGate && sportName) {
            var rowType = rowActivityTypeName(row);
            if (rowType && lc(rowType) !== lc(sportName)) {
              rejectedWrongSport += 1;
              rejected.push({
                reason: "wrong_sport",
                expected: { sportName: sportName, activityTypeId: activityTypeId },
                got: { rowTypeName: rowType, rowTypeId: rowActivityTypeId(row) },
                title: title,
                registrationUrl: url
              });
              processed += 1;
              continue;
            }
          }

          // Host derivation + host guardrails
          var derived = deriveHostGuess(row);
          var hostGuess = derived.host_name_guess;

          var hostReject = rejectHostReason(hostGuess);
          if (hostReject) {
            if (hostReject === "missing_host") rejectedMissingHost += 1;
            else rejectedJunkHost += 1;

            rejected.push({
              reason: hostReject,
              host_guess: hostGuess,
              title: title,
              registrationUrl: url
            });
            processed += 1;
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
              activitytype_returned: rowActivityTypeName(row)
            },
            debug: {
              host_rejected_reason: derived.rejectedReason || null
            }
          });

          processed += 1;
        }
      } catch (e) {
        var msg = String((e && e.message) || e);
        errors.push({ page: page, error: msg });

        debug.pages.push({
          version: VERSION,
          page: page,
          http: http || 0,
          attempt: "exception",
          reqPayload: reqPayload,
          respKeys: [],
          dataWasString: false,
          innerKeys: [],
          rowsArrayPath: "exception",
          rowCount: 0,
          total: null,
          uniqueActivityNames: [],
          activityPairs: [],
          respSnippet: truncate(respText || msg, 1400)
        });

        break;
      }
    }

    // Keep payloads bounded for logging
    var acceptedOut = dryRun ? accepted.slice(0, 25) : accepted;
    var rejectedOut = rejected.slice(0, 25);

    var response = {
      stats: {
        processed: processed,
        accepted: accepted.length,
        rejected: rejected.length,
        errors: errors.length,
        rejectedMissingHost: rejectedMissingHost,
        rejectedJunkHost: rejectedJunkHost,
        rejectedWrongSport: rejectedWrongSport,
        usedFallbackPages: usedFallbackPages
      },
      debug: debug,
      errors: errors.slice(0, 10),

      accepted: acceptedOut,

      // IMPORTANT: keep BOTH keys so your AdminImport doesn’t show zeros
      rejected: rejectedOut,
      rejected_samples: rejectedOut
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
