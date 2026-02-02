// functions/ryzerIngest.js
// Base44 Backend Function (Deno.serve required)
//
// Purpose: Call Ryzer eventSearch endpoint and return normalized events with host_name_guess.
// No DB writes here. AdminImport does School upsert + CampDemo write.
//
// Key: this version avoids optional chaining / nullish coalescing for Base44 editor validators.

"use strict";

var VERSION = "ryzerIngest_2026-01-29_v10_editor_safe_no_optional_chaining";

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
  var str = String(s || "");
  var lim = Number(n || 1200);
  return str.length > lim ? str.slice(0, lim) + "...(truncated)" : str;
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

// Handles { success:true, data:"{...json...}" }
function normalizeRyzerResponse(respJson) {
  var out = { normalized: respJson, dataWasString: false, innerKeys: [] };

  if (!respJson || typeof respJson !== "object") return out;

  if (typeof respJson.data === "string") {
    var inner = tryParseJsonString(respJson.data);
    if (inner && typeof inner === "object") {
      var keys = [];
      for (var k in inner) keys.push(k);

      out.normalized = { success: respJson.success, data: inner };
      out.dataWasString = true;
      out.innerKeys = keys;
    }
  }

  return out;
}

function extractRowsAndMeta(respJson) {
  var rows = [];
  var total = null;
  var path = "not_found";

  if (respJson && Array.isArray(respJson.events)) {
    rows = respJson.events;
    total = respJson.total || respJson.count || respJson.Total || null;
    path = "events";
    return { rows: rows, total: total, rowsArrayPath: path };
  }

  if (respJson && respJson.data && Array.isArray(respJson.data.events)) {
    rows = respJson.data.events;
    total = respJson.data.totalresults || respJson.data.total || respJson.data.count || null;
    path = "data.events";
    return { rows: rows, total: total, rowsArrayPath: path };
  }

  if (respJson && Array.isArray(respJson.records)) {
    rows = respJson.records;
    total = respJson.totalRecords || respJson.total || null;
    path = "records";
    return { rows: rows, total: total, rowsArrayPath: path };
  }

  if (respJson && respJson.data && Array.isArray(respJson.data.records)) {
    rows = respJson.data.records;
    total = respJson.data.totalRecords || respJson.data.total || null;
    path = "data.records";
    return { rows: rows, total: total, rowsArrayPath: path };
  }

  if (respJson && Array.isArray(respJson.items)) {
    rows = respJson.items;
    total = respJson.total || respJson.count || null;
    path = "items";
    return { rows: rows, total: total, rowsArrayPath: path };
  }

  if (respJson && respJson.data && Array.isArray(respJson.data.items)) {
    rows = respJson.data.items;
    total = respJson.data.total || respJson.data.count || null;
    path = "data.items";
    return { rows: rows, total: total, rowsArrayPath: path };
  }

  return { rows: rows, total: total, rowsArrayPath: path };
}

function titleText(row) {
  if (!row) return "";
  var t =
    safeString(row.eventTitle) ||
    safeString(row.EventTitle) ||
    safeString(row.title) ||
    safeString(row.Title) ||
    safeString(row.name) ||
    safeString(row.Name) ||
    "";
  return stripNonAscii(t);
}

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
  return (
    safeString(row.city) ||
    safeString(row.City) ||
    safeString(row.locationCity) ||
    safeString(row.LocationCity) ||
    null
  );
}

function pickState(row) {
  if (!row) return null;
  return (
    safeString(row.state) ||
    safeString(row.State) ||
    safeString(row.locationState) ||
    safeString(row.LocationState) ||
    null
  );
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

// Reject if host looks non-college/junk (fail-closed)
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
    var term = String(rejectContains[i] || "").trim();
    if (term && h.indexOf(term) >= 0) return "host_reject_term:" + term;
  }

  var personHints = ["coach ", "trainer", "director", "private", "personal"];
  for (var j = 0; j < personHints.length; j++) {
    var ph = String(personHints[j] || "").trim();
    if (ph && h.indexOf(ph) >= 0) return "host_person_hint:" + ph;
  }

  if (
    h === "prospect camp" ||
    h === "elite camp" ||
    h === "skills camp" ||
    h === "clinic" ||
    h === "camp" ||
    h === "showcase"
  ) {
    return "host_generic";
  }

  return null;
}

function deriveHostGuess(row) {
  var candidates = [];

  if (row) {
    candidates.push(safeString(row.organizer));
    candidates.push(safeString(row.Organizer));
    candidates.push(safeString(row.organiser));
    candidates.push(safeString(row.Organiser));

    candidates.push(safeString(row.accountName));
    candidates.push(safeString(row.AccountName));
    candidates.push(safeString(row.hostName));
    candidates.push(safeString(row.HostName));

    candidates.push(safeString(row.organizationName));
    candidates.push(safeString(row.OrganizationName));
    candidates.push(safeString(row.hostedBy));
    candidates.push(safeString(row.HostedBy));

    candidates.push(safeString(row.schoolName));
    candidates.push(safeString(row.SchoolName));
    candidates.push(safeString(row.accountDisplayName));
    candidates.push(safeString(row.AccountDisplayName));
  }

  var cleaned = [];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i]) cleaned.push(stripNonAscii(candidates[i]));
  }

  for (var c = 0; c < cleaned.length; c++) {
    if (!rejectHostReason(cleaned[c])) {
      return { host_name_guess: cleaned[c], host_source: "row_field", rejectedReason: null };
    }
  }

  var t = titleText(row);

  if (t.indexOf(" @ ") >= 0) {
    var parts = t.split(" @ ");
    var last = stripNonAscii(parts[parts.length - 1] || "");
    if (!rejectHostReason(last)) {
      return { host_name_guess: last, host_source: "title_at_pattern", rejectedReason: null };
    }
  }

  var dashMatch = t.match(/^(.+?)\s*-\s*(prospect|elite|camp|clinic)/i);
  if (dashMatch && dashMatch[1]) {
    var host = stripNonAscii(dashMatch[1]);
    if (!rejectHostReason(host)) {
      return { host_name_guess: host, host_source: "title_dash_pattern", rejectedReason: null };
    }
  }

  var best = cleaned.length ? cleaned[0] : null;
  return {
    host_name_guess: best,
    host_source: best ? "row_field_rejected" : "unknown",
    rejectedReason: rejectHostReason(best) || "missing_host"
  };
}

function uniqueActivityNames(rows) {
  var seen = {};
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var n = rowActivityTypeName(rows[i]);
    if (!n) continue;
    if (!seen[n]) {
      seen[n] = true;
      out.push(n);
    }
  }
  return out;
}

function activityPairs(rows) {
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var rr = rows[i];
    var name = rowActivityTypeName(rr) || "UNKNOWN";
    var id = rowActivityTypeId(rr) || "UNKNOWN";
    if (!map[name]) map[name] = {};
    map[name][id] = true;
  }

  var out = [];
  for (var nm in map) {
    var idsObj = map[nm];
    var ids = [];
    for (var idk in idsObj) ids.push(idk);
    out.push({ name: nm, ids: ids });
  }
  return out;
}

Deno.serve(async function (req) {
  var debug = { version: VERSION, startedAt: new Date().toISOString(), pages: [], notes: [] };

  try {
    if (!req || req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug: debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    var body = await req.json().catch(function () { return null; });

    var sportId = safeString(body && body.sportId);
    var sportName = safeString(body && body.sportName) || "";
    var activityTypeId = safeString(body && body.activityTypeId);

    var recordsPerPage = Number((body && body.recordsPerPage) || 25);
    var maxPages = Number((body && body.maxPages) || 1);
    var maxEvents = Number((body && body.maxEvents) || 100);
    var dryRun = !!(body && body.dryRun);

    // default true
    var enforceSportNameGate = !(body && body.enforceSportNameGate === false);

    // default true: if page 0 does not even contain sportName, return error to highlight filter mismatch
    var failFastOnSportFilterMismatch = !(body && body.failFastOnSportFilterMismatch === false);

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
            "Accept": "*/*",
            "authorization": auth,
            "Origin": "https://ryzer.com",
            "Referer": "https://ryzer.com/Events/?tab=eventSearch"
          },
          body: JSON.stringify(reqPayload)
        });

        http = r.status;
        respText = await r.text().catch(function () { return ""; });
        rawJson = tryParseJsonString(respText);

        var topKeys = [];
        if (rawJson && typeof rawJson === "object" && !Array.isArray(rawJson)) {
          for (var tk in rawJson) topKeys.push(tk);
        }

        var norm = normalizeRyzerResponse(rawJson);
        var normalized = norm.normalized;

        var respKeys = [];
        if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
          for (var rk in normalized) respKeys.push(rk);
        }

        var meta = extractRowsAndMeta(normalized);
        var rows = meta.rows;
        var total = meta.total;
        var rowsArrayPath = meta.rowsArrayPath;

        var uniqNames = uniqueActivityNames(rows);
        var pairs = activityPairs(rows);

        debug.pages.push({
          version: VERSION,
          page: page,
          http: http,
          reqPayload: reqPayload,
          respKeys: respKeys.length ? respKeys : topKeys,
          dataWasString: norm.dataWasString ? true : false,
          innerKeys: norm.innerKeys || [],
          rowsArrayPath: rowsArrayPath,
          rowCount: Array.isArray(rows) ? rows.length : 0,
          total: total,
          uniqueActivityNames: uniqNames,
          activityPairs: pairs,
          respSnippet: truncate(respText, 1400)
        });

        if (http === 401 || http === 403) {
          errors.push({ page: page, error: "Auth failed (HTTP " + http + ")" });
          break;
        }

        if (!rows || !rows.length) break;

        // Fail-fast if the API filter is clearly not applying for the selected sport
        if (page === 0 && failFastOnSportFilterMismatch && enforceSportNameGate && sportName) {
          var wanted = lc(sportName);
          var hasWanted = false;
          for (var ui = 0; ui < uniqNames.length; ui++) {
            if (lc(uniqNames[ui]) === wanted) {
              hasWanted = true;
              break;
            }
          }

          if (!hasWanted && uniqNames.length) {
            return new Response(
              JSON.stringify({
                error: "activity_filter_not_applied",
                request: { sportName: sportName, activityTypeId: activityTypeId, reqPayload: reqPayload },
                detected: { uniqueActivityNames: uniqNames, activityPairs: pairs },
                debug: debug
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
        }

        for (var i = 0; i < rows.length; i++) {
          if (processed >= maxEvents) break;

          var row = rows[i];
          var title = titleText(row);
          var url = pickUrl(row);
          var city = pickCity(row);
          var state = pickState(row);

          // Sport gate: reject rows whose activitytype name doesn't match selected sportName
          if (enforceSportNameGate && sportName) {
            var rowTypeName = rowActivityTypeName(row);
            if (rowTypeName && lc(rowTypeName) !== lc(sportName)) {
              rejectedWrongSport += 1;
              rejected.push({
                reason: "wrong_sport",
                expected: { sportName: sportName, activityTypeId: activityTypeId },
                got: { rowTypeName: rowTypeName, rowTypeId: rowActivityTypeId(row) },
                title: title,
                registrationUrl: url
              });
              processed += 1;
              continue;
            }
          }

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
        rejectedWrongSport: rejectedWrongSport
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
  } catch (e2) {
    debug.notes.push("top-level error: " + String((e2 && e2.message) || e2));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
