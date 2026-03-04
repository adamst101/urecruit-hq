// functions/ingestSchoolAthleticLogos.ts
// Base44 server function (Deno.serve) to enrich ATHLETIC logos (update-only).
//
// Writes to School fields:
// - athletic_logo_url
// - athletic_logo_source
// - athletic_logo_updated_at
// - athletic_logo_confidence
// - athletics_nickname       (bonus: stores the Wikidata athletics entity name e.g. "Arizona Wildcats")
//
// LOOKUP CHAIN (per school):
//   1. Search Wikidata for school name → university entity (Q)
//   2. Read P6364 (athletic department) from university entity → athletics entity (Q)
//   3. Read P154 (logo image) from athletics entity → logo file
//
//   Fallback if P6364 missing:
//   4. Read P742 (nickname) or P1813 (short name) from university entity
//   5. Search Wikidata for "{school} {nickname}" e.g. "Arizona Wildcats"
//   6. Read P154 from that entity
//
// WHY: University Wikidata pages rarely have P154 logos. The athletic department
// entity (e.g. Q4796711 "Arizona Wildcats") reliably has the athletics logo via P154.
//
// Request body:
// {
//   "dryRun": true,
//   "cursor": null,
//   "maxRows": 25,
//   "throttleMs": 500,
//   "timeBudgetMs": 25000,
//   "onlyMissing": true,
//   "force": false,
//   "minConfidence": 0.70
// }
//
// Page by passing next_cursor back as cursor until done: true.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

type Cursor = any;

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms || 0)));
}

function lc(x: any) {
  return String(x || "").toLowerCase().trim();
}

function safeStr(x: any): string | null {
  if (x == null) return null;
  const s = String(x).trim();
  return s || null;
}

function extractRows(resp: any) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  const cands = [resp.data, resp.items, resp.records];
  for (const c of cands) if (Array.isArray(c)) return c;
  return [];
}

function extractCursor(resp: any): Cursor | null {
  if (!resp || Array.isArray(resp)) return null;
  return resp.next_cursor ?? resp.nextCursor ?? null;
}

function isRetryable(e: any) {
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

async function fetchJsonWithRetry(url: string, tries = 3, backoffMs = 800) {
  let lastErr: any = null;
  for (let i = 0; i < tries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "CampConnectAthleticLogoBot/2.0" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      return await resp.json();
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (!isRetryable(e) || i === tries - 1) throw e;
      await sleep(backoffMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}

// ─── Wikidata helpers ─────────────────────────────────────────────────────────

async function wdSearch(query: string, limit = 5): Promise<Array<{ id: string; label: string; description: string }>> {
  const url =
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en` +
    `&limit=${limit}&search=${encodeURIComponent(query)}&origin=*`;
  const data = await fetchJsonWithRetry(url, 3, 800);
  return (data?.search || []).map((r: any) => ({
    id:          String(r?.id || ""),
    label:       String(r?.label || ""),
    description: String(r?.description || ""),
  }));
}

async function wdGetClaims(qid: string): Promise<Record<string, any[]>> {
  const url =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json` +
    `&ids=${encodeURIComponent(qid)}&props=claims%7Clabels&languages=en&origin=*`;
  const data = await fetchJsonWithRetry(url, 3, 800);
  return data?.entities?.[qid]?.claims || {};
}

function claimStringValue(claims: Record<string, any[]>, prop: string): string | null {
  const arr = claims[prop];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const dv = arr[0]?.mainsnak?.datavalue?.value;
  return typeof dv === "string" ? dv : null;
}

function claimEntityId(claims: Record<string, any[]>, prop: string): string | null {
  const arr = claims[prop];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const dv = arr[0]?.mainsnak?.datavalue?.value;
  return dv?.id ? String(dv.id) : null;
}

function commonsFilePath(fileName: string): string {
  const safe = encodeURIComponent(String(fileName).replace(/ /g, "_"));
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${safe}`;
}

function scoreCandidate(fileName: string): number {
  const n = lc(fileName);
  let score = 0.55;
  if (n.endsWith(".svg"))                              score += 0.30;
  if (n.endsWith(".png") || n.endsWith(".webp"))       score += 0.12;
  if (n.endsWith(".jpg") || n.endsWith(".jpeg"))       score -= 0.55;
  const hits = ["logo", "wordmark", "athletic", "athletics", "sports", "mark", "branding"]
    .filter((k) => n.includes(k)).length;
  score += Math.min(0.25, hits * 0.07);
  return Math.max(0, Math.min(0.99, score));
}

// ─── Main lookup chain ────────────────────────────────────────────────────────

interface LogoResult {
  url: string;
  source: string;
  confidence: number;
  fileName: string;
  athleticsEntityId: string | null;
  athleticsLabel: string | null;   // e.g. "Arizona Wildcats"
}

async function getAthleticLogoFromWikidata(
  schoolName: string,
  existingNickname?: string | null,
  athleticsWikipediaUrl?: string | null
): Promise<LogoResult | null> {

  // ── Step 0: Direct athletics Wikipedia URL (most reliable path) ───────────
  // If auditSchoolsAthletics stored the athletics program Wikipedia URL
  // (e.g. https://en.wikipedia.org/wiki/Arizona_Wildcats), use it directly
  // to search Wikidata — this bypasses university entity lookup entirely.
  if (athleticsWikipediaUrl) {
    const titleMatch = athleticsWikipediaUrl.match(/\/wiki\/([^#?]+)$/);
    if (titleMatch) {
      const athleticsTitle = decodeURIComponent(titleMatch[1].replace(/_/g, " "));
      const results = await wdSearch(athleticsTitle, 3);
      if (results.length) {
        const match = results[0]; // top result for exact athletics title should be correct
        const mClaims = await wdGetClaims(match.id);
        const fileName = claimStringValue(mClaims, "P154");
        if (fileName) {
          const confidence = scoreCandidate(fileName);
          return {
            url:               commonsFilePath(fileName),
            source:            `wikidata:athletics_wiki:${match.id}:P154`,
            confidence,
            fileName,
            athleticsEntityId: match.id,
            athleticsLabel:    match.label,
          };
        }
      }
    }
  }

  // ── Step 1: Find university Wikidata entity ───────────────────────────────
  const searchResults = await wdSearch(schoolName, 5);
  if (!searchResults.length) return null;

  const target = lc(schoolName);
  const universityEntity =
    searchResults.find((r) => lc(r.label) === target) ??
    searchResults.find((r) =>
      r.description.toLowerCase().includes("university") ||
      r.description.toLowerCase().includes("college")
    ) ??
    searchResults[0];

  const universityQid = universityEntity?.id;
  if (!universityQid) return null;

  const uClaims = await wdGetClaims(universityQid);

  // ── Step 2: P6364 → athletics department entity ───────────────────────────
  const athleticsQid = claimEntityId(uClaims, "P6364");

  if (athleticsQid) {
    const aClaims = await wdGetClaims(athleticsQid);
    const fileName = claimStringValue(aClaims, "P154");
    if (fileName) {
      const confidence = scoreCandidate(fileName);
      // Try to get the athletics entity label (e.g. "Arizona Wildcats")
      const aLabelUrl =
        `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json` +
        `&ids=${athleticsQid}&props=labels&languages=en&origin=*`;
      let athleticsLabel: string | null = null;
      try {
        const aLabelData = await fetchJsonWithRetry(aLabelUrl);
        athleticsLabel = aLabelData?.entities?.[athleticsQid]?.labels?.en?.value ?? null;
      } catch { /* non-fatal */ }

      return {
        url:               commonsFilePath(fileName),
        source:            `wikidata:${universityQid}:P6364:${athleticsQid}:P154`,
        confidence,
        fileName,
        athleticsEntityId: athleticsQid,
        athleticsLabel,
      };
    }
  }

  // ── Step 3: Nickname fallback ─────────────────────────────────────────────
  // Try P742 (nickname) or P1813 (short name) on the university entity,
  // or use the existing stored nickname if we have one.
  let nickname: string | null = existingNickname ?? null;

  if (!nickname) {
    nickname =
      claimStringValue(uClaims, "P742")  ??  // nickname
      claimStringValue(uClaims, "P1813") ??  // short name
      null;
  }

  if (nickname) {
    // Search for e.g. "Arizona Wildcats" or just "Wildcats" prefixed with school short name
    const shortName = schoolName
      .replace(/^university of /i, "")
      .replace(/\s+university$/i, "")
      .replace(/\s+college$/i, "")
      .trim();

    const queries = [
      `${shortName} ${nickname}`,   // "Arizona Wildcats"
      nickname,                       // "Wildcats" (less reliable)
    ];

    for (const q of queries) {
      const results = await wdSearch(q, 5);
      const match = results.find((r) =>
        r.description.toLowerCase().includes("athletic") ||
        r.description.toLowerCase().includes("ncaa") ||
        r.description.toLowerCase().includes("sport") ||
        r.description.toLowerCase().includes("team")
      ) ?? null;

      if (match) {
        const mClaims = await wdGetClaims(match.id);
        const fileName = claimStringValue(mClaims, "P154");
        if (fileName) {
          const confidence = scoreCandidate(fileName);
          return {
            url:               commonsFilePath(fileName),
            source:            `wikidata:${universityQid}:nickname:${match.id}:P154`,
            confidence,
            fileName,
            athleticsEntityId: match.id,
            athleticsLabel:    match.label,
          };
        }
      }
    }
  }

  // ── Step 4: P154 directly on university entity (last resort) ─────────────
  const directFileName = claimStringValue(uClaims, "P154");
  if (directFileName) {
    const confidence = scoreCandidate(directFileName) * 0.8; // discount — likely a seal/crest
    return {
      url:               commonsFilePath(directFileName),
      source:            `wikidata:${universityQid}:P154:direct`,
      confidence,
      fileName:          directFileName,
      athleticsEntityId: null,
      athleticsLabel:    null,
    };
  }

  return null;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();
  const debug: any = {
    version: "ingestSchoolAthleticLogos_2026-03-v3_p6364_chain",
    notes: [],
  };
  const stats: any = {
    scanned: 0,
    eligible: 0,
    updated: 0,
    skippedMissing: 0,
    skippedConfidence: 0,
    skippedPhoto: 0,
    notFound: 0,
    errors: 0,
    sources: { p6364: 0, nickname_fallback: 0, direct_p154: 0 },
    elapsedMs: 0,
  };
  const sample: any = { updated: [], errors: [], notFound: [] };

  const elapsed = () => Date.now() - t0;

  try {
    if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

    const body = await req.json().catch(() => ({}));

    const dryRun       = !!body?.dryRun;
    const cursor       = body?.cursor ?? null;
    const maxRows      = Math.max(1, Number(body?.maxRows ?? 25));
    const throttleMs   = Math.max(0, Number(body?.throttleMs ?? 500));
    const timeBudgetMs = Math.max(5000, Number(body?.timeBudgetMs ?? 25000));
    const onlyMissing  = body?.onlyMissing !== false;
    const force        = !!body?.force;
    const minConfidence = Math.max(0, Math.min(0.99, Number(body?.minConfidence ?? 0.70)));

    const base44 = createClientFromRequest(req);
    const School = (base44 as any)?.entities?.School ?? (base44 as any)?.entities?.Schools;

    if (!School || typeof School.list !== "function" || typeof School.update !== "function") {
      return json({ ok: false, error: "School entity not available" }, 500);
    }

    // Base44 uses filter() not list() — paginate via startAt offset
    const startAt = cursor ? Number(cursor) : 0;
    const pageLimit = startAt + maxRows;

    // Schema probe: confirm entity is reachable and check field names
    let schemaProbe: any = null;
    try {
      const probeRows: any[] = await School.filter({}, "school_name", 3);
      schemaProbe = {
        rowCount: probeRows?.length ?? 0,
        firstRowKeys: probeRows?.[0] ? Object.keys(probeRows[0]).slice(0, 20) : [],
        sample: probeRows?.[0] ?? null,
      };
    } catch (e: any) {
      schemaProbe = { error: String(e?.message || e) };
    }
    debug.schemaProbe = schemaProbe;

    // Fetch all schools sorted by name
    const allRows: any[] = await School.filter(
      {},
      "school_name",
      pageLimit
    );
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

      const schoolId   = String(row?.id ?? row?._id ?? row?.uuid ?? "");
      const schoolName = String(row?.name ?? row?.school_name ?? "");
      const existing   = String(row?.athletic_logo_url ?? "");
      const nickname   = String(row?.athletics_nickname ?? row?.nickname ?? "");

      if (!schoolId || !schoolName) { stats.skippedMissing++; continue; }

      // Skip non-athletics schools — must have division or conference populated
      // (scorecard import includes trade schools, beauty academies, etc. that have unitid
      // but are not NCAA/NAIA members and won't have Wikidata athletics entries)
      const hasDivision  = !!(row?.division  || row?.subdivision);
      const hasConference = !!row?.conference;
      if (!hasDivision && !hasConference) { stats.skippedMissing++; continue; }

      if (onlyMissing && existing && !force) {
        stats.skippedMissing++;
        continue;
      }

      stats.eligible++;

      let result: LogoResult | null = null;
      try {
        const athleticsWikiUrl = safeStr(row?.athletics_wikipedia_url);
        result = await getAthleticLogoFromWikidata(schoolName, nickname || null, athleticsWikiUrl);
      } catch (e: any) {
        stats.errors++;
        if (sample.errors.length < 10) {
          sample.errors.push({ schoolId, name: schoolName, error: String(e?.message || e) });
        }
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      if (!result?.url) {
        stats.notFound++;
        if (sample.notFound.length < 10) sample.notFound.push({ schoolId, name: schoolName });
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      const fn         = lc(result.fileName || "");
      const confidence = Number(result.confidence ?? 0);

      if (!force && confidence < minConfidence) {
        stats.skippedConfidence++;
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      if (!force && (fn.endsWith(".jpg") || fn.endsWith(".jpeg"))) {
        stats.skippedPhoto++;
        if (throttleMs > 0) await sleep(throttleMs);
        continue;
      }

      // Track which path found the logo
      if (result.source.includes("P6364"))       stats.sources.p6364++;
      else if (result.source.includes("nickname")) stats.sources.nickname_fallback++;
      else                                          stats.sources.direct_p154++;

      const updates: any = {
        athletic_logo_url:        result.url,
        athletic_logo_source:     result.source,
        athletic_logo_updated_at: new Date().toISOString(),
        athletic_logo_confidence: confidence,
      };

      // Bonus: store the athletics entity label as nickname if we found one
      if (result.athleticsLabel && !row?.athletics_nickname) {
        updates.athletics_nickname = result.athleticsLabel;
      }

      if (dryRun) {
        stats.updated++;
        if (sample.updated.length < 10) {
          sample.updated.push({ schoolId, name: schoolName, athleticsLabel: result.athleticsLabel, ...updates, dryRun: true });
        }
      } else {
        try {
          await School.update(schoolId, updates);
          stats.updated++;
          if (sample.updated.length < 10) {
            sample.updated.push({ schoolId, name: schoolName, athleticsLabel: result.athleticsLabel, ...updates });
          }
        } catch (e: any) {
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

  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e), stats, sample, debug }, 500);
  }
});