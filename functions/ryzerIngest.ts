// functions/ryzerIngest.js
// Base44 Backend Function (Deno)
// Purpose: call Ryzer eventSearch endpoint server-side, apply "college program" gate by matching host → School list,
// return accepted/rejected + rich debug for AdminImport log.

const VERSION = "ryzerIngest_2026-01-29_v4";

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

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

// Build normalized match keys for schools
function buildSchoolIndex(schools) {
  const list = asArray(schools)
    .map((s) => ({
      id: safeString(s?.id) || "",
      name: safeString(s?.school_name) || "",
      state: safeString(s?.state) || "",
      aliases: asArray(s?.aliases).map((a) => safeString(a)).filter(Boolean),
    }))
    .filter((s) => s.id && s.name);

  const index = [];
  for (const s of list) {
    const keys = new Set();
    keys.add(lc(s.name));
    keys.add(lc(stripNonAscii(s.name)));
    for (const a of s.aliases) {
      keys.add(lc(a));
      keys.add(lc(stripNonAscii(a)));
    }
    index.push({ ...s, keys: Array.from(keys).filter(Boolean) });
  }
  return index;
}

// Prefer a host field; else infer from title "X @ Y"
function hostToMatchText(row) {
  const candidates = [
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
    .filter(Boolean);

  let best = candidates.find(Boolean) || "";

  // Fallback: infer from title pattern "Something @ Some Place"
  if (!best) {
    const t = titleText(row);
    const parts = t.split(" @ ");
    if (parts.length >= 2) best = parts[parts.length - 1];
  }

  return stripNonAscii(best);
}

function titleText(row) {
  // Ryzer often uses `name`
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

// Return {match, reason}
function matchSchool(hostText, schoolIndex) {
  const host = lc(hostText);
  if (!host) return { match: null, reason: "missing_host" };

  // Exact or contains match against known school keys
  for (const s of schoolIndex) {
    for (const key of s.keys) {
      if (!key) continue;
      if (host === key) return { match: s, reason: "exact" };
      if (host.includes(key) || key.includes(host)) {
        if (Math.min(host.length, key.length) >= 6) return { match: s, reason: "contains" };
      }
    }
  }

  // Fuzzy-ish: compare slug tokens
  const hostSlug = slugify(host).replace(/-/g, " ");
  for (const s of schoolIndex) {
    const nameSlug = slugify(s.name).replace(/-/g, " ");
    if (hostSlug && nameSlug && (hostSlug.includes(nameSlug) || nameSlug.includes(hostSlug))) {
      if (Math.min(hostSlug.length, nameSlug.length) >= 8) return { match: s, reason: "slug_contains" };
    }
  }

  return { match: null, reason: "no_school_match" };
}

// ✅ Updated: handle nested response shapes including { success:true, data:"{...json...}" }
function normalizeRyzerResponse(respJson) {
  if (!respJson || typeof respJson !== "object") return { normalized: respJson, dataWasString: false, innerKeys: [] };

  // If data is a JSON string, parse it
  if (typeof respJson.data === "string") {
    const inner = tryParseJsonString(respJson.data);
    if (inner && typeof inner === "object") {
      const innerKeys = Object.keys(inner);
      return { normalized: { ...respJson, data: inner }, dataWasString: true, innerKeys };
    }
  }

  return { normalized: respJson, dataWasString: false, innerKeys: [] };
}

// ✅ Updated: find rows in MANY places (including data.events)
function extractRowsAndMeta(respJson) {
  const candidates = [
    { path: "events", rows: respJson?.events, total: respJson?.total || respJson?.count || respJson?.Total },
    { path: "Events", rows: respJson?.Events, total: respJson?.total || respJson?.Total },
    { path: "Records", rows: respJson?.Records, total: respJson?.TotalRecords || respJson?.total || respJson?.Total },
    { path: "records", rows: respJson?.records, total: respJson?.totalRecords || respJson?.total || respJson?.Total },
    { path: "items", rows: respJson?.items, total: respJson?.total || respJson?.count },

    { path: "data.events", rows: respJson?.data?.events, total: respJson?.data?.total || respJson?.data?.count },
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
    const sportId = safeString(body?.sportId);
    const sportName = safeString(body?.sportName) || "";
    const activityTypeId = safeString(body?.activityTypeId);
    const recordsPerPage = Number(body?.recordsPerPage ?? 25);
    const maxPages = Number(body?.maxPages ?? 1);
    const maxEvents = Number(body?.maxEvents ?? 100);
    const dryRun = !!body?.dryRun;
    const schools = asArray(body?.schools);

    if (!sportId || !activityTypeId) {
      return new Response(JSON.stringify({ error: "Missing required: sportId/activityTypeId", debug }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const schoolIndex = buildSchoolIndex(schools);
    debug.notes.push(`schools_in=${schools.length} schools_indexed=${schoolIndex.length}`);

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

    for (let page = 0; page < maxPages; page++) {
      if (processed >= maxEvents) break;

      const reqPayload = {
        Page: page,
        RecordsPerPage: recordsPerPage,
        SoldOut: 0,
        ActivityTypes: [activityTypeId],
        Proximity: "10000",
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

        // ✅ NEW: normalize nested data:"{...}"
        const { normalized, dataWasString, innerKeys } = normalizeRyzerResponse(rawJson);

        const respKeys =
          normalized && typeof normalized === "object" && !Array.isArray(normalized) ? Object.keys(normalized) : [];

        const { rows, total, rowsArrayPath } = extractRowsAndMeta(normalized);

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
          respSnippet: truncate(respText, 1400),
        });

        if (http === 401 || http === 403) {
          errors.push({ page, error: `Auth failed (HTTP ${http})` });
          break;
        }

        if (!rows || !rows.length) {
          // no more results; stop paging
          break;
        }

        for (const row of rows) {
          if (processed >= maxEvents) break;

          const host = hostToMatchText(row);
          const title = titleText(row);
          const url = pickUrl(row);

          const m = matchSchool(host, schoolIndex);

          if (m.match) {
            accepted.push({
              school: {
                school_id: m.match.id,
                school_name: m.match.name,
                state: m.match.state || null,
                match_reason: m.reason,
                host_text: host,
              },
              event: {
                sportId,
                sportName,
                activityTypeId,
                searchRowTitle: title,
                eventTitle: title,
                registrationUrl: url,
                raw: row,
              },
            });
          } else {
            rejected.push({
              reason: m.reason,
              host,
              title,
              registrationUrl: url,
            });
          }

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
          respSnippet: truncate(respText || msg, 1400),
        });
        break;
      }
    }

    const response = {
      stats: {
        accepted: accepted.length,
        rejected: rejected.length,
        errors: errors.length,
        processed,
      },
      debug,
      errors: errors.slice(0, 10),
      // keep payloads bounded on dryRun so logs stay readable
      accepted: dryRun ? accepted.slice(0, 25) : accepted,
      rejected: rejected.slice(0, 25),
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
