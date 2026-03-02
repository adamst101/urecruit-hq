// functions/resolveRyzerIdsFromBrandedPages.ts
//
// Fetch branded camp pages and extract Ryzer numeric camp id, then write camp.ryzer_camp_id.
//
// Payload:
// {
//   "seasonYear": 2026,
//   "dryRun": true,
//   "maxCamps": 120,
//   "startAt": 0,
//   "sleepMs": 300,
//   "maxRetries": 6,
//   "onlyMissing": true,
//   "debugContext": true
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

// Unescape common JS-escaped URLs: https:\/\/register.ryzer.com\/camp.cfm?id=123
function unescapeJsSlashes(s: string) {
  return String(s || "").replace(/\\\//g, "/");
}

// ✅ Hardened extractor: links + iframe/src + form/action + data-* attrs + JS strings
function extractRyzerNumericIdFromText(html: string): { rid: string | null; context: string | null } {
  const raw = String(html || "");
  const h = unescapeJsSlashes(raw);

  const patterns: Array<{ name: string; re: RegExp }> = [
    // 1) Full register.ryzer.com link
    { name: "registerLink", re: /https?:\/\/register\.ryzer\.com\/camp\.cfm[^"' ]*?[?&]id=(\d+)/i },

    // 2) Any camp.cfm link with id=digits (including relative)
    { name: "campLink", re: /camp\.cfm[^"' ]*?[?&]id=(\d+)/i },

    // 3) iframe src="...id=123..."
    { name: "iframeSrc", re: /<iframe[^>]+src=["'][^"']*?(?:register\.ryzer\.com\/)?camp\.cfm[^"']*?[?&]id=(\d+)/i },

    // 4) form action="...id=123..."
    { name: "formAction", re: /<form[^>]+action=["'][^"']*?(?:register\.ryzer\.com\/)?camp\.cfm[^"']*?[?&]id=(\d+)/i },

    // 5) hidden input name="id" value="123456"
    { name: "inputId", re: /<input[^>]+name=["']id["'][^>]+value=["'](\d{5,7})["']/i },

    // 6) data-url / data-href containing register link
    { name: "dataUrl", re: /data-(?:url|href)=["'][^"']*?(?:register\.ryzer\.com\/)?camp\.cfm[^"']*?[?&]id=(\d+)/i },

    // 7) JS variable campId / campid / id (last resort)
    { name: "jsCampId", re: /\bcamp\s*id\b\s*[:=]\s*["']?(\d{5,7})["']?/i },
    { name: "jsCampid", re: /\bcampid\b\s*[:=]\s*["']?(\d{5,7})["']?/i },
    { name: "jsId", re: /\bid\b\s*[:=]\s*["']?(\d{5,7})["']?/i },
  ];

  for (const p of patterns) {
    const m = h.match(p.re);
    if (m?.[1]) {
      const rid = String(m[1]);
      // return a small context snippet around the match to debug future misses
      const idx = m.index ?? h.indexOf(m[0]);
      const start = Math.max(0, idx - 120);
      const end = Math.min(h.length, idx + 220);
      const context = h.slice(start, end);
      return { rid, context: `[${p.name}] ${context}` };
    }
  }

  // If no id found, still return a "ryzer" context snippet if present
  const ryzerIdx = h.toLowerCase().indexOf("ryzer");
  if (ryzerIdx >= 0) {
    const start = Math.max(0, ryzerIdx - 120);
    const end = Math.min(h.length, ryzerIdx + 220);
    return { rid: null, context: `[ryzerContext] ${h.slice(start, end)}` };
  }

  return { rid: null, context: null };
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
    const sleepMs = Math.max(0, Number(body?.sleepMs ?? 300));
    const maxRetries = Math.max(0, Number(body?.maxRetries ?? 6));
    const onlyMissing = body?.onlyMissing !== false; // default true
    const debugContext = body?.debugContext !== false; // default true

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
    const htmlCache = new Map<string, { status: number; rid: string | null; ctx: string | null }>();

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
      let ctx: string | null = null;
      let status = 0;

      if (cached) {
        status = cached.status;
        rid = cached.rid;
        ctx = cached.ctx;
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

        const ex = status === 200 ? extractRyzerNumericIdFromText(res.html) : { rid: null, context: null };
        rid = ex.rid;
        ctx = ex.context;

        htmlCache.set(src, { status, rid, ctx });
      }

      if (rid) stats.extracted += 1;

      if (rid && !dryRun) {
        const ures = await updateWithRetry(Camp, campId, { ryzer_camp_id: rid }, maxRetries);
        if (ures.ok) stats.wrote += 1;
        else stats.errors += 1;
      }

      if (sample.length < 10) {
        const row: any = { campId, src, pageStatus: status, extractedRid: rid };
        if (debugContext) row.context = ctx;
        sample.push(row);
      }
    }

    stats.elapsedMs = Date.now() - t0;
    return Response.json({ ok: true, stats, sample });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});