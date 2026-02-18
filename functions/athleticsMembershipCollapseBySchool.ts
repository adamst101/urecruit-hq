// functions/athleticsMembershipCollapseBySchool.ts
// One-time cleanup: ensure ONE AthleticsMembership row per school_id for a given org.
//
// Keeps the best row per school_id, deletes the rest.
// "Best" heuristic: highest confidence, then most complete (division/subdivision/conference), then newest last_verified_at.
//
// Request body:
// {
//   dryRun: boolean,
//   org: "ncaa" | "naia" | "njcaa" | "",
//   startAt: number,           // pagination over school groups
//   maxSchools: number,        // how many school_id groups per batch
//   maxDelete: number,         // max rows to delete per batch
//   throttleMs: number,        // delay between deletes
//   timeBudgetMs: number
// }
//
// Response:
// { ok, dryRun, stats, debug, nextStartAt, done }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function lc(x: any) {
  return String(x || "").toLowerCase().trim();
}
function getId(r: any) {
  const v = r?.id ?? r?._id ?? r?.uuid;
  return v == null ? null : String(v);
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}
function scoreRow(r: any) {
  const conf = Number(r?.confidence || 0);
  const filled =
    (r?.division ? 1 : 0) +
    (r?.subdivision ? 1 : 0) +
    (r?.conference ? 1 : 0) +
    (r?.source_url ? 1 : 0);
  const last = Date.parse(r?.last_verified_at || r?.updated_date || r?.updatedAt || "") || 0;
  return conf * 1000 + filled * 10 + (last > 0 ? 1 : 0);
}
function jsonResp(payload: any) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const debug: any = { startedAt: new Date().toISOString(), notes: [], errors: [], elapsedMs: 0 };
  const stats: any = { loaded: 0, schools: 0, dupSchools: 0, kept: 0, deleted: 0, wouldDelete: 0, errors: 0 };

  let nextStartAt = 0;
  let done = false;

  function elapsed() {
    return Date.now() - t0;
  }
  function outOfTime(budgetMs: number) {
    return elapsed() >= budgetMs;
  }

  try {
    if (req.method !== "POST") return jsonResp({ ok: false, error: "Method not allowed" });

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const org = lc(body?.org || "");
    const startAt = Math.max(0, Number(body?.startAt || 0));
    const maxSchools = Math.max(1, Number(body?.maxSchools || 100));
    const maxDelete = Math.max(0, Number(body?.maxDelete || 200));
    const throttleMs = Math.max(0, Number(body?.throttleMs || (dryRun ? 0 : 50)));
    const timeBudgetMs = Math.max(5000, Number(body?.timeBudgetMs || 20000));

    const client = createClientFromRequest(req);
    const AthleticsMembership = client.entities.AthleticsMembership || client.entities.AthleticsMemberships;
    if (!AthleticsMembership) return jsonResp({ ok: false, error: "AthleticsMembership entity not found" });

    // Load all rows for org (or all if org empty). This is OK while volume is low-ish.
    const all = await AthleticsMembership.filter(org ? { org } : {});
    const rows = Array.isArray(all) ? all : [];
    stats.loaded = rows.length;

    // Group by school_id
    const bySchool = new Map<string, any[]>();
    for (const r of rows) {
      const sid = r?.school_id ? String(r.school_id) : "";
      if (!sid) continue;
      if (!bySchool.has(sid)) bySchool.set(sid, []);
      bySchool.get(sid)!.push(r);
    }

    const schoolIds = Array.from(bySchool.keys()).sort();
    stats.schools = schoolIds.length;

    const endAt = Math.min(schoolIds.length, startAt + maxSchools);
    nextStartAt = endAt;
    done = endAt >= schoolIds.length;

    let deleteBudget = maxDelete;

    for (let i = startAt; i < endAt; i++) {
      if (outOfTime(timeBudgetMs)) {
        done = false;
        nextStartAt = i;
        debug.notes.push(`stoppedEarly out_of_time at schoolIndex=${i}`);
        break;
      }

      const sid = schoolIds[i];
      const group = bySchool.get(sid) || [];
      if (group.length <= 1) continue;

      stats.dupSchools += 1;

      // Choose best row to keep
      const sorted = [...group].sort((a, b) => scoreRow(b) - scoreRow(a));
      const keep = sorted[0];
      const keepId = getId(keep);
      if (keepId) stats.kept += 1;

      // Delete others
      const toDelete = sorted.slice(1);
      stats.wouldDelete += toDelete.length;

      if (dryRun) continue;

      for (const r of toDelete) {
        if (deleteBudget <= 0) {
          debug.notes.push(`delete_budget_exhausted at schoolIndex=${i}`);
          break;
        }
        if (outOfTime(timeBudgetMs)) {
          done = false;
          nextStartAt = i;
          debug.notes.push(`stoppedEarly out_of_time during delete at schoolIndex=${i}`);
          break;
        }

        const id = getId(r);
        if (!id) continue;

        try {
          await AthleticsMembership.delete(id);
          stats.deleted += 1;
          deleteBudget -= 1;
        } catch (e: any) {
          stats.errors += 1;
          debug.errors.push({ step: "delete", id, school_id: sid, message: String(e?.message || e) });
        }

        if (throttleMs > 0) await sleep(throttleMs);
      }
    }

    debug.elapsedMs = elapsed();

    return jsonResp({ ok: true, dryRun, stats, debug, nextStartAt, done });
  } catch (e: any) {
    debug.elapsedMs = Date.now() - t0;
    return jsonResp({ ok: false, error: String(e?.message || e), stats, debug, nextStartAt, done });
  }
});