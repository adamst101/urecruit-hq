// functions/ryzerIngest.js
// Base44 Backend Function (Deno)
//
// Purpose:
// Call Ryzer eventSearch endpoint server-side and return normalized events with host_name_guess
// (best-effort) + strict reject reasons (fail-closed) WITHOUT requiring a Schools table.
//
// Key fixes in this version:
// 1) Adds activityPairs (activity name -> activityTypeId observed) to debug so you can identify the REAL Football guid.
// 2) Adds "activity_filter_not_applied" fail-fast when Ryzer returns no rows for the selected sportName.
// 3) Avoids OPTIONAL CHAINING (?.) to prevent Base44 editor validation errors.
// 4) Keeps nested { success:true, data:"{...json...}" parsing and robust row extraction.
//
// NOTE: This function returns data only. AdminImport does DB writes (School upsert + CampDemo write).

const VERSION = "ryzerIngest_2026-02-02_v11_activity_pairs_editor_safe";

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
  if (!(t[0] === "{" || t[0] === "[")) return null;
  try {
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

// Handles nested response shapes including { success:true, data:"{...json...}" }
function normalizeRyzerResponse(respJson) {
  if (!respJson || typeof respJson !== "object") {
    return { normalized: respJson, dataWasString: false, innerKeys: [] };
  }

  if (typeof respJson.data === "string") {
    var inner = tryParseJsonString(respJson.data);
    if (inner && typeof inner === "object") {
      var innerKeys = Object.keys(inner);
      var normalized = {};
      // shallow copy
      Object.keys(respJson).forEach(function (k) {
        normalized[k] = respJson[k];
      });
      normalized.data = inner;
      return { normalized: normalized, dataWasString: true, innerKeys: innerKeys };
    }
  }

  return { normalized: respJson, dataWasString: false, innerKeys: [] };
}

// Find rows in MANY places (including data.events)
function extractRowsAndMeta(respJson) {
  function pickTotal(obj) {
    if (!obj || typeof obj !== "object") return null;
    return (
      obj.totalresults ||
      obj.total ||
      obj.count ||
      obj.Total ||
      obj.TotalRecords ||
      obj.totalRecords ||
      null
    );
  }

  var candidates = [
    { path: "events", rows: respJson && respJson.events, total: pickTotal(respJson) },
    { path: "Events", rows: respJson && respJson.Events, total: pickTotal(respJson) },
    { path: "Records", rows: respJson && respJson.Records, total: pickTotal(respJson) },
    { path: "records", rows: respJson && respJson.records, total: pickTotal(respJson) },
    { path: "items", rows: respJson && respJson.items, total: pickTotal(respJson) },

    {
      path: "data.events",
      rows: respJson && respJson.data && respJson.data.events,
      total: respJson && respJson.data ? pickTotal(respJson.data) : null,
    },
    {
      path: "data.Events",
      rows: respJson && respJson.data && respJson.data.Events,
      total: respJson && respJson.data ? pickTotal(respJson.data) : null,
    },
    {
      path: "data.Records",
      rows: respJson && respJson.data && respJson.data.Records,
      total: respJson && respJson.data ? pickTotal(respJson.data) : null,
    },
    {
      path: "data.records",
      rows: respJson && respJson.data && respJson.data.records,
      total: respJson && respJson.data ? pickTotal(respJson.data) : null,
    },
    {
      path: "data.items",
      rows: respJson && respJson.data && respJson.data.items,
      total: respJson && respJson.data ? pickTotal(respJson.data) : null,
    },

    {
      path: "Result.Records",
      rows: respJson && respJson.Result && respJson.Result.Records,
      total: respJson && respJson.Result ? pickTotal(respJson.Result) : null,
    },
    {
      path: "result.records",
      rows: respJson && respJson.result && respJson.result.records,
      total: respJson && respJson.result ? pickTotal(respJson.result) : null,
    },
  ];

  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    if (Array.isArray(c.rows)) {
      return { rows: c.rows, total: c.total, rowsArrayPath: c.path };
    }
  }

  // Sometimes API returns an object with a single array value
  if (respJson && typeof respJson === "object") {
    var keys = Object.keys(respJson);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (Array.isArray(respJson[key])) {
        return { rows: respJson[key], total: null, rowsArrayPath: key };
      }
    }
  }

  // Also check inside respJson.data (object) for a single array
  if (respJson && respJson.data && typeof respJson.data === "object" && !Array.isArray(respJson.data)) {
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

// Title (Ryzer often uses `name`)
function titleText(row) {
  if (!row) return "";
  return stripNonAscii(
    safeString(row.eventTitle) ||
      safeString(row.EventTitle) ||
      safeString(row.title) ||
      safeString(row.Title) ||
      safeString(row.name) ||
      safeString(row.Name) ||
      ""
  );
}

// Ryzer commonly returns `rlink` to register. Include all variants.
function pickUrl(row) {
  if (!row) return null;
  return (
    safeString(row.registrationUrl) ||
    safeString(row.RegistrationUrl) ||
    safeString(row.registration_url) ||
    safeString(row.eventUrl) ||
    safeString(row.EventUrl) ||
    safeString(row.url) ||
    safeString(row.Url) ||
    safeString(row.rlink) ||
    safeString(row.RLink) ||
    null
  );
}

function pickCity(row) {
  if (!row) return null;
  return safeString(row.city) || safeString(row.City) || safeString(row.locationCity) || safeString(row.LocationCity) || null;
}

function pickState(row) {
  if (!row) return null;
  return safeString(row.state) || safeString(row.State) || safeString(row.locationState) || safeString(row.LocationState) || null;
}

function rowActivityTypeName(row) {
  if (!row) return null;
  return (
    safeString(row.activitytype) ||
    safeString(row.activityType) ||
    safeString(row.ActivityType) ||
    safeString(row.ActivityTypeName) ||
    safeString(row.activityTypeName) ||
    null
  );
}

function rowActivityTypeId(row) {
  if (!row) return null;
  return (
    safeString(row.activityTypeId) ||
    safeString(row.ActivityTypeId) ||
    safeString(row.activitytypeid) ||
    safeString(row.ActivityTypeID) ||
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
    " complex",
  ];

  for (var i = 0; i < rejectContains.length; i++) {
    var term = rejectContains[i];
    if (h.indexOf(term) !== -1) return "host_reject_term:" + term.trim();
  }

  var personHints = ["coach ", "trainer", "director", "private", "personal"];
  for (var j = 0; j < personHints.length; j++) {
    var p = personHints[j];
    if (h.indexOf(p) !== -1) return "host_person_hint:" + p.trim();
  }

  var genericOnly = ["prospect camp", "elite camp", "skills camp", "clinic", "camp", "showcase"];
  for (var g = 0; g < genericOnly.length; g++) {
    if (h === genericOnly[g]) return "host_generic";
  }

  return null;
}

function deriveHostGuess(row) {
  var candidates = [];
  function pushIf(v) {
    var s = safeString(v);
    if (s) candidates.push(stripNonAscii(s));
  }

  if (row) {
    // Critical: your Ryzer data includes organizer
    pushIf(row.organizer);
    pushIf(row.Organizer);
    pushIf(row.organiser);
    pushIf(row.Organiser);

    // Other possible host/org fields
    pushIf(row.accountName);
    pushIf(row.AccountName);
    pushIf(row.accountname);
    pushIf(row.Accountname);
    pushIf(row.hostName);
    pushIf(row.HostName);
    pushIf(row.hostname);
    pushIf(row.organizationName);
    pushIf(row.OrganizationName);
    pushIf(row.organizationname);
    pushIf(row.eventHostName);
    pushIf(row.EventHostName);
    pushIf(row.hostedBy);
    pushIf(row.HostedBy);
    pushIf(row.schoolName);
    pushIf(row.SchoolName);
    pushIf(row.accountDisplayName);
    pushIf(row.AccountDisplayName);
  }

  // 1) pick first viable candidate
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var reason = rejectHostReason(c);
    if (!reason) {
      return { host_name_guess: c, host_source: "row_field", rejectedReason: null };
    }
  }

  // 2) fallback: title parsing patterns
  var t = titleText(row);

  // "Something @ Host"
  if (t.indexOf(" @ ") !== -1) {
    var parts = t.split(" @ ");
    var last = stripNonAscii(parts[parts.length - 1] || "");
    var r1 = rejectHostReason(last);
    if (!r1) {
      return { host_name_guess: last, host_source: "title_at_pattern", rejectedReason: null };
    }
  }

  // "{Host} - Prospect Camp"
  var dashMatch = t.match(/^(.+?)\s*[-–]\s*(prospect|elite|camp|clinic)/i);
  if (dashMatch && dashMatch[1]) {
    var host = stripNonAscii(dashMatch[1]);
    var r2 = rejectHostReason(host);
    if (!r2) {
      return { host_name_guess: host, host_source: "title_dash_pattern", rejectedReason: null };
    }
  }

  // If all candidates rejected, return best effort + reason
  var best = candidates.length ? candidates[0] : null;
  return {
    host_name_guess: best,
    host_source: best ? "row_field_rejected" : "unknown",
    rejectedReason: rejectHostReason(best) || "missing_host",
  };
}

// Build activityPairs for debugging: [{ name, ids:[], count }]
function buildActivityPairs(rows) {
  var map = {}; // name -> { idsMap, count }
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var name = rowActivityTypeName(row);
    if (!name) continue;
    var key = String(name);
    if (!map[key]) map[key] = { idsMap: {}, count: 0 };

    map[key].count += 1;

    var id = rowActivityTypeId(row);
    if (id) map[key].idsMap[String(id)] = true;
  }

  var out = [];
  Object.keys(map).forEach(function (nameKey) {
    var ids = Object.keys(map[nameKey].idsMap);
    out.push({ name: nameKey, ids: ids, count: map[nameKey].count });
  });

  out.sort(function (a, b) {
    return String(a.name).localeCompare(String(b.name));
  });

  return out;
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

    var body = null;
    try {
      body = await req.json();
    } catch (e) {
      body = null;
    }

    // Inputs
    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var activityTypeId = safeString(body && body.activityTypeId);
    var recordsPerPage = Number((body && body.recordsPerPage) || 25);
    var maxPages = Number((body && body.maxPages) || 1);
    var maxEvents = Number((body && body.maxEvents) || 100);
    var dryRun = !!(body && body.dryRun);

    // default true unless explicitly false
    var enforceSportNameGate = true;
    if (body && body.enforceSportNameGate === false) enforceSportNameGate = false;

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

    var processed = 0;

    // stats
    var rejectedMissingHost = 0;
    var rejectedJunkHost = 0;
    var rejectedWrongSport = 0;

    // fail-fast info (if we detect filter mismatch)
    var failFastError = null;
    var failFastDetected = null;

    for (var page = 0; page < maxPages; page++) {
      if (processed >= maxEvents) break;

      var reqPayload = {
        Page: page,
        RecordsPerPage: recordsPerPage,
        SoldOut: 0,
        ActivityTypes: [activityTypeId], // attempt single-sport filter
        Proximity: "10000",
        accountTypeList: ["A7FA36E0-87BE-4750-9DE3-CB60DE133648"], // College/University
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
        } catch (e1) {
          respText = "";
        }
        rawJson = tryParseJsonString(respText);

        var topKeys = [];
        if (rawJson && typeof rawJson === "object" && !Array.isArray(rawJson)) {
          topKeys = Object.keys(rawJson);
        }

        var norm = normalizeRyzerResponse(rawJson);
        var normalized = norm.normalized;
        var dataWasString = norm.dataWasString;
        var innerKeys = norm.innerKeys;

        var respKeys = [];
        if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
          respKeys = Object.keys(normalized);
        }

        var meta = extractRowsAndMeta(normalized);
        var rows = meta.rows;
        var total = meta.total;
        var rowsArrayPath = meta.rowsArrayPath;

        var uniqueActivityNames = [];
        var seen = {};
        for (var ua = 0; ua < asArray(rows).length; ua++) {
          var nm = rowActivityTypeName(rows[ua]);
          if (nm && !seen[nm]) {
            seen[nm] = true;
            uniqueActivityNames.push(nm);
          }
        }
        uniqueActivityNames.sort(function (a, b) {
          return String(a).localeCompare(String(b));
        });

        var activityPairs = buildActivityPairs(asArray(rows));

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
          total: total,
          uniqueActivityNames: uniqueActivityNames,
          activityPairs: activityPairs,
          respSnippet: truncate(respText, 1400),
        });

        if (http === 401 || http === 403) {
          errors.push({ page: page, error: "Auth failed (HTTP " + http + ")" });
          break;
        }

        if (!rows || !rows.length) {
          break;
        }

        // ✅ Fail-fast (page 0 only): if requested sportName is not present in returned activity names,
        // your ActivityTypes guid is wrong or Ryzer is ignoring it.
        if (page === 0 && enforceSportNameGate && sportName) {
          var wanted = lc(sportName);
          var foundWanted = false;
          for (var f = 0; f < uniqueActivityNames.length; f++) {
            if (lc(uniqueActivityNames[f]) === wanted) {
              foundWanted = true;
              break;
            }
          }
          if (!foundWanted) {
            failFastError = "activity_filter_not_applied";
            failFastDetected = {
              uniqueActivityNames: uniqueActivityNames,
              activityPairs: activityPairs,
            };
            break;
          }
        }

        for (var ri = 0; ri < rows.length; ri++) {
          if (processed >= maxEvents) break;

          var row = rows[ri];

          var title = titleText(row);
          var url = pickUrl(row);
          var city = pickCity(row);
          var state = pickState(row);

          // Sport gate (reject non-matching activity type names)
          if (enforceSportNameGate && sportName) {
            var rowTypeName = rowActivityTypeName(row);
            if (rowTypeName && lc(rowTypeName) !== lc(sportName)) {
              rejectedWrongSport += 1;
              rejected.push({
                reason: "wrong_sport",
                expected: { sportName: sportName, activityTypeId: activityTypeId },
                got: { rowTypeName: rowTypeName, rowTypeId: rowActivityTypeId(row) },
                title: title,
                registrationUrl: url,
              });
              processed += 1;
              continue;
            }
          }

          // Host derivation + fail-closed filters
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
              host_guess: hostGuess,
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
              eventDates: safeString(row.daterange) || safeString(row.startdate) || null,
              grades: safeString(row.graderange) || null,
              registerBy: safeString(row.regEndDate) || null,
              price: safeString(row.cost) || null,
              registrationUrl: url,
              city: city,
              state: state,
              source_event_id: safeString(row.id) || null,
              raw: row,
            },
            derived: {
              host_name_guess: hostGuess,
              host_source: derived.host_source,
              city: city,
              state: state,
              activitytype_returned: rowActivityTypeName(row),
            },
            debug: {
              host_rejected_reason: derived.rejectedReason || null,
            },
          });

          processed += 1;
        }
      } catch (e2) {
        var msg = String((e2 && e2.message) || e2);
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
          activityPairs: [],
          respSnippet: truncate(respText || msg, 1400),
        });

        break;
      }
    }

    // If we fail-fast, return a response that still includes debug + stats (so your UI shows something),
    // and includes detected activityPairs so you can pick the correct Football guid.
    if (failFastError) {
      debug.notes.push(
        "FAIL_FAST: " + failFastError + " (requested sportName='" + sportName + "', activityTypeId='" + activityTypeId + "')"
      );

      var failFastResponse = {
        success: true,
        error: failFastError,
        request: {
          sportId: sportId,
          sportName: sportName,
          activityTypeId: activityTypeId,
        },
        detected: failFastDetected,
        stats: {
          processed: 0,
          accepted: 0,
          rejected: 0,
          errors: errors.length,
          rejectedMissingHost: 0,
          rejectedJunkHost: 0,
          rejectedWrongSport: 0,
        },
        debug: debug,
        errors: errors.slice(0, 10),
        accepted: [],
        rejected_samples: [],
      };

      return new Response(JSON.stringify(failFastResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
      },
      debug: debug,
      errors: errors.slice(0, 10),
      accepted: dryRun ? accepted.slice(0, 25) : accepted,
      rejected_samples: rejected.slice(0, 25),
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
