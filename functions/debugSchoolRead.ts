// functions/debugSchoolRead.ts
// Tiny diagnostic to prove: can the function runtime read School rows?
// Keep this minimal to reduce 502 + editor parse issues.

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

function extractCursor(resp) {
  if (!resp || Array.isArray(resp)) return null;
  return (
    resp.next_cursor ??
    resp.nextCursor ??
    resp.next_page_token ??
    resp.nextPageToken ??
    resp.cursor_next ??
    null
  );
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const School = base44?.entities?.School;
    const Schools = base44?.entities?.Schools;

    const entity = School || Schools;
    const entityName = School ? "School" : Schools ? "Schools" : null;

    if (!entityName || !entity) {
      return Response.json({
        ok: false,
        error: "No School/Schools entity binding in functions runtime",
        meta: { hasSchool: !!School, hasSchools: !!Schools },
      });
    }

    if (typeof entity.list !== "function") {
      return Response.json({
        ok: false,
        error: `${entityName}.list is not a function`,
        meta: { entityName, keys: Object.keys(entity || {}) },
      });
    }

    const resp = await entity.list({ limit: 3 });
    const rows = extractRows(resp);
    const next = extractCursor(resp);

    return Response.json({
      ok: true,
      meta: {
        entityName,
        respKeys: resp ? Object.keys(resp) : [],
        next_cursor_present: !!next,
      },
      rows: rows.length,
      sample: rows.slice(0, 2).map((r) => ({
        id: r?.id ?? r?._id ?? r?.uuid ?? null,
        name: r?.school_name ?? r?.name ?? null,
        website_url: r?.website_url ?? r?.school_url ?? null,
        logo_url: r?.logo_url ?? null,
      })),
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});