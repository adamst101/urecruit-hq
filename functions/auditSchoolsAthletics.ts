// functions/auditSchoolsAthletics.ts
//
// Audits School rows to determine if each school has an athletics program.
// Uses Wikipedia's infobox "Sporting affiliations" section as the source of truth.
//
// FOR EACH SCHOOL ROW:
//   - If division/conference already set → CONFIRMED, skip (already known athletics school)
//   - If division/conference null → fetch Wikipedia page, read sporting affiliations
//     - Found affiliations → UPDATE: write division, conference, athletics_nickname
//     - No affiliations found → FLAG for deletion (beauty academies, trade schools, etc.)
//
// MODES:
//   "audit"  (default) — dry run, produces report only, no writes
//   "update" — writes division/conference/nickname to confirmed athletics schools
//   "delete" — deletes rows flagged as non-athletics (use after reviewing audit report)
//
// AFFILIATION DETECTION:
//   Reads Wikipedia infobox for patterns like:
//   - "NCAA Division I", "NCAA Division II", "NCAA Division III"
//   - "NAIA", "NJCAA", "CCCAA", "NWAC" (junior/community colleges)
//   - Conference names: "Big Ten", "SEC", "Pac-12", "SWAC", etc.
//
// ─── Audit (dry run, review report) ─────────────────────────────────────────
// { "mode": "audit", "maxRows": 100, "startAt": 0 }
//
// ─── Update confirmed athletics schools ─────────────────────────────────────
// { "mode": "update", "maxRows": 50, "startAt": 0, "sleepMs": 400 }
//
// ─── Delete non-athletics schools (after reviewing audit report) ─────────────
// { "mode": "delete", "maxRows": 200, "startAt": 0, "dryRun": true }
// Flip dryRun: false only after you've reviewed the flaggedForDeletion list.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeStr(x: any): string | null {
  if (x == null) return null;
  const s = String(x).trim();
  return s || null;
}

function lc(x: any) {
  return String(x || "").toLowerCase().trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

async function fetchHtmlWithRetry(url: string, tries = 3): Promise<{ ok: boolean; html: string; status: number }> {
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(url, {
        headers: { "User-Agent": "CampConnectSchoolAuditBot/1.0" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const html = await r.text();
      return { ok: r.status < 400, html, status: r.status };
    } catch (e: any) {
      if (i === tries - 1) return { ok: false, html: "", status: 0 };
      await sleep(600 * Math.pow(2, i));
    }
  }
  return { ok: false, html: "", status: 0 };
}

// ─── Wikipedia lookup ─────────────────────────────────────────────────────────

function normForMatch(x: string): string {
  return x.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(university|college|institute|school|academy|of|the|and|at|a|an|for|in|state)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleMatchScore(schoolName: string, wikiTitle: string): number {
  // Hard reject list/disambiguation pages immediately
  if (/^list of /i.test(wikiTitle)) return 0;
  if (/\(disambiguation\)/i.test(wikiTitle)) return 0;

  const sn = normForMatch(schoolName);
  const wt = normForMatch(wikiTitle);

  if (!sn || !wt) return 0;
  if (sn === wt) return 100;
  if (wt.includes(sn) || sn.includes(wt)) return 80;

  const snWords = new Set(sn.split(" ").filter((w: string) => w.length > 2));
  const wtWords = wt.split(" ").filter((w: string) => w.length > 2);
  if (snWords.size === 0) return 0;
  const overlap = wtWords.filter((w: string) => snWords.has(w)).length;
  // Use max of both denominators — penalize when wiki title has many unrelated words
  const denominator = Math.max(snWords.size, wtWords.length);
  return Math.round((overlap / denominator) * 80);
}

async function getWikipediaUrl(schoolName: string): Promise<string | null> {
  const q = encodeURIComponent(schoolName);
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q}&srlimit=5&format=json&origin=*`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, { headers: { "User-Agent": "CampConnectSchoolAuditBot/1.0" }, signal: ctrl.signal });
    clearTimeout(timer);
    const data = await r.json();
    const results = data?.query?.search;
    if (!Array.isArray(results) || results.length === 0) return null;

    // Score each result — only accept if title meaningfully matches school name.
    // This prevents "Manchester by the Sea (film)" matching "A Better U Beauty Academy".
    let bestResult: any = null;
    let bestScore = 0;
    for (const result of results) {
      const score = titleMatchScore(schoolName, result.title || "");
      if (score > bestScore) { bestScore = score; bestResult = result; }
    }

    // Require minimum 50 score — reject garbage matches
    if (bestScore < 50 || !bestResult) return null;

    const title = String(bestResult.title || "").trim();
    if (!title) return null;
    // Double-check rejections (also handled in scorer but belt+suspenders)
    if (/^list of /i.test(title)) return null;
    if (/\(disambiguation\)/i.test(title)) return null;

    return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  } catch {
    return null;
  }
}

// ─── Athletics affiliation extraction ────────────────────────────────────────

const DIVISION_PATTERNS: Array<{ pattern: RegExp; division: string }> = [
  { pattern: /NCAA\s+Division\s+I(?:\s*[-–]\s*FBS)?/i,    division: "NCAA Division I FBS" },
  { pattern: /NCAA\s+Division\s+I(?:\s*[-–]\s*FCS)?/i,    division: "NCAA Division I FCS" },
  { pattern: /NCAA\s+Division\s+I\b/i,                     division: "NCAA Division I" },
  { pattern: /NCAA\s+Division\s+II\b/i,                    division: "NCAA Division II" },
  { pattern: /NCAA\s+Division\s+III\b/i,                   division: "NCAA Division III" },
  { pattern: /\bNAIA\b/i,                                   division: "NAIA" },
  { pattern: /\bNJCAA\b/i,                                  division: "NJCAA" },
  { pattern: /\bCCCAA\b/i,                                  division: "CCCAA" },
  { pattern: /\bNWAC\b/i,                                   division: "NWAC" },
  { pattern: /\bUSAA\b.*athletics/i,                        division: "USAA" },
  { pattern: /junior\s+college/i,                           division: "Junior College" },
  { pattern: /community\s+college.*athletics/i,             division: "Community College" },
];

// Known D1 conferences for conference detection
const KNOWN_CONFERENCES = [
  "ACC", "Big Ten", "Big 12", "Pac-12", "SEC", "AAC", "Atlantic 10",
  "Big East", "Big Sky", "Big South", "Big West", "CAA", "C-USA",
  "Horizon League", "MAC", "MAAC", "MEAC", "Missouri Valley", "Mountain West",
  "NEC", "OVC", "Patriot League", "Pioneer League", "SBC", "SOCON",
  "Southland", "SWAC", "Summit League", "Sun Belt", "WAC", "WCC",
  "ASUN", "America East", "Ivy League",
];

interface AthleticsInfo {
  hasAthletics:    boolean;
  division:        string | null;
  conference:      string | null;
  nickname:        string | null;
  wikipediaUrl:    string | null;
  confidence:      "high" | "medium" | "low" | "none";
  matchedPatterns: string[];
}

function extractAthleticsFromHtml(html: string, wikipediaUrl: string): AthleticsInfo {
  const result: AthleticsInfo = {
    hasAthletics:    false,
    division:        null,
    conference:      null,
    nickname:        null,
    wikipediaUrl,
    confidence:      "none",
    matchedPatterns: [],
  };

  if (!html) return result;

  // ── Extract infobox section ───────────────────────────────────────────────
  // Wikipedia infoboxes contain "Sporting affiliations" rows
  const infoboxMatch = html.match(/<table[^>]*infobox[^>]*>([\s\S]*?)<\/table>/i);
  const infoboxHtml  = infoboxMatch ? infoboxMatch[1] : html;

  // Strip HTML tags for text matching
  const stripped = infoboxHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const full     = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // ── Division detection ────────────────────────────────────────────────────
  // Check infobox first (high confidence), then full page (medium)
  for (const { pattern, division } of DIVISION_PATTERNS) {
    if (pattern.test(stripped)) {
      result.division        = division;
      result.hasAthletics    = true;
      result.confidence      = "high";
      result.matchedPatterns.push(`infobox:${division}`);
      break;
    }
  }
  if (!result.division) {
    // Tighter fallback: only accept full-page match if it appears near athletics keywords.
    // Prevents "Junior College" from matching a passing mention on unrelated pages.
    const athleticsContext = full.match(
      /.{0,200}(sporting affiliation|athletic|NCAA|NAIA|NJCAA|conference member).{0,200}/gi
    ) || [];
    const contextText = athleticsContext.join(" ");
    for (const { pattern, division } of DIVISION_PATTERNS) {
      if (contextText.length > 0 && pattern.test(contextText)) {
        result.division     = division;
        result.hasAthletics = true;
        result.confidence   = "medium";
        result.matchedPatterns.push(`context:${division}`);
        break;
      }
    }
  }

  // ── Conference detection ──────────────────────────────────────────────────
  // Look for conference in infobox rows near "Sporting affiliations" or "Conference"
  const sportingSection = stripped.match(/[Ss]porting\s+affiliations?(.*?)(?:[A-Z][a-z]+\s+affiliations?|$)/s);
  const sectionText     = sportingSection ? sportingSection[1] : stripped;

  for (const conf of KNOWN_CONFERENCES) {
    if (sectionText.includes(conf) || new RegExp(`\\b${conf}\\b`, "i").test(stripped)) {
      result.conference = conf;
      result.matchedPatterns.push(`conference:${conf}`);
      break;
    }
  }

  // ── Nickname extraction ───────────────────────────────────────────────────
  // Look for "Nickname: Wildcats" or "Athletics nickname: Wildcats" in infobox
  const nicknameMatch =
    stripped.match(/[Nn]ickname[s]?\s+([A-Z][A-Za-z\s]+?)(?:\s{2,}|[A-Z][a-z]+\s+[A-Z]|$)/) ??
    stripped.match(/[Aa]thletics?\s+nickname[s]?\s+([A-Z][A-Za-z\s]+?)(?:\s{2,}|$)/);
  if (nicknameMatch) {
    const raw = nicknameMatch[1].trim();
    // Sanity: should be 1-4 words, title-case
    if (raw.length < 40 && raw.split(" ").length <= 4) {
      result.nickname = raw;
      result.matchedPatterns.push(`nickname:${raw}`);
    }
  }

  return result;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();

  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const mode     = safeStr(body?.mode) ?? "audit";   // "audit" | "update" | "delete"
    const dryRun   = mode === "audit" || body?.dryRun !== false;
    const maxRows  = Math.max(1, Math.min(500, Number(body?.maxRows ?? 50)));
    const startAt  = Math.max(0, Number(body?.startAt ?? 0));
    const sleepMs  = Math.max(0, Number(body?.sleepMs ?? 400));
    const skipConfirmed = body?.skipConfirmed !== false; // default: skip rows already have division

    if (!["audit", "update", "delete"].includes(mode)) {
      return Response.json({ ok: false, error: "mode must be 'audit', 'update', or 'delete'" });
    }

    const base44 = createClientFromRequest(req);
    const School = base44?.entities?.School ?? base44?.entities?.Schools;
    if (!School?.filter) return Response.json({ ok: false, error: "School entity not available" });

    const stats: Record<string, any> = {
      mode, dryRun, startAt,
      scanned:          0,
      alreadyConfirmed: 0,  // had division/conference → skipped
      wikipediaFetched: 0,
      athleticsFound:   0,  // Wikipedia confirmed athletics program
      noAthleticsFound: 0,  // Wikipedia found but no athletics
      wikiNotFound:     0,  // couldn't find Wikipedia page
      updated:          0,  // wrote division/conference/nickname (update mode)
      deleted:          0,  // deleted row (delete mode)
      errors:           0,
      nextStartAt:      0,
      done:             false,
      elapsedMs:        0,
    };

    const confirmed:         any[] = [];  // already had division — sample only
    const athleticsFound:    any[] = [];  // Wikipedia confirmed — full list for update mode
    const flaggedForDeletion: any[] = []; // no athletics found — full list for delete mode
    const wikiNotFound:      any[] = [];  // couldn't resolve Wikipedia

    // ── Load slice ────────────────────────────────────────────────────────────
    const pageLimit = startAt + maxRows;
    const allRows   = await School.filter({}, "school_name", pageLimit);
    const slice     = (allRows || []).slice(startAt, startAt + maxRows);

    stats.scanned      = slice.length;
    stats.nextStartAt  = startAt + slice.length;
    stats.done         = slice.length < maxRows;

    for (const row of slice) {
      const schoolId   = safeStr(row?.id);
      const schoolName = safeStr(row?.school_name) || safeStr(row?.name);
      if (!schoolId || !schoolName) continue;

      const hasDivision   = !!safeStr(row?.division);
      const hasConference = !!safeStr(row?.conference);

      // ── Already confirmed ─────────────────────────────────────────────────
      if (skipConfirmed && (hasDivision || hasConference)) {
        stats.alreadyConfirmed++;
        if (confirmed.length < 5) {
          confirmed.push({ schoolId, school_name: schoolName, division: row.division, conference: row.conference });
        }
        continue;
      }

      // In delete mode, only process rows WITHOUT division (candidates for deletion)
      if (mode === "delete" && (hasDivision || hasConference)) {
        stats.alreadyConfirmed++;
        continue;
      }

      // ── Fetch Wikipedia ───────────────────────────────────────────────────
      await sleep(sleepMs);

      const wikiUrl = await getWikipediaUrl(schoolName);
      if (!wikiUrl) {
        stats.wikiNotFound++;
        wikiNotFound.push({ schoolId, school_name: schoolName });
        flaggedForDeletion.push({ schoolId, school_name: schoolName, reason: "wikipedia_not_found" });

        if (mode === "delete" && !dryRun) {
          try { await School.delete(schoolId); stats.deleted++; } catch { stats.errors++; }
        }
        continue;
      }

      stats.wikipediaFetched++;
      const { ok, html } = await fetchHtmlWithRetry(wikiUrl);
      if (!ok) {
        stats.errors++;
        continue;
      }

      const info = extractAthleticsFromHtml(html, wikiUrl);

      if (info.hasAthletics) {
        stats.athleticsFound++;
        athleticsFound.push({
          schoolId,
          school_name:      schoolName,
          division:         info.division,
          conference:       info.conference,
          nickname:         info.nickname,
          confidence:       info.confidence,
          wikipediaUrl:     wikiUrl,
          matchedPatterns:  info.matchedPatterns,
        });

        if (mode === "update" && !dryRun) {
          const patch: any = {};
          if (info.division  && !hasDivision)               patch.division           = info.division;
          if (info.conference && !hasConference)             patch.conference         = info.conference;
          if (info.nickname  && !safeStr(row?.athletics_nickname)) patch.athletics_nickname = info.nickname;
          if (Object.keys(patch).length) {
            try { await School.update(schoolId, patch); stats.updated++; } catch { stats.errors++; }
          }
        } else if (mode === "update") {
          // dry run — count what would be written
          stats.updated++;
        }
      } else {
        stats.noAthleticsFound++;
        flaggedForDeletion.push({
          schoolId,
          school_name:  schoolName,
          reason:       "no_sporting_affiliations_on_wikipedia",
          wikipediaUrl: wikiUrl,
          confidence:   info.confidence,
        });

        if (mode === "delete" && !dryRun) {
          try { await School.delete(schoolId); stats.deleted++; } catch { stats.errors++; }
        }
      }
    }

    stats.elapsedMs = Date.now() - t0;

    return Response.json({
      ok: true,
      stats,
      // Summary counts
      summary: [
        `Scanned: ${stats.scanned}`,
        `Already confirmed (division/conference set): ${stats.alreadyConfirmed}`,
        `Wikipedia fetched: ${stats.wikipediaFetched}`,
        `✅ Athletics program confirmed: ${stats.athleticsFound}`,
        `🚩 No athletics found (flagged for deletion): ${stats.noAthleticsFound}`,
        `❓ Wikipedia page not found: ${stats.wikiNotFound}`,
        mode === "update" ? `📝 Updated: ${stats.updated}` : null,
        mode === "delete" ? `🗑️  Deleted: ${stats.deleted}` : null,
      ].filter(Boolean),
      // Full lists for review / action
      athleticsFound:     athleticsFound.slice(0, 50),
      flaggedForDeletion: flaggedForDeletion.slice(0, 100),
      wikiNotFound:       wikiNotFound.slice(0, 50),
      confirmedSample:    confirmed,
    });

  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});