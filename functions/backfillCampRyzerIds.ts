// functions/backfillCampRyzerIds.ts
//
// Extract numeric Ryzer camp id from Camp URL fields and store as camp.ryzer_camp_id
//
// Hardening:
// - Throttles writes to avoid Base44 rate limits
// - Retries on rate limit with exponential backoff
// - Supports cursor checkpointing via startAt (index into sorted list)
// - Idempotent: only writes when missing (unless onlyMissing=false)
//
// Payload:
// {
//   "seasonYear": 2026,
//   "dryRun": true,
//   "maxCamps": 500,
//   "onlyMissing": true,
//   "startAt": 0,
//   "sleepMs": 80,
//   "maxRetries": 5
// }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

function safeString(x: any): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
}

function extractRyzerNumericCampId(url: string | null): string | null {
  const s = safeString(url);
  if (!s) return null;
  try {
    const u = new URL(s);
    const id = u.searchParams.get("id");
    if (!id) return null;
    const t = id.trim();
    return t ? t : null;
  } catch {
    const m = s.match(/[?&]id=(\d+)/i);
    return m?.[1] ? String(m[1]) : null;
  }
}

function isRateLimitError(e: any) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("too many") || msg.includes("429");
}

async function updateWithRetry(Camp: any, campId: string, patch: any, maxRetries: number) {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await Camp.update(campId, patch);
      return { ok: true };
    } catch (e: any) {
      lastErr = e;
      if (!isRateLimitError(e) || attempt === maxRetries) break;
      // exponential backoff: 250ms, 500ms, 1000ms, 2000ms, 4000ms...
      await sleep(250 * Math.pow(2, attempt));
    }
  }
  return { ok: false, error: String(lastErr?.message || lastErr) };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    const dryRun = body?.dryRun !== false; // default true
    const maxCamps = Math.max(1, Number(body?.maxCamps ?? 500));
    const onlyMissing = body?.onlyMissing !== false; // default true
    const startAt = Math.max(0, Number(body?.startAt ?? 0));
    const sleepMs = Math.max(0, Number(body?.sleepMs ?? 80));
    const maxRetries = Math.max(0, Number(body?.maxRetries ?? 5));

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;
    if (!Camp || typeof Camp.filter !== "function" || typeof Camp.update !== "function") {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }

    const where: any = seasonYear ? { season_year: seasonYear } : {};
    // Sort stable so startAt works consistently
    const rows: any[] = await Camp.filter(where, "id", Math.min(10000, startAt + maxCamps));

    const slice = rows.slice(startAt, startAt + maxCamps);

    let scanned = 0;
    let found = 0;
    let wouldWrite = 0;
    let wrote = 0;
    let rateLimitRetries = 0;
    let errors = 0;

    const sample: any[] = [];
    let nextStartAt = startAt + slice.length;

    for (const c of slice) {
      scanned += 1;
      const campId = safeString(c?.id);
      if (!campId) continue;

      const existing = safeString(c?.ryzer_camp_id);
      if (onlyMissing && existing) continue;

      const urls = [
        safeString(c?.source_url),
        safeString(c?.link_url),
        safeString(c?.url),
        safeString(c?.registration_url),
        safeString(c?.registration_link),
      ].filter(Boolean) as string[];

      let rid: string | null = null;
      for (const u of urls) {
        rid = extractRyzerNumericCampId(u);
        if (rid) break;
      }

      if (!rid) continue;

      found += 1;
      wouldWrite += 1;

      if (!dryRun) {
        await sleep(sleepMs);

        const res = await updateWithRetry(Camp, campId, { ryzer_camp_id: rid }, maxRetries);
        if (res.ok) {
          wrote += 1;
        } else {
          errors += 1;
          if (String(res.error || "").toLowerCase().includes("rate limit")) rateLimitRetries += 1;
        }
      }

      if (sample.length < 10) sample.push({ campId, ryzer_camp_id: rid });
    }

    return Response.json({
      ok: true,
      stats: {
        seasonYear,
        startAt,
        nextStartAt,
        scanned,
        found,
        wouldWrite,
        wrote,
        dryRun,
        sleepMs,
        maxRetries,
        rateLimitRetries,
        errors,
        done: slice.length < maxCamps,
      },
      sample,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});