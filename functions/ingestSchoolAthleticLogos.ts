// functions/ingestSchoolAthleticLogos.ts
// Enriches School.athletic_logo_url by following the Wikipedia link chain:
//
//   1. School.wikipedia_url  →  fetch institution Wikipedia page
//   2. Parse infobox "Nickname" row → extract link to athletics program page
//      (e.g. /wiki/Arizona_Wildcats)
//   3. Fetch the athletics program Wikipedia page
//   4. Parse infobox logo image (first image in the infobox)
//   5. Build Commons FilePath URL from the image filename
//
// Also extracts from the athletics infobox:
//   - athletics_nickname (the page title / infobox heading, e.g. "Arizona Wildcats")
//   - athletics_wikipedia_url (full URL of the athletics page)
//
// This avoids Wikidata search which mismatches common nicknames
// (e.g. "Tigers" → "Detroit Tigers", "Bears" → "Chicago Bears").
//
// Request body:
// {
//   "dryRun": true,
//   "cursor": null,
//   "maxRows": 25,
//   "throttleMs": 500,
//   "timeBudgetMs": 25000,
//   "onlyMissing": true,
//   "force": false
// }

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

function isRetryable(e) {
  const msg = lc(e?.message || e);
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("temporarily")
  );
}

async function fetchHtmlWithRetry(url, tries = 3, backoffMs = 800) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "CampConnectAthleticLogoBot/3.0" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      return await resp.text();
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (!isRetryable(e) || i === tries - 1) throw e;
      await sleep(backoffMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}

// ─── HTML Parsing Helpers ─────────────────────────────────────────────────────

// Extract the infobox HTML block from a Wikipedia page
function extractInfobox(html) {
  // Wikipedia infoboxes use class="infobox" on a <table> element
  const infoboxMatch = html.match(/<table[^>]*class="[^"]*infobox[^"]*"[^>]*>[\s\S]*?<\/table>/i);
  return infoboxMatch ? infoboxMatch[0] : null;
}

// From the institution's infobox, find the "Nickname" row and extract the link
// The infobox typically has: <th>Nickname</th><td><a href="/wiki/Arizona_Wildcats">Wildcats</a></td>
function extractNicknameLink(infoboxHtml) {
  if (!infoboxHtml) return null;

  // Look for a row containing "Nickname" in a <th> or header cell
  // Then grab the <a href="/wiki/..."> from the corresponding <td>
  const nicknamePattern = /<t[hd][^>]*>[^<]*(?:Nickname|Athletic\s*nickname)[^<]*<\/t[hd]>\s*<td[^>]*>([\s\S]*?)<\/td>/i;
  const match = infoboxHtml.match(nicknamePattern);
  if (!match) return null;

  const tdContent = match[1];
  // Extract the first wiki link from the cell
  const linkMatch = tdContent.match(/<a[^>]*href="(\/wiki\/[^"#]+)"[^>]*>/i);
  if (!linkMatch) return null;

  return linkMatch[1]; // e.g. /wiki/Arizona_Wildcats
}

// From the athletics program page's infobox, extract the logo image filename
// The logo is typically the first image in the infobox, often in the header area
function extractInfoboxLogoFilename(infoboxHtml) {
  if (!infoboxHtml) return null;

  // Look for image files in the infobox. The logo is usually the primary image.
  // Wikipedia uses: src="//upload.wikimedia.org/wikipedia/commons/thumb/X/XX/Filename.svg/250px-Filename.svg.png"
  // Or: <a href="/wiki/File:Arizona_Wildcats_logo.svg">
  
  // Strategy 1: Find File: links which are the canonical references
  const fileLinks = [];
  const fileLinkRegex = /(?:href|src)="[^"]*?(?:\/wiki\/File:|\/wikipedia\/(?:commons|en)\/(?:thumb\/)?[a-f0-9]\/[a-f0-9]{2}\/)([^/"]+\.(svg|png|gif))/gi;
  let m;
  while ((m = fileLinkRegex.exec(infoboxHtml)) !== null) {
    const fn = decodeURIComponent(m[1].replace(/^\d+px-/, ""));
    fileLinks.push(fn);
  }

  // Strategy 2: Also check <img> src attributes for upload.wikimedia.org paths
  const imgSrcRegex = /src="[^"]*upload\.wikimedia\.org\/wikipedia\/[^"]*\/([^/"]+\.(svg|png|gif))/gi;
  while ((m = imgSrcRegex.exec(infoboxHtml)) !== null) {
    const fn = decodeURIComponent(m[1].replace(/^\d+px-/, ""));
    if (!fileLinks.includes(fn)) fileLinks.push(fn);
  }

  if (fileLinks.length === 0) return null;

  // Score each candidate — prefer files with "logo" in the name, SVGs, etc.
  let bestFile = null;
  let bestScore = -1;
  for (const fn of fileLinks) {
    const n = lc(fn);
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
    if (n.endsWith(".jpg") || n.endsWith(".jpeg")) score -= 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestFile = fn;
    }
  }

  return bestFile;
}

// Extract the title / heading of the athletics page from the infobox
function extractAthleticsName(infoboxHtml, pageTitle) {
  if (!infoboxHtml) return pageTitle || null;

  // The infobox header usually has the athletics program name in a <th> with colspan
  const headerMatch = infoboxHtml.match(/<th[^>]*colspan[^>]*>([\s\S]*?)<\/th>/i);
  if (headerMatch) {
    // Strip HTML tags
    const text = headerMatch[1].replace(/<[^>]+>/g, "").trim();
    if (text.length > 2 && text.length < 100) return text;
  }

  return pageTitle || null;
}

function commonsFilePath(fileName) {
  const safe = encodeURIComponent(String(fileName).replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${safe}`;
}

// ─── Main lookup: Institution Wikipedia → Nickname link → Athletics page → Logo

async function getLogoViaWikipediaChain(wikipediaUrl, existingAthleticsUrl) {
  const result = {
    athletic_logo_url: null,
    athletics_wikipedia_url: null,
    athletics_nickname: null,
    source: null,
    confidence: 0,
    fileName: null,
    debugPath: [],
  };

  // Step 1: If we already have the athletics Wikipedia URL, go directly there
  let athleticsPath = null;

  if (existingAthleticsUrl) {
    const pathMatch = existingAthleticsUrl.match(/(\/wiki\/[^#?]+)/);
    if (pathMatch) {
      athleticsPath = pathMatch[1];
      result.debugPath.push("used_existing_athletics_url");
    }
  }

  // Step 2: If no athletics URL yet, fetch the institution page and find the Nickname link
  if (!athleticsPath && wikipediaUrl) {
    result.debugPath.push("fetching_institution_page");
    const instHtml = await fetchHtmlWithRetry(wikipediaUrl);
    const instInfobox = extractInfobox(instHtml);
    
    if (instInfobox) {
      athleticsPath = extractNicknameLink(instInfobox);
      if (athleticsPath) {
        result.debugPath.push(`found_nickname_link:${athleticsPath}`);
      } else {
        result.debugPath.push("no_nickname_link_in_infobox");
        return result;
      }
    } else {
      result.debugPath.push("no_infobox_found");
      return result;
    }
  }

  if (!athleticsPath) {
    result.debugPath.push("no_athletics_path_available");
    return result;
  }

  // Step 3: Fetch the athletics program page
  const athleticsUrl = `https://en.wikipedia.org${athleticsPath}`;
  result.athletics_wikipedia_url = athleticsUrl;
  result.debugPath.push(`fetching_athletics_page:${athleticsUrl}`);

  const athHtml = await fetchHtmlWithRetry(athleticsUrl);
  const athInfobox = extractInfobox(athHtml);

  if (!athInfobox) {
    result.debugPath.push("no_infobox_on_athletics_page");
    return result;
  }

  // Extract the page title from <title> tag
  const titleMatch = athHtml.match(/<title>([^<]+)<\/title>/i);
  const pageTitle = titleMatch 
    ? titleMatch[1].replace(/ - Wikipedia$/, "").replace(/ — Wikipedia$/, "").trim()
    : null;

  // Extract athletics name from infobox header
  result.athletics_nickname = extractAthleticsName(athInfobox, pageTitle);

  // Step 4: Extract the logo filename from the athletics infobox
  const logoFilename = extractInfoboxLogoFilename(athInfobox);

  if (!logoFilename) {
    result.debugPath.push("no_logo_in_athletics_infobox");
    return result;
  }

  result.fileName = logoFilename;
  result.athletic_logo_url = commonsFilePath(logoFilename);
  result.source = `wikipedia:institution→nickname→athletics_infobox`;

  // Score confidence
  const n = lc(logoFilename);
  let confidence = 0.7;
  if (n.endsWith(".svg")) confidence += 0.2;
  else if (n.endsWith(".png")) confidence += 0.05;
  if (n.includes("logo")) confidence += 0.1;
  if (n.includes("wordmark")) confidence += 0.05;
  result.confidence = Math.min(0.99, confidence);

  result.debugPath.push(`found_logo:${logoFilename}:confidence=${result.confidence}`);
  return result;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  const debug = {
    version: "ingestSchoolAthleticLogos_v4_wikipedia_chain",
    notes: [],
  };
  const stats = {
    scanned: 0,
    eligible: 0,
    updated: 0,
    skippedNoWikipedia: 0,
    skippedAlreadyHasLogo: 0,
    skippedNoDivision: 0,
    noNicknameLink: 0,
    noLogoFound: 0,
    errors: 0,
    elapsedMs: 0,
  };
  const sample = { updated: [], errors: [], noLogo: [] };

  const elapsed = () => Date.now() - t0;

  try {
    if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

    const body = await req.json().catch(() => ({}));

    const dryRun       = !!body?.dryRun;
    const cursor       = body?.cursor ?? null;
    const maxRows      = Math.max(1, Number(body?.maxRows ?? 25));
    const throttleMs   = Math.max(0, Number(body?.throttleMs ?? 500));
    const timeBudgetMs = Math.max(5000, Number(body?.timeBudgetMs ?? 55000));
    const onlyMissing  = body?.onlyMissing !== false;
    const force        = !!body?.force;

    const base44 = createClientFromRequest(req);
    const School = base44.entities.School;

    // Paginate via offset
    const startAt = cursor ? Number(cursor) : 0;
    const pageLimit = startAt + maxRows;

    const allRows = await School.filter({}, "school_name", pageLimit);
    const rows = (allRows || []).slice(startAt, startAt + maxRows);
    const nextOffset = startAt + rows.length;
    const next_cursor = rows.length === maxRows ? String(nextOffset) : null;
    const done = rows.length < maxRows;

    stats.scanned = rows.length;

    for (const row of rows) {
      if (elapsed() >= timeBudgetMs) {
        debug.notes.push("stopped_early:time_budget");
        break;
      }

      const schoolId   = String(row?.id || "");
      const schoolName = String(row?.school_name || "");
      const existing   = safeStr(row?.athletic_logo_url);
      const wikiUrl    = safeStr(row?.wikipedia_url);
      const existingAthUrl = safeStr(row?.athletics_wikipedia_url);

      if (!schoolId || !schoolName) { stats.skippedNoDivision++; continue; }

      // Must have division or conference to be an athletics school
      const hasDivision  = !!(row?.division || row?.subdivision);
      const hasConference = !!row?.conference;
      if (!hasDivision && !hasConference) { stats.skippedNoDivision++; continue; }

      // Skip if already has logo (unless force)
      if (onlyMissing && existing && !force) {
        stats.skippedAlreadyHasLogo++;
        continue;
      }

      // Need either wikipedia_url or athletics_wikipedia_url
      if (!wikiUrl && !existingAthUrl) {
        stats.skippedNoWikipedia++;
        continue;
      }

      stats.eligible++;

      let result = null;
      try {
        result = await getLogoViaWikipediaChain(wikiUrl, existingAthUrl);
      } catch (e) {
        stats.errors++;
        if (sample.errors.length < 10) {
          sample.errors.push({ schoolId, name: schoolName, error: String(e?.message || e) });
        }
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      if (!result?.athletic_logo_url) {
        if (result?.debugPath?.includes("no_nickname_link_in_infobox")) {
          stats.noNicknameLink++;
        } else {
          stats.noLogoFound++;
        }
        if (sample.noLogo.length < 10) {
          sample.noLogo.push({ schoolId, name: schoolName, debugPath: result?.debugPath });
        }
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      const updates = {
        athletic_logo_url:        result.athletic_logo_url,
        athletic_logo_source:     result.source,
        athletic_logo_updated_at: new Date().toISOString(),
        athletic_logo_confidence: result.confidence,
      };

      // Also update athletics_wikipedia_url and nickname if we found them
      if (result.athletics_wikipedia_url && !existingAthUrl) {
        updates.athletics_wikipedia_url = result.athletics_wikipedia_url;
      }
      if (result.athletics_nickname && !row?.athletics_nickname) {
        updates.athletics_nickname = result.athletics_nickname;
      }

      if (dryRun) {
        stats.updated++;
        if (sample.updated.length < 10) {
          sample.updated.push({ schoolId, name: schoolName, ...updates, debugPath: result.debugPath, dryRun: true });
        }
      } else {
        try {
          await School.update(schoolId, updates);
          stats.updated++;
          if (sample.updated.length < 10) {
            sample.updated.push({ schoolId, name: schoolName, ...updates, debugPath: result.debugPath });
          }
        } catch (e) {
          stats.errors++;
          if (sample.errors.length < 10) {
            sample.errors.push({ schoolId, name: schoolName, error: String(e?.message || e) });
          }
        }
      }

      if (throttleMs > 0) await sleep(throttleMs);
    }

    stats.elapsedMs = elapsed();

    return json({ ok: true, dryRun, done, next_cursor, stats, sample, debug });

  } catch (e) {
    return json({ ok: false, error: String(e?.message || e), stats, sample, debug }, 500);
  }
});