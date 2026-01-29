// functions/ryzerIngest.js
// Base44 Backend Function (Deno)

const VERSION = "ryzerIngest_2026-01-29_v6_activity_filter_guard";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function safeString(x) {
  if (x == null) return null;
  const s = String(x).trim();
  return s ? s : null;
}
function lc(x) {
  return String(x || "").toLowerCase().trim();
}
function stripNonAscii(s) {
  return String(s || "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}
function truncate(s, n) {
  const str = String(s || "");
  const lim = Number(n || 1200);
  return str.length > lim ? str.slice(0, lim) + "…(truncated)" : str;
}
function tryParseJsonString(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  if (!(t.startsWith("{") || t.startsWith("["))) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function normalizeRyzerResponse(respJson) {
  if (!respJson || typeof respJson !== "object") return { normalized: respJson, dataWasString: false, innerKeys: [] };

  if (typeof respJson.data === "string") {
    const inner = tryParseJsonString(respJson.data);
    if (inner && typeof inner === "object") {
      return { normalized: { success: respJson.success, data: inner }, dataWasString: true, innerKeys: Object.keys(inner) };
    }
  }
  return { normalized: respJson, dataWasString: false, innerKeys: [] };
}

function extractRowsAndMeta(respJson) {
  const cands = [
    { path: "events", rows: respJson && respJson.events, total: respJson && (respJson.total || respJson.count || respJson.Total) },
    { path: "data.events", rows: respJson && respJson.data && respJson.data.events, total: respJson && respJson.data && (respJson.data.totalresults || respJson.data.total || respJson.data.count) },
    { path: "records", rows: respJson && respJson.records, total: respJson && (respJson.totalRecords || respJson.total) },
    { path: "data.records", rows: respJson && respJson.data && respJson.data.records, total: respJson && respJson.data && (respJson.data.totalRecords || respJson.data.total) },
    { path: "items", rows: respJson && respJson.items, total: respJson && (respJson.total || respJson.count) },
    { path: "data.items", rows: respJson && respJson.data && respJson.data.items, total: respJson && respJson.data && (respJson.data.total || respJson.data.count) },
  ];

  for (const c of cands) {
    if (Array.isArray(c.rows)) return { rows: c.rows, total: c.total == null ? null : c.total, rowsArrayPath: c.path };
  }

  // single-array fallback
  if (respJson && typeof respJson === "object") {
    for (const k of Object.keys(respJson)) {
      if (Array.isArray(respJson[k])) return { rows: respJson[k], total: null, rowsArrayPath: k };
    }
  }
  if (respJson && respJson.data && typeof respJson.data === "object") {
    for (const k of Object.keys(respJson.data)) {
      if (Array.isArray(respJson.data[k])) return { rows: respJson.data[k], total: null, rowsArrayPath: "data." + k };
    }
  }

  return { rows: [], total: null, rowsArrayPath: "not_found" };
}

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
function rowActivityTypeId(row) {
  return safeString(row && (row.activityTypeId || row.ActivityTypeId || row.activitytypeid || row.ActivityTypeID)) || null;
}

function rejectHostReason(hostGuess) {
  const h = lc(stripNonAscii(hostGuess || ""));
  if (!h) return "missing_host";
  if (h.length < 4) return "host_too_short";

  const rejectContains = [
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

  for (const term of rejectContains) {
    const t = term.trim();
    if (t && h.includes(t)) return "host_reject_term:" + t;
  }

  const personHints = ["coach ", "trainer", "director", "private", "personal"];
  for (const term of personHints) {
    if (h.includes(term)) return "host_person_hint:" + term.trim();
  }

  const genericOnly = ["prospect camp", "elite camp", "skills camp", "clinic", "camp", "showcase"];
  if (genericOnly.includes(h)) return "host_generic";

  return null;
}

function deriveHostGuess(row) {
  const candidates = [
    row && (row.organizer || row.Organizer || row.organiser || row.Organiser),
    row && (row.accountName || row.AccountName || row.hostName || row.HostName),
    row && (row.organizationName || row.OrganizationName || row.hostedBy || row.HostedBy),
    row && (row.schoolName || row.SchoolName || row.accountDisplayName || row.AccountDisplayName),
  ]
    .map(safeString)
    .filter(Boolean)
    .map(stripNonAscii);

  for (const c of candidates) {
    if (!rejectHostReason(c)) return { host_name_guess: c, host_source: "row_field" };
  }

  const t = titleText(row);

  if (t.indexOf(" @ ") >= 0) {
    const parts = t.split(" @ ");
    const last = stripNonAscii(parts[parts.length - 1] || "");
    if (!rejectHostReason(last)) return { host_name_guess: last, host_source: "title_at_pattern" };
  }

  const dashMatch = t.match(/^(.+?)\s*[-–]\s*(prospect|elite|camp|clinic)/i);
  if (dashMatch && dashMatch[1]) {
    const host = stripNonAscii(dashMatch[1]);
    if (!rejectHostReason(host)) return { host_name_guess: host, host_source: "title_dash_pattern" };
  }

  const best = candidates.length ? candidates[0] : null;
  return {
    host_name_guess: best,
    host_source: best ? "row_field_rejected" : "unknown",
    rejectedReason: rejectHostReason(best) || "missing_host",
  };
}

Deno.serve(async (req) => {
  const debug = {
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

    const body = await req.json().catch(() => null);

    const sportId = safeString(body && body.sportId);
    const sportName = safeString(body && body.sportName) || "";
    const activityTypeId = safeString(body && body.activityTypeId);
    const recordsPerPage = Number((body && body.recordsPerPage) || 25);
    const maxPages = Number((body && body.maxPages) || 1);
    const maxEvents = Number((body && body.maxEvents) || 100);
    const dryRun = !!(body && body.dryRun);

    const enforceSportNameGate = !(body && body.enforceSportNameGate === false);
    const failFastOnSportFilterMismatch = !(body && body.failFastOnSportFilterMismatch === false);

    if (!sportId || !activityTypeId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId/activityTypeId", debug: debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const auth = Deno.env.get("RYZER_AUTH");
    if (!auth) {
      debug.notes.push("Missing env secret RYZER_AUTH (set in Base44 Secrets).");
      return new Response(JSON.stringify({ error: "Missing secret RYZER_AUTH", debug: debug }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const endpoint = "https://ryzer.com/rest/controller/connect/event/eventSearch/";

    const accepted = [];
    const rejected = [];
    const errors = [];

    let processed = 0;

    let rejectedMissingHost = 0;
    let rejectedJunkHost = 0;
    let rejectedWrongSport = 0;

    for (let page = 0; page < maxPages; page++) {
      if (processed >= maxEvents) break;

      // ✅ Belt + suspenders payload (no undefined keys)
      const reqPayload = {
        Page: page,
        RecordsPerPage: recordsPerPage,
        SoldOut: 0,
        Proximity: "10000",

        ActivityTypes: [activityTypeId],
        ActivityType: activityTypeId,
        ActivityTypeId: activityTypeId,
        ActivityTypeID: activityTypeId,
        activityTypeId: activityTypeId,

        ActivityTypeName: sportName,
        activityType: sportName,

        accountTypeList: ["A7FA36E0-87BE-4750-9DE3-CB60DE133648"],
      };

      let http = 0;
      let respText = "";
      let rawJson = null;

      try {
        const r = await fetch(endpoint, {
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
        respText = await r.text().catch(() => "");
        rawJson = tryParseJsonString(respText);

        const topKeys =
          rawJson && typeof rawJson === "object" && !Array.isArray(rawJson) ? Object.keys(rawJson) : [];

        const norm = normalizeRyzerResponse(rawJson);
        const normalized = norm.normalized;

        const respKeys =
          normalized && typeof normalized === "object" && !Array.isArray(normalized) ? Object.keys(normalized) : [];

        const meta = extractRowsAndMeta(normalized);
        const rows = meta.rows;
        const total = meta.total;
        const rowsArrayPath = meta.rowsArrayPath;

        const uniqueActivityNames = Array.from(
          new Set(asArray(rows).map((rr) => rowActivityTypeName(rr)).filter(Boolean))
        );

        debug.pages.push({
          version: VERSION,
          page: page,
          http: http,
          reqPayload: reqPayload,
          respKeys: respKeys.length ? respKeys : topKeys,
          dataWasString: !!norm.dataWasString,
          innerKeys: norm.innerKeys || [],
          rowsArrayPath: rowsArrayPath,
          rowCount: Array.isArray(rows) ? rows.length : 0,
          total: total == null ? null : total,
          uniqueActivityNames: uniqueActivityNames,
          respSnippet: truncate(respText, 1400),
        });

        if (http === 401 || http === 403) {
          errors.push({ page: page, error: "Auth failed (HTTP " + http + ")" });
          break;
        }

        if (!rows || !rows.length) break;

        // ✅ Fail fast if page 0 has rows but none match the chosen sportName
        if (
          page === 0 &&
          failFastOnSportFilterMismatch &&
          enforceSportNameGate &&
          sportName &&
          uniqueActivityNames.length > 0
        ) {
          const wanted = lc(sportName);
          const hasWanted = uniqueActivityNames.some((x) => lc(x) === wanted);

          if (!hasWanted) {
            return new Response(
              JSON.stringify({
                error: "activity_filter_not_applied",
                detected: { uniqueActivityNames: uniqueActivityNames },
                request: { sportName: sportName, activityTypeId: activityTypeId, reqPayload: reqPayload },
                debug: debug,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
        }

        for (const row of rows) {
          if (processed >= maxEvents) break;

          const title = titleText(row);
          const url = pickUrl(row);
          const city = pickCity(row);
          const state = pickState(row);

          if (enforceSportNameGate && sportName) {
            const rowTypeName = rowActivityTypeName(row);
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

          const derived = deriveHostGuess(row);
          const hostGuess = derived.host_name_guess;

          const hostReject = rejectHostReason(hostGuess);
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
              eventDates: safeString(row && (row.daterange || row.startdate)) || null,
              grades: safeString(row && row.graderange) || null,
              registerBy: safeString(row && row.regEndDate) || null,
              price: safeString(row && row.cost) || null,
              registrationUrl: url,
              city: city,
              state: state,
              source_event_id: safeString(row && row.id) || null,
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
      } catch (e) {
        const msg = String((e && e.message) || e);
        errors.push({ page: page, error: msg });
        break;
      }
    }

    const response = {
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
  } catch (e) {
    debug.notes.push("top-level error: " + String((e && e.message) || e));
    return new Response(JSON.stringify({ error: "Unhandled error", debug: debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
