// functions/debugSchoolRead.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function extractRows(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  const cands = [resp.data, resp.items, resp.records, resp.results, resp.rows];
  for (const c of cands) if (Array.isArray(c)) return c;
  if (resp.data && Array.isArray(resp.data.data)) return resp.data.data;
  if (resp.data && Array.isArray(resp.data.items)) return resp.data.items;
  if (resp.data && Array.isArray(resp.data.records)) return resp.data.records;
  return [];
}

async function tryList(entity) {
  if (!entity || typeof entity.list !== "function") return { ok: false, error: "list() missing" };
  try {
    const r = await entity.list({ limit: 5 });
    const rows = extractRows(r);
    return { ok: true, rows: rows.length, respType: Array.isArray(r) ? "array" : typeof r, respKeys: r ? Object.keys(r) : [], sample: rows.slice(0, 2) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

async function tryFilter(entity) {
  if (!entity || typeof entity.filter !== "function") return { ok: false, error: "filter() missing" };
  try {
    const r = await entity.filter({});
    const rows = extractRows(r);
    return { ok: true, rows: rows.length, respType: Array.isArray(r) ? "array" : typeof r, respKeys: r ? Object.keys(r) : [], sample: rows.slice(0, 2) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}

async function trySearch(entity) {
  // best-effort: common patterns; harmless if field doesn't exist
  if (!entity) return { ok: false, error: "entity missing" };
  const attempts = [
    { where: { school_name: { $contains: "University" } }, limit: 5 },
    { where: { name: { $contains: "University" } }, limit: 5 },
  ];

  if (typeof entity.list !== "function") return { ok: false, error: "list() missing" };

  for (const a of attempts) {
    try {
      const r = await entity.list(a);
      const rows = extractRows(r);
      if (rows.length) return { ok: true, attempt: a, rows: rows.length, sample: rows.slice(0, 2) };
    } catch {
      // ignore
    }
  }
  return { ok: true, attempt: null, rows: 0, sample: [] };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const School = base44?.entities?.School;
    const Schools = base44?.entities?.Schools;

    const entity = School || Schools;
    const entityName = School ? "School" : Schools ? "Schools" : null;

    if (!entityName || !entity) {
      return Response.json({ ok: false, error: "No School/Schools binding", meta: { hasSchool: !!School, hasSchools: !!Schools } });
    }

    // Try to infer env from headers (best-effort; may be undefined)
    const origin = req.headers.get("x-origin-url") || req.headers.get("referer") || null;
    const fnVer = req.headers.get("base44-functions-version") || null;
    const dataEnv = req.headers.get("base44-data-env") || req.headers.get("x-base44-data-env") || null;

    const out = {
      ok: true,
      meta: { entityName, origin, fnVer, dataEnv },
      list: await tryList(entity),
      filter: await tryFilter(entity),
      search: await trySearch(entity),
    };

    // keep sample small
    if (out.list?.sample) {
      out.list.sample = out.list.sample.map((r) => ({
        id: r?.id ?? r?._id ?? r?.uuid ?? null,
        name: r?.school_name ?? r?.name ?? null,
      }));
    }
    if (out.filter?.sample) {
      out.filter.sample = out.filter.sample.map((r) => ({
        id: r?.id ?? r?._id ?? r?.uuid ?? null,
        name: r?.school_name ?? r?.name ?? null,
      }));
    }
    if (out.search?.sample) {
      out.search.sample = out.search.sample.map((r) => ({
        id: r?.id ?? r?._id ?? r?.uuid ?? null,
        name: r?.school_name ?? r?.name ?? null,
      }));
    }

    return Response.json(out);
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});