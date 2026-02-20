// functions/ingestSchoolAthleticLogos.ts
// Server-side logo enrichment for School rows (NO creates; update-only).
//
// Goals:
// - Populate School.logo_url, School.logo_source, School.logo_updated_at
// - Source priority (best-effort):
//   1) Wikimedia (via Wikipedia API pageimages)
//   2) Official site hints (favicon/og:image/logo-ish img)
//   3) Fallback logo service (Clearbit) using School.website_url domain
//
// Operating constraints:
// - Batch-safe: cursor + maxRows + throttleMs + timeBudgetMs
// - Idempotent updates: always update by existing School id
// - Safe retries on transient errors / rate limits
//
// Request body:
// {
//   "dryRun": true,
//   "cursor": null,
//   "maxRows": 50,
//   "throttleMs": 250,
//   "timeBudgetMs": 20000,
//   "onlyMissing": true,
//   "preferWikimedia": true,
//   "force": false
// }
//
// Response:
// {
//   ok: true,
//   dryRun,
//   done,
//   next_cursor,
//   stats: { scanned, eligible, updated, skipped, errors, sources: { wikimedia, official, clearbit }, elapsedMs },
//   sample: { updated: [...], errors: [...] },
//   debug: { version, notes, retries }
// }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms || 0)));
}

function lc(x: any) {
  return String(x || "").toLowerCase().trim();
}

function norm(x: any) {
  return lc(x).replace(/[^a-z0-9]+/g, " ").trim();
}

function extractRows(resp: any) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  const cands = [resp.data, resp.items, resp.records];
  for (const c of cands) if (Array.isArray(c)) return c;
  return [];
}

function extractCursor(resp: any) {
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
    msg.includes("network")
  );
}

async function fetchWithRetry(url: string, tries = 3, backoffMs = 500): Promise<Response> {
  let lastErr: any = null;
  for (let i = 0; i < tries; i++) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "URecruitHQ-LogoBot/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      return resp;
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e) || i === tries - 1) throw e;
      await sleep(backoffMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}

async function fetchWikimediaLogo(schoolName: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(schoolName);
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&titles=${query}&pithumbsize=300&pilimit=1`;
    
    const resp = await fetchWithRetry(url);
    if (!resp.ok) return null;
    
    const json = await resp.json();
    const pages = json?.query?.pages || {};
    const page = Object.values(pages)[0] as any;
    
    if (!page || page.missing) return null;
    
    const thumb = page?.thumbnail?.source;
    return thumb && typeof thumb === "string" ? thumb : null;
  } catch {
    return null;
  }
}

async function fetchOfficialLogo(websiteUrl: string): Promise<string | null> {
  if (!websiteUrl) return null;
  
  try {
    const resp = await fetchWithRetry(websiteUrl);
    if (!resp.ok) return null;
    
    const html = await resp.text();
    
    // Try og:image
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogMatch?.[1]) return ogMatch[1];
    
    // Try common logo patterns
    const logoMatch = html.match(/<img[^>]+(?:class|id)=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']+)["']/i);
    if (logoMatch?.[1]) {
      const src = logoMatch[1];
      return src.startsWith("http") ? src : new URL(src, websiteUrl).href;
    }
    
    return null;
  } catch {
    return null;
  }
}

function getClearbitLogo(websiteUrl: string): string | null {
  if (!websiteUrl) return null;
  
  try {
    const url = new URL(websiteUrl);
    return `https://logo.clearbit.com/${url.hostname}`;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const debug: any = { version: "ingestSchoolAthleticLogos_2026-02-20_v1", notes: [], retries: 0 };
  const stats: any = {
    scanned: 0,
    eligible: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    sources: { wikimedia: 0, official: 0, clearbit: 0 },
    elapsedMs: 0,
  };
  const sample: any = { updated: [], errors: [] };

  function elapsed() {
    return Date.now() - t0;
  }

  function outOfTime(budgetMs: number) {
    return elapsed() >= budgetMs;
  }

  try {
    if (req.method !== "POST") {
      return Response.json({ ok: false, error: "POST only" });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const cursor = body?.cursor ?? null;
    const maxRows = Math.max(1, Number(body?.maxRows ?? 50));
    const throttleMs = Math.max(0, Number(body?.throttleMs ?? 250));
    const timeBudgetMs = Math.max(5000, Number(body?.timeBudgetMs ?? 20000));
    const onlyMissing = body?.onlyMissing !== false;
    const preferWikimedia = body?.preferWikimedia !== false;
    const force = !!body?.force;

    const base44 = createClientFromRequest(req);
    const School = base44?.entities?.School ?? base44?.entities?.Schools;
    
    if (!School || typeof School.list !== "function" || typeof School.update !== "function") {
      return Response.json({ ok: false, error: "School entity not available" });
    }

    const listParams: any = { limit: maxRows };
    if (cursor) listParams.cursor = cursor;

    const resp = await School.list(listParams);
    const rows = extractRows(resp);
    const next_cursor = extractCursor(resp);
    const done = !next_cursor || rows.length === 0;

    stats.scanned = rows.length;

    for (const row of rows) {
      if (outOfTime(timeBudgetMs)) {
        debug.notes.push("stopped_early_time_budget");
        break;
      }

      const schoolId = row?.id ?? row?._id ?? row?.uuid;
      const schoolName = row?.school_name || "";
      const websiteUrl = row?.website_url || "";
      const existingLogo = row?.logo_url || "";

      if (!schoolId) {
        stats.skipped++;
        continue;
      }

      if (onlyMissing && existingLogo && !force) {
        stats.skipped++;
        continue;
      }

      stats.eligible++;

      let logoUrl: string | null = null;
      let logoSource: string | null = null;

      // Try Wikimedia first (if preferred)
      if (preferWikimedia && schoolName) {
        logoUrl = await fetchWikimediaLogo(schoolName);
        if (logoUrl) {
          logoSource = "wikimedia";
          stats.sources.wikimedia++;
        }
      }

      // Try official site
      if (!logoUrl && websiteUrl) {
        logoUrl = await fetchOfficialLogo(websiteUrl);
        if (logoUrl) {
          logoSource = "official";
          stats.sources.official++;
        }
      }

      // Try Clearbit fallback
      if (!logoUrl && websiteUrl) {
        logoUrl = getClearbitLogo(websiteUrl);
        if (logoUrl) {
          logoSource = "clearbit";
          stats.sources.clearbit++;
        }
      }

      if (!logoUrl) {
        stats.skipped++;
        continue;
      }

      const updates = {
        logo_url: logoUrl,
        logo_source: logoSource,
        logo_updated_at: new Date().toISOString(),
      };

      if (dryRun) {
        stats.updated++;
        if (sample.updated.length < 5) {
          sample.updated.push({ id: schoolId, school_name: schoolName, ...updates });
        }
      } else {
        try {
          await School.update(String(schoolId), updates);
          stats.updated++;
          if (sample.updated.length < 5) {
            sample.updated.push({ id: schoolId, school_name: schoolName, ...updates });
          }
        } catch (e: any) {
          stats.errors++;
          if (sample.errors.length < 5) {
            sample.errors.push({ id: schoolId, school_name: schoolName, error: String(e?.message || e) });
          }
        }
      }

      if (throttleMs > 0) await sleep(throttleMs);
    }

    stats.elapsedMs = elapsed();

    return Response.json({
      ok: true,
      dryRun,
      done,
      next_cursor,
      stats,
      sample,
      debug,
    });
  } catch (e: any) {
    stats.elapsedMs = elapsed();
    return Response.json({
      ok: false,
      error: String(e?.message || e),
      stats,
      sample,
      debug,
    });
  }
});