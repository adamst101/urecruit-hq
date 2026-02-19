// functions/debugSchoolRead.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

type AnyObj = Record<string, any>;

function extractRows(resp: any): any[] {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  const cands = [resp.data, resp.items, resp.records, resp.results, resp.rows];
  for (const c of cands) if (Array.isArray(c)) return c;
  if (resp.data && Array.isArray(resp.data.data)) return resp.data.data;
  return [];
}

function jsonResp(payload: any): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const debug: AnyObj = { version: "debugSchoolRead_v1", notes: [] };

  try {
    const client = createClientFromRequest(req);
    const School = (client as any)?.entities?.School;
    const Schools = (client as any)?.entities?.Schools;

    const results: AnyObj = {
      has: {
        School: !!School,
        Schools: !!Schools,
      },
      School_list: null,
      School_filter: null,
      Schools_list: null,
      Schools_filter: null,
      samples: {
        School: [],
        Schools: [],
      },
    };

    // Try School
    if (School) {
      if (typeof School.list === "function") {
        try {
          const r = await School.list({ limit: 3 });
          const rows = extractRows(r);
          results.School_list = { ok: true, rows: rows.length, keys: r ? Object.keys(r) : [] };
          results.samples.School = rows.slice(0, 3);
        } catch (e: any) {
          results.School_list = { ok: false, error: String(e?.message || e).slice(0, 200) };
        }
      } else {
        results.School_list = { ok: false, error: "School.list not a function" };
      }

      if (typeof School.filter === "function") {
        try {
          const r = await School.filter({});
          const rows = extractRows(r);
          results.School_filter = { ok: true, rows: rows.length, keys: r ? Object.keys(r) : [] };
          if (!results.samples.School.length) results.samples.School = rows.slice(0, 3);
        } catch (e: any) {
          results.School_filter = { ok: false, error: String(e?.message || e).slice(0, 200) };
        }
      } else {
        results.School_filter = { ok: false, error: "School.filter not a function" };
      }
    }

    // Try Schools
    if (Schools) {
      if (typeof Schools.list === "function") {
        try {
          const r = await Schools.list({ limit: 3 });
          const rows = extractRows(r);
          results.Schools_list = { ok: true, rows: rows.length, keys: r ? Object.keys(r) : [] };
          results.samples.Schools = rows.slice(0, 3);
        } catch (e: any) {
          results.Schools_list = { ok: false, error: String(e?.message || e).slice(0, 200) };
        }
      } else {
        results.Schools_list = { ok: false, error: "Schools.list not a function" };
      }

      if (typeof Schools.filter === "function") {
        try {
          const r = await Schools.filter({});
          const rows = extractRows(r);
          results.Schools_filter = { ok: true, rows: rows.length, keys: r ? Object.keys(r) : [] };
          if (!results.samples.Schools.length) results.samples.Schools = rows.slice(0, 3);
        } catch (e: any) {
          results.Schools_filter = { ok: false, error: String(e?.message || e).slice(0, 200) };
        }
      } else {
        results.Schools_filter = { ok: false, error: "Schools.filter not a function" };
      }
    }

    return jsonResp({ ok: true, results, debug });
  } catch (e: any) {
    return jsonResp({ ok: false, error: String(e?.message || e), debug });
  }
});