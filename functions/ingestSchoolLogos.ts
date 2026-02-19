// functions/ingestSchoolLogos.ts
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

type AnyObj = Record<string, any>;

const VERSION = "ingestSchoolLogos_2026-02-19_v1";

function s(x: any): string | null {
  if (x === null || x === undefined) return null;
  const t = String(x).trim();
  return t ? t : null;
}

function lc(x: any): string {
  return String(x || "").toLowerCase().trim();
}

function getId(r: any): string | null {
  const v = r?.id ?? r?._id ?? r?.uuid;
  return v === null || v === undefined ? null : String(v);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms || 0))));
}

function isRetryableStatus(st: number): boolean {
  return st === 429 || st === 500 || st === 502 || st === 503 || st === 504;
}

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

function extractRows(resp: any): any[] {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  const cands = [resp.data, resp.items, resp.records, resp.results, resp.rows];
  for (const c of cands) if (Array.isArray(c)) return c;
  if (resp.data && Array.isArray(resp.data.data)) return resp.data.data;
  return [];
}

function extractCursor(resp: any): any | null {
  if (!resp || Array.isArray(resp)) return null;
  return resp.next_cursor ?? resp.nextCursor ?? resp.next_page_token ?? resp.nextPageToken ?? resp.cursor_next ?? null;
}

function jsonResp(payload: any): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function fetchTextWithRetry(
  url: string,
  debug: AnyObj,
  tries: number,
  accept: string
): Promise<{ ok: boolean; status: number; text: string }> {
  let lastErr: any = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
          Accept: accept,
        },
      });

      const txt = await safeText(r);
      debug.last_http = r.status;
      debug.last_url = url;
      debug.last_body_snippet = txt ? txt.slice(0, 500) : null;

      if (!r.ok) {
        if (isRetryableStatus(r.status) && i < tries - 1) {
          const wait = Math.min(12000, 650 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
          debug.retries = (debug.retries || 0) + 1;
          debug.retry_notes = debug.retry_notes || [];
          debug.retry_notes.push({ attempt: i + 1, http: r.status, wait_ms: wait, kind: "http" });
          await sleep(wait);
          continue;
        }
        return { ok: false, status: r.status, text: txt };
      }
      return { ok: true, status: r.status, text: txt };
    } catch (e: any) {
      lastErr = e;
      if (i < tries - 1) {
        const wait = Math.min(12000, 650 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
        debug.retries = (debug.retries || 0) + 1;
        debug.retry_notes = debug.retry_notes || [];
        debug.retry_notes.push({ attempt: i + 1, wait_ms: wait, kind: "exception", error: String(e?.message || e) });
        await sleep(wait);
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr || new Error("fetchTextWithRetry failed");
}

async function writeRetry<T>(fn: () => Promise<T>, debug: AnyObj, label: string): Promise<T> {
  const tries = 5;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const msg = String(e?.message || e);
      const status = e?.raw?.status || e?.status || e?.statusCode;
      const retryable =
        status === 429 ||
        (typeof status === "number" && status >= 500) ||
        lc(msg).includes("rate") ||
        lc(msg).includes("timeout") ||
        lc(msg).includes("network") ||
        lc(msg).includes("502") ||
        lc(msg).includes("503") ||
        lc(msg).includes("504");
      if (!retryable || i === tries - 1) throw e;

      const wait = Math.min(12000, 450 * Math.pow(2, i)) + Math.floor(Math.random() * 200);
      debug.retries = (debug.retries || 0) + 1;
      debug.retry_notes = debug.retry_notes || [];
      debug.retry_notes.push({ attempt: i + 1, wait_ms: wait, kind: "write_retry", label, msg: msg.slice(0, 160) });
      await sleep(wait);
    }
  }
  throw new Error("writeRetry failed");
}

function isStableWikimedia(url: string | null): boolean {
  const u = lc(url || "");
  return u.includes("upload.wikimedia.org") || u.includes("wikimedia") || u.includes("wikipedia.org");
}

function extractDomain(url: string | null): string | null {
  const u = s(url);
  if (!u) return null;
  try {
    const parsed = new URL(u.includes("://") ? u : `https://${u}`);
    const host = lc(parsed.hostname);
    return host ? host.replace(/^www\./, "") : null;
  } catch {
    const cleaned = lc(u)
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .trim();
    return cleaned || null;
  }
}

function clearbitLogoUrlFromDomain(domain: string | null): string | null {
  const d = s(domain);
  if (!d) return null;
  return `https://logo.clearbit.com/${encodeURIComponent(d)}`;
}

async function getWikipediaThumbUrl(schoolName: string, debug: AnyObj): Promise<string | null> {
  const q1 = `${schoolName} logo`;
  const q2 = schoolName;
  const queries = [q1, q2];

  for (const q of queries) {
    const searchUrl =
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&srsearch=` +
      encodeURIComponent(q) +
      `&format=json&origin=*`;

    const sr = await fetchTextWithRetry(searchUrl, debug, 3, "application/json");
    if (!sr.ok) continue;

    let sj: any = null;
    try {
      sj = sr.text ? JSON.parse(sr.text) : null;
    } catch {
      sj = null;
    }
    const title = sj?.query?.search?.[0]?.title ? String(sj.query.search[0].title) : null;
    if (!title) continue;

    const imgUrl =
      `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&pithumbsize=600&titles=` +
      encodeURIComponent(title) +
      `&format=json&origin=*`;

    const pr = await fetchTextWithRetry(imgUrl, debug, 3, "application/json");
    if (!pr.ok) continue;

    let pj: any = null;
    try {
      pj = pr.text ? JSON.parse(pr.text) : null;
    } catch {
      pj = null;
    }

    const pages = pj?.query?.pages || {};
    const pageKeys = Object.keys(pages);
    for (const k of pageKeys) {
      const thumb = pages?.[k]?.thumbnail?.source ? String(pages[k].thumbnail.source) : null;
      if (!thumb) continue;
      if (isStableWikimedia(thumb)) return thumb;
    }
  }

  return null;
}

function pickLogoFromHtml(html: string): string | null {
  const h = String(html || "");
  if (!h) return null;

  const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i.exec(h);
  if (og && og[1]) return String(og[1]).trim();

  const apple = /<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(h);
  if (apple && apple[1]) return String(apple[1]).trim();

  const icon = /<link[^>]+rel=["'](?:shortcut\s+icon|icon)["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(h);
  if (icon && icon[1]) return String(icon[1]).trim();

  const imgRe = /<img[^>]+>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(h)) !== null) {
    const tag = m[0] || "";
    const tagLc = tag.toLowerCase();
    if (!tagLc.includes("logo")) continue;
    const srcM = /src=["']([^"']+)["']/i.exec(tag);
    if (srcM && srcM[1]) return String(srcM[1]).trim();
  }

  return null;
}

function absUrl(baseUrl: string, maybeRelative: string | null): string | null {
  const u = s(maybeRelative);
  if (!u) return null;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return "https:" + u;
  try {
    return new URL(u, baseUrl).toString();
  } catch {
    return u;
  }
}

async function getOfficialSiteLogoUrl(candidateSiteUrl: string, debug: AnyObj): Promise<string | null> {
  const site = s(candidateSiteUrl);
  if (!site) return null;

  const resp = await fetchTextWithRetry(site, debug, 3, "text/html,*/*");
  if (!resp.ok) return null;

  const raw = pickLogoFromHtml(resp.text);
  const resolved = absUrl(site, raw);
  return resolved;
}

function chooseCandidateSiteUrl(school: any): string | null {
  const cands = [
    school?.athletics_url,
    school?.athletics_site_url,
    school?.official_athletics_url,
    school?.website_url,
    school?.school_url,
  ];
  for (const c of cands) {
    const u = s(c);
    if (u) return u;
  }
  return null;
}

Deno.serve(async (req) => {
  const debug: AnyObj = { version: VERSION, startedAt: new Date().toISOString(), notes: [], retries: 0 };

  try {
    if (req.method !== "POST") return jsonResp({ ok: false, error: "Method not allowed", debug });

    const body = (await req.json().catch(() => null)) || {};
    const dryRun = !!body.dryRun;
    const cursorIn = body.cursor ?? null;
    const maxRows = Math.max(1, Math.min(250, Number(body.maxRows ?? 50)));
    const throttleMs = Math.max(0, Math.min(5000, Number(body.throttleMs ?? 250)));
    const timeBudgetMs = Math.max(2000, Math.min(22000, Number(body.timeBudgetMs ?? 20000)));
    const onlyMissing = body.onlyMissing === undefined ? true : !!body.onlyMissing;
    const preferWikimedia = body.preferWikimedia === undefined ? true : !!body.preferWikimedia;
    const force = !!body.force;

    const startedAtMs = Date.now();
    const elapsed = () => Date.now() - startedAtMs;
    const outOfTime = () => elapsed() >= timeBudgetMs;

    const client = createClientFromRequest(req);
    const School = (client as any)?.entities?.School || (client as any)?.entities?.Schools;
    if (!School || typeof School.list !== "function" || typeof School.update !== "function") {
      return jsonResp({ ok: false, error: "Missing School entity bindings", debug });
    }

    let cursor: any = cursorIn;
    let next_cursor: any = cursorIn;
    let done = false;

    const stats: AnyObj = {
      scanned: 0,
      eligible: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      sources: { wikimedia: 0, official: 0, clearbit: 0 },
      elapsedMs: 0,
    };

    const sample: AnyObj = { updated: [] as any[], errors: [] as any[] };

    const SCAN_CAP = Math.max(maxRows * 8, 200);

    while (!outOfTime() && stats.updated < maxRows && stats.scanned < SCAN_CAP) {
      let resp: any = null;
      try {
        resp = await School.list({ where: {}, limit: 100, cursor });
      } catch {
        try {
          resp = await School.list({ where: {}, limit: 100, next_cursor: cursor });
        } catch {
          resp = await School.list({ limit: 100, offset: stats.scanned });
        }
      }

      const rows = extractRows(resp);
      const c = extractCursor(resp);
      next_cursor = c ?? null;

      if (!rows.length) {
        done = true;
        break;
      }

      for (const row of rows) {
        if (outOfTime() || stats.updated >= maxRows || stats.scanned >= SCAN_CAP) break;

        stats.scanned += 1;

        const id = getId(row);
        const name = s(row?.school_name) || s(row?.name);
        if (!id || !name) {
          stats.skipped += 1;
          continue;
        }

        const existingLogo = s(row?.logo_url) || s(row?.school_logo_url) || null;
        const shouldUpdate = force || (!existingLogo ? true : !onlyMissing);
        if (!shouldUpdate) {
          stats.skipped += 1;
          continue;
        }

        stats.eligible += 1;

        let chosenUrl: string | null = null;
        let chosenSource: string | null = null;

        if (preferWikimedia) {
          try {
            const wm = await getWikipediaThumbUrl(name, debug);
            if (wm) {
              chosenUrl = wm;
              chosenSource = "wikimedia";
            }
          } catch (e: any) {
            debug.notes.push(`wikimedia_err:${String(e?.message || e).slice(0, 80)}`);
          }
        }

        if (!chosenUrl) {
          const site = chooseCandidateSiteUrl(row);
          if (site) {
            try {
              const off = await getOfficialSiteLogoUrl(site, debug);
              if (off) {
                chosenUrl = off;
                chosenSource = "official";
              }
            } catch (e: any) {
              debug.notes.push(`official_err:${String(e?.message || e).slice(0, 80)}`);
            }
          }
        }

        if (!chosenUrl) {
          const domain = extractDomain(s(row?.website_url) || s(row?.school_url) || null);
          const cb = clearbitLogoUrlFromDomain(domain);
          if (cb) {
            chosenUrl = cb;
            chosenSource = "clearbit";
          }
        }

        if (!chosenUrl || !chosenSource) {
          stats.skipped += 1;
          continue;
        }

        if (!force && isStableWikimedia(existingLogo) && !isStableWikimedia(chosenUrl)) {
          stats.skipped += 1;
          continue;
        }

        const patch: AnyObj = {
          logo_url: chosenUrl,
          logo_source: chosenSource,
          logo_updated_at: new Date().toISOString(),
        };

        try {
          if (!dryRun) {
            await writeRetry(() => School.update(String(id), patch), debug, `School.update(${id})`);
          }
          stats.updated += 1;
          stats.sources[chosenSource] = (stats.sources[chosenSource] || 0) + 1;
          if (sample.updated.length < 15) sample.updated.push({ id, name, logo_source: chosenSource, logo_url: chosenUrl });
        } catch (e: any) {
          stats.errors += 1;
          if (sample.errors.length < 15) sample.errors.push({ id, name, error: String(e?.message || e).slice(0, 220) });
        }

        if (throttleMs) await sleep(throttleMs);
      }

      cursor = next_cursor;
      if (!next_cursor) {
        done = true;
        break;
      }
    }

    stats.elapsedMs = elapsed();

    const hardStop = outOfTime() || stats.updated >= maxRows;
    if (!done && !hardStop) done = false;

    return jsonResp({
      ok: true,
      dryRun,
      done: done && !next_cursor,
      next_cursor: next_cursor,
      stats,
      sample,
      debug,
    });
  } catch (e: any) {
    return jsonResp({ ok: false, error: String(e?.message || e), debug });
  }
});