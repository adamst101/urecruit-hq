// functions/athleticsMembershipDedupeSweep.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function jsonResp(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function getId(r) {
  const v = r?.id ?? r?._id ?? r?.uuid;
  return v === null || v === undefined ? null : String(v);
}
function lc(x) {
  return String(x || "").toLowerCase().trim();
}
function extractRows(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  const cands = [resp.data, resp.items, resp.records, resp.results, resp.rows];
  for (const c of cands) if (Array.isArray(c)) return c;
  if (resp.data && Array.isArray(resp.data.data)) return resp.data.data;
  return [];
}
function pickTime(r) {
  const t =
    r?.created_at ||
    r?.last_verified_at ||
    r?.updated_at ||
    r?.modified_at ||
    r?.createdAt ||
    r?.updatedAt ||
    null;
  const ms = t ? Date.parse(String(t)) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const stats = {
    scanned: 0,
    groups: 0,
    dupGroups: 0,
    deleted: 0,
    kept: 0,
    errors: 0,
  };
  const debug = { notes: [], errors: [], elapsedMs: 0 };

  try {
    if (req.method !== "POST") return jsonResp({ ok: false, error: "Method not allowed", stats, debug });

    const body = await req.json().catch(() => ({}));
    const org = body?.org ? String(body.org) : null; // optional: "ncaa"
    const seasonYear = body?.seasonYear != null ? Number(body.seasonYear) : null; // optional
    const dryRun = !!body?.dryRun;
    const maxDelete = body?.maxDelete != null ? Number(body.maxDelete) : 5000;

    const client = createClientFromRequest(req);
    const AthleticsMembership = client.entities.AthleticsMembership || client.entities.AthleticsMemberships;
    if (!AthleticsMembership) return jsonResp({ ok: false, error: "AthleticsMembership entity not found", stats, debug });

    // Load all (Base44 may cap; but in practice your membership table is still small)
    // If you later exceed caps, we can paginate similarly to School.
    let rows = [];
    try {
      const resp = await AthleticsMembership.list({ where: {} });
      rows = extractRows(resp);
    } catch {
      try {
        const resp = await AthleticsMembership.filter({});
        rows = extractRows(resp);
      } catch {
        rows = [];
      }
    }

    // Optional filters (client side)
    if (org) rows = rows.filter((r) => lc(r?.org) === lc(org));
    if (seasonYear != null) rows = rows.filter((r) => Number(r?.season_year) === seasonYear);

    stats.scanned = rows.length;
    debug.notes.push(`loaded rows=${rows.length} org=${org || "ALL"} seasonYear=${seasonYear ?? "ALL"} dryRun=${dryRun}`);

    // Group by source_key
    const map = new Map();
    for (const r of rows) {
      const k = r?.source_key ? String(r.source_key) : null;
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }

    stats.groups = map.size;

    for (const [k, arr] of map.entries()) {
      if (!Array.isArray(arr) || arr.length <= 1) continue;

      stats.dupGroups += 1;

      // Sort newest first
      arr.sort((a, b) => pickTime(b) - pickTime(a));

      const keep = arr[0];
      const keepId = getId(keep);
      if (!keepId) continue;

      stats.kept += 1;

      const dups = arr.slice(1);
      for (const d of dups) {
        const id = getId(d);
        if (!id) continue;

        if (!dryRun) {
          try {
            if (stats.deleted >= maxDelete) {
              debug.notes.push(`hit maxDelete=${maxDelete}, stopping deletes`);
              return jsonResp({ ok: true, dryRun, stats, debug });
            }
            await AthleticsMembership.delete(id);
          } catch (e) {
            stats.errors += 1;
            debug.errors.push({ step: "delete", source_key: k, id, message: String(e?.message || e) });
            continue;
          }
        }

        stats.deleted += 1;
      }
    }

    debug.elapsedMs = Date.now() - startedAt;
    return jsonResp({ ok: true, dryRun, stats, debug });
  } catch (e) {
    debug.elapsedMs = Date.now() - startedAt;
    return jsonResp({ ok: false, error: String(e?.message || e), stats, debug });
  }
});