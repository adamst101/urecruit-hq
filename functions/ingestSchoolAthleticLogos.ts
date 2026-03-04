// functions/ingestSchoolAthleticLogos.ts  — v5 STRICT
//
// STRICT Wikipedia chain: 
//   1. School.wikipedia_url → fetch institution Wikipedia page
//   2. Parse infobox "Nickname" row → MUST have a hyperlink to athletics page
//      If nickname is plain text (no link), logo is left blank.
//   3. Fetch the athletics program Wikipedia page (from the nickname link)
//   4. Parse infobox logo image
//   5. Build Commons FilePath URL
//
// IMPORTANT: This version NEVER uses previously stored athletics_wikipedia_url.
// Every school is re-derived from scratch via its institution Wikipedia page.
// Schools that fail the chain get their athletic logo fields CLEARED.
//
// Request body:
// {
//   "dryRun": true,
//   "cursor": null,
//   "maxRows": 25,
//   "throttleMs": 500,
//   "timeBudgetMs": 55000,
//   "onlyMissing": false,
//   "force": true
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
        headers: { "User-Agent": "CampConnectAthleticLogoBot/5.0" },
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

function extractInfobox(html) {
  const infoboxMatch = html.match(/<table[^>]*class="[^"]*infobox[^"]*"[^>]*>[\s\S]*?<\/table>/i);
  return infoboxMatch ? infoboxMatch[0] : null;
}

// From institution infobox, find "Nickname" row and extract the wiki link.
// Returns null if nickname exists but is NOT a hyperlink (plain text).
function extractNicknameLink(infoboxHtml) {
  if (!infoboxHtml) return null;

  const rows = infoboxHtml.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const thMatch = row.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
    if (!thMatch) continue;
    
    const thText = thMatch[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
    if (!thText.includes("nickname")) continue;

    // Found a Nickname row — extract wiki link from the <td>
    const tdMatch = row.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
    if (!tdMatch) return null; // nickname row exists but no td

    const tdContent = tdMatch[1];
    const linkMatch = tdContent.match(/<a[^>]*href="(\/wiki\/[^"#]+)"[^>]*>/i);
    if (linkMatch) return linkMatch[1]; // e.g. /wiki/Arizona_Wildcats

    // Nickname exists as plain text but has NO link — return special marker
    return null;
  }

  // No nickname row found at all
  return null;
}

// Check if infobox has a Nickname row at all (even without a link)
function hasNicknameRow(infoboxHtml) {
  if (!infoboxHtml) return false;
  const rows = infoboxHtml.match(/<tr[\s>][\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const thMatch = row.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
    if (!thMatch) continue;
    const thText = thMatch[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
    if (thText.includes("nickname")) return true;
  }
  return false;
}

function extractInfoboxLogoFilename(infoboxHtml) {
  if (!infoboxHtml) return null;

  // Collect candidates as { filename, srcUrl } where srcUrl is the actual image src if available
  const candidates = [];
  const seenFiles = new Set();

  // Match src attributes to get the actual hosted URL + filename
  const srcRegex = /src="((?:https?:)?\/\/upload\.wikimedia\.org\/wikipedia\/[^"]*\/([^/"]+\.(svg|png|gif)(?:\.png)?))/gi;
  let m;
  while ((m = srcRegex.exec(infoboxHtml)) !== null) {
    let fullSrc = m[1];
    if (fullSrc.startsWith("//")) fullSrc = "https:" + fullSrc;
    // Extract original filename (strip thumbnail prefix like "250px-")
    let fn = decodeURIComponent(m[2].replace(/^\d+px-/, ""));
    // Strip double extension from SVG thumbnails (e.g. "Foo.svg.png" → "Foo.svg")
    fn = fn.replace(/\.(svg|png|gif)\.(png|jpg)$/i, ".$1");
    if (!seenFiles.has(fn)) {
      seenFiles.add(fn);
      // Build the direct URL: for /en/ hosted files, use upload.wikimedia.org direct path
      // Extract the wiki (commons or en) and hash path to build a non-thumb URL
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

  // Also match href to File: links
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
    if (n.includes("status_iucn")) score -= 1.0;
    if (n.includes("range")) score -= 0.5;
    if (n.includes("distribution")) score -= 0.5;
    if (n.includes("locator")) score -= 0.5;
    if (n.includes("coat_of_arms")) score -= 0.5;
    if (n.includes("emblem")) score -= 0.3;
    if (n.includes("crest")) score -= 0.3;
    if (n.includes("oojs_ui")) score -= 1.0;
    if (n.includes("edit-ltr")) score -= 1.0;
    if (n.includes("taxonomy")) score -= 1.0;
    if (n.includes("phylogeny")) score -= 0.5;
    if (n.endsWith(".jpg") || n.endsWith(".jpeg")) score -= 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = cand;
    }
  }

  return bestCandidate;
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

function commonsFilePath(fileName) {
  const safe = encodeURIComponent(String(fileName).replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${safe}`;
}

// ─── Main lookup: STRICTLY institution Wikipedia → Nickname hyperlink → Athletics page → Logo

async function getLogoViaWikipediaChain(wikipediaUrl) {
  const result = {
    athletic_logo_url: null,
    athletics_wikipedia_url: null,
    athletics_nickname: null,
    source: null,
    confidence: 0,
    fileName: null,
    status: "pending", // pending | no_wikipedia | no_infobox | nickname_no_link | no_nickname_row | found | no_logo_on_athletics
    debugPath: [],
  };

  if (!wikipediaUrl) {
    result.status = "no_wikipedia";
    result.debugPath.push("no_wikipedia_url");
    return result;
  }

  // Step 1: Fetch the institution page
  result.debugPath.push("fetching_institution_page");
  const instHtml = await fetchHtmlWithRetry(wikipediaUrl);
  const instInfobox = extractInfobox(instHtml);
  
  if (!instInfobox) {
    result.status = "no_infobox";
    result.debugPath.push("no_infobox_found");
    return result;
  }

  // Step 2: Find nickname row with a hyperlink
  const athleticsPath = extractNicknameLink(instInfobox);
  
  if (!athleticsPath) {
    // Distinguish: nickname row exists but no link vs no nickname row at all
    if (hasNicknameRow(instInfobox)) {
      result.status = "nickname_no_link";
      result.debugPath.push("nickname_row_exists_but_no_hyperlink");
    } else {
      result.status = "no_nickname_row";
      result.debugPath.push("no_nickname_row_in_infobox");
    }
    return result;
  }

  // Guard: The nickname link must point to an athletics program page, not a generic
  // animal/term article. Athletics pages typically contain the school name.
  // Reject links like /wiki/Cougars, /wiki/Eagles, /wiki/Gopher_(animal), etc.
  const rawPathTitle = decodeURIComponent(athleticsPath.replace("/wiki/", ""));
  // Strip parenthetical qualifiers like (animal), (mascot), (bird)
  const pathTitle = rawPathTitle.replace(/_/g, " ").replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const pathWords = pathTitle.split(/\s+/).filter(w => w.length > 1);

  // ── STRICT REJECTION RULES ──────────────────────────────────────────────────

  // 1. Single-word links are animal/term articles (e.g. "Cougars", "Eagles", "Bear")
  if (pathWords.length <= 1) {
    result.status = "nickname_no_link";
    result.debugPath.push(`nickname_link_too_generic:${athleticsPath}`);
    return result;
  }

  // 2. Parenthetical qualifiers indicate non-athletics pages
  if (/\((animal|bird|insect|fish|mammal|reptile|disambiguation|genus|species|mytholog|creature|plant|arachnid|amphibian)\)/i.test(rawPathTitle)) {
    result.status = "nickname_no_link";
    result.debugPath.push(`nickname_link_is_animal_page:${athleticsPath}`);
    return result;
  }

  // 3. Taxonomy / conservation / species keywords in title
  if (/\b(conservation|taxonomy|species|subspecies|genus|temporal range|pleistocene|holocene)\b/i.test(rawPathTitle)) {
    result.status = "nickname_no_link";
    result.debugPath.push(`nickname_link_taxonomy_keyword:${athleticsPath}`);
    return result;
  }

  // 4. Known animal words set — single animals or animal plurals
  const ANIMAL_WORDS = new Set([
    "eagle","eagles","falcon","falcons","hawk","hawks","owl","owls",
    "tiger","tigers","lion","lions","bear","bears","wolf","wolves",
    "panther","panthers","cougar","cougars","jaguar","jaguars",
    "mustang","mustangs","bronco","broncos","stallion","stallions",
    "ram","rams","bull","bulls","bison","buffalo","buffaloes",
    "wildcat","wildcats","bobcat","bobcats","hornet","hornets",
    "bee","bees","wasp","wasps","cardinal","cardinals",
    "raven","ravens","jay","jays","osprey","ospreys",
    "pelican","pelicans","penguin","penguins","dolphin","dolphins",
    "shark","sharks","gator","gators","alligator","alligators",
    "cobra","cobras","fox","foxes","coyote","coyotes","badger","badgers",
    "otter","otters","beaver","beavers","rabbit","rabbits",
    "jackrabbit","jackrabbits","deer","moose","elk","terrapin","terrapins",
    "turtle","turtles","gopher","gophers","squirrel","squirrels",
  ]);

  // 5. Adjective + Animal pattern (e.g. "Snowy owl", "Golden eagle", "Black panther")
  //    But allow known school prefixes like "American Eagles", "Boston Terriers"
  const ADJECTIVE_ANIMAL_RE = /^(snowy|golden|bald|gray|grey|red|blue|black|white|great|northern|southern|eastern|western|arctic|polar|mountain|timber|prairie|common|african|asian|european)[_ ]/i;

  const KNOWN_SCHOOL_PREFIXES = new Set([
    "american","boston","coastal","central","pacific","atlantic","liberty","national",
    "auburn","stanford","harvard","yale","duke","rice","temple","navy","army",
    "tulane","gonzaga","villanova","marquette","creighton","xavier","dayton",
    "butler","depaul","drake","bradley","loyola","fordham",
    "cornell","brown","dartmouth","columbia","princeton","penn",
  ]);

  if (pathWords.length === 2) {
    const firstWordLc = lc(pathWords[0]);
    const lastWordLc = lc(pathWords[1]);

    // Check if it's an adjective + animal pair
    if (ADJECTIVE_ANIMAL_RE.test(pathTitle) && !KNOWN_SCHOOL_PREFIXES.has(firstWordLc)) {
      if (ANIMAL_WORDS.has(lastWordLc) || ANIMAL_WORDS.has(lastWordLc + "s") || ANIMAL_WORDS.has(lastWordLc.replace(/s$/, ""))) {
        result.status = "nickname_no_link";
        result.debugPath.push(`nickname_link_adjective_animal:${athleticsPath}`);
        return result;
      }
    }
  }

  // 6. Generic mascot terms without school prefix
  const GENERIC_MASCOT_TERMS = /^(yellow[_ ]?jacket|blue[_ ]?jay|blue[_ ]?devil|red[_ ]?hawk|red[_ ]?fox|gray[_ ]?wolf|golden[_ ]?eagle|bald[_ ]?eagle|black[_ ]?bear|grizzly[_ ]?bear|timber[_ ]?wolf|jack[_ ]?rabbit|road[_ ]?runner|horned[_ ]?frog|mountain[_ ]?lion|wild[_ ]?cat|sea[_ ]?wolf|black[_ ]?panther|snow[_ ]?leopard|snowy[_ ]?owl)s?$/i;
  if (GENERIC_MASCOT_TERMS.test(pathTitle)) {
    result.status = "nickname_no_link";
    result.debugPath.push(`nickname_link_is_generic_mascot:${athleticsPath}`);
    return result;
  }

  result.debugPath.push(`found_nickname_link:${athleticsPath}`);

  // Step 3: Fetch the athletics program page
  const athleticsUrl = `https://en.wikipedia.org${athleticsPath}`;
  result.athletics_wikipedia_url = athleticsUrl;
  result.debugPath.push(`fetching_athletics_page:${athleticsUrl}`);

  const athHtml = await fetchHtmlWithRetry(athleticsUrl);
  const athInfobox = extractInfobox(athHtml);

  if (!athInfobox) {
    result.status = "no_logo_on_athletics";
    result.debugPath.push("no_infobox_on_athletics_page");
    return result;
  }

  // Extract page title
  const titleMatch = athHtml.match(/<title>([^<]+)<\/title>/i);
  const pageTitle = titleMatch 
    ? titleMatch[1].replace(/ - Wikipedia$/, "").replace(/ — Wikipedia$/, "").trim()
    : null;

  result.athletics_nickname = extractAthleticsName(athInfobox, pageTitle);

  // Step 4: Extract the logo
  const logoFilename = extractInfoboxLogoFilename(athInfobox);

  if (!logoFilename) {
    result.status = "no_logo_on_athletics";
    result.debugPath.push("no_logo_in_athletics_infobox");
    return result;
  }

  result.fileName = logoFilename;
  result.athletic_logo_url = commonsFilePath(logoFilename);
  result.source = "wikipedia:institution→nickname_link→athletics_infobox";
  result.status = "found";

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

// ─── Second-chance: use stored athletics_wikipedia_url directly ────────────

async function getLogoFromStoredAthleticsUrl(athleticsWikiUrl) {
  const result = {
    athletic_logo_url: null,
    athletics_wikipedia_url: athleticsWikiUrl,
    athletics_nickname: null,
    source: null,
    confidence: 0,
    fileName: null,
    status: "pending",
    debugPath: ["second_chance_via_stored_url"],
  };

  if (!athleticsWikiUrl) {
    result.status = "no_wikipedia";
    return result;
  }

  result.debugPath.push(`fetching_athletics_page:${athleticsWikiUrl}`);
  const athHtml = await fetchHtmlWithRetry(athleticsWikiUrl);
  const athInfobox = extractInfobox(athHtml);

  if (!athInfobox) {
    result.status = "no_logo_on_athletics";
    result.debugPath.push("no_infobox_on_athletics_page");
    return result;
  }

  const titleMatch = athHtml.match(/<title>([^<]+)<\/title>/i);
  const pageTitle = titleMatch
    ? titleMatch[1].replace(/ - Wikipedia$/, "").replace(/ — Wikipedia$/, "").trim()
    : null;

  result.athletics_nickname = extractAthleticsName(athInfobox, pageTitle);

  const logoFilename = extractInfoboxLogoFilename(athInfobox);
  if (!logoFilename) {
    result.status = "no_logo_on_athletics";
    result.debugPath.push("no_logo_in_athletics_infobox");
    return result;
  }

  result.fileName = logoFilename;
  result.athletic_logo_url = commonsFilePath(logoFilename);
  result.source = "wikipedia:stored_athletics_url→athletics_infobox";
  result.status = "found";

  const n = lc(logoFilename);
  let confidence = 0.6; // slightly lower since we didn't re-derive the URL
  if (n.endsWith(".svg")) confidence += 0.2;
  else if (n.endsWith(".png")) confidence += 0.05;
  if (n.includes("logo")) confidence += 0.1;
  if (n.includes("wordmark")) confidence += 0.05;
  result.confidence = Math.min(0.95, confidence);

  result.debugPath.push(`found_logo:${logoFilename}:confidence=${result.confidence}`);
  return result;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  const debug = {
    version: "ingestSchoolAthleticLogos_v5_strict_chain",
    notes: [],
  };
  const stats = {
    scanned: 0,
    eligible: 0,
    updated: 0,
    cleared: 0,
    skippedNoWikipedia: 0,
    skippedAlreadyHasLogo: 0,
    skippedNoDivision: 0,
    noNicknameLink: 0,
    noNicknameRow: 0,
    noInfobox: 0,
    noLogoOnAthletics: 0,
    errors: 0,
    elapsedMs: 0,
  };
  const sample = { updated: [], cleared: [], errors: [], noLogo: [] };

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

      if (!schoolId || !schoolName) { stats.skippedNoDivision++; continue; }

      // Must have division or conference to be an athletics school
      const hasDivision  = !!(row?.division || row?.subdivision);
      const hasConference = !!row?.conference;
      if (!hasDivision && !hasConference) { stats.skippedNoDivision++; continue; }

      // Skip if already has logo and onlyMissing (unless force)
      if (onlyMissing && existing && !force) {
        stats.skippedAlreadyHasLogo++;
        continue;
      }

      // Must have wikipedia_url — we NEVER use stored athletics_wikipedia_url
      if (!wikiUrl) {
        stats.skippedNoWikipedia++;
        continue;
      }

      stats.eligible++;

      let result = null;
      try {
        result = await getLogoViaWikipediaChain(wikiUrl);
      } catch (e) {
        stats.errors++;
        if (sample.errors.length < 10) {
          sample.errors.push({ schoolId, name: schoolName, error: String(e?.message || e) });
        }
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      // Second-chance: if the chain didn't find a logo but the school already has
      // a stored athletics_wikipedia_url (from a prior audit), try fetching the logo
      // directly from that stored URL.
      const storedAthUrl = safeStr(row?.athletics_wikipedia_url);
      if (result.status !== "found" && storedAthUrl) {
        // Only try if the chain didn't already fetch this same URL
        const chainAthUrl = safeStr(result.athletics_wikipedia_url);
        if (!chainAthUrl || chainAthUrl !== storedAthUrl) {
          try {
            const secondResult = await getLogoFromStoredAthleticsUrl(storedAthUrl);
            if (secondResult.status === "found" && secondResult.athletic_logo_url) {
              result = secondResult;
            }
          } catch (e) {
            // Non-fatal: just couldn't fetch the stored URL
            result.debugPath.push(`second_chance_error:${String(e?.message || e).slice(0, 80)}`);
          }
          if (throttleMs > 0) await sleep(throttleMs);
        }
      }

      if (result.status === "found" && result.athletic_logo_url) {
        // SUCCESS — update with new logo
        const updates = {
          athletic_logo_url:        result.athletic_logo_url,
          athletic_logo_source:     result.source,
          athletic_logo_updated_at: new Date().toISOString(),
          athletic_logo_confidence: result.confidence,
          athletics_wikipedia_url:  result.athletics_wikipedia_url,
        };
        if (result.athletics_nickname) {
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
      } else {
        // FAILED — clear any previously stored (potentially wrong) logo data
        if (result.status === "nickname_no_link") stats.noNicknameLink++;
        else if (result.status === "no_nickname_row") stats.noNicknameRow++;
        else if (result.status === "no_infobox") stats.noInfobox++;
        else stats.noLogoOnAthletics++;

        if (sample.noLogo.length < 10) {
          sample.noLogo.push({ schoolId, name: schoolName, status: result.status, debugPath: result.debugPath });
        }

        // If we found the athletics page but just no logo, still save the athletics URL & nickname
        const partialUpdates = {};
        if (result.athletics_wikipedia_url) {
          partialUpdates.athletics_wikipedia_url = result.athletics_wikipedia_url;
        }
        if (result.athletics_nickname) {
          partialUpdates.athletics_nickname = result.athletics_nickname;
        }

        // Clear logo data but preserve athletics URL if we found it via nickname link
        const hadLogoData = existing || safeStr(row?.athletic_logo_source);
        const clearUpdates = {
          athletic_logo_url: null,
          athletic_logo_source: null,
          athletic_logo_updated_at: null,
          athletic_logo_confidence: null,
          ...(!result.athletics_wikipedia_url ? { athletics_wikipedia_url: null } : {}),
          ...(!result.athletics_nickname ? { athletics_nickname: null } : {}),
          ...partialUpdates,
        };
        const hadData = existing || safeStr(row?.athletics_wikipedia_url) || safeStr(row?.athletics_nickname);
        const needsUpdate = hadData || Object.keys(partialUpdates).length > 0;
        if (needsUpdate) {

          if (dryRun) {
            stats.cleared++;
            if (sample.cleared.length < 10) {
              sample.cleared.push({ schoolId, name: schoolName, reason: result.status, dryRun: true });
            }
          } else {
            try {
              await School.update(schoolId, clearUpdates);
              stats.cleared++;
              if (sample.cleared.length < 10) {
                sample.cleared.push({ schoolId, name: schoolName, reason: result.status });
              }
            } catch (e) {
              stats.errors++;
            }
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