// functions/ncaaMembershipSync.ts
// Deno + Base44 backend function (JS-only style; no TS type annotations)
// PURPOSE (idempotent enrichment):
// - Fetch NCAA schools index (adapter) and enrich existing Scorecard School rows
// - Upsert AthleticsMembership by deterministic source_key = "ncaa:<school_id>:<season|current>"
// - Never creates School rows
// - Unmatched/ambiguous are written to UnmatchedAthleticsRow (if entity exists)
//
// Request body:
// {
//   "dryRun": true,
//   "seasonYear": 2026,              // number or null
//   "maxRows": 0,                    // 0 = all
//   "confidenceThreshold": 0.92,     // 0..1
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
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STATE_TO_ABBR = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

function normState(x) {
  const raw = s(x);
  if (!raw) return "";
  const t = raw.trim();
  if (t.length === 2) return t.toUpperCase();
  const a = STATE_TO_ABBR[lc(t)];
  return a || t;
}

function normCity(x) {
  return lc(x)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keyNameStateCity(name, state, city) {
  const n = normName(name);
  const st = normState(state);
  const c = normCity(city);
  if (!n || !st) return "";
  return `${n}::${st}::${c || ""}`;
}

function keyNameState(name, state) {
  const n = normName(name);
  const st = normState(state);
  if (!n || !st) return "";
  return `${n}::${st}`;
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

  const out = [];
  if (typeof payload === "object") {
    for (const v of Object.values(payload)) {
      if (Array.isArray(v)) out.push(...v);
      else if (v && typeof v === "object") {
        for (const vv of Object.values(v)) {
          if (Array.isArray(vv)) out.push(...vv);
        }
      }
    }
  }
  return out;
}

function inferDivision(raw) {
  const d = lc(raw?.division || raw?.div || raw?.divisionName || raw?.ncaaDivision);
  if (!d) return null;
  if (d.includes("d1") || d.includes("division i") || d === "i") return "I";
  if (d.includes("d2") || d.includes("division ii") || d === "ii") return "II";
  if (d.includes("d3") || d.includes("division iii") || d === "iii") return "III";
  return s(raw?.division || raw?.div || raw?.divisionName || raw?.ncaaDivision);
}

function inferSubdivision(raw) {
  const sub = lc(raw?.subdivision || raw?.sub || raw?.divisionSeo || raw?.classification);
  if (!sub) return null;
  if (sub.includes("fbs")) return "FBS";
  if (sub.includes("fcs")) return "FCS";
  return s(raw?.subdivision || raw?.sub || raw?.divisionSeo || raw?.classification);
}

function inferConference(raw) {
  return s(raw?.conference || raw?.conferenceName || raw?.conf || raw?.conference_short);
}

function bestMatchCandidate(cands, rawName, rawState, rawCity) {
  if (!cands || !cands.length) return { school: null, confidence: 0, reason: "no_match" };
  if (cands.length === 1) return { school: cands[0], confidence: 0.99, reason: "exact_key" };

  const city = normCity(rawCity);
  if (city) {
    const withCity = cands.filter((r) => normCity(r?.city) === city);
    if (withCity.length === 1) return { school: withCity[0], confidence: 0.97, reason: "city_tiebreak" };
    if (withCity.length > 1) cands = withCity;
  }

  const raw = normName(rawName);
  const scored = cands
    .map((r) => {
      const n = normName(r?.school_name || r?.name);
      const overlap = n && raw ? (n === raw ? 1 : n.includes(raw) || raw.includes(n) ? 0.85 : 0.6) : 0.5;
      const st = normState(r?.state) === normState(rawState) ? 1 : 0.7;
      return { r, score: overlap * st };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  if (!top) return { school: null, confidence: 0, reason: "no_match" };
  if (second && Math.abs(top.score - second.score) < 0.08) return { school: null, confidence: 0.5, reason: "ambiguous" };
  return { school: top.r, confidence: Math.min(0.95, Math.max(0.7, top.score)), reason: "heuristic" };
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
  };

  const stats = {
    fetched: 0,
    processed: 0,
    matched: 0,
    created: 0,
    updated: 0,
    skippedDryRun: 0,
    unmatched: 0,
    ambiguous: 0,
    missingFields: 0,
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

    const allSchools = await listAllSchools(School);
    const byNameState = new Map();
    const byNameStateCity = new Map();

    for (const r of allSchools) {
      const name = s(r?.school_name || r?.name);
      const st = s(r?.state);
      if (!name || !st) continue;
      const city = s(r?.city) || "";

      const k1 = keyNameState(name, st);
      if (k1) {
        if (!byNameState.has(k1)) byNameState.set(k1, []);
        byNameState.get(k1).push(r);
      }

      const k2 = keyNameStateCity(name, st, city);
      if (k2) {
        if (!byNameStateCity.has(k2)) byNameStateCity.set(k2, []);
        byNameStateCity.get(k2).push(r);
      }
    }

    const url = "https://ncaa-api.henrygd.me/schools-index";
    const payload = await fetchJsonWithRetry(url, debug, 6);
    const rows = extractSchoolRows(payload);
    stats.fetched = rows.length;

    const limit = maxRows > 0 ? Math.min(rows.length, maxRows) : rows.length;

    for (let i = 0; i < limit; i++) {
      const raw = rows[i];
      stats.processed += 1;

      const rawName = s(raw?.name || raw?.school || raw?.title || raw?.schoolName || raw?.school_name);
      const rawCity = s(raw?.city || raw?.schoolCity || raw?.school_city) || "";
      const rawState = s(raw?.state || raw?.schoolState || raw?.school_state);
      const sourceUrl = s(raw?.url || raw?.href || raw?.schoolUrl || raw?.school_url);

      if (!rawName || !rawState) {
        stats.missingFields += 1;
        continue;
      }

      const kExact = keyNameStateCity(rawName, rawState, rawCity);
      const c1 = kExact ? (byNameStateCity.get(kExact) || []) : [];
      let match = bestMatchCandidate(c1, rawName, rawState, rawCity);

      if (!match.school) {
        const kLoose = keyNameState(rawName, rawState);
        const c2 = kLoose ? (byNameState.get(kLoose) || []) : [];
        match = bestMatchCandidate(c2, rawName, rawState, rawCity);
      }

      if (!match.school || match.confidence < threshold) {
        const reason = !match.school ? (match.reason === "ambiguous" ? "ambiguous" : "no_match") : "ambiguous";
        if (reason === "ambiguous") stats.ambiguous += 1;
        else stats.unmatched += 1;

        if (Unmatched && !dryRun) {
          const rawKey = `ncaa:${normName(rawName)}:${normState(rawState)}:${normCity(rawCity)}`;
          try {
            const existing = await Unmatched.filter({ raw_source_key: rawKey });
            const rec = {
              org: "ncaa",
              raw_school_name: rawName,
              raw_city: rawCity || null,
              raw_state: normState(rawState) || rawState,
              raw_source_key: rawKey,
              source_url: sourceUrl,
              reason: reason,
              attempted_match_notes: `confidence=${match.confidence.toFixed(2)} threshold=${threshold}`,
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
            debug.errors.push({ step: "unmatched_upsert", message: String(e?.message || e), raw: { rawName, rawState, rawCity } });
          }
        }

        continue;
      }

      const schoolId = getId(match.school);
      if (!schoolId) {
        stats.errors += 1;
        continue;
      }
      stats.matched += 1;

      const division = inferDivision(raw);
      const subdivision = inferSubdivision(raw);
      const conference = inferConference(raw);

      const sourceKey = `ncaa:${schoolId}:${seasonYear || "current"}`;
      const rec = {
        school_id: schoolId,
        org: "ncaa",
        member: true,
        division: division,
        subdivision: subdivision,
        conference: conference,
        season_year: seasonYear,
        source_platform: sourcePlatform,
        source_url: sourceUrl,
        source_key: sourceKey,
        confidence: Math.min(1, Math.max(0, match.confidence)),
        last_verified_at: new Date().toISOString(),
      };

      if (dryRun) {
        stats.skippedDryRun += 1;
        if (debug.samples.length < 10) debug.samples.push({ matched: true, school_id: schoolId, raw: { rawName, rawCity, rawState }, rec });
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
        debug.errors.push({ step: "membership_upsert", message: String(e?.message || e), raw: { rawName, rawCity, rawState }, sourceKey });
      }
    }

    return jsonResp({ ok: true, dryRun: dryRun, stats, debug });
  } catch (e) {
    debug.errors.push({ step: "fatal", message: String(e?.message || e) });
    return jsonResp({ ok: false, error: String(e?.message || e), stats, debug });
  }
});
