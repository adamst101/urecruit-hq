// functions/ingestSchoolAthleticLogos.ts
// Base44 server function (Deno.serve) to enrich ATHLETIC logos (update-only).
//
// Writes to School fields (create these if not present):
// - athletic_logo_url
// - athletic_logo_source
// - athletic_logo_updated_at
// - athletic_logo_confidence
//
// Request body:
// {
//   "dryRun": true,
//   "cursor": null,
//   "maxRows": 25,
//   "throttleMs": 350,
//   "timeBudgetMs": 20000,
//   "onlyMissing": true,
//   "force": false,
//   "minConfidence": 0.85
// }
//
// Notes:
// - Uses Wikidata -> P154 "logo image" (Commons file). Avoids Wikipedia pageimage photos.
// - Guardrails reject JPG/JPEG and low-confidence filenames unless force=true.
// - Batch-safe and idempotent (update-only).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

type Cursor = any;

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms || 0)));
}

function lc(x: any) {
  return String(x || "").toLowerCase().trim();
}

function extractRows(resp: any) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  const cands = [resp.data, resp.items, resp.records];
  for (const c of cands) if (Array.isArray(c)) return c;
  return [];
}

function extractCursor(resp: any): Cursor | null {
  if (!resp || Array.isArray(resp)) return null;
  return resp.next_cursor ?? resp.nextCursor ?? null;
}

function isRetryable(e: any) {
  const msg = lc(e?.message || e);
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("temporarily")
  );
}

async function fetchTextWithRetry(url: string, tries = 3, backoffMs = 700) {
  let lastErr: any = null;

  for (let i = 0; i < tries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "URecruitHQ-AthleticLogoBot/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      return await resp.text();
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (!isRetryable(e) || i === tries - 1) throw e;
      await sleep(backoffMs * Math.pow(2, i));
    }
  }

  throw lastErr;
}

async function fetchJsonWithRetry(url: string, tries = 3, backoffMs = 700) {
  const text = await fetchTextWithRetry(url, tries, backoffMs);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Bad JSON from ${url}`);
  }
}

/**
 * Wikidata search for entity id (Qxxx) by label
 */
async function wikidataSearchEntityId(label: string): Promise<string | null> {
  const q = encodeURIComponent(label);
  const url =
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&limit=5` +
    `&search=${q}&origin=*`;

  const json = await fetchJsonWithRetry(url, 3, 800);
  const results = json?.search;

  if (!Array.isArray(results) || results.length === 0) return null;

  const target = lc(label);

  // Prefer exact match, then substring match, then first result
  const best =
    results.find((r: any) => lc(r?.label) === target) ??
    results.find((r: any) => lc(r?.label).includes(target) || target.includes(lc(r?.label))) ??
    results[0];

  return best?.id || null;
}

/**
 * Get Wikidata P154 (logo image) file name from entity id
 */
async function wikidataGetP154FileName(qid: string): Promise<string | null> {
  const url =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=${encodeURIComponent(qid)}` +
    `&props=claims&origin=*`;

  const json = await fetchJsonWithRetry(url, 3, 800);
  const ent = json?.entities?.[qid];
  const claims = ent?.claims;

  const p154 = claims?.P154;
  if (!Array.isArray(p154) || p154.length === 0) return null;

  const dv = p154[0]?.mainsnak?.datavalue?.value;
  if (!dv) return null;

  return typeof dv === "string" ? dv : null; // e.g., "Some_logo.svg"
}

function commonsFilePath(fileName: string): string {
  const safe = encodeURIComponent(String(fileName).replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${safe}`;
}

function scoreCandidate(fileName: string): number {
  const n = lc(fileName);
  let score = 0.55;

  // Prefer vector
  if (n.endsWith(".svg")) score += 0.25;
  if (n.endsWith(".png") || n.endsWith(".webp")) score += 0.1;

  // Penalize likely photos
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) score -= 0.55;

  const hits = ["logo", "wordmark", "athletic", "athletics", "sports", "mark", "branding"].filter((k) =>
    n.includes(k)
  ).length;

  score += Math.min(0.25, hits * 0.06);

  return Math.max(0, Math.min(0.99, score));
}

async function getAthleticLogoFromWikidata(schoolName: string) {
  const qid = await wikidataSearchEntityId(schoolName);
  if (!qid) return null;

  const fileName = await wikidataGetP154FileName(qid);
  if (!fileName) return null;

  const confidence = scoreCandidate(fileName);
  const url = commonsFilePath(fileName);

  return { url, source: `wikidata:${qid}:P154`, confidence, fileName };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const debug: any = {
    version: "ingestSchoolAthleticLogos_2026-02-20_v2",
    notes: [],
    retries: 0,
  };
  const stats: any = {
    scanned: 0,
    eligible: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    sources: { wikidata: 0 },
    elapsedMs: 0,
  };
  const sample: any = { updated: [], errors: [] };

  const elapsed = () => Date.now() - t0;
  const outOfTime = (budgetMs: number) => elapsed() >= budgetMs;

  try {
    if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

    const body = await req.json().catch(() => ({}));

    const dryRun = !!body?.dryRun;
    const cursor = body?.cursor ?? null;
    const maxRows = Math.max(1, Number(body?.maxRows ?? 25));
    const throttleMs = Math.max(0, Number(body?.throttleMs ?? 350));
    const timeBudgetMs = Math.max(5000, Number(body?.timeBudgetMs ?? 20000));
    const onlyMissing = body?.onlyMissing !== false;
    const force = !!body?.force;
    const minConfidence = Math.max(0, Math.min(0.99, Number(body?.minConfidence ?? 0.85)));

    const base44 = createClientFromRequest(req);
    const School = (base44 as any)?.entities?.School ?? (base44 as any)?.entities?.Schools;

    if (!School || typeof School.list !== "function" || typeof School.update !== "function") {
      return json({ ok: false, error: "School entity not available" }, 500);
    }

    const listParams: any = { limit: maxRows };
    if (cursor) listParams.cursor = cursor;

    const resp = await School.list(listParams);
    const rows = extractRows(resp);
    const next_cursor = extractCursor(resp);
    const done = !next_cursor || rows.length === 0;

    stats.scanned = rows.length;

    for (const row of rows) {
      if (outOfTime(timeBudgetMs)) {
        debug.notes.push("stopped_early_time_budget");
        break;
      }

      const schoolId = row?.id ?? row?._id ?? row?.uuid;
      const schoolName = row?.name ?? row?.school_name ?? "";
      const existing = row?.athletic_logo_url ?? "";

      if (!schoolId || !schoolName) {
        stats.skipped++;
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      if (onlyMissing && existing && !force) {
        stats.skipped++;
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      stats.eligible++;

      let result: any = null;
      try {
        result = await getAthleticLogoFromWikidata(String(schoolName));
      } catch (e: any) {
        stats.errors++;
        if (sample.errors.length < 10) {
          sample.errors.push({ schoolId: String(schoolId), name: String(schoolName), error: String(e?.message || e) });
        }
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      if (!result?.url) {
        stats.skipped++;
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      const fn = lc(result.fileName || "");
      const confidence = Number(result.confidence ?? 0);

      // Guardrails: reject low-confidence unless forced
      if (!force && confidence < minConfidence) {
        stats.skipped++;
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      // Hard reject photos unless forced
      if (!force && (fn.endsWith(".jpg") || fn.endsWith(".jpeg"))) {
        stats.skipped++;
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      const updates: any = {
        athletic_logo_url: result.url,
        athletic_logo_source: result.source,
        athletic_logo_updated_at: new Date().toISOString(),
        athletic_logo_confidence: confidence,
      };

      if (dryRun) {
        stats.updated++;
        stats.sources.wikidata++;
        if (sample.updated.length < 10) {
          sample.updated.push({ schoolId: String(schoolId), name: String(schoolName), ...updates, dryRun: true });
        }
      } else {
        try {
          await School.update(String(schoolId), updates);
          stats.updated++;
          stats.sources.wikidata++;
          if (sample.updated.length < 10) {
            sample.updated.push({ schoolId: String(schoolId), name: String(schoolName), ...updates, dryRun: false });
          }
        } catch (e: any) {
          stats.errors++;
          if (sample.errors.length < 10) {
            sample.errors.push({
              schoolId: String(schoolId),
              name: String(schoolName),
              error: String(e?.message || e),
            });
          }
        }
      }

      if (throttleMs > 0) await sleep(throttleMs);
    }

    stats.elapsedMs = elapsed();

    return json({
      ok: true,
      dryRun,
      done,
      next_cursor,
      stats,
      sample,
      debug,
    });
  } catch (e: any) {
    stats.elapsedMs = elapsed();
    return json(
      {
        ok: false,
        error: String(e?.message || e),
        stats,
        sample,
        debug,
      },
      500
    );
  }
});