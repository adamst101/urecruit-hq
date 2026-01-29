// functions/ryzerIngest.js
// Base44 Backend Function (Deno runtime)

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeString(x) {
  if (x == null) return null;
  const s = String(x).trim();
  return s ? s : null;
}

function jsonSnippet(obj, max = 1200) {
  try {
    const s = typeof obj === "string" ? obj : JSON.stringify(obj);
    if (!s) return "";
    return s.length > max ? s.slice(0, max) + "…(truncated)" : s;
  } catch {
    return "";
  }
}

// Find an array of “rows” somewhere inside a nested response
function findFirstArrayWithObjects(root) {
  const visited = new Set();
  const queue = [{ node: root, path: "$" }];

  while (queue.length) {
    const { node, path } = queue.shift();

    if (!node || typeof node !== "object") continue;
    if (visited.has(node)) continue;
    visited.add(node);

    if (Array.isArray(node)) {
      // If it looks like an array of objects, return it
      if (node.length === 0) return { path, arr: node };
      const firstObj = node.find((x) => x && typeof x === "object" && !Array.isArray(x));
      if (firstObj) return { path, arr: node };
      continue;
    }

    // object -> search keys
    for (const k of Object.keys(node)) {
      const v = node[k];
      const nextPath = `${path}.${k}`;
      if (v && typeof v === "object") {
        queue.push({ node: v, path: nextPath });
      }
    }
  }

  return { path: null, arr: [] };
}

// Normalize header: Ryzer curl uses `authorization: <jwt>` (no "Bearer ")
function buildAuthHeader(raw) {
  const t = safeString(raw);
  if (!t) return null;
  // If user pasted "Bearer xxx" keep it; otherwise pass token raw.
  return t;
}

Deno.serve(async (req) => {
  const startedAt = new Date().toISOString();
  const debug = { startedAt, pages: [] };

  try {
    const body = await req.json().catch(() => ({}));

    const sportId = safeString(body?.sportId);
    const sportName = safeString(body?.sportName);
    const activityTypeId = safeString(body?.activityTypeId);

    const recordsPerPage = Number(body?.recordsPerPage ?? 25);
    const maxPages = Number(body?.maxPages ?? 1);
    const maxEvents = Number(body?.maxEvents ?? 200);
    const dryRun = !!body?.dryRun;

    // This is the key filter you used in DevTools
    // “Hosted By” = College/University
    const defaultCollegeAccountType = "A7FA36E0-87BE-4750-9DE3-CB60DE133648";
    const accountTypeList = asArray(body?.accountTypeList).filter(Boolean);
    const finalAccountTypeList = accountTypeList.length ? accountTypeList : [defaultCollegeAccountType];

    // Proximity: your curl sent "10000"
    const proximity = body?.proximity != null ? String(body.proximity) : "10000";

    const schools = asArray(body?.schools);

    if (!sportId || !sportName) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing sportId or sportName",
          debug,
          stats: { accepted: 0, rejected: 0, errors: 1 },
          accepted: [],
          rejected: [],
          errors: [{ message: "Missing sportId or sportName" }],
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!activityTypeId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing activityTypeId",
          debug,
          stats: { accepted: 0, rejected: 0, errors: 1 },
          accepted: [],
          rejected: [],
          errors: [{ message: "Missing activityTypeId" }],
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const authFromEnv = buildAuthHeader(Deno.env.get("RYZER_AUTH"));
    if (!authFromEnv) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing RYZER_AUTH secret",
          debug,
          stats: { accepted: 0, rejected: 0, errors: 1 },
          accepted: [],
          rejected: [],
          errors: [{ message: "Missing RYZER_AUTH secret" }],
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const url = "https://ryzer.com/rest/controller/connect/event/eventSearch/";

    // We will request pages until we hit maxPages/maxEvents or get no rows.
    let allRows = [];
    let totalErrors = 0;

    for (let page = 0; page < maxPages; page++) {
      const payload = {
        Page: page,
        RecordsPerPage: recordsPerPage,
        SoldOut: 0,
        ActivityTypes: [activityTypeId],
        Proximity: proximity,
        accountTypeList: finalAccountTypeList,
      };

      let httpStatus = null;
      let respText = "";
      let respJson = null;
      let rowCount = 0;
      let arrayPath = null;

      try {
        const r = await fetch(url, {
          method: "POST",
          headers: {
            Accept: "*/*",
            "Content-Type": "application/json; charset=UTF-8",
            Origin: "https://ryzer.com",
            Referer: "https://ryzer.com/Events/?tab=eventSearch",
            // IMPORTANT: Ryzer expects the header key "authorization"
            authorization: authFromEnv,
          },
          body: JSON.stringify(payload),
        });

        httpStatus = r.status;
        respText = await r.text();
        // try parse json
        try {
          respJson = JSON.parse(respText);
        } catch {
          respJson = null;
        }

        if (respJson && typeof respJson === "object") {
          // find rows (we don't assume a fixed shape)
          const found = findFirstArrayWithObjects(respJson);
          arrayPath = found.path;
          const arr = asArray(found.arr);

          // best-effort: array may include wrapper objects, but rowCount is enough for now
          rowCount = arr.length;

          // Accumulate rows (cap at maxEvents)
          for (const item of arr) {
            allRows.push(item);
            if (allRows.length >= maxEvents) break;
          }
        } else {
          // not JSON
          rowCount = 0;
        }
      } catch (e) {
        totalErrors += 1;
        debug.pages.push({
          page,
          httpStatus,
          rowCount: 0,
          reqPayload: payload,
          error: String(e?.message || e),
          respSnippet: jsonSnippet(respText || "", 900),
        });
        break;
      }

      // Always push rich debug (this is what your AdminImport prints now)
      debug.pages.push({
        page,
        httpStatus,
        rowCount,
        reqPayload: payload,
        respKeys: respJson && typeof respJson === "object" ? Object.keys(respJson).slice(0, 40) : [],
        rowsArrayPath: arrayPath,
        respSnippet: respJson ? jsonSnippet(respJson, 1200) : jsonSnippet(respText, 1200),
      });

      // Stop early if zero rows returned
      if (rowCount === 0) break;
      if (allRows.length >= maxEvents) break;
    }

    // If we got rows but they aren’t the “right” shape, we still return them in debug for inspection.
    // For your current flow, we’ll build accepted/rejected as empty unless we can confidently map.
    // BUT: we’ll expose sample row for quick diagnosis.
    const sampleRow = allRows[0] || null;

    // Minimal mapping attempt: Ryzer typically returns a list of event-ish rows.
    // For now, we return them in `rawRows` and let your next step map correctly once we see keys.
    // (This avoids “accepted=0” while flying blind.)
    // If you prefer fail-closed, set `returnRowsAsAccepted=false` below.
    const returnRowsAsAccepted = true;

    let accepted = [];
    let rejected = [];

    if (returnRowsAsAccepted) {
      // We wrap each row in the structure AdminImport expects (school gate happens later).
      // Your AdminImport currently expects accepted items shaped like:
      // { school: { school_id, state }, event: {...} }
      // We can’t derive school from row without seeing its fields, so we set school=null and keep event=row.
      accepted = allRows.map((r) => ({
        school: null,
        event: r,
      }));
    }

    const out = {
      ok: true,
      stats: {
        accepted: accepted.length,
        rejected: rejected.length,
        errors: totalErrors,
        rows: allRows.length,
      },
      accepted,
      rejected,
      errors: [],
      debug: {
        ...debug,
        sampleRowKeys: sampleRow ? Object.keys(sampleRow).slice(0, 60) : [],
        sampleRow: sampleRow ? sampleRow : null,
        note:
          allRows.length === 0
            ? "Zero rows returned. Compare debug.pages[0].reqPayload to the DevTools request payload (ActivityTypes, accountTypeList, Proximity)."
            : "Rows returned. Next: confirm the field names for title/dates/registration URL so we can map into CampDemo correctly.",
      },
    };

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: String(e?.message || e),
        debug,
        stats: { accepted: 0, rejected: 0, errors: 1 },
        accepted: [],
        rejected: [],
        errors: [{ message: String(e?.message || e) }],
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
