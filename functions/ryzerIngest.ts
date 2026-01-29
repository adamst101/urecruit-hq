// functions/ryzerIngest.js
// Base44 Backend Function (Deno)
// Purpose: call Ryzer eventSearch endpoint server-side, apply "college program" gate by matching host → School list,
// return accepted/rejected + rich debug for AdminImport log.

const VERSION = "ryzerIngest_2026-01-29_v3";

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

function truncate(s, n = 1000) {
  const str = String(s || "");
  return str.length > n ? str.slice(0, n) + "…(truncated)" : str;
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

function hostToMatchText(row) {
  // Try common field names Ryzer may use
  const candidates = [
    row?.accountName,
    row?.AccountName,
    row?.hostName,
    row?.HostName,
    row?.organizationName,
    row?.OrganizationName,
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

  // fallback: sometimes title contains host
  if (!candidates.length) candidates.push(safeString(row?.eventTitle || row?.EventTitle || row?.title || row?.Title) || "");

  const best = candidates.find(Boolean) || "";
  return stripNonAscii(best);
}

function titleText(row) {
  return stripNonAscii(
    safeString(row?.eventTitle || row?.EventTitle || row?.title || row?.Title || row?.name || row?.Name) || ""
  );
}

function pickUrl(row) {
  return (
    safeString(row?.registrationUrl) ||
    safeString(row?.RegistrationUrl) ||
    safeString(row?.eventUrl) ||
    safeString(row?.EventUrl) ||
    safeString(row?.url) ||
    safeString(row?.Url) ||
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
        // avoid ridiculous tiny tokens
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

// Try to locate the "rows array" in a variety of response shapes
function extractRowsAndMeta(respJson) {
  const candidates = [
    { path: "Records", rows: respJson?.Records, total: respJson?.TotalRecords || respJson?.total || respJson?.Total },
    { path: "records", rows: respJson?.records, total: respJson?.totalRecords || respJson?.total || respJson?.Total },
    { path: "data.Records", rows: respJson?.data?.Records, total: respJson?.data?.TotalRecords || respJson?.data?.total },
    { path: "data.records", rows: respJson?.data?.records, total: respJson?.data?.totalRecords || respJson?.data?.total },
    { path: "Result.Records", rows: respJson?.Result?.Records, total: respJson?.Result?.TotalRecords || respJson?.Result?.total },
    { path: "result.records", rows: respJson?.result?.records, total: respJson?.result?.totalRecords || respJson?.result?.total },
    { path: "items", rows: respJson?.items, total: respJson?.total || respJson?.count },
    { path: "Events", rows: respJson?.Events, total: respJson?.Total || respJson?.total },
    { path: "events", rows: respJson?.events, total: respJson?.total || respJson?.count },
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

    // Endpoint from your DevTools capture
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
        // Your curl used this accountTypeList (College/University). Keep it.
        accountTypeList: ["A7FA36E0-87BE-4750-9DE3-CB60DE133648"],
      };

      let http = 0;
      let respText = "";
      let respJson = null;

      try {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            Accept: "*/*",
            // IMPORTANT: the captured value is a JWT string; send as-is
            authorization: auth,
            Origin: "https://ryzer.com",
            Referer: "https://ryzer.com/Events/?tab=eventSearch",
          },
          body: JSON.stringify(reqPayload),
        });

        http = r.status;
        respText = await r.text().catch(() => "");
        // Try JSON parse (some 200 responses still contain error objects)
        respJson = (() => {
          try {
            return JSON.parse(respText);
          } catch {
            return null;
          }
        })();

        const respKeys =
          respJson && typeof respJson === "object" && !Array.isArray(respJson) ? Object.keys(respJson) : [];

        const { rows, total, rowsArrayPath } = extractRowsAndMeta(respJson);

        debug.pages.push({
          version: VERSION,
          page,
          http,
          reqPayload,
          respKeys,
          rowsArrayPath,
          rowCount: Array.isArray(rows) ? rows.length : 0,
          total: total ?? null,
          respSnippet: truncate(respText, 1400),
        });

        // Stop early on auth issues even if HTTP=200 but content says unauthorized
        if (http === 401 || http === 403) {
          errors.push({ page, error: `Auth failed (HTTP ${http})` });
          break;
        }
        if (!rows || !rows.length) {
          // no more results; break so we don't keep paging empty sets
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
          rowsArrayPath: "exception",
          rowCount: 0,
          total: null,
          respSnippet: truncate(respText || msg, 1400),
        });
        break;
      }
    }

    // If you want “dry run” to still show some rejected samples (debug), keep them but cap size
    const response = {
      stats: {
        accepted: accepted.length,
        rejected: rejected.length,
        errors: errors.length,
        processed,
      },
      debug,
      errors: errors.slice(0, 10),
      // Return small payloads; AdminImport only needs counts + small samples
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
