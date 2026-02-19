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
  if (apple && apple[1]) {
    const href = String(apple[1]).trim();
    if (href && !href.startsWith("data:")) return href;
  }

  const icon = /<link[^>]+rel=["']icon["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(h);
  if (icon && icon[1]) {
    const href = String(icon[1]).trim();
    if (href && !href.startsWith("data:")) return href;
  }

  const logo = /<img[^>]*\blogo\b[^>]+src=["']([^"']+)["'][^>]*>/i.exec(h);
  if (logo && logo[1]) return String(logo[1]).trim();

  return null;
}

async function getOfficialSiteLogo(websiteUrl: string, debug: AnyObj): Promise<string | null> {
  const hr = await fetchTextWithRetry(websiteUrl, debug, 2, "text/html");
  if (!hr.ok) return null;

  const found = pickLogoFromHtml(hr.text);
  if (!found) return null;

  const u = s(found);
  if (!u) return null;

  if (u.startsWith("http")) return u;

  try {
    const base = new URL(websiteUrl);
    const abs = new URL(u, base).href;
    return abs;
  } catch {
    return null;
  }
}

async function fetchLogoForSchool(
  row: any,
  onlyMissing: boolean,
  preferWikimedia: boolean,
  force: boolean,
  debug: AnyObj
): Promise<{ logo_url: string | null; logo_source: string | null }> {
  const name = s(row.school_name);
  const website = s(row.website_url);
  const existing = s(row.logo_url);

  if (existing && !force) return { logo_url: existing, logo_source: s(row.logo_source) };
  if (!name) return { logo_url: null, logo_source: null };

  let logoUrl: string | null = null;
  let logoSource: string | null = null;

  if (preferWikimedia) {
    const wm = await getWikipediaThumbUrl(name, debug);
    if (wm) {
      logoUrl = wm;
      logoSource = "wikimedia";
    }
  }

  if (!logoUrl && website) {
    const off = await getOfficialSiteLogo(website, debug);
    if (off) {
      logoUrl = off;
      logoSource = "official";
    }
  }

  if (!logoUrl && website) {
    const dom = extractDomain(website);
    if (dom) {
      const cb = clearbitLogoUrlFromDomain(dom);
      if (cb) {
        logoUrl = cb;
        logoSource = "clearbit";
      }
    }
  }

  if (!logoUrl && !preferWikimedia) {
    const wm = await getWikipediaThumbUrl(name, debug);
    if (wm) {
      logoUrl = wm;
      logoSource = "wikimedia";
    }
  }

  return { logo_url: logoUrl, logo_source: logoSource };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const debug: AnyObj = { version: VERSION, notes: [], retries: 0 };
  const stats: AnyObj = {
    scanned: 0,
    eligible: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    sources: { wikimedia: 0, official: 0, clearbit: 0 },
    elapsedMs: 0,
  };

  const sample: AnyObj = { updated: [], errors: [] };
  let next_cursor: any | null = null;
  let done = false;

  function elapsed() {
    return Date.now() - t0;
  }
  function outOfTime(budgetMs: number) {
    return elapsed() >= budgetMs;
  }

  try {
    if (req.method !== "POST") return jsonResp({ ok: false, error: "Method not allowed" });

    const body = await req.json().catch(() => ({}));

    const dryRun = !!body?.dryRun;
    const cursor = body?.cursor ?? null;
    const maxRows = Math.max(1, Number(body?.maxRows ?? 50));
    const throttleMs = Math.max(0, Number(body?.throttleMs ?? 250));
    const timeBudgetMs = Math.max(5000, Number(body?.timeBudgetMs ?? 20000));
    const onlyMissing = body?.onlyMissing !== false;
    const preferWikimedia = body?.preferWikimedia !== false;
    const force = !!body?.force;

    const client = createClientFromRequest(req);
    const School = client?.entities?.School ?? client?.entities?.Schools;
    if (!School) return jsonResp({ ok: false, error: "School entity not found" });

    if (typeof School.list !== "function") {
      return jsonResp({ ok: false, error: "School.list is not a function" });
    }

    const listParams: any = { limit: maxRows };
    if (cursor) listParams.cursor = cursor;

    const resp = await School.list(listParams);
    const rows = extractRows(resp);
    next_cursor = extractCursor(resp);
    done = !next_cursor || rows.length === 0;

    stats.scanned = rows.length;

    for (const row of rows) {
      if (outOfTime(timeBudgetMs)) {
        done = false;
        debug.notes.push("stoppedEarly: out of time");
        break;
      }

      const id = getId(row);
      if (!id) {
        stats.skipped += 1;
        continue;
      }

      const existing = s(row.logo_url);
      if (onlyMissing && existing && !force) {
        stats.skipped += 1;
        continue;
      }

      stats.eligible += 1;

      const rowDebug: AnyObj = { id };
      try {
        const { logo_url, logo_source } = await fetchLogoForSchool(row, onlyMissing, preferWikimedia, force, rowDebug);

        if (!logo_url) {
          stats.skipped += 1;
          continue;
        }

        if (logo_source) {
          stats.sources[logo_source] = (stats.sources[logo_source] || 0) + 1;
        }

        if (!dryRun) {
          const payload: any = {
            logo_url,
            logo_source,
            logo_updated_at: new Date().toISOString(),
          };

          await writeRetry(() => School.update(id, payload), debug, `update_${id}`);
        }

        stats.updated += 1;

        if (sample.updated.length < 5) {
          sample.updated.push({
            id,
            name: s(row.school_name),
            logo_url,
            logo_source,
          });
        }
      } catch (e: any) {
        stats.errors += 1;
        if (sample.errors.length < 10) {
          sample.errors.push({
            id,
            name: s(row.school_name),
            error: String(e?.message || e).slice(0, 200),
          });
        }
      }

      if (throttleMs > 0) await sleep(throttleMs);
    }

    stats.elapsedMs = elapsed();

    return jsonResp({
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
    return jsonResp({
      ok: false,
      error: String(e?.message || e),
      stats,
      sample,
      debug,
      next_cursor,
      done,
    });
  }
});