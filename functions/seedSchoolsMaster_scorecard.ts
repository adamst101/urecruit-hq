// functions/seedSchoolsMaster_scorecard.js
// Deno + Base44 backend function (JS-only: no TS syntax)
// Fetches College Scorecard schools and returns normalized rows for School upsert.
// Does NOT write to DB. Frontend handles upserts with throttling.
// Adds retry + debug so intermittent 500s are diagnosable.

function s(x) {
  if (x === null || x === undefined) return null;
  const t = String(x).trim();
  return t ? t : null;
}

function lc(x) {
  return String(x || "").toLowerCase().trim();
}

function normName(x) {
  return lc(x)
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKey(org, name, state) {
  const n = normName(name);
  const st = state ? lc(state) : "na";
  return `${org}:${n}:${st}`;
}

function isRetryableStatus(st) {
  return st === 429 || st === 500 || st === 502 || st === 503 || st === 504;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonWithRetry(url, debug, tries) {
  let lastErr = null;

  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
          Accept: "application/json",
        },
      });

      debug.last_http = r.status;
      debug.last_url = url;

      const text = await r.text();
      debug.last_body_snippet = text ? text.slice(0, 500) : null;

      if (!r.ok) {
        if (isRetryableStatus(r.status) && i < tries - 1) {
          const wait = Math.min(8000, 600 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
          debug.retries = (debug.retries || 0) + 1;
          debug.retry_notes = debug.retry_notes || [];
          debug.retry_notes.push({ attempt: i + 1, http: r.status, wait_ms: wait });
          await sleep(wait);
          continue;
        }
        throw new Error(`Scorecard HTTP ${r.status}`);
      }

      // Parse JSON safely (Scorecard sometimes returns HTML error pages)
      try {
        return JSON.parse(text);
      } catch (e) {
        if (i < tries - 1) {
          const wait = Math.min(8000, 600 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
          debug.retries = (debug.retries || 0) + 1;
          debug.retry_notes = debug.retry_notes || [];
          debug.retry_notes.push({ attempt: i + 1, http: r.status, wait_ms: wait, note: "json_parse_failed" });
          await sleep(wait);
          continue;
        }
        throw new Error(`Scorecard invalid JSON (http ${r.status})`);
      }
    } catch (e) {
      lastErr = e;
      const msg = String(e && e.message ? e.message : e);

      if (i < tries - 1) {
        const wait = Math.min(8000, 600 * Math.pow(2, i)) + Math.floor(Math.random() * 250);
        debug.retries = (debug.retries || 0) + 1;
        debug.retry_notes = debug.retry_notes || [];
        debug.retry_notes.push({ attempt: i + 1, error: msg, wait_ms: wait });
        await sleep(wait);
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr || new Error("Scorecard fetch failed");
}

Deno.serve(async (req) => {
  const debug = {
    startedAt: new Date().toISOString(),
    pageCalls: [],
    retries: 0,
    retry_notes: [],
    last_http: null,
    last_url: null,
    last_body_snippet: null,
    errors: [],
  };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const page = Number(body && body.page !== undefined ? body.page : 0);
    const perPage = Math.max(1, Math.min(100, Number(body && body.perPage !== undefined ? body.perPage : 100)));
    const maxPages = Math.max(1, Math.min(10, Number(body && body.maxPages !== undefined ? body.maxPages : 1)));

    const apiKey = (Deno.env.get("SCORECARD_API_KEY") || "").trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing SCORECARD_API_KEY", debug }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const fields = ["id", "school.name", "school.city", "school.state", "school.school_url"].join(",");

    const rowsOut = [];

    for (let p = page; p < page + maxPages; p++) {
      const urlObj = new URL("https://api.data.gov/ed/collegescorecard/v1/schools");
      urlObj.searchParams.set("api_key", apiKey);
      urlObj.searchParams.set("fields", fields);
      urlObj.searchParams.set("per_page", String(perPage));
      urlObj.searchParams.set("page", String(p));

      const url = urlObj.toString();

      const data = await fetchJsonWithRetry(url, debug, 5);

      debug.pageCalls.push({ page: p, http: debug.last_http });

      const results = Array.isArray(data && data.results) ? data.results : [];
      for (const r of results) {
        const id = s(r && r.id);
        const name = s(r && r["school.name"]);
        const city = s(r && r["school.city"]);
        const state = s(r && r["school.state"]);
        const site = s(r && r["school.school_url"]);

        if (!name) continue;

        rowsOut.push({
          unitid: id,
          school_name: name,
          normalized_name: normName(name),
          city: city,
          state: state,
          website_url: site,
          source_platform: "scorecard",
          source_key: buildKey("scorecard", name, state),
        });
      }

      // likely end-of-dataset
      if (results.length < perPage) break;
    }

    // redact key from debug URLs if editor prints them somewhere else
    const safeDebug = {
      startedAt: debug.startedAt,
      pageCalls: debug.pageCalls,
      retries: debug.retries,
      retry_notes: debug.retry_notes,
      last_http: debug.last_http,
      last_body_snippet: debug.last_body_snippet,
      errors: debug.errors,
    };

    return new Response(JSON.stringify({ rows: rowsOut, stats: { fetched: rowsOut.length }, debug: safeDebug }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    debug.errors.push(msg);
    return new Response(JSON.stringify({ error: msg, debug }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
