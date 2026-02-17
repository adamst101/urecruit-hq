// functions/athleticsMembershipDedupe.ts
// Batch-safe dedupe sweep for AthleticsMembership (JS-only syntax; Base44-editor safe)
//
// Request body:
// {
//   dryRun: boolean,
//   org: string,
//   seasonYear: number | null,
//   startAtGroup: number,
//   maxGroups: number,
//   maxDelete: number,
//   throttleMs: number,
//   timeBudgetMs: number,
//   tries: number
// }
//
// Response:
// { ok, dryRun, stats, debug, nextStartAtGroup, done }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function safeStr(x) {
  return x == null ? "" : String(x);
}
function lc(x) {
  return safeStr(x).toLowerCase().trim();
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}
function getId(r) {
  const v = r && (r.id ?? r._id ?? r.uuid);
  return v == null ? null : String(v);
}
function toTime(x) {
  const s = safeStr(x);
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}
function isRetryable(msg) {
  const m = lc(msg);
  return (
    m.includes("rate limit") ||
    m.includes("429") ||
    m.includes("status code 429") ||
    m.includes("status code 502") ||
    m.includes("status code 503") ||
    m.includes("status code 504") ||
    m.includes("timeout")
  );
}
function jsonResp(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;

  const debug = {
    startedAt: new Date().toISOString(),
    notes: [],
    errors: [],
    retries: 0,
    retry_notes: [],
    elapsedMs: 0,
    stoppedEarly: false,
  };

  const stats = {
    scanned: 0,
    groups: 0,
    dupGroups: 0,
    kept: 0,
    deleted: 0,
    errors: 0,
    deleteAttempts: 0,
  };

  let nextStartAtGroup = 0;
  let done = false;

  try {
    if (req.method !== "POST") {
      debug.elapsedMs = elapsed();
      return jsonResp({ ok: false, error: "Method not allowed", stats, debug, nextStartAtGroup, done });
    }

    const body = await req.json().catch(() => ({}));

    const dryRun = !!body.dryRun;
    const org = safeStr(body.org || "ncaa") || "ncaa";
    const seasonYear = body.seasonYear != null ? Number(body.seasonYear) : null;

    const startAtGroup = Math.max(0, Number(body.startAtGroup || 0));
    const maxGroups = Math.max(1, Number(body.maxGroups || 100));
    const maxDelete = Math.max(0, Number(body.maxDelete || 500));
    const throttleMs = Math.max(0, Number(body.throttleMs || (dryRun ? 0 : 60)));
    const timeBudgetMs = Math.max(5000, Number(body.timeBudgetMs || 20000));
    const tries = Math.max(1, Number(body.tries || 6));

    const client = createClientFromRequest(req);
    const AthleticsMembership = client.entities.AthleticsMembership || client.entities.AthleticsMemberships;
    if (!AthleticsMembership) {
      debug.elapsedMs = elapsed();
      return jsonResp({ ok: false, error: "AthleticsMembership entity not found", stats, debug, nextStartAtGroup, done });
    }

    // Load rows with best-effort server-side filter, else fallback local filter
    let rows = [];
    try {
      const q = { org };
      if (seasonYear != null && Number.isFinite(seasonYear)) q.season_year = seasonYear;
      const out = await AthleticsMembership.filter(q);
      rows = Array.isArray(out) ? out : [];
    } catch (e) {
      const out = await AthleticsMembership.filter({});
      const all = Array.isArray(out) ? out : [];
      rows = all.filter((r) => lc(r && r.org) === lc(org) && (seasonYear == null ? true : Number(r && r.season_year) === Number(seasonYear)));
      debug.notes.push(`fallback filter used; loaded all=${all.length} kept=${rows.length}`);
    }

    stats.scanned = rows.length;
    debug.notes.push(`loaded rows=${rows.length} org=${org} seasonYear=${seasonYear == null ? "ALL" : seasonYear} dryRun=${dryRun}`);

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

    const endAtGroup = Math.min(keys.length, startAtGroup + maxGroups);
    nextStartAtGroup = endAtGroup;
    done = endAtGroup >= keys.length;

    debug.notes.push(`group window startAtGroup=${startAtGroup} endAtGroup=${endAtGroup} totalGroups=${keys.length} maxGroups=${maxGroups}`);

    function chooseKeep(group) {
      let best = group[0];
      let bestScore = -1;
      for (const r of group) {
        const score =
          toTime(r && r.last_verified_at) * 10 +
          toTime((r && (r.updated_at || r.updatedAt)) || "") * 3 +
          toTime((r && (r.created_at || r.createdAt)) || "") * 1;
        if (score > bestScore) {
          bestScore = score;
          best = r;
        }
      }
      return best;
    }

    async function deleteWithRetry(id, sourceKey) {
      for (let i = 0; i < tries; i++) {
        stats.deleteAttempts += 1;
        try {
          await AthleticsMembership.delete(id);
          return { ok: true };
        } catch (e) {
          const msg = safeStr(e && (e.message || e));
          const retryable = isRetryable(msg);
          if (!retryable || i === tries - 1) return { ok: false, message: msg };

          const backoff = Math.min(12000, Math.floor(600 * Math.pow(2, i) + Math.random() * 250));
          debug.retries += 1;
          debug.retry_notes.push({ step: "delete", attempt: i + 1, tries, backoffMs: backoff, source_key: sourceKey, id, message: msg });
          await sleep(backoff);
        }
      }
      return { ok: false, message: "delete failed" };
    }

    let deletesLeft = maxDelete;

    for (let gi = startAtGroup; gi < endAtGroup; gi++) {
      if (elapsed() >= timeBudgetMs) {
        debug.stoppedEarly = true;
        nextStartAtGroup = gi;
        done = false;
        break;
      }

      const k = keys[gi];
      const group = byKey.get(k) || [];
      if (group.length <= 1) continue;

      stats.dupGroups += 1;

      const keep = chooseKeep(group);
      const keepId = getId(keep);
      if (!keepId) {
        stats.errors += 1;
        debug.errors.push({ step: "choose_keep_missing_id", source_key: k, message: "keep record missing id" });
        continue;
      }
      stats.kept += 1;

      for (const r of group) {
        const id = getId(r);
        if (!id || id === keepId) continue;

        if (dryRun) {
          stats.deleted += 1; // would delete
          continue;
        }

        if (deletesLeft <= 0) {
          debug.stoppedEarly = true;
          nextStartAtGroup = gi;
          done = false;
          debug.notes.push(`hit maxDelete cap; resume at groupIndex=${gi}`);
          break;
        }

        const out = await deleteWithRetry(id, k);
        if (!out.ok) {
          stats.errors += 1;
          debug.errors.push({ step: "delete", source_key: k, id, message: out.message });
        } else {
          stats.deleted += 1;
          deletesLeft -= 1;
        }

        if (throttleMs > 0) await sleep(throttleMs);
        if (elapsed() >= timeBudgetMs) {
          debug.stoppedEarly = true;
          nextStartAtGroup = gi;
          done = false;
          break;
        }
      }

      if (debug.stoppedEarly) break;
    }

    debug.elapsedMs = elapsed();
    return jsonResp({ ok: true, dryRun, stats, debug, nextStartAtGroup, done });
  } catch (e) {
    stats.errors += 1;
    debug.errors.push({ step: "fatal", message: safeStr(e && (e.message || e)) });
    debug.elapsedMs = elapsed();
    return jsonResp({ ok: false, error: safeStr(e && (e.message || e)), stats, debug, nextStartAtGroup, done });
  }
});

