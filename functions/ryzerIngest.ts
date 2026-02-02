// functions/ryzerIngest.js
// Base44 Backend Function (Deno)
//
// Goal: Return Football-only + University-only events from Ryzer eventSearch,
// even if the API returns mixed sports on early pages.
// This function does NOT write DB. AdminImport can write School/CampDemo.
//
// Editor-safe: NO optional chaining, NO ??, NO fancy TS.

// ---- version ----
var VERSION = "ryzerIngest_2026-02-02_v13_collector_sport_and_university_editor_safe";

// ---- helpers ----
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

// ---- schools index (optional, used for stronger university gate) ----
function buildSchoolIndex(schools) {
  var list = asArray(schools)
    .map(function (s) {
      return {
        id: safeString(s && s.id) || "",
        name: safeString(s && (s.school_name || s.name)) || "",
        state: safeString(s && s.state) || "",
        aliases: asArray(s && s.aliases).map(function (a) { return safeString(a); }).filter(Boolean)
      };
    })
    .filter(function (s) { return s.id && s.name; });

  var idx = [];
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    var keys = {};
    keys[lc(stripNonAscii(s.name))] = true;
    for (var j = 0; j < s.aliases.length; j++) {
      keys[lc(stripNonAscii(s.aliases[j]))] = true;
    }
    idx.push({ id: s.id, name: s.name, state: s.state, keys: Object.keys(keys) });
  }
  return idx;
}

function matchSchoolByHost(hostText, schoolIndex) {
  var host = lc(stripNonAscii(hostText || ""));
  if (!host) return null;
  for (var i = 0; i < schoolIndex.length; i++) {
    var s = schoolIndex[i];
    for (var j = 0; j < s.keys.length; j++) {
      var k = s.keys[j];
      if (!k) continue;
      if (host === k) return s;
      if (host.indexOf(k) >= 0 && Math.min(host.length, k.length) >= 6) return s;
      if (k.indexOf(host) >= 0 && Math.min(host.length, k.length) >= 6) return s;
    }
  }
  return null;
}

// ---- response normalization ----
function normalizeRyzerResponse(respJson) {
  if (!isObject(respJson)) return { normalized: respJson, dataWasString: false, innerKeys: [] };

  if (typeof respJson.data === "string") {
    var inner = tryParseJsonString(respJson.data);
    if (isObject(inner)) {
      return { normalized: { success: respJson.success, data: inner }, dataWasString: true, innerKeys: Object.keys(inner) };
    }
  }
  return { normalized: respJson, dataWasString: false, innerKeys: [] };
}

// ---- rows extraction ----
function extractRowsAndMeta(respJson) {
  // supports: data.events (your real shape)
  if (isObject(respJson) && isObject(respJson.data) && Array.isArray(respJson.data.events)) {
    return {
      rows: respJson.data.events,
      total: respJson.data.totalresults || respJson.data.total || respJson.data.count || null,
      rowsArrayPath: "data.events"
    };
  }

  // fallback: events at top
  if (isObject(respJson) && Array.isArray(respJson.events)) {
    return { rows: respJson.events, total: respJson.total || respJson.count || null, rowsArrayPath: "events" };
  }

  // generic: first array property
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

// ---- field pickers ----
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
  return safeString(row && (row.activitytype || row.activityType || row.ActivityType || row.ActivityTypeName || row.activityTypeName)) || null;
}

// ---- host derivation ----
function deriveHostGuess(row) {
  // organizer is present in your real data sample
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
    safeString(row && row.SchoolName)
  ].filter(Boolean).map(stripNonAscii);

  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i]) return { host: candidates[i], source: "row_field" };
  }

  // fallback: "X @ Y"
  var t = titleText(row);
  if (t.indexOf(" @ ") >= 0) {
    var parts = t.split(" @ ");
    var last = stripNonAscii(parts[parts.length - 1] || "");
    if (last) return { host: last, source: "title_at_pattern" };
  }

  return { host: "", source: "missing" };
}

// ---- gating rules ----
function sportGate(row, expectedSportName) {
  var exp = lc(expectedSportName || "");
  if (!exp) return { ok: true, reason: null };

  var got = rowActivityTypeName(row);
  var gotLc = lc(got || "");

  if (!got) return { ok: false, reason: "missing_activitytype" };
  if (gotLc !== exp) return { ok: false, reason: "wrong_sport" };

  return { ok: true, reason: null };
}

function universityGate(hostGuess, schoolIndex) {
  var h = lc(stripNonAscii(hostGuess || ""));
  if (!h) return { ok: false, reason: "missing_host" };

  // hard rejects (not college programs)
  var rejectTerms = [
    "middle school",
    "high school",
    "elementary",
    "community schools",
    "cub quest",
    "youth",
    "cheer",
    "dance"
  ];
  for (var i = 0; i < rejectTerms.length; i++) {
    if (h.indexOf(rejectTerms[i]) >= 0) return { ok: false, reason: "non_university_host" };
  }

  // strongest allow: match a known School (if passed in)
  if (schoolIndex && schoolIndex.length) {
    var hit = matchSchoolByHost(hostGuess, schoolIndex);
    if (hit) return { ok: true, reason: null, matchedSchool: hit };
  }

  // heuristic allow: must look like college/university
  if (h.indexOf("university") >= 0) return { ok: true, reason: null };
  if (h.indexOf("college") >= 0) return { ok: true, reason: null };

  // otherwise fail-closed
  return { ok: false, reason: "non_university_host" };
}

// ---- Deno handler ----
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
    var maxPages = Number((body && body.maxPages) || 10);

    // IMPORTANT: treat maxEvents as "desired accepted count"
    var maxEvents = Number((body && body.maxEvents) || 100);
    var dryRun = !!(body && body.dryRun);

    var schools = asArray(body && body.schools);
    var schoolIndex = buildSchoolIndex(schools);

    debug.notes.push("schools_in=" + schools.length + " schools_indexed=" + schoolIndex.length);

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

    var scanned = 0;

    var rejectedMissingHost = 0;
    var rejectedNonUniversity = 0;
    var rejectedWrongSport = 0;
    var rejectedMissingActivityType = 0;

    // Collector: keep paging until we collect enough accepted football rows
    for (var page = 0; page < maxPages; page++) {
      if (accepted.length >= maxEvents) break;

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

        var topKeys = isObject(rawJson) ? Object.keys(rawJson) : [];

        var norm = normalizeRyzerResponse(rawJson);
        var normalized = norm.normalized;

        var respKeys = isObject(normalized) ? Object.keys(normalized) : [];

        var extracted = extractRowsAndMeta(normalized);
        var rows = extracted.rows;
        var total = extracted.total;
        var rowsArrayPath = extracted.rowsArrayPath;

        // debug: activity names on this page
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
          if (accepted.length >= maxEvents) break;

          var row = rows[i];
          scanned += 1;

          var title = titleText(row);
          var url = pickUrl(row);
          var city = pickCity(row);
          var state = pickState(row);

          // 1) sport gate (fail-closed)
          var sg = sportGate(row, sportName);
          if (!sg.ok) {
            if (sg.reason === "wrong_sport") rejectedWrongSport += 1;
            if (sg.reason === "missing_activitytype") rejectedMissingActivityType += 1;

            rejected.push({
              reason: sg.reason,
              title: title,
              registrationUrl: url,
              activitytype: rowActivityTypeName(row)
            });
            continue;
          }

          // 2) host + university gate (fail-closed)
          var d = deriveHostGuess(row);
          var hostGuess = d.host;

          var ug = universityGate(hostGuess, schoolIndex);
          if (!ug.ok) {
            if (ug.reason === "missing_host") rejectedMissingHost += 1;
            else rejectedNonUniversity += 1;

            rejected.push({
              reason: ug.reason,
              title: title,
              registrationUrl: url,
              host_guess: hostGuess
            });
            continue;
          }

          // Accepted
          accepted.push({
            school_match: ug.matchedSchool
              ? { school_id: ug.matchedSchool.id, school_name: ug.matchedSchool.name, state: ug.matchedSchool.state }
              : null,
            derived: {
              host_name_guess: hostGuess,
              host_source: d.source,
              city: city,
              state: state,
              activitytype_returned: rowActivityTypeName(row)
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
              city: city,
              state: state,
              source_event_id: safeString(row && row.id) || null,
              raw: row
            }
          });
        }
      } catch (e) {
        var msg = String((e && e.message) || e);
        errors.push({ page: page, error: msg });
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
        rejectedNonUniversity: rejectedNonUniversity,
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
