// functions/ryzerIngest.js
// Base44 Backend Function (Deno runtime)
// Purpose: Call Ryzer eventSearch server-side and return debug + accepted rows.
// NOTE: This version is “truth-finding”: it prioritizes visibility + correctness over completeness.
// Once we see the real response shape, we can add registration-page fetch + richer parsing.

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

// Try to locate an array of “rows” in a variety of possible response shapes
function extractRows(json) {
  if (!json || typeof json !== "object") return [];

  // Common candidates
  const candidates = [
    json.records,
    json.Records,
    json.results,
    json.Results,
    json.data,
    json.Data,
    json.items,
    json.Items,
    json.events,
    json.Events,
    json.eventList,
    json.EventList,
    json.searchResults,
    json.SearchResults,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }

  // Sometimes nested under a known wrapper
  if (json?.payload && Array.isArray(json.payload)) return json.payload;
  if (json?.payload?.records && Array.isArray(json.payload.records)) return json.payload.records;

  return [];
}

function extractTotal(json) {
  if (!json || typeof json !== "object") return null;
  const candidates = [
    json.total,
    json.Total,
    json.totalRecords,
    json.TotalRecords,
    json.TotalRecordCount,
    json.recordCount,
    json.RecordCount,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Very lightweight “match a row to a school list” (exact/contains)
// You can tighten later (aliases, state matching, etc.)
function findSchoolMatch({ row, schools }) {
  const schoolName = safeString(row?.schoolName || row?.SchoolName || row?.organizationName || row?.OrganizationName || row?.hostName || row?.HostName);
  const title = safeString(row?.eventTitle || row?.EventTitle || row?.title || row?.Title || row?.name || row?.Name);

  const hay = lc(`${schoolName || ""} ${title || ""}`);

  for (const s of schools) {
    const n = lc(s?.school_name);
    if (!n) continue;
    if (hay === n) return s;
    if (hay.includes(n)) return s;

    // Optional aliases array
    const aliases = asArray(s?.aliases).map((a) => lc(a)).filter(Boolean);
    for (const a of aliases) {
      if (a && hay.includes(a)) return s;
    }
  }

  return null;
}

// Hard-coded from the curl you pasted (College/University filter)
const COLLEGE_ACCOUNT_TYPE_ID = "A7FA36E0-87BE-4750-9DE3-CB60DE133648";

async function ryzerEventSearch({ activityTypeId, page, recordsPerPage, authToken }) {
  const url = "https://ryzer.com/rest/controller/connect/event/eventSearch/";

  const payload = {
    Page: page,
    RecordsPerPage: recordsPerPage,
    SoldOut: 0,
    ActivityTypes: [activityTypeId],
    Proximity: "10000",
    accountTypeList: [COLLEGE_ACCOUNT_TYPE_ID],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json; charset=UTF-8",
      Origin: "https://ryzer.com",
      Referer: "https://ryzer.com/Events/?tab=eventSearch",
      // This is your JWT from the browser (stored in Base44 Secret RYZER_AUTH)
      authorization: authToken,
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { res, text, json, payload };
}

Deno.serve(async (req) => {
  const startedAt = new Date().toISOString();

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const activityTypeId = safeString(body?.activityTypeId);
    const sportName = safeString(body?.sportName);
    const recordsPerPage = Number(body?.recordsPerPage ?? 25);
    const maxPages = Number(body?.maxPages ?? 1);
    const maxEvents = Number(body?.maxEvents ?? 50);
    const dryRun = !!body?.dryRun;

    const schools = asArray(body?.schools)
      .map((s) => ({
        id: safeString(s?.id),
        school_name: safeString(s?.school_name),
        state: safeString(s?.state),
        aliases: asArray(s?.aliases),
      }))
      .filter((s) => s.id && s.school_name);

    // Secret
    const authToken = safeString(Deno.env.get("RYZER_AUTH"));

    if (!activityTypeId) {
      return new Response(JSON.stringify({ error: "Missing activityTypeId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!authToken) {
      return new Response(JSON.stringify({ error: "Missing Base44 Secret RYZER_AUTH" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const debug = {
      startedAt,
      sportName: sportName || null,
      activityTypeId,
      recordsPerPage,
      maxPages,
      maxEvents,
      dryRun,
      schoolsCount: schools.length,
      pages: [],
    };

    const accepted = [];
    const rejected = [];
    const errors = [];

    let scanned = 0;

    for (let page = 0; page < maxPages; page++) {
      if (scanned >= maxEvents) break;

      const { res, text, json, payload } = await ryzerEventSearch({
        activityTypeId,
        page,
        recordsPerPage,
        authToken,
      });

      const status = res.status;
      const total = extractTotal(json);
      const rows = extractRows(json);

      debug.pages.push({
        page,
        requestPayload: payload,
        httpStatus: status,
        total: total ?? null,
        rowCount: rows.length,
        // include a tiny sample for debugging (safe, no token)
        sampleRowKeys: rows[0] ? Object.keys(rows[0]).slice(0, 30) : [],
        sampleRow: rows[0] ? rows[0] : null,
        // if not JSON, show first 300 chars so we can see errors
        nonJsonPreview: json ? null : text.slice(0, 300),
      });

      // Fail loudly on auth issues
      if (status === 401 || status === 403) {
        errors.push({
          page,
          type: "AUTH",
          message: `Ryzer returned HTTP ${status}. JWT likely expired/invalid or requires additional session cookies.`,
        });
        break;
      }

      // If response isn't parseable, treat as error (don’t silently return 0/0/0)
      if (!json) {
        errors.push({
          page,
          type: "PARSE",
          message: "Ryzer response was not valid JSON (see debug.pages.nonJsonPreview).",
        });
        break;
      }

      // No rows: stop early (common when you hit the end)
      if (!rows.length) {
        break;
      }

      for (const row of rows) {
        if (scanned >= maxEvents) break;
        scanned += 1;

        const school = findSchoolMatch({ row, schools });

        // If we can’t match to a known School, treat as rejected (fail-closed)
        if (!school) {
          rejected.push({
            reason: "NO_SCHOOL_MATCH",
            // keep minimal useful context
            eventTitle:
              safeString(row?.eventTitle || row?.EventTitle || row?.title || row?.Title || row?.name || row?.Name) ||
              null,
            host:
              safeString(row?.schoolName || row?.SchoolName || row?.organizationName || row?.OrganizationName || row?.hostName || row?.HostName) ||
              null,
          });
          continue;
        }

        accepted.push({
          school: {
            school_id: school.id,
            school_name: school.school_name,
            state: school.state || null,
          },
          // pass through the raw row for now; AdminImport already expects `event.*`
          event: row,
        });
      }
    }

    // stats
    const stats = {
      scanned,
      accepted: accepted.length,
      rejected: rejected.length,
      errors: errors.length,
    };

    return new Response(
      JSON.stringify(
        {
          stats,
          accepted,
          rejected: dryRun ? rejected.slice(0, 50) : rejected, // cap in dryRun to keep response light
          errors,
          debug, // <-- THIS is what you use to see what Ryzer actually returned
        },
        null,
        2
      ),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e), startedAt: new Date().toISOString() }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
