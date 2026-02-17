// functions/athleticsMembershipDedupe.ts
// Dedupe AthleticsMembership by source_key (keep best, delete rest).
// TS-free syntax to avoid Base44 editor parse errors.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function safeStr(x) {
  return x == null ? "" : String(x);
}
function lc(x) {
  return safeStr(x).toLowerCase().trim();
}
function toNum(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}
function getId(r) {
  const v = r && (r.id ?? r._id ?? r.uuid);
  return v == null ? null : String(v);
}
function jsonResp(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function isRetryableDeleteError(e) {
  const m = lc(e && (e.message || e));
  return (
    m.includes("rate limit") ||
    m.includes("status code 429") ||
    m.includes("status code 502") ||
    m.includes("status code 503") ||
    m.includes("status code 504") ||
    m.includes("timeout")
  );
}

async function deleteWithRetry(Entity, id, tries, debug, throttleMs) {
  let lastErr = null;
  const t = Math.max(1, Number(tries || 1));
  for (let i = 0; i < t; i++) {
    try {
      if (throttleMs > 0) await sleep(throttleMs);
      await Entity.delete(id);
      return { ok: true };
    } catch (e) {
      lastErr = e;
      if (!isRetryableDeleteError(e) || i === t - 1) break;
      const backoff = Math.min(8000, Math.floor(500 * Math.pow(2, i) + Math.random() * 250));
      debug.notes.push(`delete retry ${i + 1}/${t - 1} backoffMs=${backoff} id=${id}`);
      await sleep(backoff);
    }
  }
  return { ok: false, error: safeStr(lastErr && (lastErr.message || lastErr)) };
}

function pickBestRecord(records) {
  // Prefer: higher confidence, then newest last_verified_at, then newest created_at.
  const scored = records.map((r) => {
    const conf = Number((r && r.confidence) ?? 0);
    const lv = Date.parse((r && (r.last_verified_at || r.lastVerifiedAt)) || "") || 0;
    const ca = Date.parse((r && (r.created_at || r.createdAt)) || "") || 0;
    return { r, conf, lv, ca };
  });

  scored.sort((a, b) => {
    if (b.conf !== a.conf) return b.conf - a.conf;
    if (b.lv !== a.lv) return b.lv - a.lv;
    if (b.ca !== a.ca) return b.ca - a.ca;
    return 0;
  });

  return (scored[0] && scored[0].r) || records[0];
}

Deno.serve(async (req) => {
  const t0 = Date.now();

  const debug = {
    startedAt: new Date().toISOString(),
    notes: [],
    errors: [],
    elapsedMs: 0,
  };

  const stats = {
    scanned: 0,
    groups: 0,
    dupGroups: 0,
    kept: 0,
    deleted: 0,
    errors: 0,
  };

  let nextStartAtGroup = 0;
  let done = false;

  function elapsed() {
    return Date.now() - t0;
  }
  function outOfTime(budgetMs) {
    return elapsed() >= budgetMs;
  }

  try {
    if (req.method !== "POST") {
      debug.elapsedMs = elapsed();
      return jsonResp({ ok: false, error: "Method not allowed", stats, debug, nextStartAtGroup, done });
    }

    const body = await req.json().catch(() => ({}));

    const dryRun = !!body.dryRun;
    const org = safeStr(body.org || "ncaa").trim() || "ncaa";
    const seasonYear = body.seasonYear != null ? toNum(body.seasonYear, null) : null;

    const startAtGroup = Math.max(0, toNum(body.startAtGroup, 0));
    const maxGroups = Math.max(1, toNum(body.maxGroups, 120));
    const maxDelete = Math.max(0, toNum(body.maxDelete, 200));
    const throttleMs = Math.max(0, toNum(body.throttleMs, dryRun ? 0 : 120));
    const timeBudgetMs = Math.max(5000, toNum(body.timeBudgetMs, 22000));
    const tries = Math.max(1, toNum(body.tries, 6));

    nextStartAtGroup = startAtGroup;

    const client = createClientFromRequest(req);
    const AthleticsMembership =
      (client.entities && (client.entities.AthleticsMembership || client.entities.AthleticsMemberships)) || null;

    if (!AthleticsMembership) {
      debug.errors.push({ step: "init", message: "AthleticsMembership entity not found (check table name + exports)" });
      debug.elapsedMs = elapsed();
      return jsonResp({ ok: false, error: "AthleticsMembership entity not found", stats, debug, nextStartAtGroup, done });
    }

    const where = {};
    if (org) where.org = org;
    if (seasonYear != null) where.season_year = seasonYear;

    let rows = [];
    try {
      const out = await AthleticsMembership.filter(where);
      rows = Array.isArray(out) ? out : [];
    } catch (e) {
      debug.errors.push({ step: "load", message: safeStr(e && (e.message || e)), where });
      debug.elapsedMs = elapsed();
      return jsonResp({ ok: false, error: "Failed to load AthleticsMembership rows", stats, debug, nextStartAtGroup, done });
    }

    stats.scanned = rows.length;
    debug.notes.push(`loaded rows=${rows.length} org=${org} seasonYear=${seasonYear ?? "(any)"} dryRun=${dryRun}`);

    if (!rows.length) {
      done = true;
      debug.elapsedMs = elapsed();
      return jsonResp({ ok: true, dryRun, stats, debug, nextStartAtGroup, done });
    }

    if (outOfTime(timeBudgetMs)) {
      debug.notes.push("out_of_time_before_grouping");
      debug.elapsedMs = elapsed();
      return jsonResp({ ok: true, dryRun, stats, debug, nextStartAtGroup, done });
    }

    // Group by source_key
    const byKey = new Map();
    for (const r of rows) {
      const k = safeStr(r && r.source_key).trim();
      if (!k) continue;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r);
    }

    const keys = Array.from(byKey.keys()).sort();
    stats.groups = keys.length;

    const endAt = Math.min(keys.length, startAtGroup + maxGroups);
    nextStartAtGroup = endAt;
    done = endAt >= keys.length;

    let deleteBudget = maxDelete;

    for (let gi = startAtGroup; gi < endAt; gi++) {
      if (outOfTime(timeBudgetMs)) {
        debug.notes.push(`stoppedEarly out_of_time gi=${gi}`);
        nextStartAtGroup = gi;
        done = false;
        break;
      }

      const key = keys[gi];
      const group = byKey.get(key) || [];
      if (group.length <= 1) continue;

      stats.dupGroups += 1;

      const keep = pickBestRecord(group);
      const keepId = getId(keep);
      if (!keepId) {
        stats.errors += 1;
        debug.errors.push({ step: "pick_keep", source_key: key, message: "keep record missing id" });
        continue;
      }
      stats.kept += 1;

      const toDelete = group.filter((r) => {
        const id = getId(r);
        return id && id !== keepId;
      });

      for (const r of toDelete) {
        if (deleteBudget <= 0) {
          debug.notes.push(`delete_budget_exhausted at gi=${gi}`);
          nextStartAtGroup = gi;
          done = false;
          break;
        }
        if (outOfTime(timeBudgetMs)) {
          debug.notes.push(`stoppedEarly out_of_time during delete gi=${gi}`);
          nextStartAtGroup = gi;
          done = false;
          break;
        }

        const id = getId(r);
        if (!id) continue;

        if (dryRun) {
          stats.deleted += 1;
          deleteBudget -= 1;
          continue;
        }

        const del = await deleteWithRetry(AthleticsMembership, id, tries, debug, throttleMs);
        if (del.ok) {
          stats.deleted += 1;
          deleteBudget -= 1;
        } else {
          stats.errors += 1;
          debug.errors.push({ step: "delete", source_key: key, id, message: del.error });
        }
      }
    }

    debug.elapsedMs = elapsed();
    return jsonResp({ ok: true, dryRun, stats, debug, nextStartAtGroup, done });
  } catch (e) {
    debug.errors.push({ step: "fatal", message: safeStr(e && (e.message || e)) });
    debug.elapsedMs = Date.now() - t0;
    return jsonResp({ ok: false, error: "Fatal dedupe error", stats, debug, nextStartAtGroup, done });
  }
});

