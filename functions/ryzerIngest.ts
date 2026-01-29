// functions/ryzerIngest.js
// Base44 Backend Function (Deno)
// Purpose: Call Ryzer eventSearch endpoint server-side, return normalized events with host_name_guess
// (best-effort) and strong reject reasons (fail-closed) WITHOUT requiring a pre-populated Schools table.
//
// v5 changes vs your v4:
// - Removes Schools matching/gate entirely (no schools required)
// - Derives host_name_guess primarily from row.organizer (present in your Ryzer data)
// - Adds fail-closed host filters to prevent junk auto-created schools
// - Adds optional sport gate based on row.activitytype (and logs unique activity types per page)
// - Keeps your nested data:"{...json...}" normalization + robust row extraction
//
// NOTE: This function ONLY returns data. AdminImport does DB writes (School upsert + CampDemo write).

const VERSION = "ryzerIngest_2026-01-29_v5_host_guess_no_schools";

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

function truncate(s, n = 1200) {
  const str = String(s || "");
  return str.length > n ? str.slice(0, n) + "…(truncated)" : str;
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

// ✅ Handles nested response shapes including { success:true, data:"{...json...}" }
function normalizeRyzerResponse(respJson) {
  if (!respJson || typeof respJson !== "object") return { normalized: respJson, dataWasString: false, innerKeys: [] };

  if (typeof respJson.data === "string") {
    const inner = tryParseJsonString(respJson.data);
    if (inner && typeof inner === "object") {
      const innerKeys = Object.keys(inner);
      return { normalized: { ...respJson, data: inner }, dataWasString: true, innerKeys };
    }
  }

  return { normalized: respJson, dataWasString: false, innerKeys: [] };
}

// ✅ Find rows in MANY places (including data.events)
function extractRowsAndMeta(respJson) {
  const candidates = [
    { path: "events", rows: respJson?.events, total: respJson?.total || respJson?.count || respJson?.Total },
    { path: "Events", rows: respJson?.Events, total: respJson?.total || respJson?.Total },
    { path: "Records", rows: respJson?.Records, total: respJson?.TotalRecords || respJson?.total || respJson?.Total },
    { path: "records", rows: respJson?.records, total: respJson?.totalRecords || respJson?.total || respJson?.Total },
    { path: "items", rows: respJson?.items, total: respJson?.total || respJson?.count },

    { path: "data.events", rows: respJson?.data?.events, total: respJson?.data?.totalresults || respJson?.data?.total || respJson?.data?.count },
    { path: "data.Events", rows: respJson?.data?.Events, total: respJson?.data?.Total || respJson?.data?.total },
    { path: "data.Records", rows: respJson?.data?.Records, total: respJson?.data?.TotalRecords || respJson?.data?.total },
    { path: "data.records", rows: respJson?.data?.records, total: respJson?.data?.totalRecords || respJson?.data?.total },
    { path: "data.items", rows: respJson?.data?.items, total: respJson?.data?.total || respJson?.data?.count },

    { path: "Result.Records", rows: respJson?.Result?.Records, total: respJson?.Result?.TotalRecords || respJson?.Result?.total },
    { path: "result.records", rows: respJson?.result?.records, total: respJson?.result?.totalRecords || respJson?.result?.total },
  ];

  for (const c of candidates) {
    if (Array.isArray(c.rows)) {
      return { rows: c.rows, total: c.total ?? null, rowsArrayPath: c.path };
    }
  }

  // Sometimes API returns an object with a single array value
  const keys = respJson && typeof respJson === "object" ? Object.keys(respJson) : [];
  for (const k of keys) {
    if (Array.isArray(respJson[k])) {
      return { rows: respJson[k], total: null, rowsArrayPath: k };
    }
  }

  // Also check inside respJson.data (object) for a single array
  const dk = respJson?.data && typeof respJson.data === "object" ? Object.keys(respJson.data) : [];
  for (const k of dk) {
    if (Array.isArray(respJson.data[k])) {
      return { rows: respJson.data[k], total: null, rowsArrayPath: `data.${k}` };
    }
  }

  return { rows: [], total: null, rowsArrayPath: "not_found" };
}

// Title (Ryzer often uses `name`)
function titleText(row) {
  return stripNonAscii(
    safeString(row?.eventTitle || row?.EventTitle || row?.title || row?.Title || row?.name || row?.Name) || ""
  );
}

// Ryzer commonly returns `rlink` to register. Include all variants.
function pickUrl(row) {
  return (
    safeString(row?.registrationUrl) ||
    safeString(row?.RegistrationUrl) ||
    safeString(row?.registration_url) ||
    safeString(row?.eventUrl) ||
    safeString(row?.EventUrl) ||
    safeString(row?.url) ||
    safeString(row?.Url) ||
    safeString(row?.rlink) ||
    safeString(row?.RLink) ||
    null
  );
}

// City/state best-effort
function pickCity(row) {
  return safeString(row?.city || row?.City || row?.locationCity || row?.LocationCity) || null;
}
function pickState(row) {
  return safeString(row?.state || row?.State || row?.locationState || row?.LocationState) || null;
}

// Activity type name/id (for sport gating + debug)
function rowActivityTypeName(row) {
  return safeString(row?.activitytype || row?.activityType || row?.ActivityType || row?.ActivityTypeName || row?.activityTypeName) || null;
}
function rowActivityTypeId(row) {
  return safeString(row?.activityTypeId || row?.ActivityTypeId || row?.activitytypeid || row?.ActivityTypeID) || null;
}

// ---------------------------
// Host derivation + guardrails
// ---------------------------

// Reject if host looks non-college / junk (fail-closed)
function rejectHostReason(hostGuess) {
  const h = lc(stripNonAscii(hostGuess || ""));
  if (!h) return "missing_host";
  if (h.length < 4) return "host_too_short";

  // Strong reject terms you specified (+ a few obvious business suffixes)
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
    if (h.includes(term.trim())) return `host_reject_term:${term.trim()}`;
  }

  // Person-ish hints (light heuristic)
  const personHints = ["coach ", "trainer", "director", "private", "personal"];
  for (const term of personHints) {
    if (h.includes(term)) return `host_person_hint:${term.trim()}`;
  }

  // If it’s basically generic
  const genericOnly = ["prospect camp", "elite camp", "skills camp", "clinic", "camp", "showcase"];
  if (genericOnly.includes(h)) return "host_generic";

  return null;
}

// Prefer organizer; else fall back to other fields; else parse title patterns.
function deriveHostGuess(row) {
  const candidates = [
    // ✅ Critical: your Ryzer data includes organizer
    row?.organizer,
    row?.Organizer,
    row?.organiser,
    row?.Organiser,

    // Other possible host/org fields
    row?.accountName,
    row?.AccountName,
    row?.accountname,
    row?.Accountname,
    row?.hostName,
    row?.HostName,
    row?.hostname,
    row?.organizationName,
    row?.OrganizationName,
    row?.organizationname,
    row?.eventHostName,
    row?.EventHostName,
    row?.hostedBy,
    row?.HostedBy,
    row?.schoolName,
    row?.SchoolName,
    row?.accountDisplayName,
    row?.AccountDisplayName,
  ]
    .map(safeString)
    .filter(Boolean)
    .map(stripNonAscii);

  // 1) pick first viable candidate
  for (const c of candidates) {
    const reason = rejectHostReason(c);
    if (!reason) {
      return { host_name_guess: c, host_source: "row_field" };
    }
  }

  // 2) fallback: title parsing patterns
  const t = titleText(row);

  // "Something @ Host"
  if (t.includes(" @ ")) {
    const parts = t.split(" @ ");
    const last = stripNonAscii(parts[parts.length - 1] || "");
    const reason = rejectHostReason(last);
    if (!reason) {
      return { host_name_guess: last, host_source: "title_at_pattern" };
    }
  }

  // "{Host} - Prospect Camp"
  const dashMatch = t.match(/^(.+?)\s*[-–]\s*(prospect|elite|camp|clinic)/i);
  if (dashMatch?.[1]) {
    const host = stripNonAscii(dashMatch[1]);
    const reason = rejectHostReason(host);
    if (!reason) {
      return { host_name_guess: host, host_source: "title_dash_pattern" };
    }
  }

  // If all candidates rejected, return best effort + reason
  const best = candidates.find(Boolean) || null;
  return {
    host_name_guess: best,
    host_source: best ? "row_field_rejected" : "unknown",
    rejectedReason: rejectHostReason(best) || "missing_host",
  };
}

// ---------------------------
// Deno handler
// ---------------------------

Deno.serve(async (req) => {
  const debug = {
    version: VERSION,
    startedAt: new Date().toISOString(),
    pages: [],
    notes: [],
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);

    // Inputs (kept close to your v4)
    const sportId = safeString(body?.sportId);               // your internal sport id
    const sportName = safeString(body?.sportName) || "";     // display name (e.g., "Football")
    const activityTypeId = safeString(body?.activityTypeId); // Ryzer ActivityTypes GUID (required)
    const recordsPerPage = Number(body?.recordsPerPage ?? 25);
    const maxPages = Number(body?.maxPages ?? 1);
    const maxEvents = Number(body?.maxEvents ?? 100);
    const dryRun = !!body?.dryRun;

    // Optional: enforce returned activity type name matches sportName when available
    const enforceSportNameGate = body?.enforceSportNameGate !== false; // default true

    // NOTE: Schools no longer required / accepted
    if (!sportId || !activityTypeId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId/activityTypeId", debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const auth = Deno.env.get("RYZER_AUTH");
    if (!auth) {
      debug.notes.push("Missing env secret RYZER_AUTH (set in Base44 Secrets).");
      return new Response(JSON.stringify({ error: "Missing secret RYZER_AUTH", debug }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const endpoint = "https://ryzer.com/rest/controller/connect/event/eventSearch/";

    const accepted = [];
    const rejected = [];
    const errors = [];

    let processed = 0;

    // Stats for insight
    let rejectedMissingHost = 0;
    let rejectedJunkHost = 0;
    let rejectedWrongSport = 0;

    for (let page = 0; page < maxPages; page++) {
      if (processed >= maxEvents) break;

      const reqPayload = {
        Page: page,
        RecordsPerPage: recordsPerPage,
        SoldOut: 0,
        ActivityTypes: [activityTypeId], // enforce single sport request
        Proximity: "10000",
        // College/University filter (your lever)
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

        // normalize nested data:"{...}"
        const { normalized, dataWasString, innerKeys } = normalizeRyzerResponse(rawJson);

        const respKeys =
          normalized && typeof normalized === "object" && !Array.isArray(normalized) ? Object.keys(normalized) : [];

        const { rows, total, rowsArrayPath } = extractRowsAndMeta(normalized);

        // Unique activity types observed (helps diagnose “multiple sports”)
        const uniqueActivityNames = Array.from(
          new Set(asArray(rows).map((rr) => rowActivityTypeName(rr)).filter(Boolean))
        );

        debug.pages.push({
          version: VERSION,
          page,
          http,
          reqPayload,
          respKeys: respKeys.length ? respKeys : topKeys,
          dataWasString,
          innerKeys,
          rowsArrayPath,
          rowCount: Array.isArray(rows) ? rows.length : 0,
          total: total ?? null,
          uniqueActivityNames,
          respSnippet: truncate(respText, 1400),
        });

        if (http === 401 || http === 403) {
          errors.push({ page, error: `Auth failed (HTTP ${http})` });
          break;
        }

        if (!rows || !rows.length) {
          break; // no more rows
        }

        for (const row of rows) {
          if (processed >= maxEvents) break;

          const title = titleText(row);
          const url = pickUrl(row);
          const city = pickCity(row);
          const state = pickState(row);

          // -------- Sport gate (safety) --------
          // If Ryzer returns activitytype, enforce it matches sportName (when enabled).
          // This prevents “multi-sport” leakage even if the API filter is flaky.
          if (enforceSportNameGate && sportName) {
            const rowTypeName = rowActivityTypeName(row);
            if (rowTypeName && lc(rowTypeName) !== lc(sportName)) {
              rejectedWrongSport += 1;
              rejected.push({
                reason: "wrong_sport",
                expected: { sportName, activityTypeId },
                got: { rowTypeName, rowTypeId: rowActivityTypeId(row) },
                title,
                registrationUrl: url,
              });
              processed += 1;
              continue;
            }
          }

          // -------- Host derivation (best effort) --------
          const derived = deriveHostGuess(row);
          const hostGuess = derived.host_name_guess;

          const hostReject = rejectHostReason(hostGuess);
          if (hostReject) {
            if (hostReject === "missing_host") rejectedMissingHost += 1;
            else rejectedJunkHost += 1;

            rejected.push({
              reason: hostReject,
              title,
              registrationUrl: url,
              host_guess: hostGuess,
            });

            processed += 1;
            continue;
          }

          // Accepted (no DB writes here)
          accepted.push({
            event: {
              sportId,
              sportName,
              activityTypeId,
              eventTitle: title,
              eventDates: safeString(row?.daterange) || safeString(row?.startdate) || null,
              grades: safeString(row?.graderange) || null,
              registerBy: safeString(row?.regEndDate) || null,
              price: safeString(row?.cost) || null,
              registrationUrl: url,
              city,
              state,
              source_event_id: safeString(row?.id) || null,
              raw: row, // keep raw for AdminImport mapping/debug
            },
            derived: {
              host_name_guess: hostGuess,
              host_source: derived.host_source,
              city,
              state,
              activitytype_returned: rowActivityTypeName(row),
            },
            debug: {
              host_rejected_reason: derived.rejectedReason || null,
            },
          });

          processed += 1;
        }
      } catch (e) {
        const msg = String(e?.message || e);
        errors.push({ page, error: msg });

        debug.pages.push({
          version: VERSION,
          page,
          http: http || 0,
          reqPayload,
          respKeys: [],
          dataWasString: false,
          innerKeys: [],
          rowsArrayPath: "exception",
          rowCount: 0,
          total: null,
          uniqueActivityNames: [],
          respSnippet: truncate(respText || msg, 1400),
        });

        break;
      }
    }

    // Keep rejected payload bounded for logging
    const rejected_samples = rejected.slice(0, 25);

    const response = {
      stats: {
        processed,
        accepted: accepted.length,
        rejected: rejected.length,
        errors: errors.length,
        rejectedMissingHost,
        rejectedJunkHost,
        rejectedWrongSport,
      },
      debug,
      errors: errors.slice(0, 10),
      accepted: dryRun ? accepted.slice(0, 25) : accepted,
      rejected_samples,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    debug.notes.push(`top-level error: ${String(e?.message || e)}`);
    return new Response(JSON.stringify({ error: "Unhandled error", debug }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
