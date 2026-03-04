// functions/fillMissingLogosFromAthleticsWiki.js
//
// Finds schools that have athletics_wikipedia_url but NO athletic_logo_url,
// fetches the athletics Wikipedia page, extracts the infobox logo, and saves it.
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

async function fetchHtmlWithRetry(url, tries = 3, backoffMs = 800) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "CampConnectLogoFillBot/1.0" },
        signal: controller.signal,
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
        const infobox = extractInfobox(html);

        if (!infobox) {
          stats.noLogo++;
          if (sample.noLogo.length < 10) sample.noLogo.push({ schoolId, name: schoolName, reason: "no_infobox" });
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
          if (sample.noLogo.length < 10) sample.noLogo.push({ schoolId, name: schoolName, reason: "no_logo_in_infobox" });
          if (throttleMs > 0) await sleep(throttleMs);
          continue;
        }

        const logoUrl = logoCand.directUrl || commonsFilePath(logoCand.filename);
        const n = lc(logoCand.filename);
        let confidence = 0.65;
        if (n.endsWith(".svg")) confidence += 0.2;
        else if (n.endsWith(".png")) confidence += 0.05;
        if (n.includes("logo")) confidence += 0.1;
        if (n.includes("wordmark")) confidence += 0.05;
        confidence = Math.min(0.95, confidence);

        const nickname = extractAthleticsName(infobox, pageTitle);

        const updates = {
          athletic_logo_url: logoUrl,
          athletic_logo_source: "wikipedia:manual_athletics_url→infobox",
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
          sample.updated.push({ schoolId, name: schoolName, logo: logoUrl, file: logoCand.filename, confidence, dryRun });
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