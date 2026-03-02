// functions/resolveRyzerIdsFromBrandedPages_CampDemo.ts
//
// CampDemo-only: fetch branded camp pages, extract Ryzer numeric id, write CampDemo.ryzer_camp_id.
// This is STEP 1 of the backfill pipeline:
//   resolveRyzerIdsFromBrandedPages_CampDemo  ← (this file)
//   promoteCampsFromCampDemo                  ← then run this (carries ryzer_camp_id → Camp)
//   auditRyzerCampIdCoverage                  ← verify
//
// ─── Dry-run (safe to run first) ────────────────────────────────────────────
// {
//   "seasonYear": 2026,
//   "dryRun": true,
//   "maxRows": 60,
//   "startAt": 0,
//   "sleepMs": 300,
//   "maxRetries": 6,
//   "onlyMissing": true,
//   "debugContext": false
// }
//
// ─── Write mode (page through to completion) ────────────────────────────────
// {
//   "seasonYear": 2026,
//   "dryRun": false,
//   "maxRows": 60,
//   "startAt": 0,       ← set to stats.nextStartAt from previous response
//   "sleepMs": 300,
//   "maxRetries": 6,
//   "onlyMissing": true,
//   "debugContext": false
// }
// Repeat with startAt = stats.nextStartAt until stats.done === true.
//
// ─── Edge-case overrides ──────────────────────────────────────────────────────
// Hardcoded overrides (e.g. Gary Goff Houston) are baked into HARDCODED_OVERRIDES
// below and applied automatically on every run — no payload needed.
//
// To add a one-off override at runtime without editing code, pass in payload:
// {
//   ...,
//   "overrides": [
//     { "demoId": "<CampDemo row id>", "ryzerId": "123456" },
//     { "src": "https://example.com/camp.cfm", "ryzerId": "123456" }
//   ]
// }
// Payload overrides are merged with (and take precedence over) hardcoded ones.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

// ─── helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

function safeString(x: any): string | null {
  if (x == null) return null;
  const s = String(x).trim();
  return s || null;
}

function normalizeUrl(u: string | null): string | null {
  const s = safeString(u);
  return s ? s.replace(/#.*$/, "").trim() : null;
}

function isRateLimitError(e: any) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("too many") || msg.includes("429");
}

async function updateWithRetry(Entity: any, rowId: string, patch: any, maxRetries: number) {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await Entity.update(rowId, patch);
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
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
          "Accept": "text/html,*/*",
        },
      });
      return {
        ok: true,
        status: res.status,
        finalUrl: res.url || url,
        html: await res.text().catch(() => ""),
      };
    } catch (e: any) {
      lastErr = e;
      if (attempt === maxRetries) break;
      await sleep(250 * Math.pow(2, attempt));
    }
  }
  return { ok: false, status: 0, finalUrl: url, html: "", error: String(lastErr?.message || lastErr) };
}

// ─── HTML parsing ─────────────────────────────────────────────────────────────

function unescapeJsSlashes(s: string) {
  return String(s || "").replace(/\\\//g, "/");
}

function normalizeProtocol(s: string) {
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
    const id = new URL(s).searchParams.get("id");
    if (id?.trim()) return id.trim();
  } catch { /* ignore */ }
  const m = s.match(/[?&]id=(\d{5,7})/i);
  return m?.[1] ? String(m[1]) : null;
}

function extractRyzerIdFromHtml(html: string): {
  rid: string | null;
  ctx: string | null;
  registerUrl: string | null;
} {
  const h = normalizeProtocol(unescapeJsSlashes(String(html || "")));

  const PATTERNS: Array<{ name: string; re: RegExp }> = [
    { name: "registerLink",  re: /https?:\/\/register\.ryzer\.com\/camp\.cfm[^"' ]*?[?&]id=(\d{5,7})/i },
    { name: "campLink",      re: /camp\.cfm[^"' ]*?[?&]id=(\d{5,7})/i },
    { name: "iframeSrc",     re: /<iframe[^>]+src=["'][^"']*?(?:register\.ryzer\.com\/)?camp\.cfm[^"']*?[?&]id=(\d{5,7})/i },
    { name: "formAction",    re: /<form[^>]+action=["'][^"']*?(?:register\.ryzer\.com\/)?camp\.cfm[^"']*?[?&]id=(\d{5,7})/i },
    { name: "inputHidden",   re: /<input[^>]+name=["']id["'][^>]+value=["'](\d{5,7})["']/i },
    { name: "dataUrl",       re: /data-(?:url|href)=["'][^"']*?(?:register\.ryzer\.com\/)?camp\.cfm[^"']*?[?&]id=(\d{5,7})/i },
    { name: "jsCampid",      re: /\bcampid\b\s*[:=]\s*["']?(\d{5,7})["']?/i },
    { name: "jsCampId2",     re: /\bcamp\s*id\b\s*[:=]\s*["']?(\d{5,7})["']?/i },
  ];

  for (const p of PATTERNS) {
    const m = h.match(p.re);
    if (m?.[1]) {
      const rid = m[1];
      const idx = m.index ?? h.indexOf(m[0]);
      const ctx = `[${p.name}] ${h.slice(Math.max(0, idx - 140), Math.min(h.length, idx + 260))}`;
      return { rid, ctx, registerUrl: null };
    }
  }

  // No id found in static HTML — look for a register.ryzer.com link to follow
  const reg = h.match(/https?:\/\/register\.ryzer\.com\/[^"' ]+/i);
  const registerUrl = reg?.[0] ?? null;

  const pos = h.toLowerCase().indexOf(registerUrl ? "register.ryzer.com" : "ryzer");
  const ctx = pos >= 0
    ? `[context] ${h.slice(Math.max(0, pos - 140), Math.min(h.length, pos + 260))}`
    : null;

  return { rid: null, ctx, registerUrl };
}

// ─── hardcoded overrides ──────────────────────────────────────────────────────
// Add entries here for JS-rendered pages that don't expose id= in static HTML.
// These are merged with any overrides passed in the request payload.
// Fields: demoId (CampDemo row id), src (source_url/link_url), ryzerId (Ryzer numeric camp id).
// You only need one of demoId or src per entry — both is fine too.
//
// To add a new edge case:
//   { src: "https://example.com/camp-page.cfm", ryzerId: "123456" }
//   { demoId: "<base44 CampDemo row id>",        ryzerId: "123456" }

const HARDCODED_OVERRIDES: Array<{ demoId?: string; src?: string; ryzerId: string }> = [
  // Gary Goff Football Camps – Houston (JS-rendered, id= not in static HTML)
  { src: "https://www.garygofffootballcamps.com/houston-camp.cfm", ryzerId: "289884" },

  // ── Add more entries below as you discover new JS-rendered edge cases ──────
  // { src: "https://example.com/some-camp.cfm", ryzerId: "XXXXXX" },
];

// ─── override maps ────────────────────────────────────────────────────────────

function buildOverrideMaps(overrides: any[]) {
  const byDemoId = new Map<string, string>();
  const bySrc    = new Map<string, string>();
  for (const o of overrides || []) {
    const demoId  = safeString(o?.demoId);
    const src     = normalizeUrl(safeString(o?.src));
    const ryzerId = safeString(o?.ryzerId);
    if (!ryzerId) continue;
    if (demoId) byDemoId.set(demoId, ryzerId);
    if (src)    bySrc.set(src, ryzerId);
  }
  return { byDemoId, bySrc };
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();

  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear   = Number(body?.seasonYear || 0);
    const dryRun       = body?.dryRun !== false;  // default: true (safe)
    const maxRows      = Math.max(1,   Number(body?.maxRows   ?? 60));
    const startAt      = Math.max(0,   Number(body?.startAt   ?? 0));
    const sleepMs      = Math.max(0,   Number(body?.sleepMs   ?? 300));
    const maxRetries   = Math.max(0,   Number(body?.maxRetries ?? 6));
    const onlyMissing  = body?.onlyMissing !== false;  // default: true
    const debugContext = body?.debugContext === true;   // default: false (keeps logs small)

    // Merge hardcoded overrides (always applied) with any passed in the payload
    const payloadOverrides = Array.isArray(body?.overrides) ? body.overrides : [];
    const mergedOverrides  = [...HARDCODED_OVERRIDES, ...payloadOverrides];
    const { byDemoId, bySrc } = buildOverrideMaps(mergedOverrides);

    if (!seasonYear) return Response.json({ ok: false, error: "seasonYear is required (e.g. 2026)" });

    const base44   = createClientFromRequest(req);
    const CampDemo = base44?.entities?.CampDemo ?? base44?.entities?.CampDemos;

    if (!CampDemo || typeof CampDemo.filter !== "function" || typeof CampDemo.update !== "function") {
      return Response.json({ ok: false, error: "CampDemo entity not available (check entity name)" });
    }

    // Fetch page of rows, filtered by season_year
    const pageLimit = Math.min(10_000, startAt + maxRows);
    const rows: any[] = await CampDemo.filter({ season_year: seasonYear }, "id", pageLimit);
    const slice = (rows || []).slice(startAt, startAt + maxRows);
    const nextStartAt = startAt + slice.length;

    const stats: Record<string, any> = {
      seasonYear,
      startAt,
      nextStartAt,
      scanned:             slice.length,
      eligible:            0,
      skippedAlreadyHasId: 0,
      skippedNoUrl:        0,
      usedOverride:        0,
      fetched:             0,
      html200:             0,
      extracted:           0,
      followedRegisterUrl: 0,
      extractedViaFollow:  0,
      wrote:               0,
      errors:              0,
      dryRun,
      elapsedMs:           0,
      done:                slice.length < maxRows,
    };

    const sample:  any[] = [];
    // URL → fetch result cache (avoids re-fetching the same branded page for multiple CampDemo rows)
    const urlCache = new Map<string, {
      status: number;
      rid: string | null;
      ctx: string | null;
      registerUrl: string | null;
      finalFollowUrl: string | null;
    }>();

    for (const r of slice) {
      const demoId = safeString(r?.id);
      if (!demoId) continue;

      const existing = safeString(r?.ryzer_camp_id);
      if (onlyMissing && existing) {
        stats.skippedAlreadyHasId += 1;
        continue;
      }

      const src = normalizeUrl(safeString(r?.source_url)) || normalizeUrl(safeString(r?.link_url));
      if (!src) {
        stats.skippedNoUrl += 1;
        continue;
      }

      stats.eligible += 1;

      // ── override check ────────────────────────────────────────────────────
      const overrideRid = byDemoId.get(demoId) || bySrc.get(src) || null;
      if (overrideRid) {
        stats.usedOverride += 1;
        if (!dryRun) {
          const res = await updateWithRetry(CampDemo, demoId, { ryzer_camp_id: overrideRid }, maxRetries);
          if (res.ok) stats.wrote += 1;
          else stats.errors += 1;
        }
        if (sample.length < 10) sample.push({ demoId, src, extractedRid: overrideRid, usedOverride: true });
        continue;
      }

      // ── URL fetch (or cache hit) ──────────────────────────────────────────
      let cached = urlCache.get(src) ?? null;
      let status = 0, rid: string | null = null, ctx: string | null = null;
      let registerUrl: string | null = null, finalFollowUrl: string | null = null;

      if (cached) {
        ({ status, rid, ctx, registerUrl, finalFollowUrl } = cached);
      } else {
        await sleep(sleepMs);

        const res = await fetchTextWithRetry(src, maxRetries);
        if (!res.ok) {
          stats.errors += 1;
          if (sample.length < 10) sample.push({ demoId, src, error: res.error });
          continue;
        }

        stats.fetched += 1;
        status = res.status;
        if (status === 200) stats.html200 += 1;

        const ex = status === 200 ? extractRyzerIdFromHtml(res.html) : { rid: null, ctx: null, registerUrl: null };
        rid = ex.rid; ctx = ex.ctx; registerUrl = ex.registerUrl;

        // Follow the register.ryzer.com link if found but no id in static HTML
        if (!rid && registerUrl) {
          stats.followedRegisterUrl += 1;
          await sleep(Math.min(500, sleepMs));
          const rr = await fetchTextWithRetry(registerUrl, maxRetries);
          if (rr.ok && rr.status < 400) {
            finalFollowUrl = rr.finalUrl;
            rid = extractIdFromUrl(rr.finalUrl) || extractRyzerIdFromHtml(rr.html).rid;
            if (rid) stats.extractedViaFollow += 1;
          }
        }

        urlCache.set(src, { status, rid, ctx, registerUrl, finalFollowUrl });
      }

      if (rid) stats.extracted += 1;

      // ── write ─────────────────────────────────────────────────────────────
      if (rid && !dryRun) {
        const res = await updateWithRetry(CampDemo, demoId, { ryzer_camp_id: rid }, maxRetries);
        if (res.ok) stats.wrote += 1;
        else stats.errors += 1;
      }

      if (sample.length < 10) {
        const entry: any = { demoId, src, pageStatus: status, extractedRid: rid };
        if (debugContext) {
          entry.context = ctx;
          entry.registerUrlFound = registerUrl;
          entry.finalFollowUrl = finalFollowUrl;
        }
        sample.push(entry);
      }
    }

    stats.elapsedMs = Date.now() - t0;
    return Response.json({ ok: true, stats, sample });

  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});