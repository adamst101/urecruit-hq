// functions/promoteCampsFromCampDemo.ts
// Server-side promotion runner: CampDemo → Camp (idempotent upsert by event_key)
//
// KEY CHANGE (backfill fix): carries ryzer_camp_id from CampDemo into Camp on every run.
//   - Prefers CampDemo.ryzer_camp_id (set by resolveRyzerIdsFromBrandedPages_CampDemo)
//   - Falls back to parsing id= param from link_url / source_url
//   - Existing Camp.ryzer_camp_id is never overwritten with blank (only with a real value)
//
// Supports:
//   sportId = "*"          → promote all sports
//   sportId = "<id>"       → promote single sport
//   seasonYear = 2026      → filter CampDemo by season_year (recommended; omit to promote all years)
//
// Paging (repeat until done: true):
//   First call:  { sportId: "*", seasonYear: 2026, startAt: 0, batchSize: 200, dryRun: true }
//   Next calls:  set startAt = next.nextStartAt from previous response
//
// Observability:
//   debug.skippedSamples  – up to 5 rows skipped (missing required fields)
//   debug.errorSamples    – up to 5 rows that threw during upsert
//   debug.ryzerIdSamples  – up to 10 rows showing ryzer_camp_id resolution path

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

// ─── helpers ────────────────────────────────────────────────────────────────

function asArray<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}
function safeStr(x: any): string {
  return x == null ? "" : String(x).trim();
}
function lc(x: any): string {
  return safeStr(x).toLowerCase();
}
function getId(x: any): string {
  if (!x) return "";
  if (typeof x === "string" || typeof x === "number") return String(x);
  return String(x?.id ?? x?._id ?? x?.uuid ?? "");
}
function isRetryableError(e: any): boolean {
  const msg = lc(e?.message || e);
  return (
    msg.includes("502") || msg.includes("503") || msg.includes("504") ||
    msg.includes("429") || msg.includes("rate limit")
  );
}
async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}
async function withRetry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  let last: any = null;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (!isRetryableError(e) || i === tries - 1) throw e;
      await sleep(Math.min(10_000, 500 * Math.pow(2, i) + Math.random() * 200));
    }
  }
  throw last;
}
function pickEntity(base44: any, name: string) {
  const e = base44?.entities;
  if (!e) return null;
  return e[name] || e[`${name}s`] || null;
}

// ─── ryzer id extraction ─────────────────────────────────────────────────────

/**
 * Pull numeric Ryzer camp id from a URL's id= query param.
 * Works for register.ryzer.com URLs and branded pages that include ?id=XXXXXX.
 * Returns "" when not found — never returns null/undefined.
 */
function extractRyzerNumericCampId(url: any): string {
  const s = safeStr(url);
  if (!s) return "";
  try {
    const id = new URL(s).searchParams.get("id");
    if (id?.trim()) return id.trim();
  } catch { /* ignore malformed URL */ }
  const m = s.match(/[?&]id=(\d{5,7})/i);
  return m?.[1] ? m[1].trim() : "";
}

/**
 * Resolve the best available ryzer_camp_id for a CampDemo row.
 * Priority: explicit field > link_url parse > source_url parse.
 */
function resolveRyzerId(r: any): { ryzerId: string; source: string } {
  const explicit = safeStr(r?.ryzer_camp_id || r?.ryzerCampId);
  if (explicit) return { ryzerId: explicit, source: "field" };

  const fromLink = extractRyzerNumericCampId(r?.link_url ?? r?.linkUrl);
  if (fromLink) return { ryzerId: fromLink, source: "link_url" };

  const fromSource = extractRyzerNumericCampId(r?.source_url ?? r?.sourceUrl);
  if (fromSource) return { ryzerId: fromSource, source: "source_url" };

  return { ryzerId: "", source: "none" };
}

// ─── row projection ──────────────────────────────────────────────────────────

type BuildResult =
  | { ok: true; payload: Record<string, any>; ryzerIdSource: string }
  | { ok: false; reason: string; missing: Record<string, boolean> };

function buildCampPayload(r: any, runIso: string): BuildResult {
  const event_key = safeStr(r?.event_key || r?.eventKey || r?.source_key || r?.sourceKey);
  const school_id = getId(r?.school_id || r?.schoolId || r?.school);
  const sport_id  = getId(r?.sport_id  || r?.sportId  || r?.sport);
  const camp_name = safeStr(r?.camp_name || r?.campName || r?.name);
  const start_date = safeStr(r?.start_date || r?.startDate);

  if (!event_key || !school_id || !sport_id || !camp_name || !start_date) {
    return {
      ok: false,
      reason: "missing_required_fields",
      missing: { event_key: !event_key, school_id: !school_id, sport_id: !sport_id, camp_name: !camp_name, start_date: !start_date },
    };
  }

  const source_key = safeStr(r?.source_key || r?.sourceKey) || event_key;

  const payload: Record<string, any> = {
    // identity
    event_key,
    source_key,
    // core
    school_id,
    sport_id,
    camp_name,
    start_date,
    end_date:   r?.end_date   ?? r?.endDate   ?? null,
    // location
    city:  r?.city  ?? null,
    state: r?.state ?? null,
    // targeting
    position_ids: Array.isArray(r?.position_ids) ? r.position_ids
                : Array.isArray(r?.positionIds)  ? r.positionIds
                : [],
    // pricing
    price:     r?.price     ?? null,
    price_min: r?.price_min ?? r?.priceMin ?? null,
    price_max: r?.price_max ?? r?.priceMax ?? null,
    // links + source
    link_url:        r?.link_url        ?? r?.linkUrl   ?? null,
    source_url:      r?.source_url      ?? r?.sourceUrl ?? r?.link_url ?? r?.linkUrl ?? null,
    source_platform: r?.source_platform ?? r?.sourcePlatform ?? "seed",
    program_id:      r?.program_id      ?? r?.programId ?? null,
    // season + metadata
    season_year:  r?.season_year  ?? r?.seasonYear  ?? null,
    notes:        r?.notes        ?? null,
    content_hash: r?.content_hash ?? r?.contentHash ?? null,
    last_seen_at: runIso,
    // raw parse fields (debug retention)
    event_dates_raw:  r?.event_dates_raw  ?? null,
    grades_raw:       r?.grades_raw       ?? null,
    register_by_raw:  r?.register_by_raw  ?? null,
    price_raw:        r?.price_raw        ?? null,
    sections_json:    r?.sections_json    ?? null,
    // lifecycle
    active: typeof r?.active === "boolean" ? r.active : true,
  };

  // ✅ Carry ryzer_camp_id: CampDemo.ryzer_camp_id (set by resolver) → Camp
  const { ryzerId, source: ryzerIdSource } = resolveRyzerId(r);
  if (ryzerId) payload.ryzer_camp_id = ryzerId;
  // If no id resolved, we intentionally omit the key so we never blank-out
  // an existing Camp.ryzer_camp_id that was set by a previous run.

  // ✅ Carry branded_url: the non-Ryzer landing page URL set by the branded-page resolver.
  // enrichLogoFromBrandedPage uses this to fetch the school logo from the real school site.
  const brandedUrl = safeStr(r?.branded_url || r?.brandedUrl);
  if (brandedUrl) payload.branded_url = brandedUrl;

  return { ok: true, payload, ryzerIdSource };
}

// ─── CampDemo fetching ───────────────────────────────────────────────────────

async function fetchCampDemoRows(CampDemo: any, sportId: string, seasonYear: number) {
  const sport = safeStr(sportId);
  const year = Number(seasonYear) || 0;

  const buildFilter = (sportFilter: any) =>
    year
      ? { ...sportFilter, season_year: year }
      : sportFilter;

  if (sport === "*" || sport === "__ALL__" || sport === "ALL") {
    const rows = asArray<any>(
      await withRetry(() => CampDemo.filter(year ? { season_year: year } : {}))
    );
    return { rows, matchedOn: { all: true, season_year: year || "all" } };
  }

  const candidates: any[] = [
    { sport_id: sport }, { sportId: sport }, { sport: sport },
  ];
  const n = Number(sport);
  if (Number.isFinite(n) && String(n) === sport) {
    candidates.unshift({ sport_id: n }, { sportId: n }, { sport: n });
  }

  for (const q of candidates) {
    try {
      const rows = asArray<any>(await withRetry(() => CampDemo.filter(buildFilter(q))));
      if (rows.length) return { rows, matchedOn: buildFilter(q) };
    } catch { /* try next shape */ }
  }

  return { rows: [], matchedOn: null };
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const runIso = new Date().toISOString();

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const sportId      = safeStr(body?.sportId || body?.sport_id || "");
    const seasonYear   = Number(body?.seasonYear || body?.season_year || 0);
    const startAt      = Math.max(0, Number(body?.startAt ?? 0));
    const batchSize    = Math.max(1, Math.min(2000, Number(body?.batchSize ?? 300)));
    const throttleMs   = Math.max(0, Number(body?.throttleMs ?? 8));
    const timeBudgetMs = Math.max(2000, Math.min(55_000, Number(body?.timeBudgetMs ?? 22_000)));
    const dryRun       = !!body?.dryRun;

    const CampDemo = pickEntity(base44, "CampDemo");
    const Camp     = pickEntity(base44, "Camp");

    if (!CampDemo?.filter)
      return Response.json({ ok: false, error: "CampDemo entity not available or missing filter()." });
    if (!Camp?.filter || !Camp?.create || !Camp?.update)
      return Response.json({ ok: false, error: "Camp entity missing filter/create/update." });
    if (!sportId)
      return Response.json({ ok: false, error: "sportId is required. Use sportId='*' to promote all." });

    const started = Date.now();

    const fetched = await fetchCampDemoRows(CampDemo, sportId, seasonYear);
    const allRows = fetched.rows;

    // Schema hint when nothing matched (helps diagnose filter mismatches)
    let schemaHint: any = null;
    if (allRows.length === 0 && startAt === 0) {
      try {
        const sample = asArray<any>(await withRetry(() => CampDemo.filter({}))).slice(0, 3);
        const sampleKeys = sample[0] ? Object.keys(sample[0]).slice(0, 60) : [];
        const sportValues = sample.map((r: any) => ({
          sport_id: r?.sport_id, sportId: r?.sportId, sport: r?.sport, season_year: r?.season_year,
        }));
        schemaHint = { note: "No rows matched; inspect sampleKeys and sportValues.", sampleKeys, sportValues, matchedOn: fetched.matchedOn };
      } catch {
        schemaHint = { note: "No rows matched and CampDemo.filter({}) also failed." };
      }
    }

    const total  = allRows.length;
    const slice  = allRows.slice(startAt, startAt + batchSize);

    let created = 0, updated = 0, skipped = 0, errors = 0;
    let ryzerIdResolved = 0;

    const skippedSamples:  any[] = [];
    const errorSamples:    any[] = [];
    const ryzerIdSamples:  any[] = [];

    for (let i = 0; i < slice.length; i++) {
      if (Date.now() - started > timeBudgetMs) break;

      const r = slice[i];
      const built = buildCampPayload(r, runIso);

      if (!built.ok) {
        skipped += 1;
        if (skippedSamples.length < 5) {
          skippedSamples.push({
            campDemoId: safeStr(r?.id),
            event_key: safeStr(r?.event_key),
            reason: built.reason,
            missing: built.missing,
          });
        }
        continue;
      }

      const { payload, ryzerIdSource } = built;
      if (payload.ryzer_camp_id) ryzerIdResolved += 1;

      // Collect sample of ryzer_camp_id resolution for observability
      if (ryzerIdSamples.length < 10) {
        ryzerIdSamples.push({
          campDemoId: safeStr(r?.id),
          event_key: payload.event_key,
          ryzer_camp_id: payload.ryzer_camp_id ?? null,
          ryzerIdSource,
        });
      }

      try {
        const existing = asArray<any>(
          await withRetry(() => Camp.filter({ event_key: payload.event_key }))
        );

        if (existing.length && existing[0]?.id) {
          // On update: if Camp already has ryzer_camp_id and we don't have one, don't clobber it
          const existingRyzerId = safeStr(existing[0]?.ryzer_camp_id);
          if (!payload.ryzer_camp_id && existingRyzerId) {
            delete payload.ryzer_camp_id; // leave existing value intact
          }
          if (!dryRun) await withRetry(() => Camp.update(String(existing[0].id), payload));
          updated += 1;
        } else {
          if (!dryRun) await withRetry(() => Camp.create(payload));
          created += 1;
        }
      } catch (e) {
        errors += 1;
        if (errorSamples.length < 5) {
          errorSamples.push({
            campDemoId: safeStr(r?.id),
            event_key: payload.event_key,
            error: safeStr((e as any)?.message || e),
          });
        }
      }

      if (throttleMs) await sleep(throttleMs);
    }

    const processed   = created + updated + skipped + errors;
    const nextStartAt = startAt + slice.length; // advance by slice length, not processed
    const done        = nextStartAt >= total;

    return Response.json({
      ok: true,
      runIso,
      dryRun,
      params: { sportId, seasonYear: seasonYear || "all", startAt, batchSize, throttleMs, timeBudgetMs },
      totals: { total, sliceSize: slice.length, processed, created, updated, skipped, errors, ryzerIdResolved },
      next: { nextStartAt, done },
      debug: {
        matchedOn: fetched.matchedOn,
        schemaHint,
        skippedSamples,
        errorSamples,
        ryzerIdSamples,
      },
    });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as any)?.message || e) });
  }
});