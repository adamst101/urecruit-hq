// functions/resolveRyzerIdsFromBrandedPages_CampDemo.ts
//
// Fetch branded camp pages and extract Ryzer numeric camp id, then write CampDemo.ryzer_camp_id.
//
// Why this exists:
// - Most Camp/CampDemo URLs are branded landing pages with no id= param.
// - Promotion is CampDemo -> Camp, so enrichment must be durable on CampDemo.
//
// Payload:
// {
//   "seasonYear": 2026,
//   "dryRun": true,
//   "maxRows": 60,
//   "startAt": 0,
//   "sleepMs": 300,
//   "maxRetries": 6,
//   "onlyMissing": true,
//   "debugContext": false,
//
//   // Optional overrides (use for edge cases)
//   "overrides": [
//     { "demoId": "699b62388644f35fb8bbc950", "ryzerId": "289884" },
//     { "src": "https://www.garygofffootballcamps.com/houston-camp.cfm", "ryzerId": "289884" }
//   ]
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

async function updateWithRetry(CampDemo: any, demoId: string, patch: any, maxRetries: number) {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await CampDemo.update(demoId, patch);
      return { ok: true };
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

function unescapeJsSlashes(s: string) {
  return String(s || "").replace(/\\\//g, "/");
}

// Fix https:///example.com -> https://example.com
function normalizeProtocolWeirdness(s: string) {
  return String(s || "")
    .replace(/https:\/\/\//g, "https://")
    .replace(/http:\/\/\//g, "http://")
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

function extractRyzerIdFromHtml(html: string): { rid: string | null; ctx: string | null; registerUrl: string | null } {
  const raw = String(html || "");
  const h = normalizeProtocolWeirdness(unescapeJsSlashes(raw));

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

  const reg = h.match(/https?:\/\/register\.ryzer\.com\/[^"' ]+/i);
  const registerUrl = reg?.[0] ? reg[0] : null;

  const needle = registerUrl ? "register.ryzer.com" : "ryzer";
  const pos = h.toLowerCase().indexOf(needle);
  const ctx =
    pos >= 0 ? `[context] ${h.slice(Math.max(0, pos - 140), Math.min(h.length, pos + 260))}` : null;

  return { rid: null, ctx, registerUrl };
}

function buildOverrideMaps(overrides: any[]) {
  const byDemoId = new Map<string, string>();
  const bySrc = new Map<string, string>();

  for (const o of overrides || []) {
    const demoId = safeString(o?.demoId);
    const src = normalizeUrl(safeString(o?.src));
    const ryzerId = safeString(o?.ryzerId);
    if (!ryzerId) continue;
    if (demoId) byDemoId.set(demoId, ryzerId);
    if (src) bySrc.set(src, ryzerId);
  }

  return { byDemoId, bySrc };
}

function pickUrlForDemoRow(r: any): string | null {
  const candidates = [
    r?.source_url,
    r?.sourceUrl,
    r?.link_url,
    r?.linkUrl,
    r?.registration_url,
    r?.registrationUrl,
    r?.registration_link,
    r?.registrationLink,
    r?.url,
    r?.camp_url,
    r?.campUrl,
  ];
  for (const c of candidates) {
    const u = normalizeUrl(safeString(c));
    if (u) return u;
  }
  return null;
}

Deno.serve(async (req) => {
  const t0 = Date.now();

  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    const dryRun = body?.dryRun !== false;
    const maxRows = Math.max(1, Number(body?.maxRows ?? 60));
    const startAt = Math.max(0, Number(body?.startAt ?? 0));
    const sleepMs = Math.max(0, Number(body?.sleepMs ?? 300));
    const maxRetries = Math.max(0, Number(body?.maxRetries ?? 6));
    const onlyMissing = body?.onlyMissing !== false;
    const debugContext = body?.debugContext === true;

    const overrides = Array.isArray(body?.overrides) ? body.overrides : [];
    const { byDemoId: overrideByDemoId, bySrc: overrideBySrc } = buildOverrideMaps(overrides);

    if (!seasonYear) return Response.json({ ok: false, error: "seasonYear required" });

    const base44 = createClientFromRequest(req);
    const CampDemo = base44?.entities?.CampDemo ?? base44?.entities?.CampDemos;

    if (!CampDemo || typeof CampDemo.filter !== "function" || typeof CampDemo.update !== "function") {
      return Response.json({ ok: false, error: "CampDemo entity not available" });
    }

    const rows: any[] = await CampDemo.filter(
      { season_year: seasonYear },
      "id",
      Math.min(10000, startAt + maxRows)
    );
    const slice = (rows || []).slice(startAt, startAt + maxRows);
    const nextStartAt = startAt + slice.length;

    const stats: any = {
      seasonYear,
      startAt,
      nextStartAt,
      scanned: slice.length,
      eligible: 0,
      usedOverride: 0,
      extractedFromUrl: 0,
      fetched: 0,
      html200: 0,
      extracted: 0,
      wrote: 0,
      errors: 0,
      followedRegisterUrl: 0,
      extractedViaFollow: 0,
      dryRun,
      elapsedMs: 0,
      done: slice.length < maxRows,
    };

    const sample: any[] = [];
    const cache = new Map<
      string,
      { status: number; rid: string | null; ctx: string | null; registerUrl: string | null; finalFollowUrl: string | null }
    >();

    for (const r of slice) {
      const demoId = safeString(r?.id);
      if (!demoId) continue;

      const existingRid = safeString(r?.ryzer_camp_id ?? r?.ryzerCampId ?? r?.ryzer_id ?? r?.ryzerId);
      if (onlyMissing && existingRid) continue;

      const src = pickUrlForDemoRow(r);
      const normalizedSrc = normalizeUrl(src);
      if (!normalizedSrc) continue;

      stats.eligible += 1;

      // Override takes precedence
      const ov = overrideByDemoId.get(demoId) || (normalizedSrc ? overrideBySrc.get(normalizedSrc) : null);
      if (ov) {
        stats.usedOverride += 1;
        if (!dryRun) {
          const wr = await updateWithRetry(CampDemo, demoId, { ryzer_camp_id: ov }, maxRetries);
          if (wr.ok) stats.wrote += 1;
          else stats.errors += 1;
        } else {
          stats.wrote += 1;
        }
        if (sample.length < 10) sample.push({ demoId, src: normalizedSrc, override: true, ryzerId: ov });
        if (sleepMs) await sleep(sleepMs);
        continue;
      }

      // Fast path: some branded pages still have id= in URL
      const ridFromUrl = extractIdFromUrl(normalizedSrc);
      if (ridFromUrl) {
        stats.extractedFromUrl += 1;
        if (!dryRun) {
          const wr = await updateWithRetry(CampDemo, demoId, { ryzer_camp_id: ridFromUrl }, maxRetries);
          if (wr.ok) stats.wrote += 1;
          else stats.errors += 1;
        } else {
          stats.wrote += 1;
        }
        if (sample.length < 10) sample.push({ demoId, src: normalizedSrc, ryzerId: ridFromUrl, via: "url" });
        if (sleepMs) await sleep(sleepMs);
        continue;
      }

      // Cache by URL to reduce repeat fetches
      let cached = cache.get(normalizedSrc);
      if (!cached) {
        stats.fetched += 1;
        const ft = await fetchTextWithRetry(normalizedSrc, maxRetries);
        const status = ft.ok ? ft.status : 0;
        if (status === 200) stats.html200 += 1;

        const ex = extractRyzerIdFromHtml(ft.html);
        cached = { status, rid: ex.rid, ctx: ex.ctx, registerUrl: ex.registerUrl, finalFollowUrl: null };

        // If we got a register.ryzer.com URL but no id, try following it once.
        if (!cached.rid && cached.registerUrl) {
          stats.followedRegisterUrl += 1;
          const followUrl = normalizeUrl(cached.registerUrl);
          if (followUrl) {
            const ft2 = await fetchTextWithRetry(followUrl, maxRetries);
            cached.finalFollowUrl = ft2.ok ? (ft2.finalUrl || followUrl) : followUrl;
            const ridFromFinalUrl = extractIdFromUrl(cached.finalFollowUrl);
            if (ridFromFinalUrl) {
              cached.rid = ridFromFinalUrl;
              cached.ctx = `[follow.finalUrl] ${cached.finalFollowUrl}`;
              stats.extractedViaFollow += 1;
            } else {
              const ex2 = extractRyzerIdFromHtml(ft2.html);
              if (ex2.rid) {
                cached.rid = ex2.rid;
                cached.ctx = ex2.ctx;
                stats.extractedViaFollow += 1;
              }
            }
          }
        }

        cache.set(normalizedSrc, cached);
      }

      const rid = cached?.rid || null;
      if (rid) stats.extracted += 1;

      if (rid) {
        if (!dryRun) {
          const wr = await updateWithRetry(CampDemo, demoId, { ryzer_camp_id: rid }, maxRetries);
          if (wr.ok) stats.wrote += 1;
          else stats.errors += 1;
        } else {
          stats.wrote += 1;
        }
      }

      if (sample.length < 10) {
        sample.push({
          demoId,
          src: normalizedSrc,
          status: cached?.status,
          ryzerId: rid,
          registerUrl: cached?.registerUrl || null,
          ctx: debugContext ? cached?.ctx : null,
        });
      }

      if (sleepMs) await sleep(sleepMs);
    }

    stats.elapsedMs = Date.now() - t0;

    return Response.json({ ok: true, stats, sample });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});