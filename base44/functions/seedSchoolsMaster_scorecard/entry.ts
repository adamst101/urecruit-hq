// functions/seedSchoolsMaster_scorecard.ts
// Deno + Base44 backend function (JS-only style; no TS syntax used)
// PURPOSE (idempotent + self-healing):
// - Fetch College Scorecard schools
// - Upsert into School by unitid (canonical key)
// - If duplicates already exist for a unitid, keep the “best” row and delete the rest
// - Safe to run repeatedly: it will not create duplicates and will clean existing duplicates over time
//
// Request body:
// {
//   "page": 0,               // starting page (0-based Scorecard API)
//   "perPage": 100,          // 1..100
//   "maxPages": 1,           // 1..25 (batch pages per call)
//   "dryRun": true,          // if true: no writes
//   "delayMs": 220,          // throttle between writes
//   "deleteDelayMs": 260,    // throttle between deletes
//   "updateExisting": true   // if false: only create missing + dedupe deletes (no updates)
// }
//
// Response:
// { ok, dryRun, stats, debug }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function s(x) {
  if (x === null || x === undefined) return null;
  const t = String(x).trim();
  return t ? t : null;
}

function lc(x) {
  return String(x || "").toLowerCase().trim();
}

function normName(x) {
  return lc(x)
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKeyFromUnitid(unitid) {
  const u = s(unitid);
  return u ? `scorecard:${u}` : null;
}

function isRetryableStatus(st) {
  return st === 429 || st === 500 || st === 502 || st === 503 || st === 504;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(r) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

async function fetchJsonWithRetry(url, debug, tries) {
  let lastErr = null;

  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
          Accept: "application/json",
        },
      });

      debug.last_http = r.status;
      debug.last_url = url;

      const text = await safeText(r);
      debug.last_body_snippet = text ? text.slice(0, 500) : null;

      if (!r.ok) {
        if (isRetryableStatus(r.status) && i < tries - 1) {
          const wait = Math.min(12000, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
          debug.retries = (debug.retries || 0) + 1;
          debug.retry_notes = debug.retry_notes || [];
          debug.retry_notes.push({ attempt: i + 1, http: r.status, wait_ms: wait, kind: "http" });
          await sleep(wait);
          continue;
        }
        throw new Error(`Scorecard HTTP ${r.status}`);
      }

      try {
        return JSON.parse(text);
      } catch {
        if (i < tries - 1) {
          const wait = Math.min(12000, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
          debug.retries = (debug.retries || 0) + 1;
          debug.retry_notes = debug.retry_notes || [];
          debug.retry_notes.push({ attempt: i + 1, http: r.status, wait_ms: wait, kind: "json_parse_failed" });
          await sleep(wait);
          continue;
        }
        throw new Error(`Scorecard invalid JSON (http ${r.status})`);
      }
    } catch (e) {
      lastErr = e;
      const msg = String(e && e.message ? e.message : e);

      if (i < tries - 1) {
        const wait = Math.min(12000, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
        debug.retries = (debug.retries || 0) + 1;
        debug.retry_notes = debug.retry_notes || [];
        debug.retry_notes.push({ attempt: i + 1, error: msg, wait_ms: wait, kind: "exception" });
        await sleep(wait);
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr || new Error("Scorecard fetch failed");
}

async function withRetries(fn, debug, label, tries) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String(e && e.message ? e.message : e);
      const status = e?.raw?.status || e?.status;
      const retryable =
        status === 429 ||
        (typeof status === "number" && status >= 500) ||
        lc(msg).includes("rate limit") ||
        lc(msg).includes("timeout") ||
        lc(msg).includes("network");

      if (retryable && i < tries - 1) {
        const wait = Math.min(20000, 500 * Math.pow(2, i)) + Math.floor(Math.random() * 200);
        debug.retries = (debug.retries || 0) + 1;
        debug.retry_notes = debug.retry_notes || [];
        debug.retry_notes.push({ attempt: i + 1, label, wait_ms: wait, error: msg });
        await sleep(wait);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// Higher score = “better completeness” for keeper selection
function scoreSchoolRow(r) {
  let sc = 0;
  if (s(r?.unitid)) sc += 10;
  if (s(r?.school_name) || s(r?.name)) sc += 6;
  if (s(r?.state)) sc += 4;
  if (s(r?.city)) sc += 3;
  if (s(r?.website_url)) sc += 2;
  if (s(r?.logo_url)) sc += 2;
  if (lc(r?.source_platform) === "scorecard") sc += 2;
  if (s(r?.source_key)) sc += 1;
  return sc;
}

function pickKeepRow(rows) {
  const sorted = [...rows].sort((a, b) => {
    const sa = scoreSchoolRow(a);
    const sb = scoreSchoolRow(b);
    if (sb !== sa) return sb - sa;
    const ida = String(a?.id || a?._id || "");
    const idb = String(b?.id || b?._id || "");
    return ida.localeCompare(idb);
  });
  return sorted[0] || null;
}

function getId(r) {
  const v = r?.id ?? r?._id ?? r?.uuid;
  return v === null || v === undefined ? null : String(v);
}

function desiredSchoolRowFromScorecard(r) {
  const unitid = s(r && r.id);
  const name = s(r && r["school.name"]);
  const city = s(r && r["school.city"]);
  const state = s(r && r["school.state"]);
  const site = s(r && r["school.school_url"]);

  if (!unitid || !name) return null;

  return {
    unitid,
    school_name: name,
    normalized_name: normName(name),
    city,
    state,
    website_url: site,
    source_platform: "scorecard",
    source_key: buildKeyFromUnitid(unitid),
  };
}

function mergeForUpdate(existing, desired) {
  // Policy: keep existing values if desired is null, otherwise overwrite with desired
  const out = { ...existing };

  const fields = [
    "unitid",
    "school_name",
    "normalized_name",
    "city",
    "state",
    "website_url",
    "source_platform",
    "source_key",
  ];

  for (const f of fields) {
    const v = desired[f];
    if (v !== null && v !== undefined && String(v).trim() !== "") out[f] = v;
    else if (out[f] === undefined) out[f] = null;
  }

  return out;
}

function jsonResp(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const debug = {
    startedAt: new Date().toISOString(),
    retries: 0,
    retry_notes: [],
    last_http: null,
    last_url: null,
    last_body_snippet: null,
    pageCalls: [],
    samples: [],
    errors: [],
  };

  const stats = {
    fetched: 0,
    processed: 0,
    created: 0,
    updated: 0,
    dedupeGroups: 0,
    dedupeDeleted: 0,
    skippedNoUnitidOrName: 0,
    dbLookupErrors: 0,
    dbWriteErrors: 0,
  };

  try {
    if (req.method !== "POST") return jsonResp({ ok: false, error: "Method not allowed", stats, debug });

    const base44 = createClientFromRequest(req);
    const School = base44?.entities?.School || base44?.entities?.Schools;

    if (!School) return jsonResp({ ok: false, error: "School entity not found in base44.entities", stats, debug });

    const body = await req.json().catch(() => ({}));

    const page = Number(body?.page ?? 0);
    const perPage = Math.max(1, Math.min(100, Number(body?.perPage ?? 100)));
    const maxPages = Math.max(1, Math.min(25, Number(body?.maxPages ?? 1)));

    const dryRun = !!body?.dryRun;
    const delayMs = Math.max(0, Number(body?.delayMs ?? 220));
    const deleteDelayMs = Math.max(0, Number(body?.deleteDelayMs ?? 260));
    const updateExisting = body?.updateExisting === undefined ? true : !!body?.updateExisting;

    const apiKey = (Deno.env.get("SCORECARD_API_KEY") || "").trim();
    if (!apiKey) return jsonResp({ ok: false, error: "Missing SCORECARD_API_KEY", stats, debug });

    const fields = ["id", "school.name", "school.city", "school.state", "school.school_url"].join(",");

    for (let p = page; p < page + maxPages; p++) {
      const urlObj = new URL("https://api.data.gov/ed/collegescorecard/v1/schools");
      urlObj.searchParams.set("api_key", apiKey);
      urlObj.searchParams.set("fields", fields);
      urlObj.searchParams.set("per_page", String(perPage));
      urlObj.searchParams.set("page", String(p));
      const url = urlObj.toString();

      const data = await fetchJsonWithRetry(url, debug, 5);
      debug.pageCalls.push({ page: p, http: debug.last_http });

      const results = Array.isArray(data && data.results) ? data.results : [];
      stats.fetched += results.length;

      for (const r of results) {
        const desired = desiredSchoolRowFromScorecard(r);

        if (!desired) {
          stats.skippedNoUnitidOrName += 1;
          continue;
        }

        stats.processed += 1;

        // Lookup by canonical key: unitid
        let existing = [];
        try {
          existing = await withRetries(
            () => School.filter({ unitid: desired.unitid }),
            debug,
            `School.filter(unitid=${desired.unitid})`,
            8
          );
          if (!Array.isArray(existing)) existing = [];
        } catch (e) {
          stats.dbLookupErrors += 1;
          debug.errors.push(`lookup failed unitid=${desired.unitid}: ${String(e?.message || e)}`);

          // Fallback lookup by source_key (deterministic)
          try {
            existing = await withRetries(
              () => School.filter({ source_key: desired.source_key }),
              debug,
              `School.filter(source_key=${desired.source_key})`,
              6
            );
            if (!Array.isArray(existing)) existing = [];
          } catch (e2) {
            stats.dbLookupErrors += 1;
            debug.errors.push(`fallback lookup failed key=${desired.source_key}: ${String(e2?.message || e2)}`);
            existing = [];
          }
        }

        // If multiple rows already exist for same unitid, keep best and delete others
        if (existing.length > 1) {
          stats.dedupeGroups += 1;

          const keep = pickKeepRow(existing);
          const keepId = getId(keep);
          const delIds = existing
            .map(getId)
            .filter(Boolean)
            .filter((id) => id !== keepId);

          if (debug.samples.length < 8) {
            debug.samples.push({
              unitid: desired.unitid,
              name: desired.school_name,
              dupCount: existing.length,
              keepId,
              deleteIds: delIds.slice(0, 6),
            });
          }

          // Update keeper with canonical Scorecard values
          if (!dryRun && updateExisting && keepId) {
            try {
              const merged = mergeForUpdate(keep, desired);
              await withRetries(() => School.update(keepId, merged), debug, `School.update(keepId=${keepId})`, 8);
              stats.updated += 1;
            } catch (e) {
              stats.dbWriteErrors += 1;
              debug.errors.push(`update keeper failed keepId=${keepId}: ${String(e?.message || e)}`);
            }
            await sleep(delayMs);
          }

          // Delete duplicates
          if (!dryRun) {
            for (const id of delIds) {
              try {
                await withRetries(() => School.delete(id), debug, `School.delete(dupId=${id})`, 10);
                stats.dedupeDeleted += 1;
              } catch (e) {
                stats.dbWriteErrors += 1;
                debug.errors.push(`delete dup failed id=${id}: ${String(e?.message || e)}`);
              }
              await sleep(deleteDelayMs);
            }
          }

          continue; // done with this unitid
        }

        // No existing: create
        if (existing.length === 0) {
          if (!dryRun) {
            try {
              await withRetries(() => School.create(desired), debug, `School.create(unitid=${desired.unitid})`, 8);
              stats.created += 1;
            } catch (e) {
              stats.dbWriteErrors += 1;
              debug.errors.push(`create failed unitid=${desired.unitid}: ${String(e?.message || e)}`);
            }
            await sleep(delayMs);
          }
          continue;
        }

        // Exactly one existing: update (optional)
        const one = existing[0];
        const oneId = getId(one);

        if (!dryRun && updateExisting && oneId) {
          try {
            const merged = mergeForUpdate(one, desired);
            await withRetries(() => School.update(oneId, merged), debug, `School.update(id=${oneId})`, 8);
            stats.updated += 1;
          } catch (e) {
            stats.dbWriteErrors += 1;
            debug.errors.push(`update failed id=${oneId} unitid=${desired.unitid}: ${String(e?.message || e)}`);
          }
          await sleep(delayMs);
        }
      }

      // likely end-of-dataset
      if (results.length < perPage) break;
    }

    return jsonResp({
      ok: true,
      dryRun,
      stats,
      debug: {
        startedAt: debug.startedAt,
        pageCalls: debug.pageCalls,
        retries: debug.retries,
        retry_notes: debug.retry_notes,
        last_http: debug.last_http,
        last_body_snippet: debug.last_body_snippet,
        samples: debug.samples,
        errors: debug.errors.slice(0, 50),
      },
    });
  } catch (e) {
    debug.errors.push(String(e?.message || e));
    return jsonResp({ ok: false, error: String(e?.message || e), stats, debug });
  }
});
