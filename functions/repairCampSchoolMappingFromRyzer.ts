// functions/repairCampSchoolMappingFromRyzer.ts
//
// Repair pass for Camps where:
// - school_logo_url is missing OR is the Ryzer placeholder logo
// - school_id is missing and we can map by logo
//
// New hard rules (per Tom):
// - Ryzer placeholder logo is EXACT: https://register.ryzer.com/webart/logo.png
// - Correct school logos start with: https://s3.amazonaws.com/
//
// Safe behavior:
// - Default dryRun=true
// - Only overwrites logo if existing is missing or exactly the Ryzer placeholder
// - Only writes a logo if extracted logo is an S3 URL
// - Only sets school_id when match is UNIQUE
//
// Usage (POST JSON):
// {
//   "seasonYear": 2026,
//   "dryRun": true,
//   "maxCamps": 250,
//   "maxSchools": 4000,
//   "onlyMissingSchoolId": false,
//   "onlyBadOrMissingLogo": true,
//   "throttleMs": 150
// }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const RYZER_PLACEHOLDER_LOGO = "https://register.ryzer.com/webart/logo.png";
const S3_PREFIX = "https://s3.amazonaws.com/";

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

// Strip fragment + query
function normalizeUrl(u: string | null): string | null {
  const s = safeString(u);
  if (!s) return null;
  return s.replace(/#.*$/, "").replace(/\?.*$/, "").trim();
}

function isS3LogoUrl(u: string | null): boolean {
  const s = normalizeUrl(u);
  if (!s) return false;
  return s.startsWith(S3_PREFIX);
}

function isRyzerPlaceholderLogo(u: string | null): boolean {
  const s = normalizeUrl(u);
  if (!s) return false;
  return s === RYZER_PLACEHOLDER_LOGO;
}

function urlBasename(u: string | null): string | null {
  const s = normalizeUrl(u);
  if (!s) return null;
  const last = s.split("/").pop() || "";
  const base = last.split("?")[0].split("#")[0].trim();
  if (!base) return null;
  return base;
}

function urlHostlessPath(u: string | null): string | null {
  const s = normalizeUrl(u);
  if (!s) return null;
  try {
    const uu = new URL(s);
    const path = `${uu.pathname}`.trim();
    return path || null;
  } catch {
    return s;
  }
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

    // Score: prefer logo-ish images
    let score = 0;
    if (t.includes("logo")) score += 4;
    if (t.includes("brand")) score += 2;
    if (t.includes("header")) score += 2;
    if (t.includes("org")) score += 2;
    if (t.includes("school")) score += 3;
    if (t.includes("team")) score += 3;
    if (t.includes("athletic")) score += 3;
    if (t.includes("sprite") || t.includes("icon")) score -= 2;

    out.push({ url: raw, score });
  }

  out.sort((a, b) => (b.score || 0) - (a.score || 0));

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

// ✅ Per rule: Only accept extracted logos that start with s3.amazonaws.com
function pickBestS3Logo(html: string, baseUrl: string) {
  const meta = extractMetaImage(html);
  if (meta) {
    const u = absUrl(baseUrl, meta);
    const nu = normalizeUrl(u);
    if (nu && isS3LogoUrl(nu)) return nu;
  }

  const candidates = extractImgCandidates(html);
  for (const c of candidates) {
    const u = absUrl(baseUrl, c.url);
    const nu = normalizeUrl(u);
    if (nu && isS3LogoUrl(nu)) return nu;
  }

  return null;
}

function shouldReplaceLogo(existing: string | null, nextLogo: string | null) {
  const ex = normalizeUrl(existing);
  const nx = normalizeUrl(nextLogo);
  if (!nx) return false;
  if (!isS3LogoUrl(nx)) return false;

  // Overwrite only if missing OR exactly the Ryzer placeholder
  if (!ex) return true;
  if (isRyzerPlaceholderLogo(ex)) return true;

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

function addToIndex(idx: Map<string, string[]>, key: string | null, schoolId: string) {
  if (!key) return;
  const k = key.toLowerCase();
  const arr = idx.get(k) || [];
  arr.push(schoolId);
  idx.set(k, arr);
}

// ✅ Only index S3 logos from Schools
async function buildSchoolLogoIndex(School: any, maxSchools: number) {
  const idx = new Map<string, string[]>(); // key -> [schoolId...]
  let scanned = 0;

  const limit = Math.max(200, Math.min(10000, Number(maxSchools) || 4000));
  const rows = asArray<any>(await School.filter({}, "school_name", limit));

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
      const raw = normalizeUrl(safeString(l));
      if (!raw) continue;
      if (!isS3LogoUrl(raw)) continue; // ✅ enforce rule

      addToIndex(idx, raw, sid);
      addToIndex(idx, urlHostlessPath(raw), sid);
      addToIndex(idx, urlBasename(raw), sid);
    }
  }

  return { idx, scanned };
}

function uniqueMatch(idx: Map<string, string[]>, keys: string[]) {
  const collected = new Set<string>();

  for (const k of keys) {
    const kk = (k || "").toLowerCase().trim();
    if (!kk) continue;
    const matches = idx.get(kk) || [];
    for (const m of matches) collected.add(m);
  }

  const arr = Array.from(collected);
  if (arr.length === 1) return { schoolId: arr[0], count: 1 };
  return { schoolId: null, count: arr.length };
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
    const maxSchools = Math.max(200, Number(body?.maxSchools ?? 4000));
    const throttleMs = Math.max(0, Number(body?.throttleMs ?? 150));

    const onlyMissingSchoolId = !!body?.onlyMissingSchoolId;
    const onlyBadOrMissingLogo = body?.onlyBadOrMissingLogo !== false; // default true

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;
    const School = base44?.entities?.School ?? base44?.entities?.Schools;

    if (!Camp || typeof Camp.filter !== "function") {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }
    if (!School || typeof School.filter !== "function") {
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
      logoSamples: [],
      schoolIndexScanned: 0,
      rules: {
        ryzerPlaceholderLogo: RYZER_PLACEHOLDER_LOGO,
        requiredLogoPrefix: S3_PREFIX,
      },
    };

    const { idx: schoolLogoIdx, scanned: schoolIndexScanned } = await buildSchoolLogoIndex(School, maxSchools);
    debug.schoolIndexScanned = schoolIndexScanned;

    // Cache duplicate regUrl fetches
    const regCache = new Map<string, { status: number; extractedLogo: string | null }>();

    const camps = asArray<any>(await Camp.filter({ season_year: seasonYear }, "-start_date", maxCamps));
    stats.scannedCamps = camps.length;

    for (const c of camps) {
      const campId = safeString(c?.id);
      if (!campId) continue;

      const currentSchoolId = safeString(c?.school_id);
      const currentLogo = normalizeUrl(safeString(c?.school_logo_url));

      const isBadLogo = !currentLogo || isRyzerPlaceholderLogo(currentLogo);

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

      const cached = regCache.get(regUrl) || null;

      try {
        let httpStatus = 0;
        let extractedLogo: string | null = null;

        if (cached) {
          httpStatus = cached.status;
          extractedLogo = cached.extractedLogo;
        } else {
          await sleep(throttleMs);
          const { status, html } = await fetchHtml(regUrl);
          stats.fetchedPages += 1;
          httpStatus = status;

          // ✅ Only S3 logos are considered valid
          extractedLogo = pickBestS3Logo(html, regUrl);

          regCache.set(regUrl, { status, extractedLogo });
        }

        if (extractedLogo) stats.logoFound += 1;

        let nextLogoToWrite: string | null = null;
        if (shouldReplaceLogo(currentLogo, extractedLogo)) {
          nextLogoToWrite = extractedLogo;
        }

        // Decide school mapping with multi-key match (still deterministic)
        let nextSchoolIdToWrite: string | null = null;
        let matchCount = 0;

        if (!currentSchoolId) {
          const bestLogoKey = normalizeUrl(nextLogoToWrite || extractedLogo || currentLogo);
          if (bestLogoKey && isS3LogoUrl(bestLogoKey)) {
            const keysToTry = [
              bestLogoKey,
              urlHostlessPath(bestLogoKey) || "",
              urlBasename(bestLogoKey) || "",
            ].filter(Boolean);

            const m = uniqueMatch(schoolLogoIdx, keysToTry);
            nextSchoolIdToWrite = m.schoolId;
            matchCount = m.count;

            if (!nextSchoolIdToWrite && matchCount > 1) {
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
            http: httpStatus,
            regUrl,
            currentLogo,
            extractedLogo,
            nextLogoToWrite,
            currentSchoolId,
            nextSchoolIdToWrite,
            matchCount,
          });
        }

        if (extractedLogo && debug.logoSamples.length < 10) {
          const bestLogoKey = normalizeUrl(extractedLogo);
          const keysToTry = bestLogoKey
            ? [bestLogoKey, urlHostlessPath(bestLogoKey) || "", urlBasename(bestLogoKey) || ""].filter(Boolean)
            : [];

          const m = uniqueMatch(schoolLogoIdx, keysToTry);

          debug.logoSamples.push({
            campId,
            regUrl,
            extractedLogo,
            keysToTry,
            matchCount: m.count,
            nextSchoolIdToWrite: m.schoolId,
          });
        }
      } catch (e: any) {
        stats.errors += 1;
        if (debug.sample.length < 10) {
          debug.sample.push({ campId, regUrl, error: String(e?.message || e) });
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