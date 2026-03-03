// functions/enrichLogoFromBrandedPage.ts
//
// Fills Camp.school_logo_url from the best available source, in priority order:
//
//   1. Branded landing page  — Camp.branded_url / source_url / link_url (non-Ryzer)
//      Fetches the school's actual website and extracts og:image or prominent img tags.
//
//   2. School entity fallback — Camp.school_id → School.athletic_logo_url / logo_url
//      Used when all stored URLs are register.ryzer.com (direct Ryzer ingests have no
//      branded page). Copies the school's logo directly — no HTTP fetch needed.
//
// Skips rows that already have a good logo (use force=true to re-evaluate all).
//
// LOGO ACCEPTANCE RULES (in priority order):
//   1. og:image — if it's https and not a known bad/vendor URL
//   2. <img> tags — prefer S3, then any https, skipping icons/payments/placeholders
//   3. data-src / lazy-load attributes
//
// SKIPS rows that already have a good logo (use force=true to re-evaluate all).
//
// ─── Dry run ────────────────────────────────────────────────────────────────
// {
//   "seasonYear": 2026,
//   "dryRun": true,
//   "maxRows": 60,
//   "startAt": 0,
//   "sleepMs": 400,
//   "maxRetries": 4,
//   "onlyMissing": true,
//   "debugHtml": false
// }
//
// ─── Write mode ─────────────────────────────────────────────────────────────
// {
//   "seasonYear": 2026,
//   "dryRun": false,
//   "maxRows": 60,
//   "startAt": 0,
//   "sleepMs": 400,
//   "maxRetries": 4,
//   "onlyMissing": true,
//   "debugHtml": false
// }
// Page with startAt = stats.nextStartAt until stats.done === true.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

// ─── bad logo detection ───────────────────────────────────────────────────────

const BAD_LOGO_PATTERNS = [
  "register.ryzer.com",
  "ryzer.com/webart",
  "sportsusa",
  "sportscamps",
  "placeholder",
];

// Image URLs that are clearly not school logos
const SKIP_IMG_PATTERNS = [
  "webart/logo.png",
  "spacer.gif",
  "blank.png",
  "pixel.gif",
  "/icons/",
  "/favicon",
  "advertisement",
  "venmo",
  "google-pay",
  "apple-pay",
  "mastercard",
  "visa",
  "stripe",
  "paypal",
  "1x1",
  "tracking",
];

function isBadLogoUrl(url: any): boolean {
  const s = String(url || "").trim().toLowerCase();
  if (!s) return true;
  if (!s.startsWith("http://") && !s.startsWith("https://")) return true;
  return BAD_LOGO_PATTERNS.some((p) => s.includes(p));
}

function isSkippableImg(url: any): boolean {
  const s = String(url || "").trim().toLowerCase();
  return SKIP_IMG_PATTERNS.some((p) => s.includes(p));
}

function isS3Url(u: string): boolean {
  return u.startsWith("https://s3.amazonaws.com/") || u.startsWith("https://s3.");
}

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

async function fetchHtmlWithRetry(url: string, maxRetries: number) {
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

// ─── HTML extraction ──────────────────────────────────────────────────────────

function absUrl(base: string, maybe: string): string | null {
  try {
    const m = String(maybe || "").trim();
    if (!m) return null;
    if (m.startsWith("http://") || m.startsWith("https://")) return m;
    return new URL(m, base).toString();
  } catch { return null; }
}

function extractMetaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, "i");
  const m = re.exec(html);
  if (!m) return null;
  const c = /content\s*=\s*["']([^"']+)["']/i.exec(m[0] || "");
  return c?.[1] ? c[1].trim() : null;
}

function extractImgSrcs(html: string): string[] {
  const out: string[] = [];
  const re = /<img[^>]+>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(m[0] || "");
    if (src?.[1]) out.push(src[1].trim());
  }
  return Array.from(new Set(out.filter(Boolean)));
}

function extractDataSrcs(html: string): string[] {
  const out: string[] = [];
  const re = /data-(?:src|lazy-src|original)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) out.push(m[1].trim());
  }
  return Array.from(new Set(out.filter(Boolean)));
}

function scoreLogoCandidate(url: string): number {
  const u = url.toLowerCase();
  let score = 0;
  if (isS3Url(url)) score += 30;
  if (u.includes("logo")) score += 20;
  if (u.includes("athletic")) score += 10;
  if (u.includes(".svg")) score += 5;
  if (u.includes(".png")) score += 3;
  if (u.includes(".jpg") || u.includes(".jpeg")) score -= 5;
  if (u.includes("header")) score += 5;
  if (u.includes("banner")) score -= 5;
  if (u.includes("background") || u.includes("bg-")) score -= 20;
  if (u.includes("hero")) score -= 10;
  return score;
}

function pickBestLogo(html: string, baseUrl: string): string | null {
  const candidates: Array<{ url: string; score: number }> = [];

  const addCandidate = (raw: string | null) => {
    if (!raw) return;
    const u = normalizeUrl(absUrl(baseUrl, raw));
    if (!u) return;
    if (!u.startsWith("https://")) return;
    if (isBadLogoUrl(u)) return;
    if (isSkippableImg(u)) return;
    candidates.push({ url: u, score: scoreLogoCandidate(u) });
  };

  // og:image is highest confidence if it's a real school URL (not Ryzer)
  const og = extractMetaContent(html, "og:image");
  if (og) {
    const ogFull = normalizeUrl(absUrl(baseUrl, og));
    if (ogFull && !isBadLogoUrl(ogFull) && !isSkippableImg(ogFull) && ogFull.startsWith("https://")) {
      // og:image from branded page is usually the school's social card image — good logo
      candidates.push({ url: ogFull, score: scoreLogoCandidate(ogFull) + 50 });
    }
  }

  for (const src of extractImgSrcs(html)) addCandidate(src);
  for (const src of extractDataSrcs(html)) addCandidate(src);

  if (candidates.length === 0) return null;

  // Return highest scoring candidate
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].url;
}

function buildDebugContext(html: string, baseUrl: string): any {
  return {
    htmlLen: html.length,
    ogImage: extractMetaContent(html, "og:image"),
    ogSiteName: extractMetaContent(html, "og:site_name"),
    imgSrcs: extractImgSrcs(html).slice(0, 12),
    dataSrcs: extractDataSrcs(html).slice(0, 8),
    s3Mentions: (html.match(/s3\.amazonaws\.com[^"'\s]*/gi) || []).slice(0, 5),
  };
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();

  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    const dryRun     = body?.dryRun !== false;  // default: true
    const maxRows    = Math.max(1, Math.min(500, Number(body?.maxRows ?? 60)));
    const startAt    = Math.max(0, Number(body?.startAt ?? 0));
    const sleepMs    = Math.max(0, Number(body?.sleepMs ?? 400));
    const maxRetries = Math.max(0, Number(body?.maxRetries ?? 4));
    const onlyMissing = body?.onlyMissing !== false;  // default: true
    const debugHtml  = body?.debugHtml === true;
    const force      = body?.force === true;  // re-evaluate even if logo already set

    if (!seasonYear) return Response.json({ ok: false, error: "seasonYear required" });

    const base44 = createClientFromRequest(req);
    const Camp   = base44?.entities?.Camp   ?? base44?.entities?.Camps;
    const School = base44?.entities?.School ?? base44?.entities?.Schools;
    if (!Camp?.filter || !Camp?.update) {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }

    const pageLimit = Math.min(10_000, startAt + maxRows);
    const rows: any[] = await Camp.filter({ season_year: seasonYear }, "id", pageLimit);
    const slice = (rows || []).slice(startAt, startAt + maxRows);
    const nextStartAt = startAt + slice.length;

    const stats: Record<string, any> = {
      seasonYear,
      startAt,
      nextStartAt,
      scanned:              slice.length,
      skippedNoUrl:         0,
      skippedHasLogo:       0,
      eligible:             0,
      fetched:              0,
      html200:              0,
      logoFound:            0,
      logoFoundViaSchool:   0,  // sourced from School entity (no branded page fetch)
      logoWouldWrite:       0,
      logoWrote:            0,
      errors:               0,
      dryRun,
      elapsedMs:            0,
      done:                 slice.length < maxRows,
    };

    // Cache school logo lookups — many Camp rows share the same school_id
    const schoolLogoCache = new Map<string, string | null>();

    const sample:      any[] = [];
    const errorSamples: any[] = [];
    // Cache by URL so multiple Camp rows pointing to same branded page don't re-fetch
    const urlCache = new Map<string, { status: number; html: string; finalUrl: string }>();

    // Schema probe: show URL fields on first 5 rows regardless of eligibility
    const schemaSample = slice.slice(0, 5).map((r: any) => ({
      id:          r?.id,
      branded_url: r?.branded_url ?? "(missing)",
      source_url:  r?.source_url  ?? "(missing)",
      link_url:    r?.link_url    ?? "(missing)",
    }));

    for (const r of slice) {
      const campId = safeString(r?.id);
      if (!campId) continue;

      // Pick the branded URL in priority order:
      //   1. branded_url — set by resolveRyzerIdsFromBrandedPages_CampDemo (most reliable)
      //   2. source_url  — may be branded or Ryzer depending on ingest source
      //   3. link_url    — fallback
      // Skip any register.ryzer.com URLs — those pages never contain school logos
      const rawUrl =
        normalizeUrl(safeString(r?.branded_url)) ||
        normalizeUrl(safeString(r?.source_url))  ||
        normalizeUrl(safeString(r?.link_url));

      const srcUrl = rawUrl && !rawUrl.includes("register.ryzer.com") ? rawUrl : null;
      // Don't skip when srcUrl is null — School entity fallback will handle it below
      if (!srcUrl) stats.skippedNoUrl += 1;  // still count for observability, but don't skip

      const existingLogo = safeString(r?.school_logo_url);
      if (!force && onlyMissing && existingLogo && !isBadLogoUrl(existingLogo)) {
        stats.skippedHasLogo += 1;
        continue;
      }

      stats.eligible += 1;

      // ── Path A: fetch branded page ────────────────────────────────────────
      let logo: string | null = null;
      let logoSource = "none";
      let fetchStatus = 0;
      let fetchFinalUrl = srcUrl || "";
      let fetchHtmlSnap = "";

      if (srcUrl) {
        let cached = urlCache.get(srcUrl) ?? null;
        let html = "", finalUrl = srcUrl;

        if (cached) {
          ({ status: fetchStatus, html, finalUrl } = cached);
        } else {
          await sleep(sleepMs);
          const res = await fetchHtmlWithRetry(srcUrl, maxRetries);
          if (!res.ok) {
            stats.errors += 1;
            if (errorSamples.length < 5) errorSamples.push({ campId, srcUrl, error: res.error });
            continue;
          }
          stats.fetched += 1;
          fetchStatus = res.status;
          html = res.html;
          finalUrl = res.finalUrl;
          urlCache.set(srcUrl, { status: fetchStatus, html, finalUrl });
        }

        if (fetchStatus === 200) {
          stats.html200 += 1;
          logo = pickBestLogo(html, finalUrl);
          if (logo) { logoSource = "branded_page"; stats.logoFound += 1; }
        }
        fetchFinalUrl = finalUrl;
        fetchHtmlSnap = html;
      }

      // ── Path B: School entity fallback ────────────────────────────────────
      // Used when no branded URL exists (direct Ryzer ingests) or branded page had no logo.
      if (!logo && School) {
        const schoolId = safeString(r?.school_id);
        if (schoolId) {
          let schoolLogo: string | null | undefined = schoolLogoCache.get(schoolId);
          if (schoolLogo === undefined) {
            try {
              const schools = await School.filter({ id: schoolId });
              const s = Array.isArray(schools) ? schools[0] : schools;
              // Priority: athletic_logo_url (Wikidata SVG) → logo_url (scorecard)
              const candidates = [s?.athletic_logo_url, s?.athletics_logo_url, s?.logo_url, s?.school_logo_url];
              schoolLogo = null;
              for (const c of candidates) {
                const u = safeString(c);
                if (u && !isBadLogoUrl(u)) { schoolLogo = u; break; }
              }
            } catch { schoolLogo = null; }
            schoolLogoCache.set(schoolId, schoolLogo ?? null);
          }
          if (schoolLogo) {
            logo = schoolLogo;
            logoSource = "school_entity";
            stats.logoFoundViaSchool += 1;
            if (!stats.logoFound) stats.logoFound += 1;
          }
        }
      }

      const shouldWrite = !!logo && (force || !existingLogo || isBadLogoUrl(existingLogo));
      if (shouldWrite) stats.logoWouldWrite += 1;

      if (shouldWrite && !dryRun) {
        const res = await updateWithRetry(Camp, campId, { school_logo_url: logo }, maxRetries);
        if (res.ok) stats.logoWrote += 1;
        else {
          stats.errors += 1;
          if (errorSamples.length < 5) errorSamples.push({ campId, srcUrl: srcUrl ?? "(none)", error: res.error });
        }
      }

      if (sample.length < 12) {
        const entry: any = {
          campId,
          srcUrl:       srcUrl ?? "(none — school fallback used)",
          pageStatus:   fetchStatus || undefined,
          logoSource,
          existingLogo,
          extractedLogo: logo,
          willWrite:    shouldWrite,
        };
        if (debugHtml && fetchHtmlSnap) entry.htmlDebug = buildDebugContext(fetchHtmlSnap, fetchFinalUrl);
        sample.push(entry);
      }
    }

    stats.elapsedMs = Date.now() - t0;

    return Response.json({
      ok: true,
      stats,
      schemaSample,
      sample,
      errorSamples,
      nextStep: stats.done
        ? "Complete — run auditRyzerCampIdCoverage or check Discover UI."
        : `Not done — run again with startAt: ${nextStartAt}`,
    });

  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});