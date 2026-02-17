// functions/ncaaMembershipSync.ts
// Deno + Base44 backend function (JS-only style; no TS type annotations)
//
// PURPOSE (idempotent enrichment):
// - Fetch NCAA schools index (adapter) and enrich existing Scorecard School rows
// - Upsert AthleticsMembership by deterministic source_key = "ncaa:<school_id>:<season|current>"
// - Never creates School rows
// - Unmatched/ambiguous are written to UnmatchedAthleticsRow (if entity exists)
//
// NOTE:
// The NCAA schools-index endpoint returns only { slug, name, long } (no state/city).
// So matching is NAME-ONLY with strict rules:
// - Match only if normalized name maps to exactly 1 School row.
// - Otherwise: queue to UnmatchedAthleticsRow and skip.
//
// Request body:
// {
//   "dryRun": true,
//   "seasonYear": 2026,              // number or null
//   "maxRows": 0,                    // 0 = all
//   "confidenceThreshold": 0.92,     // 0..1 (used for name-only matches too)
//   "throttleMs": 80,                // delay between DB writes
//   "sourcePlatform": "ncaa-api"
// }
//
// Response: { ok, dryRun, stats, debug }

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
    .replace(/\buniv\b/g, "university")
    .replace(/\bst\.\b/g, "state") // "Adams St." → "adams state"
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
  };

  const stats = {
    fetched: 0,
    processed: 0,

    // Matching outcomes
    matched: 0,
    noMatch: 0,
    ambiguous: 0,

    // Upsert outcomes
    created: 0,
    updated: 0,
    skippedDryRun: 0,

    // Data quality
    missingName: 0,

    // Errors
    errors: 0,
  };

  try {
    if (req.method !== "POST") return jsonResp({ ok: false, error: "Method not allowed", stats, debug });

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const seasonYear = body?.seasonYear != null ? Number(body.seasonYear) : null;
    const maxRows = Number(body?.maxRows || 0);
    const threshold = Number(body?.confidenceThreshold || 0.92);
    const throttleMs = Number(body?.throttleMs || 80);
    const sourcePlatform = s(body?.sourcePlatform) || "ncaa-api";

    const client = createClientFromRequest(req);
    const School = client.entities.School || client.entities.Schools;
    const AthleticsMembership = client.entities.AthleticsMembership || client.entities.AthleticsMemberships;
    const Unmatched = client.entities.UnmatchedAthleticsRow || client.entities.UnmatchedAthleticsRows;

    if (!School) return jsonResp({ ok: false, error: "School entity not found", stats, debug });
    if (!AthleticsMembership) return jsonResp({ ok: false, error: "AthleticsMembership entity not found", stats, debug });

    // Build name-only index:
    // prefer School.normalized_name if present, otherwise derive from school_name/name
    const allSchools = await listAllSchools(School);
    const byNormName = new Map();

    for (const r of allSchools) {
      const nn = s(r?.normalized_name) || normName(r?.school_name || r?.name || "");
      if (!nn) continue;
      if (!byNormName.has(nn)) byNormName.set(nn, []);
      byNormName.get(nn).push(r);
    }

    debug.notes.push(`Indexed schools by normalized_name: keys=${byNormName.size} rows=${allSchools.length}`);

    // Fetch NCAA index
    const url = "https://ncaa-api.henrygd.me/schools-index";
    const payload = await fetchJsonWithRetry(url, debug, 6);
    const rows = extractSchoolRows(payload);
    stats.fetched = rows.length;

    const limit = maxRows > 0 ? Math.min(rows.length, maxRows) : rows.length;

    for (let i = 0; i < limit; i++) {
      const raw = rows[i];
      stats.processed += 1;

      const ncaaNameLong = s(raw?.long);
      const ncaaNameShort = s(raw?.name);
      const slug = s(raw?.slug);

      const rawName = ncaaNameLong || ncaaNameShort;
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
            const existing = await Unmatched.filter({ raw_source_key: rawKey });
            const rec = {
              org: "ncaa",
              raw_school_name: rawName,
              raw_city: null,
              raw_state: null,
              raw_source_key: rawKey,
              source_url: slug ? `https://www.ncaa.com/schools/${slug}` : null,
              reason: "no_match",
              attempted_match_notes: `name_only; normalized="${nkey}"`,
              created_at: new Date().toISOString(),
            };
            if (Array.isArray(existing) && existing.length) {
              const id = getId(existing[0]);
              if (id) await Unmatched.update(id, rec);
            } else {
              await Unmatched.create(rec);
            }
          } catch (e) {
            stats.errors += 1;
            debug.errors.push({ step: "unmatched_upsert", message: String(e?.message || e), raw: { rawName, slug } });
          }
        }

        continue;
      }

      if (candidates.length > 1) {
        stats.ambiguous += 1;

        if (Unmatched && !dryRun) {
          const rawKey = `ncaa:${nkey}:${slug || "no_slug"}`;
          try {
            const existing = await Unmatched.filter({ raw_source_key: rawKey });
            const rec = {
              org: "ncaa",
              raw_school_name: rawName,
              raw_city: null,
              raw_state: null,
              raw_source_key: rawKey,
              source_url: slug ? `https://www.ncaa.com/schools/${slug}` : null,
              reason: "ambiguous",
              attempted_match_notes: `name_only; candidates=${candidates.length}; normalized="${nkey}"`,
              created_at: new Date().toISOString(),
            };
            if (Array.isArray(existing) && existing.length) {
              const id = getId(existing[0]);
              if (id) await Unmatched.update(id, rec);
            } else {
              await Unmatched.create(rec);
            }
          } catch (e) {
            stats.errors += 1;
            debug.errors.push({ step: "unmatched_upsert_ambiguous", message: String(e?.message || e), raw: { rawName, slug } });
          }
        }

        continue;
      }

      // Single unique candidate: eligible for auto-match
      const school = candidates[0];
      const schoolId = getId(school);
      if (!schoolId) {
        stats.errors += 1;
        debug.errors.push({ step: "candidate_missing_id", raw: { rawName, slug } });
        continue;
      }

      const confidence = 0.95; // deterministic unique normalized-name match
      if (confidence < threshold) {
        // Future-proof: if you crank threshold above 0.95, this will protect against auto-writes.
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
        if (debug.samples.length < 10) debug.samples.push({ matched: true, school_id: schoolId, raw: { rawName, slug }, rec });
        continue;
      }

      try {
        const existing = await AthleticsMembership.filter({ source_key: sourceKey });
        if (Array.isArray(existing) && existing.length) {
          const id = getId(existing[0]);
          if (id) {
            await AthleticsMembership.update(id, rec);
            stats.updated += 1;
          } else {
            await AthleticsMembership.create(rec);
            stats.created += 1;
          }
        } else {
          await AthleticsMembership.create(rec);
          stats.created += 1;
        }

        await sleep(throttleMs);
      } catch (e) {
        stats.errors += 1;
        debug.errors.push({ step: "membership_upsert", message: String(e?.message || e), raw: { rawName, slug }, sourceKey });
      }
    }

    return jsonResp({ ok: true, dryRun: dryRun, stats, debug });
  } catch (e) {
    stats.errors += 1;
    debug.errors.push({ step: "fatal", message: String(e?.message || e) });
    return jsonResp({ ok: false, error: String(e?.message || e), stats, debug });
  }
});
