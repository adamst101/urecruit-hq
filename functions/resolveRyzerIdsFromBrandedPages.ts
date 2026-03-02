// functions/resolveRyzerIdsFromBrandedPages.ts
//
// For each Camp with source_url/link_url on a branded domain, fetch HTML and extract
// register.ryzer.com/camp.cfm?...id=#### (or id=#### anywhere), then write camp.ryzer_camp_id.
//
// Payload:
// {
//   "seasonYear": 2026,
//   "dryRun": true,
//   "maxCamps": 120,
//   "startAt": 0,
//   "sleepMs": 250,
//   "maxRetries": 6,
//   "onlyMissing": true
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

function normalizeUrl(u: string | null): string | null {
  const s = safeString(u);
  if (!s) return null;
  return s.replace(/#.*$/, "").trim();
}

function isRateLimitError(e: any) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("too many") || msg.includes("429");
}

async function fetchHtmlWithRetry(url: string, maxRetries: number) {
  let lastErr: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const rr = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
          Accept: "text/html,*/*",
        },
      });
      const status = rr.status;
      const html = await rr.text().catch(() => "");
      return { ok: true, status, html };
    } catch (e: any) {
      lastErr = e;
      if (attempt === maxRetries) break;
      await sleep(250 * Math.pow(2, attempt));
    }
  }

  return { ok: false, status: 0, html: "", error: String(lastErr?.message || lastErr) };
}

function extractRyzerNumericIdFromText(html: string): string | null {
  const h = String(html || "");

  // 1) Strong signal: register.ryzer.com link with id=digits
  const m1 = h.match(/https?:\/\/register\.ryzer\.com\/camp\.cfm[^"' ]*?[?&]id=(\d+)/i);
  if (m1?.[1]) return String(m1[1]);

  // 2) Any id=digits in context of camp.cfm
  const m2 = h.match(/camp\.cfm[^"' ]*?[?&]id=(\d+)/i);
  if (m2?.[1]) return String(m2[1]);

  // 3) Sometimes embedded as "id: 123456" etc
  const m3 = h.match(/["']id["']\s*:\s*["']?(\d{5,7})["']?/i);
  if (m3?.[1]) return String(m3[1]);

  return null;
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
      await sleep(250 * Math.pow(2, attempt));
    }
  }
  return { ok: false, error: String(lastErr?.message || lastErr) };
}

Deno.serve(async (req) => {
  const t0 = Date.now();

  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    const dryRun = body?.dryRun !== false; // default true
    const maxCamps = Math.max(1, Number(body?.maxCamps ?? 120));
    const startAt = Math.max(0, Number(body?.startAt ?? 0));
    const sleepMs = Math.max(0, Number(body?.sleepMs ?? 250));
    const maxRetries = Math.max(0, Number(body?.maxRetries ?? 6));
    const onlyMissing = body?.onlyMissing !== false; // default true

    if (!seasonYear) return Response.json({ ok: false, error: "seasonYear required" });

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;

    if (!Camp || typeof Camp.filter !== "function" || typeof Camp.update !== "function") {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }

    const rows: any[] = await Camp.filter({ season_year: seasonYear }, "id", Math.min(10000, startAt + maxCamps));
    const slice = (rows || []).slice(startAt, startAt + maxCamps);
    const nextStartAt = startAt + slice.length;

    const stats: any = {
      seasonYear,
      startAt,
      nextStartAt,
      scanned: slice.length,
      eligible: 0,
      fetched: 0,
      html200: 0,
      extracted: 0,
      wrote: 0,
      errors: 0,
      dryRun,
      elapsedMs: 0,
      done: slice.length < maxCamps,
    };

    const sample: any[] = [];

    // Cache by branded URL so duplicates don't refetch
    const htmlCache = new Map<string, { status: number; rid: string | null }>();

    for (const c of slice) {
      const campId = safeString(c?.id);
      if (!campId) continue;

      const existing = safeString(c?.ryzer_camp_id);
      if (onlyMissing && existing) continue;

      const src = normalizeUrl(safeString(c?.source_url)) || normalizeUrl(safeString(c?.link_url));
      if (!src) continue;

      stats.eligible += 1;

      let cached = htmlCache.get(src) || null;
      let rid: string | null = null;
      let status = 0;

      if (cached) {
        status = cached.status;
        rid = cached.rid;
      } else {
        await sleep(sleepMs);

        const res = await fetchHtmlWithRetry(src, maxRetries);
        if (!res.ok) {
          stats.errors += 1;
          if (sample.length < 10) sample.push({ campId, src, error: res.error });
          continue;
        }

        stats.fetched += 1;
        status = res.status;
        if (status === 200) stats.html200 += 1;

        rid = status === 200 ? extractRyzerNumericIdFromText(res.html) : null;
        htmlCache.set(src, { status, rid });
      }

      if (rid) stats.extracted += 1;

      if (rid && !dryRun) {
        const ures = await updateWithRetry(Camp, campId, { ryzer_camp_id: rid }, maxRetries);
        if (ures.ok) stats.wrote += 1;
        else stats.errors += 1;
      }

      if (sample.length < 10) {
        sample.push({
          campId,
          src,
          pageStatus: status,
          extractedRid: rid,
        });
      }
    }

    stats.elapsedMs = Date.now() - t0;
    return Response.json({ ok: true, stats, sample });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});