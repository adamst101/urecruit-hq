// functions/resolveRyzerIdsFromBrandedPages.ts
//
// Fetch branded camp pages and extract Ryzer numeric camp id, then write Camp.ryzer_camp_id.
//
// Extraction strategy:
// 1) Search branded HTML for register.ryzer.com/camp.cfm?id=#### or camp.cfm?...id=####
// 2) If missing, find ANY register.ryzer.com URL in HTML (even JS-escaped), fetch it, then extract id from:
//    - final response.url (after redirects), OR
//    - fetched HTML body
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

async function updateWithRetry(Camp: any, campId: string, patch: any, maxRetries: number) {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await Camp.update(campId, patch);
      return { ok: true, res };
    } catch (e: any) {
      lastErr = e;
      if (!isRateLimitError(e) || attempt === maxRetries) break;
      await sleep(250 * Math.pow(2, attempt));
    }
  }
  return { ok: false, error: String(lastErr?.message || lastErr) };
}

async function fetchTextWithRetry(url: string, maxRetries: number) {
  let lastErr: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const rr = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
          Accept: "text/html,*/*",
        },
      });
      const status = rr.status;
      const finalUrl = rr.url || url;
      const html = await rr.text().catch(() => "");
      return { ok: true, status, finalUrl, html };
    } catch (e: any) {
      lastErr = e;
      if (attempt === maxRetries) break;
      await sleep(250 * Math.pow(2, attempt));
    }
  }

  return { ok: false, status: 0, finalUrl: url, html: "", error: String(lastErr?.message || lastErr) };
}

// Unescape common JS-escaped URLs: https:\/\/register.ryzer.com\/...
function unescapeJsSlashes(s: string) {
  return String(s || "").replace(/\\\//g, "/");
}

// Sometimes you see "https:/" in HTML snippets. Normalize to https://
function normalizeProtocolSlashes(s: string) {
  return String(s || "")
    .replace(/https:\//g, "https://")
    .replace(/http:\//g, "http://");
}

function extractIdFromUrl(u: string | null): string | null {
  const s = safeString(u);
  if (!s) return null;
  try {
    const url = new URL(s);
    const id = url.searchParams.get("id");
    if (id && id.trim()) return id.trim();
  } catch {}
  const m = s.match(/[?&]id=(\d{5,7})/i);
  return m?.[1] ? String(m[1]) : null;
}

// Return rid + a context snippet for debugging
function extractRyzerIdFromHtml(html: string): { rid: string | null; ctx: string | null; registerUrl: string | null } {
  const raw = String(html || "");
  const h = normalizeProtocolSlashes(unescapeJsSlashes(raw));

  const patterns: Array<{ name: string; re: RegExp }> = [
    { name: "registerLink", re: /https?:\/\/register\.ryzer\.com\/camp\.cfm[^"' ]*?[?&]id=(\d{5,7})/i },
    { name: "campLink", re: /camp\.cfm[^"' ]*?[?&]id=(\d{5,7})/i },
    { name: "iframeSrc", re: /<iframe[^>]+src=["'][^"']*?(?:register\.ryzer\.com\/)?camp\.cfm[^"']*?[?&]id=(\d{5,7})/i },
    { name: "formAction", re: /<form[^>]+action=["'][^"']*?(?:register\.ryzer\.com\/)?camp\.cfm[^"']*?[?&]id=(\d{5,7})/i },
    { name: "inputId", re: /<input[^>]+name=["']id["'][^>]+value=["'](\d{5,7})["']/i },
    { name: "dataUrl", re: /data-(?:url|href)=["'][^"']*?(?:register\.ryzer\.com\/)?camp\.cfm[^"']*?[?&]id=(\d{5,7})/i },
    { name: "jsCampid", re: /\bcampid\b\s*[:=]\s*["']?(\d{5,7})["']?/i },
    { name: "jsCampId", re: /\bcamp\s*id\b\s*[:=]\s*["']?(\d{5,7})["']?/i },
  ];

  for (const p of patterns) {
    const m = h.match(p.re);
    if (m?.[1]) {
      const rid = String(m[1]);
      const idx = m.index ?? h.indexOf(m[0]);
      const start = Math.max(0, idx - 140);
      const end = Math.min(h.length, idx + 260);
      return { rid, ctx: `[${p.name}] ${h.slice(start, end)}`, registerUrl: null };
    }
  }

  // Second-pass: find ANY register.ryzer.com URL (even if it doesn't include id in the visible snippet)
  const reg = h.match(/https?:\/\/register\.ryzer\.com\/[^"' ]+/i);
  const registerUrl = reg?.[0] ? reg[0] : null;

  // Provide some context around "register.ryzer.com" or "ryzer"
  const needle = registerUrl ? "register.ryzer.com" : "ryzer";
  const pos = h.toLowerCase().indexOf(needle);
  const ctx =
    pos >= 0 ? `[context] ${h.slice(Math.max(0, pos - 140), Math.min(h.length, pos + 260))}` : null;

  return { rid: null, ctx, registerUrl };
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
      followedRegisterUrl: 0,
      extractedViaFollow: 0,
      dryRun,
      elapsedMs: 0,
      done: slice.length < maxCamps,
    };

    const sample: any[] = [];

    // Cache by branded URL so duplicates don’t refetch
    const cache = new Map<string, { status: number; rid: string | null; ctx: string | null }>();

    for (const c of slice) {
      const campId = safeString(c?.id);
      if (!campId) continue;

      const existing = safeString(c?.ryzer_camp_id);
      if (onlyMissing && existing) continue;

      const src = normalizeUrl(safeString(c?.source_url)) || normalizeUrl(safeString(c?.link_url));
      if (!src) continue;

      stats.eligible += 1;

      let cached = cache.get(src) || null;
      let status = 0;
      let rid: string | null = null;
      let ctx: string | null = null;
      let registerUrl: string | null = null;
      let finalFollowUrl: string | null = null;

      if (cached) {
        status = cached.status;
        rid = cached.rid;
        ctx = cached.ctx;
      } else {
        await sleep(sleepMs);

        const res = await fetchTextWithRetry(src, maxRetries);
        if (!res.ok) {
          stats.errors += 1;
          if (sample.length < 10) sample.push({ campId, src, error: res.error });
          continue;
        }

        stats.fetched += 1;
        status = res.status;
        if (status === 200) stats.html200 += 1;

        const ex1 = status === 200 ? extractRyzerIdFromHtml(res.html) : { rid: null, ctx: null, registerUrl: null };
        rid = ex1.rid;
        ctx = ex1.ctx;
        registerUrl = ex1.registerUrl;

        // ✅ Second pass: follow registerUrl if present and rid still missing
        if (!rid && registerUrl) {
          stats.followedRegisterUrl += 1;
          await sleep(Math.min(500, sleepMs)); // small extra delay

          const rr = await fetchTextWithRetry(registerUrl, maxRetries);
          if (rr.ok && rr.status >= 200 && rr.status < 400) {
            finalFollowUrl = rr.finalUrl;
            rid = extractIdFromUrl(rr.finalUrl) || extractRyzerIdFromHtml(rr.html).rid;
            if (rid) stats.extractedViaFollow += 1;
          }
        }

        cache.set(src, { status, rid, ctx });
      }

      if (rid) stats.extracted += 1;

      if (rid && !dryRun) {
        const ures = await updateWithRetry(Camp, campId, { ryzer_camp_id: rid }, maxRetries);
        if (ures.ok) stats.wrote += 1;
        else stats.errors += 1;
      }

      if (sample.length < 10) {
        const row: any = { campId, src, pageStatus: status, extractedRid: rid };
        if (debugContext) {
          row.context = ctx;
          row.registerUrlFound = registerUrl;
          row.finalFollowUrl = finalFollowUrl;
        }
        sample.push(row);
      }
    }

    stats.elapsedMs = Date.now() - t0;
    return Response.json({ ok: true, stats, sample });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});