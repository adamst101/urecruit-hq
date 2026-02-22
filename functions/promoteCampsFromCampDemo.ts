// functions/promoteCampsFromCampDemo.ts
// Server-side promotion runner: CampDemo -> Camp (idempotent upsert by event_key)
//
// Supports:
// - Promote ALL via sportId="*"
// - Promote per sportId via sportId=<CampDemo.sport_id>
//
// Adds observability:
// - debug.errorSamples (up to 5)
// - debug.skippedSamples (up to 5)

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function asArray<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}
function safeStr(x: any): string {
  return x == null ? "" : String(x);
}
function lc(x: any): string {
  return safeStr(x).toLowerCase().trim();
}
function getId(x: any): string {
  if (!x) return "";
  if (typeof x === "string" || typeof x === "number") return String(x);
  return String(x?.id ?? x?._id ?? x?.uuid ?? "");
}

function isRetryableError(e: any): boolean {
  const msg = lc(e?.message || e);
  return (
    msg.includes("status code 502") ||
    msg.includes("status code 503") ||
    msg.includes("status code 504") ||
    msg.includes("status code 429") ||
    msg.includes("rate limit")
  );
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}

async function withRetry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  let last: any = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isRetryableError(e) || i === tries - 1) throw e;
      const backoff = Math.min(10_000, Math.floor(500 * Math.pow(2, i) + Math.random() * 200));
      await sleep(backoff);
    }
  }
  throw last;
}

function pickEntity(base44: any, name: string) {
  const e = base44?.entities;
  if (!e) return null;
  return e[name] || e[`${name}s`] || null;
}

type DemoRowIdentity = {
  campDemoId?: string;
  event_key?: string;
  source_key?: string;
  school_id?: string;
  sport_id?: string;
  start_date?: string;
  camp_name?: string;
  source_platform?: string;
  source_url?: string;
};

function identityFromDemoRow(r: any): DemoRowIdentity {
  return {
    campDemoId: safeStr(r?.id),
    event_key: safeStr(r?.event_key || r?.eventKey),
    source_key: safeStr(r?.source_key || r?.sourceKey),
    school_id: getId(r?.school_id || r?.schoolId || r?.school),
    sport_id: getId(r?.sport_id || r?.sportId || r?.sport),
    start_date: safeStr(r?.start_date || r?.startDate),
    camp_name: safeStr(r?.camp_name || r?.campName || r?.name),
    source_platform: safeStr(r?.source_platform || r?.sourcePlatform),
    source_url: safeStr(r?.source_url || r?.sourceUrl || r?.link_url || r?.linkUrl),
  };
}

function selectCampFieldsFromDemoRow(r: any, runIso: string) {
  // Required (minimum for Discover + detail pages)
  const event_key = safeStr(r?.event_key || r?.eventKey || r?.source_key || r?.sourceKey);
  const school_id = getId(r?.school_id || r?.schoolId || r?.school);
  const sport_id = getId(r?.sport_id || r?.sportId || r?.sport);
  const camp_name = safeStr(r?.camp_name || r?.campName || r?.name);
  const start_date = safeStr(r?.start_date || r?.startDate);

  if (!event_key || !school_id || !sport_id || !camp_name || !start_date) {
    return {
      ok: false as const,
      reason: "missing_required_fields",
      missing: {
        event_key: !event_key,
        school_id: !school_id,
        sport_id: !sport_id,
        camp_name: !camp_name,
        start_date: !start_date,
      },
    };
  }

  const source_key = safeStr(r?.source_key || r?.sourceKey) || event_key;

  const payload: any = {
    // identity
    event_key,
    source_key,

    // core
    school_id,
    sport_id,
    camp_name,
    start_date,
    end_date: r?.end_date ?? r?.endDate ?? null,

    // location
    city: r?.city ?? null,
    state: r?.state ?? null,

    // targeting
    position_ids: Array.isArray(r?.position_ids)
      ? r.position_ids
      : Array.isArray(r?.positionIds)
      ? r.positionIds
      : [],

    // pricing
    price: r?.price ?? null,
    price_min: r?.price_min ?? r?.priceMin ?? null,
    price_max: r?.price_max ?? r?.priceMax ?? null,

    // links + source
    link_url: r?.link_url ?? r?.linkUrl ?? null,
    source_url: r?.source_url ?? r?.sourceUrl ?? r?.link_url ?? r?.linkUrl ?? null,
    source_platform: r?.source_platform ?? r?.sourcePlatform ?? "seed",
    program_id: r?.program_id ?? r?.programId ?? null,

    // season + metadata
    season_year: r?.season_year ?? r?.seasonYear ?? null,
    notes: r?.notes ?? null,
    content_hash: r?.content_hash ?? r?.contentHash ?? null,
    last_seen_at: runIso,

    // raw parse retention (debug)
    event_dates_raw: r?.event_dates_raw ?? null,
    grades_raw: r?.grades_raw ?? null,
    register_by_raw: r?.register_by_raw ?? null,
    price_raw: r?.price_raw ?? null,
    sections_json: r?.sections_json ?? null,

    // lifecycle
    active: typeof r?.active === "boolean" ? r.active : true,
  };

  return { ok: true as const, payload };
}

async function fetchCampDemoRows(CampDemo: any, sportId: string) {
  // sportId="*" means no sport filter (promote everything)
  const sport = safeStr(sportId);

  if (sport === "*" || sport === "__ALL__" || sport === "ALL") {
    const rows = asArray<any>(await withRetry(() => CampDemo.filter({})));
    return { rows, matchedOn: { all: true } };
  }

  // CampDemo schema varies. Try common filters.
  const tries: any[] = [{ sport_id: sport }, { sportId: sport }, { sport: sport }];

  // Numeric cast attempt
  const n = Number(sport);
  if (Number.isFinite(n) && String(n) === sport) {
    tries.unshift({ sport_id: n }, { sportId: n }, { sport: n });
  }

  for (const q of tries) {
    try {
      const rows = asArray<any>(await withRetry(() => CampDemo.filter(q)));
      if (rows.length) return { rows, matchedOn: q };
    } catch {
      // keep trying
    }
  }

  return { rows: [], matchedOn: null };
}

function buildSchemaHint(sample: any[], matchedOn: any) {
  const keys = sample?.[0] ? Object.keys(sample[0]).slice(0, 80) : [];
  const sampleSportValues = asArray(sample).map((r: any) => ({
    sport_id: r?.sport_id,
    sportId: r?.sportId,
    sport: r?.sport,
  }));
  const distinct = Array.from(
    new Set(
      sampleSportValues
        .map((v) => safeStr(v.sport_id || v.sportId || v.sport).trim())
        .filter(Boolean)
    )
  ).slice(0, 30);

  return {
    note: "No CampDemo rows matched sport filter; sample keys from CampDemo.filter({})",
    matchedOn,
    sampleKeys: keys,
    sampleSportValues,
    distinctSportIdsSample: distinct,
  };
}

Deno.serve(async (req) => {
  const runIso = new Date().toISOString();

  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const sportId = safeStr(body?.sportId || body?.sport_id || "");
    const startAt = Math.max(0, Number(body?.startAt ?? 0));
    const batchSize = Math.max(1, Math.min(2000, Number(body?.batchSize ?? 600)));
    const throttleMs = Math.max(0, Number(body?.throttleMs ?? 8));
    const timeBudgetMs = Math.max(2000, Math.min(55_000, Number(body?.timeBudgetMs ?? 22_000)));
    const dryRun = !!body?.dryRun;

    const CampDemo = pickEntity(base44, "CampDemo");
    const Camp = pickEntity(base44, "Camp");

    if (!CampDemo?.filter) {
      return Response.json({ ok: false, error: "CampDemo entity not available or has no filter()." });
    }
    if (!Camp?.filter || !Camp?.create || !Camp?.update) {
      return Response.json({ ok: false, error: "Camp entity not available or missing filter/create/update." });
    }
    if (!sportId) {
      return Response.json({ ok: false, error: "sportId is required. Use sportId='*' to promote all." });
    }

    const started = Date.now();

    const fetched = await fetchCampDemoRows(CampDemo, sportId);
    const allRows = fetched.rows;

    let schemaHint: any = null;
    if (allRows.length === 0 && startAt === 0) {
      try {
        const sample = asArray<any>(await withRetry(() => CampDemo.filter({}))).slice(0, 5);
        schemaHint = buildSchemaHint(sample, fetched.matchedOn);
      } catch {
        schemaHint = { note: "No CampDemo rows matched sport filter; unable to sample CampDemo." };
      }
    }

    const total = allRows.length;
    const slice = allRows.slice(startAt, startAt + batchSize);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    const skippedSamples: any[] = [];
    const errorSamples: any[] = [];

    for (let i = 0; i < slice.length; i++) {
      if (Date.now() - started > timeBudgetMs) break;

      const r = slice[i];
      const ident = identityFromDemoRow(r);

      const built = selectCampFieldsFromDemoRow(r, runIso);
      if (!built.ok) {
        skipped += 1;
        if (skippedSamples.length < 5) {
          skippedSamples.push({
            ...ident,
            reason: built.reason,
            missing: built.missing,
          });
        }
        continue;
      }

      const payload = built.payload;

      try {
        const existing = asArray<any>(await withRetry(() => Camp.filter({ event_key: payload.event_key })));
        if (existing.length && existing[0]?.id) {
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
            ...ident,
            event_key_effective: safeStr(payload?.event_key),
            error: safeStr(e?.message || e),
          });
        }
      }

      if (throttleMs) await sleep(throttleMs);
    }

    const processed = created + updated + skipped + errors;
    const nextStartAt = startAt + processed;
    const done = nextStartAt >= total;

    return Response.json({
      ok: true,
      runIso,
      params: { sportId, startAt, batchSize, throttleMs, timeBudgetMs, dryRun },
      debug: {
        matchedOn: fetched.matchedOn,
        schemaHint,
        skippedSamples,
        errorSamples,
      },
      totals: { total, processed, created, updated, skipped, errors },
      next: { nextStartAt, done },
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});