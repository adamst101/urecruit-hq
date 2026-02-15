// functions/seedSchoolsMaster_scorecard.js
// Deno + Base44 backend function (JS-only: no TS syntax)
//
// Two modes:
// 1) Fetch-only (DEFAULT): returns normalized rows for UI to upsert (fast + restart-safe)
//    - When dryRun=true OR serverWrite=false (default), NO DB calls are made.
// 2) Server-write (optional): function performs DB upsert + dedupe (slower; can hit rate limits)
//
// Request body:
// {
//   "page": 0,
//   "perPage": 100,
//   "maxPages": 1,
//   "dryRun": true,
//   "serverWrite": false,     // default false; set true ONLY if you want server-side upsert/dedupe
//   "delayMs": 140,
//   "deleteDelayMs": 160,
//   "updateExisting": true
// }
//
// Response:
// { ok, rows, stats, debug }

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
      } catch (e) {
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

// OPTIONAL: server-write helpers (kept for later, not used in default fetch-only)
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
    mode: null,
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

    const body = await req.json().catch(() => ({}));

    const page = Number(body?.page ?? 0);
    const perPage = Math.max(1, Math.min(100, Number(body?.perPage ?? 100)));
    const maxPages = Math.max(1, Math.min(25, Number(body?.maxPages ?? 1)));

    const dryRun = !!body?.dryRun;
    const serverWrite = body?.serverWrite === true; // default false

    const delayMs = Math.max(0, Number(body?.delayMs ?? 140));
    const deleteDelayMs = Math.max(0, Number(body?.deleteDelayMs ?? 160));
    const updateExisting = body?.updateExisting === undefined ? true : !!body?.updateExisting;

    const apiKey = (Deno.env.get("SCORECARD_API_KEY") || "").trim();
    if (!apiKey) return jsonResp({ ok: false, error: "Missing SCORECARD_API_KEY", stats, debug });

    // MODE: if dryRun OR serverWrite=false => fetch-only, no DB calls
    if (dryRun || !serverWrite) debug.mode = "fetch_only_rows_for_client";
    else debug.mode = "server_write_upsert_dedupe";

    const fields = ["id", "school.name", "school.city", "school.state", "school.school_url"].join(",");

    const rowsOut = [];

    // 1) Fetch + normalize rows
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
        rowsOut.push(desired);
      }

      if (results.length < perPage) break;
    }

    // 2) Fetch-only path: return rows immediately (NO DB)
    if (dryRun || !serverWrite) {
      return jsonResp({
        ok: true,
        dryRun,
        rows: rowsOut,
        stats,
        debug: {
          startedAt: debug.startedAt,
          mode: debug.mode,
          pageCalls: debug.pageCalls,
          retries: debug.retries,
          retry_notes: debug.retry_notes,
          last_http: debug.last_http,
          last_body_snippet: debug.last_body_snippet,
          samples: debug.samples,
          errors: debug.errors.slice(0, 50),
        },
      });
    }

    // 3) Server-write path (optional): do DB upsert + dedupe
    const base44 = createClientFromRequest(req);
    const School = base44?.entities?.School || base44?.entities?.Schools;
    if (!School) return jsonResp({ ok: false, error: "School entity not found in base44.entities", stats, debug });

    for (const desired of rowsOut) {
      // Lookup by unitid (canonical)
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
        existing = [];
      }

      if (existing.length > 1) {
        stats.dedupeGroups += 1;
        const keep = pickKeepRow(existing);
        const keepId = getId(keep);
        const delIds = existing.map(getId).filter(Boolean).filter((id) => id !== keepId);

        if (debug.samples.length < 8) {
          debug.samples.push({
            unitid: desired.unitid,
            name: desired.school_name,
            dupCount: existing.length,
            keepId,
            deleteIds: delIds.slice(0, 6),
          });
        }

        if (updateExisting && keepId) {
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

        continue;
      }

      if (existing.length === 0) {
        try {
          await withRetries(() => School.create(desired), debug, `School.create(unitid=${desired.unitid})`, 8);
          stats.created += 1;
        } catch (e) {
          stats.dbWriteErrors += 1;
          debug.errors.push(`create failed unitid=${desired.unitid}: ${String(e?.message || e)}`);
        }
        await sleep(delayMs);
        continue;
      }

      const one = existing[0];
      const oneId = getId(one);
      if (updateExisting && oneId) {
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

    return jsonResp({
      ok: true,
      dryRun,
      rows: [],
      stats,
      debug: {
        startedAt: debug.startedAt,
        mode: debug.mode,
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
