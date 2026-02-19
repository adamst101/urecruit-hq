// functions/ingestSchoolLogos.ts
// Deno + Base44 backend function (JS-only style; no TS syntax)
//
// v7: Logo-safe approach.
// - Prefer: Wikidata logo (P154) / coat of arms (P94) when present
// - Fallback: Commons category scan for likely logo/seal files
// - LAST resort: Clearbit logo from school domain (if reliable)
// - Removes dangerous Wikipedia pageimages thumbnails (often random photos)
//
// Writes to School:
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
//   "probeOnly": false,             // diagnostics only
//   "minConfidence": 0.7            // 0..1, default 0.7
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

  if (typeof resp === "object") {
    const keys = Object.keys(resp);
    if (keys.length && keys.every((k) => /^\d+$/.test(k))) {
      return Object.values(resp);
    }
  }

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

function normalizeWikiTitle(title) {
  if (!title) return null;
  let t = String(title).trim();
  if (!t) return null;
  t = t.replace(/ /g, "_");
  return t;
}

function parseWikiTitleFromUrl(wikiUrl) {
  if (!wikiUrl || typeof wikiUrl !== "string") return null;
  if (!wikiUrl.includes("wikipedia.org/wiki/")) return null;
  const raw = (wikiUrl.split("/wiki/")[1] || "").split("#")[0];
  const title = raw ? decodeURIComponent(raw) : null;
  return normalizeWikiTitle(title);
}

async function wikipediaSearchTopTitle(name, debug) {
  const api = "https://en.wikipedia.org/w/api.php";
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    srsearch: name,
    srlimit: "1",
    origin: "*",
  });
  const data = await fetchJsonWithRetry(`${api}?${params.toString()}`, debug, 3);
  const hit = data && data.query && data.query.search && data.query.search[0] ? data.query.search[0] : null;
  const title = hit && hit.title ? hit.title : null;
  return normalizeWikiTitle(title);
}

async function wikipediaGetWikibaseItem(title, debug) {
  if (!title) return null;

  const api = "https://en.wikipedia.org/w/api.php";
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "pageprops",
    ppprop: "wikibase_item",
    titles: title,
    redirects: "1",
    origin: "*",
  });

  const data = await fetchJsonWithRetry(`${api}?${params.toString()}`, debug, 3);
  const pages = data && data.query && data.query.pages ? data.query.pages : null;
  if (!pages) return null;
  const firstKey = Object.keys(pages)[0];
  const page = pages[firstKey];
  const wb = page && page.pageprops && page.pageprops.wikibase_item ? page.pageprops.wikibase_item : null;
  return wb || null; // Qxxxx
}

async function wikidataGetLogoFileName(qid, debug) {
  if (!qid) return null;

  const endpoint = "https://www.wikidata.org/w/api.php";
  const params = new URLSearchParams({
    action: "wbgetclaims",
    format: "json",
    entity: qid,
    property: "P154", // logo image
    origin: "*",
  });

  const data = await fetchJsonWithRetry(`${endpoint}?${params.toString()}`, debug, 3);
  const claims = data && data.claims && data.claims.P154 ? data.claims.P154 : null;
  const claim = claims && claims[0] ? claims[0] : null;
  const dv = claim && claim.mainsnak && claim.mainsnak.datavalue ? claim.mainsnak.datavalue : null;
  const value = dv && dv.value ? dv.value : null; // filename on Commons
  return value || null;
}

async function wikidataGetCoatOfArmsFileName(qid, debug) {
  if (!qid) return null;

  const endpoint = "https://www.wikidata.org/w/api.php";
  const params = new URLSearchParams({
    action: "wbgetclaims",
    format: "json",
    entity: qid,
    property: "P94", // coat of arms image
    origin: "*",
  });

  const data = await fetchJsonWithRetry(`${endpoint}?${params.toString()}`, debug, 3);
  const claims = data && data.claims && data.claims.P94 ? data.claims.P94 : null;
  const claim = claims && claims[0] ? claims[0] : null;
  const dv = claim && claim.mainsnak && claim.mainsnak.datavalue ? claim.mainsnak.datavalue : null;
  const value = dv && dv.value ? dv.value : null;
  return value || null;
}

async function commonsImageInfoByFileName(fileName, debug) {
  if (!fileName) return null;
  const title = `File:${fileName}`;
  const api = "https://commons.wikimedia.org/w/api.php";
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "imageinfo",
    iiprop: "url|size|mime",
    titles: title,
    origin: "*",
  });

  const data = await fetchJsonWithRetry(`${api}?${params.toString()}`, debug, 3);
  const pages = data && data.query && data.query.pages ? data.query.pages : null;
  if (!pages) return null;
  const firstKey = Object.keys(pages)[0];
  const page = pages[firstKey];
  const ii = page && page.imageinfo && page.imageinfo[0] ? page.imageinfo[0] : null;
  if (!ii) return null;
  const url = ii.url;
  if (!isUrl(url)) return null;

  return {
    url,
    mime: ii.mime || null,
    width: ii.width || null,
    height: ii.height || null,
  };
}

function looksLikeLogoFileName(fn) {
  if (!fn || typeof fn !== "string") return false;
  const s = fn.toLowerCase();
  return (
    s.includes("logo") ||
    s.includes("seal") ||
    s.includes("wordmark") ||
    s.includes("athletics") ||
    s.includes("sports") ||
    s.includes("emblem")
  );
}

async function commonsCategoryLikelyLogo(title, debug) {
  // Try Category:<Title> then scan member files that look like logo/seal.
  // This is a best-effort fallback when Wikidata lacks P154.
  if (!title) return null;

  const cat = `Category:${title.replace(/_/g, " ")}`;
  const api = "https://commons.wikimedia.org/w/api.php";

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "categorymembers",
    cmtitle: cat,
    cmtype: "file",
    cmlimit: "50",
    origin: "*",
  });

  const data = await fetchJsonWithRetry(`${api}?${params.toString()}`, debug, 3);
  const members = data && data.query && data.query.categorymembers ? data.query.categorymembers : [];
  if (!members || !members.length) return null;

  // Score candidates
  let best = null;
  for (const m of members) {
    const t = m && m.title ? m.title : null; // "File:...."
    if (!t || !t.startsWith("File:")) continue;
    const fileName = t.slice("File:".length);
    if (!looksLikeLogoFileName(fileName)) continue;

    // Prefer SVG/PNG by filename
    const low = fileName.toLowerCase();
    let score = 0.6;
    if (low.endsWith(".svg")) score += 0.2;
    if (low.endsWith(".png")) score += 0.1;
    if (low.includes("seal")) score += 0.05;
    if (low.includes("logo")) score += 0.1;

    if (!best || score > best.score) best = { fileName, score };
  }

  if (!best) return null;

  const info = await commonsImageInfoByFileName(best.fileName, debug);
  if (!info) return null;

  return { url: info.url, confidence: best.score, source: "wikimedia:commons:category-scan" };
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

  // Avoid obvious non-institutional domains (optional guard)
  if (domain.endsWith(".edu") === false && domain.endsWith(".org") === false && domain.endsWith(".com") === false) {
    return null;
  }

  return { url: `https://logo.clearbit.com/${domain}`, confidence: 0.65, source: "clearbit:logo" };
}

function shouldProcess(school, onlyMissing, force) {
  if (force) return true;
  if (!onlyMissing) return true;
  return !(school && school.logo_url);
}

async function resolveWikimediaLogoSafe(school, debug) {
  const wikiUrl = school && (school.wikipedia_url || school.wikipedia) ? (school.wikipedia_url || school.wikipedia) : null;
  const name = school && (school.school_name || school.name) ? (school.school_name || school.name) : null;

  // Step 1: get Wikipedia title
  let title = parseWikiTitleFromUrl(wikiUrl);
  if (!title && name && typeof name === "string" && name.trim().length >= 3) {
    title = await wikipediaSearchTopTitle(name.trim(), debug);
  }
  if (!title) return null;

  // Step 2: map to Wikidata item
  const qid = await wikipediaGetWikibaseItem(title, debug);
  if (!qid) {
    // Try commons category scan by title anyway
    const catTry = await commonsCategoryLikelyLogo(title, debug);
    if (catTry) return { url: catTry.url, confidence: catTry.confidence, source: catTry.source };
    return null;
  }

  // Step 3: Wikidata logo (P154)
  const logoFile = await wikidataGetLogoFileName(qid, debug);
  if (logoFile) {
    const info = await commonsImageInfoByFileName(logoFile, debug);
    if (info && isUrl(info.url)) {
      // High confidence because it is an explicit logo property
      return { url: info.url, confidence: 0.95, source: "wikimedia:wikidata:P154-logo" };
    }
  }

  // Step 4: Coat of arms (P94) for some institutions (medium confidence)
  const coatFile = await wikidataGetCoatOfArmsFileName(qid, debug);
  if (coatFile) {
    const info = await commonsImageInfoByFileName(coatFile, debug);
    if (info && isUrl(info.url)) {
      return { url: info.url, confidence: 0.8, source: "wikimedia:wikidata:P94-coatofarms" };
    }
  }

  // Step 5: Commons category scan (best-effort)
  const catTry = await commonsCategoryLikelyLogo(title, debug);
  if (catTry) return { url: catTry.url, confidence: catTry.confidence, source: catTry.source };

  return null;
}

Deno.serve(async (req) => {
  const startedAtMs = Date.now();
  const startedAt = nowIso();
  const version = "ingestSchoolLogos_2026-02-19_v7";

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

    const onlyMissing = body.onlyMissing !== false;
    const preferWikimedia = body.preferWikimedia !== false;
    const force = !!body.force;

    const minConfidence = clampNum(body.minConfidence, 0.7, 0, 1);

    const cursor = body.cursor || null;
    const offset = clampNum(cursor && cursor.offset != null ? cursor.offset : 0, 0, 0, 10000000);

    // Diagnostics counts (best effort)
    let listCount = null;
    let filterCount = null;

    try {
      const r = await School.list({ limit: 5 });
      listCount = extractRows(r).length;
    } catch (e) {
      listCount = `ERR:${String(e && e.message ? e.message : e)}`;
    }

    let allRows = [];
    try {
      const r = await School.filter({});
      allRows = extractRows(r);
      filterCount = allRows.length;
    } catch (e) {
      filterCount = `ERR:${String(e && e.message ? e.message : e)}`;
      allRows = [];
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

    const windowRows = allRows.slice(offset, offset + maxRows);

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
          sample.errors.push({
            stage: "id",
            err: "missing school id",
            name: school?.school_name || school?.name || null,
          });
        }
        continue;
      }

      let resolved = null;

      if (preferWikimedia) {
        try {
          resolved = await resolveWikimediaLogoSafe(school, debug);
          if (resolved) stats.sources.wikimedia++;
        } catch (e) {
          if (sample.errors.length < 10) {
            sample.errors.push({ stage: "wikimedia", err: String(e && e.message ? e.message : e), schoolId });
          }
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

      if ((resolved.confidence || 0) < minConfidence) {
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
          confidence: resolved.confidence,
          dryRun,
        });
      }

      if (throttleMs) await sleep(throttleMs);
    }

    const nextOffset = offset + windowRows.length;
    const done = nextOffset >= allRows.length;
    const next_cursor = done ? null : { offset: nextOffset };

    stats.elapsedMs = Date.now() - startedAtMs;

    debug.notes.push(`windowRows=${windowRows.length}`);
    debug.notes.push(`offset=${offset}`);
    debug.notes.push(`listCount=${listCount}`);
    debug.notes.push(`filterCount=${filterCount}`);
    debug.notes.push(`minConfidence=${minConfidence}`);

    return Response.json({ ok: true, dryRun, done, next_cursor, stats, sample, debug });
  } catch (e) {
    return Response.json({ ok: false, error: String(e && e.message ? e.message : e), debug }, { status: 500 });
  }
});