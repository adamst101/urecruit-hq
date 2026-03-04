// functions/fillMissingLogosFromAthleticsWiki.js
//
// Finds schools that have athletics_wikipedia_url but NO athletic_logo_url,
// fetches the page (Wikipedia or generic athletics site), extracts a logo, and saves it.
//
// Supports:
// - Wikipedia pages: extracts infobox logo
// - Generic athletics sites: extracts og:image, apple-touch-icon, or large favicon
//
// Request body:
// { "dryRun": false, "cursor": null, "maxRows": 25, "throttleMs": 400, "timeBudgetMs": 55000 }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms || 0)));
}

function lc(x) {
  return String(x || "").toLowerCase().trim();
}

function safeStr(x) {
  if (x == null) return null;
  const s = String(x).trim();
  return s || null;
}

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function isWikipediaUrl(url) {
  return /^https?:\/\/[a-z]{2,3}\.wikipedia\.org\//i.test(url);
}

async function fetchHtmlWithRetry(url, tries = 3, backoffMs = 800) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "CampConnectLogoFillBot/1.0" },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      return await resp.text();
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      const msg = lc(e?.message || e);
      const retryable = msg.includes("429") || msg.includes("502") || msg.includes("503") ||
        msg.includes("504") || msg.includes("timeout") || msg.includes("network");
      if (!retryable || i === tries - 1) throw e;
      await sleep(backoffMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}

// ── Wikipedia infobox extraction ──

function extractInfobox(html) {
  const m = html.match(/<table[^>]*class="[^"]*infobox[^"]*"[^>]*>[\s\S]*?<\/table>/i);
  return m ? m[0] : null;
}

function extractInfoboxLogoCandidate(infoboxHtml) {
  if (!infoboxHtml) return null;

  const candidates = [];
  const seenFiles = new Set();

  const srcRegex = /src="((?:https?:)?\/\/upload\.wikimedia\.org\/wikipedia\/[^"]*\/([^/"]+\.(svg|png|gif)(?:\.png)?))/gi;
  let m;
  while ((m = srcRegex.exec(infoboxHtml)) !== null) {
    let fullSrc = m[1];
    if (fullSrc.startsWith("//")) fullSrc = "https:" + fullSrc;
    let fn = decodeURIComponent(m[2].replace(/^\d+px-/, ""));
    fn = fn.replace(/\.(svg|png|gif)\.(png|jpg)$/i, ".$1");
    if (!seenFiles.has(fn)) {
      seenFiles.add(fn);
      const directUrlMatch = fullSrc.match(/upload\.wikimedia\.org\/wikipedia\/(commons|en)\/(?:thumb\/)?([a-f0-9]\/[a-f0-9]{2})\//i);
      let directUrl = null;
      if (directUrlMatch) {
        const wiki = directUrlMatch[1];
        const hashPath = directUrlMatch[2];
        const encodedFn = encodeURIComponent(fn.replace(/ /g, "_")).replace(/%2F/g, "/");
        directUrl = `https://upload.wikimedia.org/wikipedia/${wiki}/${hashPath}/${encodedFn}`;
      }
      candidates.push({ filename: fn, directUrl, srcUrl: fullSrc });
    }
  }

  const fileLinkRegex = /href="[^"]*?\/wiki\/File:([^"#]+\.(svg|png|gif))"/gi;
  while ((m = fileLinkRegex.exec(infoboxHtml)) !== null) {
    const fn = decodeURIComponent(m[1].replace(/ /g, "_"));
    if (!seenFiles.has(fn)) {
      seenFiles.add(fn);
      candidates.push({ filename: fn, directUrl: null, srcUrl: null });
    }
  }

  if (candidates.length === 0) return null;

  let bestCandidate = null;
  let bestScore = -1;
  for (const cand of candidates) {
    const n = lc(cand.filename);
    let score = 0.5;
    if (n.endsWith(".svg")) score += 0.3;
    else if (n.endsWith(".png")) score += 0.1;
    if (n.includes("logo")) score += 0.3;
    if (n.includes("wordmark")) score += 0.15;
    if (n.includes("athletic")) score += 0.1;
    if (n.includes("seal")) score -= 0.3;
    if (n.includes("map")) score -= 0.5;
    if (n.includes("location")) score -= 0.5;
    if (n.includes("conference")) score -= 0.2;
    if (n.includes("flag")) score -= 0.3;
    if (n.includes("stadium")) score -= 0.3;
    if (n.includes("photo")) score -= 0.3;
    if (n.includes("conservation")) score -= 1.0;
    if (n.includes("iucn")) score -= 1.0;
    if (n.includes("range")) score -= 0.5;
    if (n.includes("distribution")) score -= 0.5;
    if (n.includes("locator")) score -= 0.5;
    if (n.includes("coat_of_arms")) score -= 0.5;
    if (n.includes("emblem")) score -= 0.3;
    if (n.includes("crest")) score -= 0.3;
    if (n.includes("oojs_ui")) score -= 1.0;
    if (n.includes("edit-ltr")) score -= 1.0;
    if (n.includes("taxonomy")) score -= 1.0;
    if (n.endsWith(".jpg") || n.endsWith(".jpeg")) score -= 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = cand;
    }
  }

  return bestCandidate;
}

function commonsFilePath(fileName) {
  const safe = encodeURIComponent(String(fileName).replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${safe}`;
}

function extractAthleticsName(infoboxHtml, pageTitle) {
  if (!infoboxHtml) return pageTitle || null;
  const headerMatch = infoboxHtml.match(/<th[^>]*colspan[^>]*>([\s\S]*?)<\/th>/i);
  if (headerMatch) {
    const text = headerMatch[1].replace(/<[^>]+>/g, "").trim();
    if (text.length > 2 && text.length < 100) return text;
  }
  return pageTitle || null;
}

// ── Generic athletics site logo extraction ──

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

function extractLogoFromGenericSite(html, siteUrl) {
  // Priority order: og:image > apple-touch-icon (large) > shortcut icon/favicon
  const candidates = [];

  // 1. og:image
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogMatch) {
    const url = resolveUrl(siteUrl, ogMatch[1]);
    if (url) candidates.push({ url, source: "og:image", score: 0.8 });
  }

  // 2. apple-touch-icon (prefer largest)
  const touchRegex = /<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  let tm;
  while ((tm = touchRegex.exec(html)) !== null) {
    const url = resolveUrl(siteUrl, tm[1]);
    if (url) {
      const sizeMatch = tm[0].match(/sizes=["'](\d+)/i);
      const size = sizeMatch ? parseInt(sizeMatch[1]) : 0;
      candidates.push({ url, source: "apple-touch-icon", score: 0.6 + Math.min(size / 1000, 0.15) });
    }
  }

  // 3. <link rel="icon"> or <link rel="shortcut icon">
  const iconRegex = /<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  let im;
  while ((im = iconRegex.exec(html)) !== null) {
    const url = resolveUrl(siteUrl, im[1]);
    if (url) {
      const sizeMatch = im[0].match(/sizes=["'](\d+)/i);
      const size = sizeMatch ? parseInt(sizeMatch[1]) : 16;
      // Only use if reasonably sized (>= 64px) or SVG
      const isSvg = /\.svg/i.test(url);
      if (size >= 64 || isSvg) {
        candidates.push({ url, source: "favicon", score: 0.4 + (isSvg ? 0.15 : Math.min(size / 1000, 0.1)) });
      }
    }
  }

  // 4. Look for <img> with "logo" in class/id/alt/src in the header area
  const headerArea = (html.match(/<header[\s\S]*?<\/header>/i) || [null])[0]
    || (html.match(/<nav[\s\S]*?<\/nav>/i) || [null])[0]
    || html.substring(0, 15000); // fallback: first 15k chars
  const logoImgRegex = /<img[^>]+(?:class|id|alt|src)=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/gi;
  const logoImgRegex2 = /<img[^>]+src=["']([^"']+)["'][^>]*(?:class|id|alt)=["'][^"']*logo[^"']*["']/gi;
  for (const regex of [logoImgRegex, logoImgRegex2]) {
    let lm;
    while ((lm = regex.exec(headerArea)) !== null) {
      const url = resolveUrl(siteUrl, lm[1]);
      if (url && !/tracking|pixel|spacer|1x1/i.test(url)) {
        candidates.push({ url, source: "header-logo-img", score: 0.7 });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Pick best
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// ── Main handler ──

Deno.serve(async (req) => {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;

  const stats = {
    scanned: 0,
    eligible: 0,
    updated: 0,
    noLogo: 0,
    errors: 0,
    elapsedMs: 0,
  };
  const sample = { updated: [], noLogo: [], errors: [] };

  try {
    if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

    const body = await req.json().catch(() => ({}));
    const dryRun       = !!body?.dryRun;
    const cursor       = body?.cursor ?? null;
    const maxRows      = Math.max(1, Number(body?.maxRows ?? 25));
    const throttleMs   = Math.max(0, Number(body?.throttleMs ?? 400));
    const timeBudgetMs = Math.max(5000, Number(body?.timeBudgetMs ?? 55000));

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== "admin") {
      return json({ error: "Forbidden: Admin access required" }, 403);
    }

    const School = base44.entities.School;

    // Fetch ALL schools that have athletics_wikipedia_url but no athletic_logo_url
    const allSchools = await School.filter({}, "school_name", 99999);
    const eligible = (allSchools || []).filter(s =>
      safeStr(s.athletics_wikipedia_url) && !safeStr(s.athletic_logo_url)
    );

    const startAt = cursor ? Number(cursor) : 0;
    const batch = eligible.slice(startAt, startAt + maxRows);
    const nextOffset = startAt + batch.length;
    const next_cursor = batch.length === maxRows && nextOffset < eligible.length ? String(nextOffset) : null;
    const done = !next_cursor;

    stats.scanned = batch.length;
    stats.eligible = eligible.length;

    for (const row of batch) {
      if (elapsed() >= timeBudgetMs) break;

      const schoolId = String(row.id);
      const schoolName = String(row.school_name || "");
      const athUrl = safeStr(row.athletics_wikipedia_url);

      try {
        const html = await fetchHtmlWithRetry(athUrl);
        const isWiki = isWikipediaUrl(athUrl);

        let logoUrl = null;
        let logoSource = null;
        let confidence = 0;
        let nickname = null;

        if (isWiki) {
          // ── Wikipedia path ──
          const infobox = extractInfobox(html);

          if (!infobox) {
            stats.noLogo++;
            if (sample.noLogo.length < 10) sample.noLogo.push({ schoolId, name: schoolName, url: athUrl, reason: "no_infobox" });
            if (throttleMs > 0) await sleep(throttleMs);
            continue;
          }

          const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
          const pageTitle = titleMatch
            ? titleMatch[1].replace(/ - Wikipedia$/, "").replace(/ — Wikipedia$/, "").trim()
            : null;

          const logoCand = extractInfoboxLogoCandidate(infobox);

          if (!logoCand) {
            stats.noLogo++;
            if (sample.noLogo.length < 10) sample.noLogo.push({ schoolId, name: schoolName, url: athUrl, reason: "no_logo_in_infobox" });
            if (throttleMs > 0) await sleep(throttleMs);
            continue;
          }

          logoUrl = logoCand.directUrl || commonsFilePath(logoCand.filename);
          const n = lc(logoCand.filename);
          confidence = 0.65;
          if (n.endsWith(".svg")) confidence += 0.2;
          else if (n.endsWith(".png")) confidence += 0.05;
          if (n.includes("logo")) confidence += 0.1;
          if (n.includes("wordmark")) confidence += 0.05;
          confidence = Math.min(0.95, confidence);

          nickname = extractAthleticsName(infobox, pageTitle);
          logoSource = "wikipedia:manual_athletics_url→infobox";
        } else {
          // ── Generic athletics site path ──
          const logoCand = extractLogoFromGenericSite(html, athUrl);

          if (!logoCand) {
            stats.noLogo++;
            if (sample.noLogo.length < 10) sample.noLogo.push({ schoolId, name: schoolName, url: athUrl, reason: "no_logo_on_site" });
            if (throttleMs > 0) await sleep(throttleMs);
            continue;
          }

          logoUrl = logoCand.url;
          confidence = Math.min(0.8, logoCand.score);
          logoSource = `athletics_site:${logoCand.source}`;
        }

        const updates = {
          athletic_logo_url: logoUrl,
          athletic_logo_source: logoSource,
          athletic_logo_updated_at: new Date().toISOString(),
          athletic_logo_confidence: confidence,
        };
        if (nickname && !safeStr(row.athletics_nickname)) {
          updates.athletics_nickname = nickname;
        }

        if (!dryRun) {
          await School.update(schoolId, updates);
        }

        stats.updated++;
        if (sample.updated.length < 15) {
          sample.updated.push({ schoolId, name: schoolName, logo: logoUrl, source: logoSource, confidence, dryRun });
        }
      } catch (e) {
        stats.errors++;
        if (sample.errors.length < 10) {
          sample.errors.push({ schoolId, name: schoolName, error: String(e?.message || e) });
        }
      }

      if (throttleMs > 0) await sleep(throttleMs);
    }

    stats.elapsedMs = elapsed();
    return json({ ok: true, dryRun, done, next_cursor, stats, sample });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e), stats, sample }, 500);
  }
});