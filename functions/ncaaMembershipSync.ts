// functions/ncaaMembershipSync.ts
// Batch-safe NCAA enrichment (name-only matching) with checkpointing + faster writes.
//
// Key improvements:
// - Defensive time budget checks (pre/post fetch, and inside loop)
// - Faster upsert: try CREATE first, on duplicate then UPDATE (filter+update only on dup)
//
// Request body:
// {
//   dryRun: boolean,
//   seasonYear: number | null,
//   startAt: number,
//   maxRows: number,                 // batch size (recommend 150-250). 0 = ALL (not recommended for write)
//   confidenceThreshold: number,      // 0..1
//   throttleMs: number,              // recommend 0-5
//   timeBudgetMs: number,            // recommend 18000-22000
//   sourcePlatform: string
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
function lc(x) {
  return String(x || "").toLowerCase().trim();
}
function normName(x) {
  return lc(x)
    .replace(/&/g, "and")
    .replace(/\ba&m\b/g, "am")
    .replace(/\buniv\b/g, "university")
    .replace(/\buniv\.\b/g, "university")
    .replace(/\bst\.\b/g, "state")
    .replace(/\bmt\.\b/g, "mount")
    .replace(/\bthe\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function getId(r) {
  const v = r?.id ?? r?._id ?? r?.uuid;
  return v === null || v === undefined ? null : String(v);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}
async function safeText(r) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}
function isRetryableStatus(st) {
  return st === 429 || st === 500 || st === 502 || st === 503 || st === 504;
}
function looksLikeDuplicate(errMsg) {
  const m = lc(errMsg);
  return (
    m.includes("duplicate") ||
    m.includes("unique") ||
    m.includes("already exists") ||
    m.includes("conflict") ||
    m.includes("409")
  );
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

      const txt = await safeText(r);
      debug.last_body_snippet = txt ? txt.slice(0, 800) : null;

      if (!r.ok) {
        if (isRetryableStatus(r.status) && i < tries - 1) {
          const wait = Math.min(12000, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
          debug.retries = (debug.retries || 0) + 1;
          debug.retry_notes = debug.retry_notes || [];
          debug.retry_notes.push({ attempt: i + 1, http: r.status, wait_ms: wait, kind: "http" });
          await sleep(wait);
          continue;
        }
        throw new Error(`NCAA HTTP ${r.status}`);
      }

      try {
        return txt ? JSON.parse(txt) : null;
      } catch {
        if (i < tries - 1) {
          const wait = Math.min(12000, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
          debug.retries = (debug.retries || 0) + 1;
          debug.retry_notes = debug.retry_notes || [];
          debug.retry_notes.push({ attempt: i + 1, http: r.status, wait_ms: wait, kind: "json_parse_failed" });
          await sleep(wait);
          continue;
        }
        throw new Error("NCAA invalid JSON");
      }
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) {
        const wait = Math.min(12000, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
        debug.retries = (debug.retries || 0) + 1;
        debug.retry_notes = debug.retry_notes || [];
        debug.retry_notes.push({ attempt: i + 1, error: String(e?.message || e), wait_ms: wait, kind: "exception" });
        await sleep(wait);
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr || new Error("NCAA fetch failed");
}

async function listAllSchools(School) {
  if (!School) return [];
  if (typeof School.filter === "function") {
    const rows = await School.filter({});
    return Array.isArray(rows) ? rows : [];
  }
  if (typeof School.list === "function") {
    try {
      const rows = await School.list({ where: {} });
      return Array.isArray(rows) ? rows : [];
    } catch {
      const rows = await School.list({});
      return Array.isArray(rows) ? rows : [];
    }
  }
  if (typeof School.all === "function") {
    const rows = await School.all();
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

function extractSchoolRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.schools)) return payload.schools;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
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
    retries: 0,
    retry_notes: [],
    last_http: null,
    last_url: null,
    last_body_snippet: null,
    samples: [],
    errors: [],
    notes: [],
    stoppedEarly: false,
    elapsedMs: 0,
  };

  const stats = {
    fetched: 0,
    processed: 0,
    matched: 0,
    noMatch: 0,
    ambiguous: 0,
    created: 0,
    updated: 0,
    skippedDryRun: 0,
    missingName: 0,
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
    if (req.method !== "POST") return jsonResp({ ok: false, error: "Method not allowed", stats, debug, nextStartAt, done });

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const seasonYear = body?.seasonYear != null ? Number(body.seasonYear) : null;
    const startAt = Math.max(0, Number(body?.startAt || 0));
    const maxRows = Number(body?.maxRows || 0);
    const threshold = Number(body?.confidenceThreshold || 0.92);
    const throttleMs = Number(body?.throttleMs || (dryRun ? 0 : 5));
    const timeBudgetMs = Math.max(5000, Number(body?.timeBudgetMs || 20000));
    const sourcePlatform = s(body?.sourcePlatform) || "ncaa-api";

    const client = createClientFromRequest(req);
    const School = client.entities.School || client.entities.Schools;
    const AthleticsMembership = client.entities.AthleticsMembership || client.entities.AthleticsMemberships;
    const Unmatched = client.entities.UnmatchedAthleticsRow || client.entities.UnmatchedAthleticsRows;

    if (!School) return jsonResp({ ok: false, error: "School entity not found", stats, debug, nextStartAt, done });
    if (!AthleticsMembership) return jsonResp({ ok: false, error: "AthleticsMembership entity not found", stats, debug, nextStartAt, done });

    // Build name-only index
    const allSchools = await listAllSchools(School);
    const byNormName = new Map();
    for (const r of allSchools) {
      const nn = s(r?.normalized_name) || normName(r?.school_name || r?.name || "");
      if (!nn) continue;
      if (!byNormName.has(nn)) byNormName.set(nn, []);
      byNormName.get(nn).push(r);
    }
    debug.notes.push(`Indexed schools: keys=${byNormName.size} rows=${allSchools.length} elapsedMs=${elapsed()}`);

    if (outOfTime(timeBudgetMs)) {
      debug.stoppedEarly = true;
      debug.elapsedMs = elapsed();
      nextStartAt = startAt;
      done = false;
      return jsonResp({ ok: true, dryRun, stats, debug, nextStartAt, done });
    }

    // Fetch NCAA index
    const url = "https://ncaa-api.henrygd.me/schools-index";
    const payload = await fetchJsonWithRetry(url, debug, 6);
    const rows = extractSchoolRows(payload);
    stats.fetched = rows.length;

    const effectiveMax = maxRows > 0 ? maxRows : rows.length;
    const endAt = Math.min(rows.length, startAt + effectiveMax);
    nextStartAt = endAt;
    done = endAt >= rows.length;

    debug.notes.push(`Batch window: startAt=${startAt} endAt=${endAt} total=${rows.length} budgetMs=${timeBudgetMs} elapsedMs=${elapsed()}`);

    if (outOfTime(timeBudgetMs)) {
      debug.stoppedEarly = true;
      debug.elapsedMs = elapsed();
      nextStartAt = startAt;
      done = false;
      return jsonResp({ ok: true, dryRun, stats, debug, nextStartAt, done });
    }

    for (let i = startAt; i < endAt; i++) {
      if (outOfTime(timeBudgetMs)) {
        debug.stoppedEarly = true;
        debug.elapsedMs = elapsed();
        nextStartAt = i; // resume
        done = false;
        break;
      }

      const raw = rows[i];
      stats.processed += 1;

      const rawName = s(raw?.long) || s(raw?.name);
      const slug = s(raw?.slug);

      if (!rawName) {
        stats.missingName += 1;
        continue;
      }

      const nkey = normName(rawName);
      const candidates = nkey ? (byNormName.get(nkey) || []) : [];

      if (!candidates.length) {
        stats.noMatch += 1;

        if (Unmatched && !dryRun) {
          const rawKey = `ncaa:${nkey || "no_name"}:${slug || "no_slug"}`;
          try {
            // create-first unmatched
            await Unmatched.create({
              org: "ncaa",
              raw_school_name: rawName,
              raw_city: null,
              raw_state: null,
              raw_source_key: rawKey,
              source_url: slug ? `https://www.ncaa.com/schools/${slug}` : null,
              reason: "no_match",
              attempted_match_notes: `name_only; normalized="${nkey}"`,
              created_at: new Date().toISOString(),
            });
          } catch (e) {
            // if duplicate, ignore; if other, log
            const msg = String(e?.message || e);
            if (!looksLikeDuplicate(msg)) {
              stats.errors += 1;
              debug.errors.push({ step: "unmatched_create", message: msg, raw: { rawName, slug }, rawKey });
            }
          }
        }

        continue;
      }

      if (candidates.length > 1) {
        stats.ambiguous += 1;

        if (Unmatched && !dryRun) {
          const rawKey = `ncaa:${nkey}:${slug || "no_slug"}`;
          try {
            await Unmatched.create({
              org: "ncaa",
              raw_school_name: rawName,
              raw_city: null,
              raw_state: null,
              raw_source_key: rawKey,
              source_url: slug ? `https://www.ncaa.com/schools/${slug}` : null,
              reason: "ambiguous",
              attempted_match_notes: `name_only; candidates=${candidates.length}; normalized="${nkey}"`,
              created_at: new Date().toISOString(),
            });
          } catch (e) {
            const msg = String(e?.message || e);
            if (!looksLikeDuplicate(msg)) {
              stats.errors += 1;
              debug.errors.push({ step: "unmatched_create_ambiguous", message: msg, raw: { rawName, slug }, rawKey });
            }
          }
        }

        continue;
      }

      const school = candidates[0];
      const schoolId = getId(school);
      if (!schoolId) {
        stats.errors += 1;
        debug.errors.push({ step: "candidate_missing_id", raw: { rawName, slug } });
        continue;
      }

      const confidence = 0.95;
      if (confidence < threshold) {
        stats.ambiguous += 1;
        continue;
      }

      stats.matched += 1;

      const sourceKey = `ncaa:${schoolId}:${seasonYear || "current"}`;
      const rec = {
        school_id: schoolId,
        org: "ncaa",
        member: true,
        division: null,
        subdivision: null,
        conference: null,
        season_year: seasonYear,
        source_platform: sourcePlatform,
        source_url: slug ? `https://www.ncaa.com/schools/${slug}` : null,
        source_key: sourceKey,
        confidence: confidence,
        last_verified_at: new Date().toISOString(),
      };

      if (dryRun) {
        stats.skippedDryRun += 1;
        if (debug.samples.length < 4) debug.samples.push({ matched: true, school_id: schoolId, raw: { rawName, slug }, sourceKey });
        continue;
      }

      // Fast upsert:
      // 1) try create
      // 2) if duplicate, filter+update
      try {
        await AthleticsMembership.create(rec);
        stats.created += 1;
      } catch (e) {
        const msg = String(e?.message || e);
        if (!looksLikeDuplicate(msg)) {
          stats.errors += 1;
          debug.errors.push({ step: "membership_create", message: msg, raw: { rawName, slug }, sourceKey });
        } else {
          try {
            const existing = await AthleticsMembership.filter({ source_key: sourceKey });
            if (Array.isArray(existing) && existing.length) {
              const id = getId(existing[0]);
              if (id) {
                await AthleticsMembership.update(id, rec);
                stats.updated += 1;
              } else {
                // fallback create if no id
                await AthleticsMembership.create(rec);
                stats.created += 1;
              }
            } else {
              // if filter returns nothing, attempt create again
              await AthleticsMembership.create(rec);
              stats.created += 1;
            }
          } catch (e2) {
            stats.errors += 1;
            debug.errors.push({
              step: "membership_update_on_dup",
              message: String(e2?.message || e2),
              raw: { rawName, slug },
              sourceKey,
            });
          }
        }
      }

      if (throttleMs > 0) await sleep(throttleMs);
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
