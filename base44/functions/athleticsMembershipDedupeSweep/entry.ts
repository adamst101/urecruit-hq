// functions/athleticsMembershipDedupe.ts
// @ts-nocheck
// Dedupe AthleticsMembership for seasonless model:
// - one row per org + school_id
// - normalize kept row source_key to `${org}:${schoolId}`
// - delete the rest with throttle + retry

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function safeStr(x) {
  return x == null ? "" : String(x);
}
function lc(x) {
  return safeStr(x).toLowerCase().trim();
}
function toNum(x, d) {
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
function parseTime(x) {
  const t = Date.parse(safeStr(x));
  return Number.isFinite(t) ? t : 0;
}
function jsonResp(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function isRetryable(e) {
  const m = lc(e && (e.message || e));
  return (
    m.includes("rate limit") ||
    m.includes("429") ||
    m.includes("502") ||
    m.includes("503") ||
    m.includes("504") ||
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
      if (!isRetryable(e) || i === t - 1) break;
      const backoff = Math.min(8000, Math.floor(500 * Math.pow(2, i) + Math.random() * 250));
      debug.notes.push(`delete retry ${i + 1}/${t - 1} backoffMs=${backoff} id=${id}`);
      await sleep(backoff);
    }
  }
  return { ok: false, error: safeStr(lastErr && (lastErr.message || lastErr)) };
}

async function updateWithRetry(Entity, id, patch, tries, debug, label) {
  let lastErr = null;
  const t = Math.max(1, Number(tries || 1));
  for (let i = 0; i < t; i++) {
    try {
      await Entity.update(id, patch);
      return { ok: true };
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e) || i === t - 1) break;
      const backoff = Math.min(8000, Math.floor(400 * Math.pow(2, i) + Math.random() * 200));
      debug.notes.push(`${label} retry ${i + 1}/${t - 1} backoffMs=${backoff} id=${id}`);
      await sleep(backoff);
    }
  }
  return { ok: false, error: safeStr(lastErr && (lastErr.message || lastErr)) };
}

function pickBestRecord(records) {
  const scored = records.map((r) => {
    const conf = Number((r && r.confidence) ?? 0);
    const lv = parseTime(r && (r.last_verified_at || r.lastVerifiedAt));
    const ca = parseTime(r && (r.created_at || r.createdAt));
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
    sampleDupKeys: [],
  };

  const stats = {
    scanned: 0,
    groups: 0,
    dupGroups: 0,
    kept: 0,
    deleted: 0,
    wouldDelete: 0,
    normalizedKeptKeys: 0,
    errors: 0,
  };

  let nextStartAtGroup = 0;
  let done = false;

  const elapsed = () => Date.now() - t0;
  const outOfTime = (budgetMs) => elapsed() >= budgetMs;

  try {
    if (req.method !== "POST") {
      debug.elapsedMs = elapsed();
      return jsonResp({ ok: false, error: "Method not allowed", stats, debug, nextStartAtGroup, done });
    }

    const client = createClientFromRequest(req);
    const user = await client.auth.me().catch(() => null);
    if (!user || user.role !== "admin") return jsonResp({ ok: false, error: "Forbidden" });

    const body = await req.json().catch(() => ({}));

    const dryRun = !!body.dryRun;
    const org = safeStr(body.org || "ncaa").trim() || "ncaa";

    const startAtGroup = Math.max(0, toNum(body.startAtGroup, 0));
    const maxGroups = Math.max(1, toNum(body.maxGroups, 120));
    const maxDelete = Math.max(0, toNum(body.maxDelete, 200));

    const throttleMs = Math.max(0, toNum(body.throttleMs, dryRun ? 0 : 250));
    const timeBudgetMs = Math.max(5000, toNum(body.timeBudgetMs, 22000));
    const tries = Math.max(1, toNum(body.tries, 6));

    const normalizeSourceKey = body.normalizeSourceKey === undefined ? true : !!body.normalizeSourceKey;

    nextStartAtGroup = startAtGroup;
    const AthleticsMembership =
      (client.entities && (client.entities.AthleticsMembership || client.entities.AthleticsMemberships)) || null;

    if (!AthleticsMembership) {
      debug.errors.push({ step: "init", message: "AthleticsMembership entity not found" });
      debug.elapsedMs = elapsed();
      return jsonResp({ ok: false, error: "AthleticsMembership entity not found", stats, debug, nextStartAtGroup, done });
    }

    let rows = [];
    try {
      const out = await AthleticsMembership.filter({ org });
      rows = Array.isArray(out) ? out : [];
    } catch (e) {
      debug.errors.push({ step: "load", message: safeStr(e && (e.message || e)), where: { org } });
      debug.elapsedMs = elapsed();
      return jsonResp({ ok: false, error: "Failed to load AthleticsMembership rows", stats, debug, nextStartAtGroup, done });
    }

    stats.scanned = rows.length;
    debug.notes.push(`loaded rows=${rows.length} org=${org} dryRun=${dryRun}`);

    if (!rows.length) {
      done = true;
      debug.elapsedMs = elapsed();
      return jsonResp({ ok: true, dryRun, stats, debug, nextStartAtGroup, done });
    }

    const byKey = new Map();
    for (const r of rows) {
      const schoolId = safeStr(r && r.school_id).trim();
      if (!schoolId) continue;
      const k = `${org}:${schoolId}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r);
    }

    const keys = Array.from(byKey.keys()).sort();
    stats.groups = keys.length;

    const endAt = Math.min(keys.length, startAtGroup + maxGroups);
    nextStartAtGroup = endAt;
    done = endAt >= keys.length;

    let deleteBudget = dryRun ? Number.MAX_SAFE_INTEGER : maxDelete;

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
      if (debug.sampleDupKeys.length < 3) debug.sampleDupKeys.push(key);

      const keep = pickBestRecord(group);
      const keepId = getId(keep);
      if (!keepId) {
        stats.errors += 1;
        debug.errors.push({ step: "pick_keep", key, message: "keep record missing id" });
        continue;
      }
      stats.kept += 1;

      if (normalizeSourceKey) {
        const desiredSourceKey = key;
        const currentSourceKey = safeStr(keep && keep.source_key).trim();

        if (desiredSourceKey && desiredSourceKey !== currentSourceKey) {
          if (dryRun) {
            stats.normalizedKeptKeys += 1;
          } else {
            const up = await updateWithRetry(
              AthleticsMembership,
              keepId,
              { source_key: desiredSourceKey, season_year: null },
              tries,
              debug,
              "normalize_keep"
            );
            if (up.ok) stats.normalizedKeptKeys += 1;
            else {
              stats.errors += 1;
              debug.errors.push({ step: "normalize_keep", key, id: keepId, message: up.error });
            }
          }
        }
      }

      const toDelete = group.filter((r) => {
        const id = getId(r);
        return id && id !== keepId;
      });

      stats.wouldDelete += toDelete.length;

      for (const r of toDelete) {
        if (!dryRun && deleteBudget <= 0) {
          debug.notes.push(`delete_budget_exhausted gi=${gi}`);
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

        if (dryRun) continue;

        const del = await deleteWithRetry(AthleticsMembership, id, tries, debug, throttleMs);
        if (del.ok) {
          stats.deleted += 1;
          deleteBudget -= 1;
        } else {
          stats.errors += 1;
          debug.errors.push({ step: "delete", key, id, message: del.error });
        }
      }
    }

    debug.elapsedMs = elapsed();
    return jsonResp({ ok: true, dryRun, stats, debug, nextStartAtGroup, done });
  } catch (e) {
    stats.errors += 1;
    debug.errors.push({ step: "fatal", message: safeStr(e && (e.message || e)) });
    debug.elapsedMs = elapsed();
    return jsonResp({ ok: false, error: "Fatal dedupe error", stats, debug, nextStartAtGroup, done });
  }
});
