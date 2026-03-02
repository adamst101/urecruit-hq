// functions/repairCampSchoolMappingFromRyzer.ts
//
// Repair pass for Camps where:
// - school_logo_url is missing OR is actually the Ryzer brand logo
// - school_id is missing and we can map by logo
//
// Safe behavior:
// - Default dryRun=true
// - Only overwrites logo if existing is missing or clearly Ryzer-branded
// - Only sets school_id when the logo match is UNIQUE
//
// Usage (POST JSON):
// {
//   "seasonYear": 2026,
//   "dryRun": true,
//   "maxCamps": 250,
//   "maxSchools": 2500,
//   "onlyMissingSchoolId": false,
//   "onlyBadOrMissingLogo": true,
//   "throttleMs": 150
// }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

function asArray<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function lc(x: any) {
  return String(x || "").toLowerCase().trim();
}

function safeString(x: any): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
}

function looksLikeHttpUrl(url: any) {
  const u = lc(url);
  return u.startsWith("http://") || u.startsWith("https://");
}

function normalizeUrl(u: string | null): string | null {
  const s = safeString(u);
  if (!s) return null;
  // strip common tracking fragments
  return s.replace(/#.*$/, "").trim();
}

function isLikelyImageUrl(u: string) {
  const s = lc(u);
  if (!s) return false;
  if (s.includes("favicon") || s.endsWith(".ico")) return false;
  if (s.includes("apple-touch-icon")) return false;
  if (
    s.includes(".png") ||
    s.includes(".jpg") ||
    s.includes(".jpeg") ||
    s.includes(".webp") ||
    s.includes(".gif") ||
    s.includes(".svg")
  ) return true;

  // some CDNs are extensionless
  if (s.includes("cloudfront") || s.includes("amazonaws") || s.includes("cdn")) return true;

  return false;
}

// This is the key: reject obvious Ryzer brand/logo assets.
function isRyzerBrandLogoCandidate(u: string) {
  const s = lc(u);
  if (!s) return true;

  // very strong negative indicators
  if (s.includes("ryzer") && (s.includes("logo") || s.includes("brand") || s.includes("favicon") || s.includes("icon")))
    return true;

  // common pattern: ryzer.com + logo assets
  if (s.includes("ryzer.com") && s.includes("ryzer")) return true;

  // some pages might use "connect" assets for Ryzer branding
  if (s.includes("ryzer") && s.includes("connect") && (s.includes("logo") || s.includes("brand")))
    return true;

  return false;
}

function absUrl(baseUrl: string, maybe: string) {
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

function extractMetaImage(html: string) {
  // og:image or twitter:image
  const h = String(html || "");
  const patterns = [
    /<meta[^>]+property\s*=\s*["']og:image["'][^>]*>/i,
    /<meta[^>]+name\s*=\s*["']og:image["'][^>]*>/i,
    /<meta[^>]+name\s*=\s*["']twitter:image["'][^>]*>/i,
    /<meta[^>]+property\s*=\s*["']twitter:image["'][^>]*>/i,
  ];

  for (const re of patterns) {
    const m = re.exec(h);
    if (!m) continue;
    const tag = m[0] || "";
    const c = /content\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (c && c[1]) return c[1].trim();
  }

  return null;
}

function extractImgCandidates(html: string) {
  const h = String(html || "");
  const out: { url: string; score: number }[] = [];

  const reImg = /<img[^>]+>/gi;
  let m: RegExpExecArray | null;

  while ((m = reImg.exec(h)) !== null) {
    const tag = m[0] || "";
    const t = lc(tag);

    const srcM = /\ssrc\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!srcM || !srcM[1]) continue;

    const raw = srcM[1].trim();
    if (!raw) continue;

    // ignore explicit ryzer brand tags
    if (t.includes("ryzer")) continue;

    // score heuristic: prefer logos in header/brand/org/program contexts
    let score = 0;
    if (t.includes("logo")) score += 4;
    if (t.includes("brand")) score += 2;
    if (t.includes("header")) score += 2;
    if (t.includes("org")) score += 3;
    if (t.includes("organization")) score += 3;
    if (t.includes("school")) score += 3;
    if (t.includes("team")) score += 3;
    if (t.includes("athletic")) score += 3;

    // reduce likely junk
    if (t.includes("sprite") || t.includes("icon")) score -= 2;

    out.push({ url: raw, score });
  }

  // also pick direct image URLs in HTML
  const reAnyImg = /(https?:\/\/[^"' <]+\.(?:png|jpg|jpeg|webp|gif|svg)(?:\?[^"' <]*)?)/gi;
  let mi: RegExpExecArray | null;
  while ((mi = reAnyImg.exec(h)) !== null) {
    if (!mi[1]) continue;
    out.push({ url: mi[1], score: 1 });
  }

  // sort by score desc
  out.sort((a, b) => (b.score || 0) - (a.score || 0));

  // de-dupe by url
  const seen = new Set<string>();
  const deduped: { url: string; score: number }[] = [];
  for (const c of out) {
    const u = c.url;
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    deduped.push(c);
  }

  return deduped;
}

function pickBestNonRyzerLogo(html: string, baseUrl: string) {
  const meta = extractMetaImage(html);
  if (meta) {
    const u = absUrl(baseUrl, meta);
    if (u && looksLikeHttpUrl(u) && isLikelyImageUrl(u) && !isRyzerBrandLogoCandidate(u)) {
      return normalizeUrl(u);
    }
  }

  const candidates = extractImgCandidates(html);
  for (const c of candidates) {
    const u = absUrl(baseUrl, c.url);
    if (!u) continue;
    if (!looksLikeHttpUrl(u)) continue;
    if (!isLikelyImageUrl(u)) continue;
    if (isRyzerBrandLogoCandidate(u)) continue;
    return normalizeUrl(u);
  }

  return null;
}

function shouldReplaceLogo(existing: string | null, nextLogo: string | null) {
  const ex = normalizeUrl(existing);
  const nx = normalizeUrl(nextLogo);
  if (!nx) return false;
  if (!ex) return true;
  // overwrite only if existing looks like Ryzer brand
  if (isRyzerBrandLogoCandidate(ex)) return true;
  return false;
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

async function buildSchoolLogoIndex(School: any, maxSchools: number) {
  const idx = new Map<string, string[]>(); // logoUrl -> [schoolId...]
  let cursor: string | null = null;
  let scanned = 0;

  while (scanned < maxSchools) {
    const limit = Math.min(250, maxSchools - scanned);
    const params: any = { limit };
    if (cursor) params.cursor = cursor;

    const resp = await School.list(params);
    const rows = asArray<any>(resp?.data || resp?.items || resp?.records || resp);
    const next = resp?.next_cursor ?? resp?.nextCursor ?? null;

    for (const s of rows) {
      scanned += 1;
      const sid = safeString(s?.id);
      if (!sid) continue;

      const logos = [
        s?.athletics_logo_url,
        s?.team_logo_url,
        s?.school_logo_url,
        s?.logo_url,
        s?.primary_logo_url,
        s?.logo,
      ];

      for (const l of logos) {
        const u = normalizeUrl(safeString(l));
        if (!u) continue;
        if (isRyzerBrandLogoCandidate(u)) continue;
        const arr = idx.get(u) || [];
        arr.push(sid);
        idx.set(u, arr);
      }
    }

    cursor = next;
    if (!cursor || rows.length === 0) break;
  }

  return { idx, scanned };
}

Deno.serve(async (req) => {
  const t0 = Date.now();

  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });

    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    if (!seasonYear) return Response.json({ ok: false, error: "seasonYear required" });

    const dryRun = body?.dryRun !== false; // default true
    const maxCamps = Math.max(1, Number(body?.maxCamps ?? 250));
    const maxSchools = Math.max(200, Number(body?.maxSchools ?? 2500));
    const throttleMs = Math.max(0, Number(body?.throttleMs ?? 150));

    const onlyMissingSchoolId = !!body?.onlyMissingSchoolId;
    const onlyBadOrMissingLogo = body?.onlyBadOrMissingLogo !== false; // default true

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;
    const School = base44?.entities?.School ?? base44?.entities?.Schools;

    if (!Camp || typeof Camp.filter !== "function") {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }
    if (!School || typeof School.list !== "function") {
      return Response.json({ ok: false, error: "School entity not available" });
    }

    const stats: any = {
      seasonYear,
      scannedCamps: 0,
      eligibleCamps: 0,
      fetchedPages: 0,
      logoFound: 0,
      logoUpdated: 0,
      schoolIdSet: 0,
      schoolIdSkippedAmbiguous: 0,
      skipped: 0,
      errors: 0,
      dryRun,
      elapsedMs: 0,
    };

    const debug: any = {
      sample: [],
      schoolIndexScanned: 0,
    };

    const { idx: schoolLogoIdx, scanned: schoolIndexScanned } = await buildSchoolLogoIndex(School, maxSchools);
    debug.schoolIndexScanned = schoolIndexScanned;

    const camps = asArray<any>(await Camp.filter({ season_year: seasonYear }, "-start_date", maxCamps));
    stats.scannedCamps = camps.length;

    for (const c of camps) {
      const campId = safeString(c?.id);
      if (!campId) continue;

      const currentSchoolId = safeString(c?.school_id);
      const currentLogo = normalizeUrl(safeString(c?.school_logo_url));
      const isBadLogo = !currentLogo || isRyzerBrandLogoCandidate(currentLogo);

      if (onlyMissingSchoolId && currentSchoolId) {
        stats.skipped += 1;
        continue;
      }
      if (onlyBadOrMissingLogo && !isBadLogo) {
        stats.skipped += 1;
        continue;
      }

      stats.eligibleCamps += 1;

      const regUrl = safeString(c?.source_url) || safeString(c?.link_url) || safeString(c?.url);
      if (!regUrl || !looksLikeHttpUrl(regUrl)) {
        stats.skipped += 1;
        continue;
      }

      await sleep(throttleMs);

      try {
        const { status, html } = await fetchHtml(regUrl);
        stats.fetchedPages += 1;

        const extractedLogo = pickBestNonRyzerLogo(html, regUrl);
        if (extractedLogo) stats.logoFound += 1;

        let nextLogoToWrite: string | null = null;
        if (shouldReplaceLogo(currentLogo, extractedLogo)) {
          nextLogoToWrite = extractedLogo;
        }

        // decide school mapping
        let nextSchoolIdToWrite: string | null = null;
        if (!currentSchoolId) {
          const key = normalizeUrl(nextLogoToWrite || extractedLogo || currentLogo);
          if (key) {
            const matches = schoolLogoIdx.get(key) || [];
            if (matches.length === 1) {
              nextSchoolIdToWrite = matches[0];
            } else if (matches.length > 1) {
              stats.schoolIdSkippedAmbiguous += 1;
            }
          }
        }

        const willUpdateLogo = !!nextLogoToWrite;
        const willSetSchoolId = !!nextSchoolIdToWrite;

        if (!dryRun) {
          const patch: any = {};
          if (willUpdateLogo) patch.school_logo_url = nextLogoToWrite;
          if (willSetSchoolId) patch.school_id = nextSchoolIdToWrite;

          if (Object.keys(patch).length) {
            await Camp.update(campId, patch);
            if (willUpdateLogo) stats.logoUpdated += 1;
            if (willSetSchoolId) stats.schoolIdSet += 1;
          }
        } else {
          if (willUpdateLogo) stats.logoUpdated += 1;
          if (willSetSchoolId) stats.schoolIdSet += 1;
        }

        if (debug.sample.length < 10) {
          debug.sample.push({
            campId,
            http: status,
            regUrl,
            currentLogo,
            extractedLogo,
            nextLogoToWrite,
            currentSchoolId,
            nextSchoolIdToWrite,
          });
        }
      } catch (e: any) {
        stats.errors += 1;
        if (debug.sample.length < 10) {
          debug.sample.push({
            campId,
            error: String(e?.message || e),
          });
        }
      }
    }

    stats.elapsedMs = Date.now() - t0;

    return Response.json({ ok: true, stats, debug });
  } catch (e: any) {
    return Response.json({
      ok: false,
      error: String(e?.message || e),
      elapsedMs: Date.now() - t0,
    });
  }
});