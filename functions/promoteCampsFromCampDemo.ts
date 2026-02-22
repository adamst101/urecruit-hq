// functions/promoteCampsFromCampDemo.ts
// Server-side promotion runner: CampDemo -> Camp (idempotent upsert by event_key)
// Use in AdminOps to promote all sports safely in batches.

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

function selectCampFieldsFromDemoRow(r: any, runIso: string) {
  // Keep this list conservative: only fields we know are used across UI + scoring.
  // If Camp has additional required fields in your schema, add them here.
  const event_key = safeStr(r?.event_key);
  const school_id = safeStr(r?.school_id);
  const sport_id = safeStr(r?.sport_id);
  const camp_name = safeStr(r?.camp_name || r?.name);
  const start_date = safeStr(r?.start_date);

  if (!event_key || !school_id || !sport_id || !camp_name || !start_date) {
    return { ok: false, error: "Missing required fields for Camp (event_key, school_id, sport_id, camp_name, start_date)." };
  }

  const source_key = safeStr(r?.source_key) || event_key;

  const payload: any = {
    // identity
    event_key,
    source_key,

    // core
    school_id,
    sport_id,
    camp_name,
    start_date,
    end_date: r?.end_date ?? null,

    // location
    city: r?.city ?? null,
    state: r?.state ?? null,

    // targeting
    position_ids: Array.isArray(r?.position_ids) ? r.position_ids : [],

    // pricing
    price: r?.price ?? null,
    price_min: r?.price_min ?? null,
    price_max: r?.price_max ?? null,

    // links + source
    link_url: r?.link_url ?? null,
    source_url: r?.source_url ?? r?.link_url ?? null,
    source_platform: r?.source_platform ?? "seed",
    program_id: r?.program_id ?? null,

    // season + metadata
    season_year: r?.season_year ?? null,
    notes: r?.notes ?? null,
    content_hash: r?.content_hash ?? null,
    last_seen_at: runIso,

    // raw parse retention (helps debugging)
    event_dates_raw: r?.event_dates_raw ?? null,
    grades_raw: r?.grades_raw ?? null,
    register_by_raw: r?.register_by_raw ?? null,
    price_raw: r?.price_raw ?? null,
    sections_json: r?.sections_json ?? null,

    // lifecycle
    active: typeof r?.active === "boolean" ? r.active : true,
  };

  return { ok: true, payload };
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
      return Response.json({ ok: false, error: "sportId is required (run per-sport to avoid giant scans)." });
    }

    const started = Date.now();

    // NOTE: Base44 SDK filter likely returns all matches. We slice for batching.
    // If your dataset becomes huge, replace this with a server-side cursor/limit API if Base44 supports it.
    const allRows = asArray<any>(await withRetry(() => CampDemo.filter({ sport_id: sportId })));

    const total = allRows.length;
    const slice = allRows.slice(startAt, startAt + batchSize);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < slice.length; i++) {
      if (Date.now() - started > timeBudgetMs) break;

      const r = slice[i];
      const built = selectCampFieldsFromDemoRow(r, runIso);
      if (!built.ok) {
        skipped += 1;
        continue;
      }

      const payload = built.payload;

      try {
        const existing = asArray<any>(await withRetry(() => Camp.filter({ event_key: payload.event_key })));
        if (existing.length && existing[0]?.id) {
          if (!dryRun) {
            await withRetry(() => Camp.update(String(existing[0].id), payload));
          }
          updated += 1;
        } else {
          if (!dryRun) {
            await withRetry(() => Camp.create(payload));
          }
          created += 1;
        }
      } catch (e) {
        errors += 1;
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
      totals: { total, processed, created, updated, skipped, errors },
      next: { nextStartAt, done },
    });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});