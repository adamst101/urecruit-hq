// functions/dedupeAthleticsMembershipBySourceKey.ts
// Deduplicates AthleticsMembership records sharing the same source_key.
// Keeps the "best" row (by completeness + recency), deletes extras.
// Batch-safe with checkpointing and time budget enforcement.
//
// Request body:
// {
//   dryRun: boolean,
//   startAt: number,
//   maxGroups: number,               // batch size (recommend 100-200). 0 = ALL (not recommended)
//   throttleMs: number,              // recommend 50-100
//   timeBudgetMs: number,            // recommend 18000-22000
// }
//
// Response:
// { ok, dryRun, stats, debug, nextStartAt, done }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function s(x) {
  if (x === null || x === undefined) return null;
  const t = String(x).trim();
  return t ? t : null;
}

function getId(r) {
  const v = r?.id ?? r?._id ?? r?.uuid;
  return v === null || v === undefined ? null : String(v);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}

function scoreRow(r) {
  let score = 0;
  
  if (s(r?.school_id)) score += 10;
  if (s(r?.division)) score += 3;
  if (s(r?.subdivision)) score += 2;
  if (s(r?.conference)) score += 3;
  if (s(r?.source_url)) score += 2;
  
  const conf = Number(r?.confidence ?? 0);
  if (Number.isFinite(conf)) score += conf * 5;
  
  const lastVerified = s(r?.last_verified_at);
  if (lastVerified) {
    const t = new Date(lastVerified).getTime();
    if (Number.isFinite(t)) score += Math.min(5, Math.floor(t / 1e13)); // tiny recency nudge
  }
  
  return score;
}

function jsonResp(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const t0 = Date.now();

  const debug = {
    startedAt: new Date().toISOString(),
    samples: [],
    errors: [],
    notes: [],
    stoppedEarly: false,
    elapsedMs: 0,
  };

  const stats = {
    totalRows: 0,
    uniqueKeys: 0,
    duplicateKeys: 0,
    rowsDeleted: 0,
    rowsKept: 0,
    skippedDryRun: 0,
    errors: 0,
  };

  let nextStartAt = 0;
  let done = false;

  function elapsed() {
    return Date.now() - t0;
  }

  function outOfTime(budgetMs) {
    return elapsed() >= budgetMs;
  }

  try {
    if (req.method !== "POST") {
      return jsonResp({ ok: false, error: "Method not allowed", stats, debug, nextStartAt, done });
    }

    const client = createClientFromRequest(req);
    const user = await client.auth.me().catch(() => null);
    if (!user || user.role !== "admin") return jsonResp({ ok: false, error: "Forbidden" });

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const startAt = Math.max(0, Number(body?.startAt || 0));
    const maxGroups = Number(body?.maxGroups || 0);
    const throttleMs = Number(body?.throttleMs || (dryRun ? 0 : 50));
    const timeBudgetMs = Math.max(5000, Number(body?.timeBudgetMs || 20000));
    const AthleticsMembership = client.entities.AthleticsMembership || client.entities.AthleticsMemberships;

    if (!AthleticsMembership) {
      return jsonResp({ ok: false, error: "AthleticsMembership entity not found", stats, debug, nextStartAt, done });
    }

    debug.notes.push(`Params: dryRun=${dryRun} startAt=${startAt} maxGroups=${maxGroups} throttleMs=${throttleMs} timeBudgetMs=${timeBudgetMs}`);

    // Load all membership rows
    let allRows = [];
    if (typeof AthleticsMembership.filter === "function") {
      allRows = await AthleticsMembership.filter({});
    } else if (typeof AthleticsMembership.list === "function") {
      try {
        allRows = await AthleticsMembership.list({ where: {} });
      } catch {
        allRows = await AthleticsMembership.list({});
      }
    } else if (typeof AthleticsMembership.all === "function") {
      allRows = await AthleticsMembership.all();
    }

    const rows = Array.isArray(allRows) ? allRows : [];
    stats.totalRows = rows.length;
    debug.notes.push(`Loaded AthleticsMembership: rows=${rows.length} elapsedMs=${elapsed()}`);

    if (outOfTime(timeBudgetMs)) {
      debug.stoppedEarly = true;
      debug.elapsedMs = elapsed();
      nextStartAt = startAt;
      done = false;
      return jsonResp({ ok: true, dryRun, stats, debug, nextStartAt, done });
    }

    // Group by source_key
    const groups = new Map();
    let missingKey = 0;

    for (const r of rows) {
      const key = s(r?.source_key);
      if (!key) {
        missingKey += 1;
        continue;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    stats.uniqueKeys = groups.size;
    debug.notes.push(`Groups by source_key: unique=${groups.size} missing_key=${missingKey}`);

    // Filter to duplicate groups only
    const dupKeys = [];
    for (const [k, arr] of groups.entries()) {
      if (arr.length > 1) dupKeys.push([k, arr]);
    }
    stats.duplicateKeys = dupKeys.length;

    dupKeys.sort((a, b) => b[1].length - a[1].length); // largest groups first

    debug.notes.push(`Duplicate groups: ${dupKeys.length} elapsedMs=${elapsed()}`);

    if (outOfTime(timeBudgetMs)) {
      debug.stoppedEarly = true;
      debug.elapsedMs = elapsed();
      nextStartAt = startAt;
      done = false;
      return jsonResp({ ok: true, dryRun, stats, debug, nextStartAt, done });
    }

    // Process batch
    const effectiveMax = maxGroups > 0 ? maxGroups : dupKeys.length;
    const endAt = Math.min(dupKeys.length, startAt + effectiveMax);
    nextStartAt = endAt;
    done = endAt >= dupKeys.length;

    debug.notes.push(`Batch window: startAt=${startAt} endAt=${endAt} total=${dupKeys.length} budgetMs=${timeBudgetMs}`);

    for (let i = startAt; i < endAt; i++) {
      if (outOfTime(timeBudgetMs)) {
        debug.stoppedEarly = true;
        debug.elapsedMs = elapsed();
        nextStartAt = i; // resume from here
        done = false;
        break;
      }

      const [key, arr] = dupKeys[i];

      // Score and sort
      const sorted = [...arr].sort((a, b) => {
        const sa = scoreRow(a);
        const sb = scoreRow(b);
        if (sb !== sa) return sb - sa;
        // tiebreaker: id (stable)
        const ida = s(getId(a)) || "";
        const idb = s(getId(b)) || "";
        return ida.localeCompare(idb);
      });

      const keep = sorted[0];
      const keepId = getId(keep);
      const toDelete = sorted.slice(1);

      stats.rowsKept += 1;

      if (debug.samples.length < 5) {
        debug.samples.push({
          source_key: key,
          group_size: arr.length,
          keepId,
          deleteIds: toDelete.map((r) => getId(r)).filter(Boolean),
        });
      }

      if (dryRun) {
        stats.skippedDryRun += toDelete.length;
        continue;
      }

      // Delete extras
      for (const r of toDelete) {
        const id = getId(r);
        if (!id) continue;

        try {
          // Try delete methods
          const delFn = AthleticsMembership.delete || AthleticsMembership.remove || AthleticsMembership.destroy;
          if (typeof delFn === "function") {
            await delFn.call(AthleticsMembership, String(id));
            stats.rowsDeleted += 1;
          } else {
            stats.errors += 1;
            debug.errors.push({ step: "delete_method_missing", id, source_key: key });
          }
        } catch (e) {
          stats.errors += 1;
          debug.errors.push({ step: "delete", id, source_key: key, message: String(e?.message || e) });
        }

        if (throttleMs > 0) await sleep(throttleMs);
      }
    }

    debug.elapsedMs = elapsed();

    return jsonResp({
      ok: true,
      dryRun,
      stats,
      debug,
      nextStartAt,
      done,
    });
  } catch (e) {
    stats.errors += 1;
    debug.errors.push({ step: "fatal", message: String(e?.message || e) });
    debug.elapsedMs = Date.now() - t0;

    return jsonResp({
      ok: false,
      error: String(e?.message || e),
      stats,
      debug,
      nextStartAt,
      done,
    });
  }
});