// functions/ingestSchoolLogos.ts
// Deno + Base44 backend function (JS-only style; no TS syntax used)
//
// Goal: write School logos to fields:
// - logo_url, logo_source, logo_updated_at
//
// Input:
// {
//   "dryRun": true,
//   "cursor": null,                 // or { "offset": 0 }
//   "maxRows": 25,                  // 1..250
//   "throttleMs": 250,              // 0..5000
//   "timeBudgetMs": 20000,          // 3000..22000
//   "onlyMissing": true,            // default true
//   "preferWikimedia": true,        // default true
//   "force": false,                 // default false
//   "probeOnly": false              // if true: does no work, returns diagnostics + version
// }
//
// Output:
// { ok, dryRun, done, next_cursor, stats, sample, debug }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function nowIso() {
  return new Date().toISOString();
}

function clampNum(x, def, min, max) {
  const n = Number(x);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms || 0)));
}

function isRetryableStatus(st) {
  return st === 429 || st === 500 || st === 502 || st === 503 || st === 504;
}

async function safeText(r) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

function extractRows(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;

  const cands = [resp.data, resp.items, resp.records, resp.results, resp.rows];
  for (const c of cands) if (Array.isArray(c)) return c;

  if (resp.data && Array.isArray(resp.data.data)) return resp.data.data;
  if (resp.data && Array.isArray(resp.data.items)) return resp.data.items;
  if (resp.data && Array.isArray(resp.data.records)) return resp.data.records;

  return [];
}

function isUrl(s) {
  return typeof s === "string" && /^https?:\/\//i.test(s);
}

async function fetchJsonWithRetry(url, debug, tries) {
  let lastErr = null;

  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      debug.last_http = r.status;
      debug.last_url = url;

      const text = await safeText(r);
      debug.last_body_snippet = text ? text.slice(0, 300) : null;

      if (!r.ok) {
        if (isRetryableStatus(r.status) && i < tries - 1) {
          const wait = Math.min(12000, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
          debug.retries = (debug.retries || 0) + 1;
          debug.retry_notes = debug.retry_notes || [];
          debug.retry_notes.push({ attempt: i + 1, http: r.status, wait_ms: wait, kind: "http" });
          await sleep(wait);
          continue;
        }
        throw new Error(`HTTP ${r.status}`);
      }

      try {
        return JSON.parse(text);
      } catch {
        if (i < tries - 1) {
          const wait = Math.min(12000, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
          debug.retries = (debug.retries || 0) + 1;
          debug.retry_notes = debug.retry_notes || [];
          debug.retry_notes.push({ attempt: i + 1, http: r.status, wait_ms: wait, kind: "json_parse_failed" });
          await sleep(wait);
          continue;
        }
        throw new Error("Invalid JSON");
      }
    } catch (e) {
      lastErr = e;
      const msg = String(e && e.message ? e.message : e);
      if (i < tries - 1) {
        const wait = Math.min(12000, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
        debug.retries = (debug.retries || 0) + 1;
        debug.retry_notes = debug.retry_notes || [];
        debug.retry_notes.push({ attempt: i + 1, error: msg, wait_ms: wait, kind: "exception" });
        await sleep(wait);
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr || new Error("fetchJsonWithRetry failed");
}

async function resolveWikimediaLogo(school, debug) {
  const wikiUrl = school && (school.wikipedia_url || school.wikipedia) ? (school.wikipedia_url || school.wikipedia) : null;
  const name = school && (school.school_name || school.name) ? (school.school_name || school.name) : null;

  async function pageThumbByTitle(title) {
    const api = "https://en.wikipedia.org/w/api.php";
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "pageimages",
      pithumbsize: "320",
      titles: title,
      redirects: "1",
      origin: "*",
    });
    const data = await fetchJsonWithRetry(`${api}?${params.toString()}`, debug, 3);
    const pages = data && data.query && data.query.pages ? data.query.pages : null;
    if (!pages) return null;
    const firstKey = Object.keys(pages)[0];
    const page = pages[firstKey];
    const thumb = page && page.thumbnail && page.thumbnail.source ? page.thumbnail.source : null;
    return isUrl(thumb) ? thumb : null;
  }

  // 1) Use wikipedia_url if present
  if (wikiUrl && typeof wikiUrl === "string" && wikiUrl.includes("wikipedia.org/wiki/")) {
    const raw = (wikiUrl.split("/wiki/")[1] || "").split("#")[0];
    const title = raw ? decodeURIComponent(raw) : null;
    if (title) {
      const thumb = await pageThumbByTitle(title);
      if (thumb) return { url: thumb, source: "wikimedia:wikipedia:pageimage" };
    }
  }

  // 2) Search by name
  if (name && typeof name === "string" && name.trim().length >= 3) {
    const api = "https://en.wikipedia.org/w/api.php";
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      list: "search",
      srsearch: name.trim(),
      srlimit: "1",
      origin: "*",
    });
    const data = await fetchJsonWithRetry(`${api}?${params.toString()}`, debug, 3);
    const hit = data && data.query && data.query.search && data.query.search[0] ? data.query.search[0] : null;
    const title = hit && hit.title ? hit.title : null;
    if (title) {
      const thumb = await pageThumbByTitle(title);
      if (thumb) return { url: thumb, source: "wikimedia:wikipedia:search+pageimage" };
    }
  }

  return null;
}

function resolveClearbitLogo(school) {
  const site = school && (school.school_url || school.website || school.url)
    ? (school.school_url || school.website || school.url)
    : null;

  if (!site || typeof site !== "string") return null;

  let domain = site.trim();
  domain = domain.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  domain = (domain.split("/")[0] || "").trim();
  if (!domain || domain.includes(" ")) return null;

  return { url: `https://logo.clearbit.com/${domain}`, source: "clearbit:logo" };
}

function shouldProcess(school, onlyMissing, force) {
  if (force) return true;
  if (!onlyMissing) return true;
  return !(school && school.logo_url);
}

Deno.serve(async (req) => {
  const startedAtMs = Date.now();
  const startedAt = nowIso();
  const version = "ingestSchoolLogos_2026-02-19_v5";

  const debug = { version, startedAt, notes: [], retries: 0 };

  try {
    const base44 = createClientFromRequest(req);
    const School = base44?.entities?.School || base44?.entities?.Schools;

    if (!School) {
      return Response.json({ ok: false, error: "Missing School entity binding", debug }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));

    const probeOnly = !!body.probeOnly;

    const dryRun = !!body.dryRun;
    const maxRows = clampNum(body.maxRows, 25, 1, 250);
    const throttleMs = clampNum(body.throttleMs, 250, 0, 5000);
    const timeBudgetMs = clampNum(body.timeBudgetMs, 20000, 3000, 22000);

    const onlyMissing = body.onlyMissing !== false;        // default true
    const preferWikimedia = body.preferWikimedia !== false; // default true
    const force = !!body.force;

    const cursor = body.cursor || null;
    const offset = clampNum(cursor && cursor.offset != null ? cursor.offset : 0, 0, 0, 10000000);

    // Diagnostics: confirm data access shape
    let listCount = null;
    let filterCount = null;
    try {
      const r = await School.list({ limit: 5 });
      listCount = extractRows(r).length;
    } catch (e) {
      listCount = `ERR:${String(e && e.message ? e.message : e)}`;
    }
    try {
      const r = await School.filter({});
      filterCount = extractRows(r).length;
    } catch (e) {
      filterCount = `ERR:${String(e && e.message ? e.message : e)}`;
    }

    if (probeOnly) {
      debug.notes.push("probeOnly=true");
      debug.notes.push(`listCount=${listCount}`);
      debug.notes.push(`filterCount=${filterCount}`);
      return Response.json({
        ok: true,
        dryRun,
        done: true,
        next_cursor: null,
        stats: {
          scanned: 0,
          eligible: 0,
          updated: 0,
          skipped: 0,
          errors: 0,
          sources: { wikimedia: 0, official: 0, clearbit: 0 },
          elapsedMs: Date.now() - startedAtMs,
        },
        sample: { updated: [], errors: [] },
        debug,
      });
    }

    const stats = {
      scanned: 0,
      eligible: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      sources: { wikimedia: 0, official: 0, clearbit: 0 },
      elapsedMs: 0,
    };

    const sample = { updated: [], errors: [] };

    // Pull a window via filter(); if SDK supports limit/offset, use it; else slice
    let windowRows = [];
    try {
      let resp = null;

      // Some SDK builds accept (query, opts)
      if (School.filter && School.filter.length >= 2) {
        resp = await School.filter({}, { limit: maxRows, offset });
        windowRows = extractRows(resp);
      } else {
        resp = await School.filter({});
        const all = extractRows(resp);
        windowRows = all.slice(offset, offset + maxRows);
      }
    } catch (e) {
      stats.errors++;
      sample.errors.push({ stage: "read", err: String(e && e.message ? e.message : e) });
      stats.elapsedMs = Date.now() - startedAtMs;
      debug.notes.push(`listCount=${listCount}`);
      debug.notes.push(`filterCount=${filterCount}`);
      return Response.json({ ok: false, dryRun, done: true, next_cursor: null, stats, sample, debug });
    }

    if (!windowRows.length) {
      stats.elapsedMs = Date.now() - startedAtMs;
      debug.notes.push("no rows in window");
      debug.notes.push(`offset=${offset}`);
      debug.notes.push(`listCount=${listCount}`);
      debug.notes.push(`filterCount=${filterCount}`);
      return Response.json({ ok: true, dryRun, done: true, next_cursor: null, stats, sample, debug });
    }

    for (const school of windowRows) {
      if (Date.now() - startedAtMs > timeBudgetMs - 750) break;

      stats.scanned++;

      if (!shouldProcess(school, onlyMissing, force)) {
        stats.skipped++;
        continue;
      }

      stats.eligible++;

      const schoolId = school?.id || school?._id || null;
      if (!schoolId) {
        stats.errors++;
        if (sample.errors.length < 10) {
          sample.errors.push({ stage: "id", err: "missing school id", name: school?.school_name || school?.name || null });
        }
        continue;
      }

      let resolved = null;

      // NOTE: "official athletics site" resolver is intentionally not implemented yet
      // because we don't have a reliable athletics_url field in School in this app.
      // We'll add it once you confirm where athletics URLs are stored (SchoolSportSite, AthleticsMembership, etc).

      if (preferWikimedia) {
        try {
          resolved = await resolveWikimediaLogo(school, debug);
          if (resolved) stats.sources.wikimedia++;
        } catch (e) {
          // don't fail the batch for a single lookup
          if (sample.errors.length < 10) sample.errors.push({ stage: "wikimedia", err: String(e && e.message ? e.message : e), schoolId });
        }
      }

      if (!resolved) {
        resolved = resolveClearbitLogo(school);
        if (resolved) stats.sources.clearbit++;
      }

      if (!resolved) {
        stats.skipped++;
        continue;
      }

      const patch = {
        logo_url: resolved.url,
        logo_source: resolved.source,
        logo_updated_at: nowIso(),
      };

      if (!dryRun) {
        try {
          await School.update(schoolId, patch);
        } catch (e) {
          stats.errors++;
          if (sample.errors.length < 10) {
            sample.errors.push({ stage: "update", err: String(e && e.message ? e.message : e), schoolId });
          }
          continue;
        }
      }

      stats.updated++;
      if (sample.updated.length < 10) {
        sample.updated.push({
          schoolId,
          name: school?.school_name || school?.name || null,
          logo_url: patch.logo_url,
          logo_source: patch.logo_source,
          dryRun,
        });
      }

      if (throttleMs) await sleep(throttleMs);
    }

    const nextOffset = offset + windowRows.length;
    const done = windowRows.length < maxRows;
    const next_cursor = done ? null : { offset: nextOffset };

    stats.elapsedMs = Date.now() - startedAtMs;

    debug.notes.push(`windowRows=${windowRows.length}`);
    debug.notes.push(`offset=${offset}`);
    debug.notes.push(`listCount=${listCount}`);
    debug.notes.push(`filterCount=${filterCount}`);

    return Response.json({ ok: true, dryRun, done, next_cursor, stats, sample, debug });
  } catch (e) {
    return Response.json({ ok: false, error: String(e && e.message ? e.message : e), debug }, { status: 500 });
  }
});