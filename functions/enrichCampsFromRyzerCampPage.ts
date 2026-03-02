// functions/enrichCampsFromRyzerCampPage.ts
//
// Enrich Camps directly from Ryzer camp pages using Camp.ryzer_camp_id.
// - Fetches https://register.ryzer.com/camp.cfm?id=<id>&ryzer=1
// - Extracts an S3 logo (og:image/twitter:image/img candidates)
// - Extracts a host/organizer name (best-effort from og:site_name/title/h1)
// - Writes:
//    - Camp.school_logo_url ONLY if missing or Ryzer placeholder
//    - Camp.host_name ONLY if missing (or always, configurable)
//
// Rules (per Tom):
// - Ryzer placeholder: https://register.ryzer.com/webart/logo.png
// - Only accept logos starting with https://s3.amazonaws.com/
//
// Payload:
// {
//   "seasonYear": 2026,
//   "dryRun": true,
//   "maxCamps": 300,
//   "startAt": 0,
//   "sleepMs": 150,
//   "maxRetries": 6,
//   "updateHostNameMode": "missing_only"  // "missing_only" | "always"
// }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const RYZER_PLACEHOLDER_LOGO = "https://register.ryzer.com/webart/logo.png";
const S3_PREFIX = "https://s3.amazonaws.com/";

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
  return s.replace(/#.*$/, "").replace(/\?.*$/, "").trim();
}

function isS3LogoUrl(u: string | null): boolean {
  const s = normalizeUrl(u);
  return !!s && s.startsWith(S3_PREFIX);
}

function isRyzerPlaceholderLogo(u: string | null): boolean {
  const s = normalizeUrl(u);
  return !!s && s === RYZER_PLACEHOLDER_LOGO;
}

function shouldReplaceLogo(existing: string | null, nextLogo: string | null): boolean {
  const ex = normalizeUrl(existing);
  const nx = normalizeUrl(nextLogo);
  if (!nx) return false;
  if (!isS3LogoUrl(nx)) return false;
  if (!ex) return true;
  if (isRyzerPlaceholderLogo(ex)) return true;
  return false;
}

function extractMetaContent(html: string, key: string): string | null {
  const h = String(html || "");
  const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, "i");
  const m = re.exec(h);
  if (!m) return null;
  const tag = m[0] || "";
  const c = /content\s*=\s*["']([^"']+)["']/i.exec(tag);
  return c?.[1] ? c[1].trim() : null;
}

function extractTitle(html: string): string | null {
  const h = String(html || "");
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(h);
  return m?.[1] ? m[1].trim() : null;
}

function extractH1(html: string): string | null {
  const h = String(html || "");
  const m = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h);
  if (!m?.[1]) return null;
  return m[1].replace(/<[^>]+>/g, "").trim() || null;
}

function extractImgCandidates(html: string): string[] {
  const h = String(html || "");
  const out: string[] = [];
  const reImg = /<img[^>]+>/gi;
  let m: RegExpExecArray | null;

  while ((m = reImg.exec(h)) !== null) {
    const tag = m[0] || "";
    const srcM = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!srcM?.[1]) continue;
    out.push(srcM[1].trim());
  }

  // de-dupe
  return Array.from(new Set(out.filter(Boolean)));
}

function absUrl(baseUrl: string, maybe: string): string | null {
  try {
    if (!maybe) return null;
    const m = String(maybe).trim();
    if (!m) return null;
    if (m.startsWith("http://") || m.startsWith("https://")) return m;
    return new URL(m, baseUrl).toString();
  } catch {
    return null;
  }
}

function pickBestS3Logo(html: string, baseUrl: string): string | null {
  const og = normalizeUrl(absUrl(baseUrl, extractMetaContent(html, "og:image") || ""));
  if (og && isS3LogoUrl(og)) return og;

  const tw = normalizeUrl(absUrl(baseUrl, extractMetaContent(html, "twitter:image") || ""));
  if (tw && isS3LogoUrl(tw)) return tw;

  for (const c of extractImgCandidates(html)) {
    const u = normalizeUrl(absUrl(baseUrl, c) || "");
    if (u && isS3LogoUrl(u)) return u;
  }

  return null;
}

function pickHostName(html: string): string | null {
  // Best-effort, deterministic extraction (no guessing via location)
  const ogSite = safeString(extractMetaContent(html, "og:site_name"));
  if (ogSite) return ogSite;

  const h1 = safeString(extractH1(html));
  if (h1) return h1;

  const title = safeString(extractTitle(html));
  if (title) {
    // clean common suffixes
    return title
      .replace(/\s*\|\s*registration\s*$/i, "")
      .replace(/\s*-\s*registration\s*$/i, "")
      .replace(/\s*\|\s*ryzer\s*$/i, "")
      .trim();
  }

  return null;
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

async function fetchHtml(url: string) {
  const rr = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
      Accept: "text/html,*/*",
    },
  });
  const status = rr.status;
  const html = await rr.text().catch(() => "");
  return { status, html };
}

Deno.serve(async (req) => {
  const t0 = Date.now();

  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    const dryRun = body?.dryRun !== false; // default true
    const maxCamps = Math.max(1, Number(body?.maxCamps ?? 300));
    const startAt = Math.max(0, Number(body?.startAt ?? 0));
    const sleepMs = Math.max(0, Number(body?.sleepMs ?? 150));
    const maxRetries = Math.max(0, Number(body?.maxRetries ?? 6));
    const updateHostNameMode = String(body?.updateHostNameMode || "missing_only"); // missing_only | always

    if (!seasonYear) return Response.json({ ok: false, error: "seasonYear required" });

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;
    if (!Camp || typeof Camp.filter !== "function" || typeof Camp.update !== "function") {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }

    // Pull stable list of camps for season; page using startAt
    const rows: any[] = await Camp.filter({ season_year: seasonYear }, "id", Math.min(10000, startAt + maxCamps));
    const slice = (rows || []).slice(startAt, startAt + maxCamps);
    const nextStartAt = startAt + slice.length;

    const stats: any = {
      seasonYear,
      startAt,
      nextStartAt,
      scanned: slice.length,
      withRyzerId: 0,
      fetched: 0,
      html200: 0,
      logoFound: 0,
      logoWouldWrite: 0,
      logoWrote: 0,
      hostFound: 0,
      hostWouldWrite: 0,
      hostWrote: 0,
      errors: 0,
      dryRun,
      elapsedMs: 0,
      done: slice.length < maxCamps,
    };

    const sample: any[] = [];

    // Cache html by ryzer id to avoid refetching duplicates
    const htmlCache = new Map<string, { status: number; html: string }>();

    for (const c of slice) {
      const campId = safeString(c?.id);
      if (!campId) continue;

      const ryzerId = safeString(c?.ryzer_camp_id);
      if (!ryzerId) continue;

      stats.withRyzerId += 1;

      const url = `https://register.ryzer.com/camp.cfm?id=${encodeURIComponent(ryzerId)}&ryzer=1`;

      let cached = htmlCache.get(ryzerId) || null;
      let status = 0;
      let html = "";

      if (cached) {
        status = cached.status;
        html = cached.html;
      } else {
        await sleep(sleepMs);
        const res = await fetchHtml(url);
        status = res.status;
        html = res.html;
        htmlCache.set(ryzerId, { status, html });
        stats.fetched += 1;
      }

      if (status === 200) stats.html200 += 1;

      const extractedLogo = status === 200 ? pickBestS3Logo(html, url) : null;
      const extractedHost = status === 200 ? pickHostName(html) : null;

      if (extractedLogo) stats.logoFound += 1;
      if (extractedHost) stats.hostFound += 1;

      const patch: any = {};

      if (shouldReplaceLogo(safeString(c?.school_logo_url), extractedLogo)) {
        patch.school_logo_url = extractedLogo;
        stats.logoWouldWrite += 1;
      }

      if (extractedHost) {
        const existing = safeString(c?.host_name);
        if (updateHostNameMode === "always" || !existing) {
          patch.host_name = extractedHost;
          stats.hostWouldWrite += 1;
        }
      }

      if (Object.keys(patch).length) {
        if (!dryRun) {
          const ures = await updateWithRetry(Camp, campId, patch, maxRetries);
          if (ures.ok) {
            if (patch.school_logo_url) stats.logoWrote += 1;
            if (patch.host_name) stats.hostWrote += 1;
          } else {
            stats.errors += 1;
          }
        } else {
          // dry run counts as would write only
        }
      }

      if (sample.length < 10) {
        sample.push({
          campId,
          ryzer_camp_id: ryzerId,
          pageStatus: status,
          extractedLogo,
          extractedHost,
          willWrite: Object.keys(patch),
        });
      }
    }

    stats.elapsedMs = Date.now() - t0;
    return Response.json({ ok: true, stats, sample });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});