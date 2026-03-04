// functions/seedSchoolsFromWikipedia.js
//
// Two-level crawl:
//   1. Fetch Wikipedia "List of NCAA Division I/II/III institutions" + "List of NAIA institutions"
//   2. Parse the HTML tables to extract school data
//
// Each table row has: School (link), Nickname (link to athletics wiki), City, State, Conference
//
// Payload:
//   { "dryRun": true, "orgs": ["ncaa"], "divisions": ["D1"], "maxSchools": 50, "sleepMs": 0 }
//   { "dryRun": false, "orgs": ["ncaa","naia"], "sleepMs": 200 }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

function sleep(ms) { return new Promise(r => setTimeout(r, Math.max(0, ms || 0))); }

function safeStr(x) {
  if (x == null) return null;
  const s = String(x).trim();
  return s || null;
}

async function fetchHtml(url, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "CampConnectSchoolBot/1.0 (educational project)" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.text();
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (i < retries - 1) await sleep(2000 * (i + 1));
    }
  }
  throw lastErr;
}

// Decode HTML entities
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#x2013;/g, "–")
    .replace(/&#x2014;/g, "—");
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).trim();
}

// Extract first <a href="/wiki/..."> from HTML snippet
function extractWikiLink(html) {
  const m = html.match(/<a\s+[^>]*href="(\/wiki\/[^"#]+)"[^>]*>([^<]*)<\/a>/i);
  if (!m) return { href: null, text: null };
  return { href: m[1], text: decodeEntities(m[2]).trim() };
}

// Extract ALL <a href="/wiki/..."> links
function extractAllWikiLinks(html) {
  const results = [];
  const re = /<a\s+[^>]*href="(\/wiki\/[^"#]+)"[^>]*>([^<]*)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    results.push({ href: m[1], text: decodeEntities(m[2]).trim() });
  }
  return results;
}

// Parse table rows from HTML — finds <table> with class "wikitable sortable" or "wikitable"
function parseWikiTable(html) {
  // Find all wikitables (both "wikitable sortable" and "sortable wikitable" class orders)
  const tables = [];
  const tableRe = /<table\s+class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(html)) !== null) {
    tables.push(tm[1]);
  }
  if (!tables.length) return [];

  const rows = [];
  for (const tableHtml of tables) {
    // Extract header
    const theadMatch = tableHtml.match(/<thead>([\s\S]*?)<\/thead>/i);
    let headerHtml = theadMatch ? theadMatch[1] : "";
    if (!headerHtml) {
      // Some tables don't have explicit <thead>, grab first <tr> in tbody or top-level
      const firstTrMatch = tableHtml.match(/<tr>([\s\S]*?)<\/tr>/i);
      if (firstTrMatch) headerHtml = firstTrMatch[1];
    }

    // Parse header cells
    const headerCells = [];
    const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let thm;
    while ((thm = thRe.exec(headerHtml)) !== null) {
      headerCells.push(stripTags(thm[1]).toLowerCase().trim());
    }

    // Find column indices
    const schoolIdx = headerCells.findIndex(h =>
      h === "school" || h === "institution" || h.includes("school")
    );
    const nicknameIdx = headerCells.findIndex(h =>
      h === "nickname" || h.includes("nickname")
    );
    const cityIdx = headerCells.findIndex(h =>
      h === "city" || h.includes("city")
    );
    const stateIdx = headerCells.findIndex(h =>
      h === "state" || h.startsWith("state") || h.includes("state/") || h.includes("province")
    );
    const conferenceIdx = headerCells.findIndex(h =>
      h === "conference" || h === "primary" || h.includes("conference") || h.includes("primary")
    );
    const subdivisionIdx = headerCells.findIndex(h =>
      h === "subdivision" || h.includes("subdivision")
    );

    if (schoolIdx === -1) continue; // skip tables without school column

    // Parse body rows
    const tbodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/i);
    const bodyHtml = tbodyMatch ? tbodyMatch[1] : tableHtml;
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(bodyHtml)) !== null) {
      const rowHtml = rm[1];
      // Skip pure header rows (rows that have ONLY <th> and no <td>)
      // But keep data rows that use <th scope="row"> for the school name
      if (rowHtml.includes("<th") && !rowHtml.includes("<td")) continue;

      // Extract cells (both <th> and <td>) — handle both self-closing and content cells
      const cells = [];
      const cellRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let cm;
      while ((cm = cellRe.exec(rowHtml)) !== null) {
        cells.push(cm[1]);
      }

      if (cells.length <= schoolIdx) continue;

      const schoolCell = cells[schoolIdx] || "";
      const nicknameCell = nicknameIdx >= 0 && cells[nicknameIdx] ? cells[nicknameIdx] : "";
      const cityCell = cityIdx >= 0 && cells[cityIdx] ? cells[cityIdx] : "";
      const stateCell = stateIdx >= 0 && cells[stateIdx] ? cells[stateIdx] : "";
      const conferenceCell = conferenceIdx >= 0 && cells[conferenceIdx] ? cells[conferenceIdx] : "";
      const subdivisionCell = subdivisionIdx >= 0 && cells[subdivisionIdx] ? cells[subdivisionIdx] : "";

      // School name & wikipedia_url
      const schoolLink = extractWikiLink(schoolCell);
      const schoolName = schoolLink.text || stripTags(schoolCell);
      const wikipediaUrl = schoolLink.href
        ? `https://en.wikipedia.org${schoolLink.href}`
        : null;

      // Nickname & athletics_wikipedia_url
      const nicknameLink = extractWikiLink(nicknameCell);
      const nickname = nicknameLink.text || stripTags(nicknameCell);
      let athleticsWikipediaUrl = null;
      if (nicknameLink.href) {
        // Verify the link is NOT pointing to a school/university page
        // It should be the athletics program page e.g. /wiki/Arizona_Wildcats
        const hrefLc = nicknameLink.href.toLowerCase();
        const isUniversityLink = hrefLc.includes("university") || hrefLc.includes("college") || hrefLc.includes("institute");
        if (!isUniversityLink) {
          athleticsWikipediaUrl = `https://en.wikipedia.org${nicknameLink.href}`;
        }
      }

      // City
      const cityLink = extractWikiLink(cityCell);
      const city = cityLink.text || stripTags(cityCell);

      // State
      let state = stripTags(stateCell).replace(/^\s*\n\s*/g, "").trim();
      // Some states are abbreviated links like <a href="/wiki/Texas" title="Texas">TX</a>
      const stateLink = extractWikiLink(stateCell);
      if (stateLink.text && stateLink.text.length <= 3) {
        state = stateLink.text;
      } else if (stateLink.text) {
        state = stateLink.text;
      }
      // Clean up multi-line state values
      state = state.split("\n")[0].trim();

      // Conference
      const confLinks = extractAllWikiLinks(conferenceCell);
      const conference = confLinks.length > 0 ? confLinks[0].text : stripTags(conferenceCell);

      // Subdivision (FBS/FCS for D1)
      const subdivision = stripTags(subdivisionCell);

      if (!schoolName || schoolName.length < 2) continue;

      rows.push({
        schoolName,
        wikipediaUrl,
        nickname: nickname || null,
        athleticsWikipediaUrl,
        city: city || null,
        state: state || null,
        conference: conference || null,
        subdivision: subdivision || null,
      });
    }
  }
  return rows;
}

const WIKI_PAGES = {
  ncaa_d1: "https://en.wikipedia.org/wiki/List_of_NCAA_Division_I_institutions",
  ncaa_d2: "https://en.wikipedia.org/wiki/List_of_NCAA_Division_II_institutions",
  ncaa_d3: "https://en.wikipedia.org/wiki/List_of_NCAA_Division_III_institutions",
  naia:    "https://en.wikipedia.org/wiki/List_of_NAIA_institutions",
};

const DIVISION_MAP = {
  ncaa_d1: "NCAA Division I",
  ncaa_d2: "NCAA Division II",
  ncaa_d3: "NCAA Division III",
  naia:    "NAIA",
};

// Vocational / non-athletic school filter
const BAD_PATTERNS = /beauty|barber|cosmetology|nursing school|trade school|technical institute of|culinary/i;

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" }, { status: 405 });
    const body = await req.json().catch(() => ({}));

    const dryRun = body?.dryRun !== false;
    const orgs = body?.orgs || ["ncaa", "naia"]; // "ncaa", "naia"
    const divisions = body?.divisions || null; // ["D1","D2","D3"] or null for all
    const maxSchools = body?.maxSchools || 99999;
    const sleepMs = Math.max(0, Number(body?.sleepMs ?? 0));
    const testConference = body?.testConference || null; // e.g. "Big 12 Conference"

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const School = base44.entities.School;

    // Determine which pages to crawl
    const pagesToCrawl = [];
    if (orgs.includes("ncaa")) {
      if (!divisions || divisions.includes("D1")) pagesToCrawl.push("ncaa_d1");
      if (!divisions || divisions.includes("D2")) pagesToCrawl.push("ncaa_d2");
      if (!divisions || divisions.includes("D3")) pagesToCrawl.push("ncaa_d3");
    }
    if (orgs.includes("naia")) {
      pagesToCrawl.push("naia");
    }

    const stats = {
      pagesFetched: 0,
      totalParsed: 0,
      filtered: 0,
      inserted: 0,
      duplicatesSkipped: 0,
      errors: 0,
      byDivision: {},
    };
    const sample = [];
    const seen = new Set(); // dedup by normalized school name

    let allSchools = [];

    for (const pageKey of pagesToCrawl) {
      const url = WIKI_PAGES[pageKey];
      const division = DIVISION_MAP[pageKey];

      let html;
      try {
        html = await fetchHtml(url);
        stats.pagesFetched++;
      } catch (e) {
        stats.errors++;
        continue;
      }

      const rows = parseWikiTable(html);
      stats.byDivision[division] = { parsed: rows.length, inserted: 0 };

      for (const row of rows) {
        stats.totalParsed++;

        // Filter bad schools
        if (BAD_PATTERNS.test(row.schoolName)) {
          stats.filtered++;
          continue;
        }

        // Conference filter for testing
        if (testConference && row.conference !== testConference) continue;

        // Dedup
        const normName = row.schoolName.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seen.has(normName)) {
          stats.duplicatesSkipped++;
          continue;
        }
        seen.add(normName);

        // Determine subdivision
        let subdivision = null;
        if (row.subdivision) {
          const sub = row.subdivision.toUpperCase();
          if (sub.includes("FBS")) subdivision = "FBS";
          else if (sub.includes("FCS")) subdivision = "FCS";
        }

        const schoolRecord = {
          school_name: row.schoolName,
          normalized_name: row.schoolName.toLowerCase(),
          city: row.city,
          state: row.state,
          country: "US",
          division: division,
          subdivision: subdivision,
          conference: row.conference,
          athletics_nickname: row.nickname,
          wikipedia_url: row.wikipediaUrl,
          athletics_wikipedia_url: row.athleticsWikipediaUrl,
          source_platform: "wikipedia",
          source_key: `wikipedia:${normName}`,
          active: true,
          athletics_audit_status: "confirmed",
          last_seen_at: new Date().toISOString(),
        };

        allSchools.push(schoolRecord);

        if (allSchools.length >= maxSchools) break;
      }
      if (allSchools.length >= maxSchools) break;
    }

    // Insert
    if (!dryRun && allSchools.length > 0) {
      // Bulk create in batches of 25
      const batchSize = 25;
      for (let i = 0; i < allSchools.length; i += batchSize) {
        const batch = allSchools.slice(i, i + batchSize);
        try {
          await School.bulkCreate(batch);
          stats.inserted += batch.length;
          // Update division stats
          for (const s of batch) {
            if (stats.byDivision[s.division]) stats.byDivision[s.division].inserted++;
          }
        } catch (e) {
          // Fallback to individual creates
          for (const s of batch) {
            try {
              await School.create(s);
              stats.inserted++;
              if (stats.byDivision[s.division]) stats.byDivision[s.division].inserted++;
            } catch {
              stats.errors++;
            }
          }
        }
        if (sleepMs > 0) await sleep(sleepMs);
      }
    } else if (dryRun) {
      stats.inserted = allSchools.length; // would-be count
      for (const s of allSchools) {
        if (stats.byDivision[s.division]) stats.byDivision[s.division].inserted++;
      }
    }

    // Build sample (first 20)
    for (const s of allSchools.slice(0, 20)) {
      sample.push({
        school_name: s.school_name,
        division: s.division,
        subdivision: s.subdivision,
        conference: s.conference,
        nickname: s.athletics_nickname,
        wikipedia_url: s.wikipedia_url,
        athletics_wikipedia_url: s.athletics_wikipedia_url,
        city: s.city,
        state: s.state,
      });
    }

    return Response.json({
      ok: true,
      dryRun,
      stats,
      sample,
      elapsedMs: Date.now() - t0,
    });

  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e), elapsedMs: Date.now() - t0 }, { status: 500 });
  }
});