// functions/seedSchoolsMaster_scorecard.ts
// Deno + Base44 backend
//
// Seeds/updates School from College Scorecard API.
// Requires SCORECARD_API_KEY in Base44 secrets.
//
// Body:
// {
//   dryRun?: boolean,
//   page?: number,        // start page
//   perPage?: number,     // default 100
//   maxPages?: number     // default 1
// }

type AnyRec = Record<string, any>;

function s(x: any) {
  if (x === null || x === undefined) return null;
  const t = String(x).trim();
  return t ? t : null;
}

function lc(x: any) {
  return String(x || "").toLowerCase().trim();
}

function normName(x: any) {
  return lc(x)
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildKey(unitid: string) {
  return `scorecard:${unitid}`;
}

function makeUrl(apiKey: string, page: number, perPage: number) {
  const fields = "id,school.name,school.city,school.state,school.school_url";
  const qs =
    "api_key=" +
    encodeURIComponent(apiKey) +
    "&fields=" +
    encodeURIComponent(fields) +
    "&per_page=" +
    encodeURIComponent(String(perPage)) +
    "&page=" +
    encodeURIComponent(String(page));
  return "https://api.data.gov/ed/collegescorecard/v1/schools?" + qs;
}

async function fetchScorecard(apiKey: string, page: number, perPage: number) {
  const url = makeUrl(apiKey, page, perPage);
  const r = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
    },
  });
  const txt = await r.text().catch(() => "");
  let json: any = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    json = null;
  }
  return { http: r.status, url, txt, json };
}

async function listBySourceKey(School: any, key: string) {
  try {
    const rows = await School.filter({ source_key: key });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  const debug: AnyRec = {
    startedAt: new Date().toISOString(),
    step: "init",
    pageCalls: [],
    errors: [],
    sample: [],
  };

  const stats = { created: 0, updated: 0, skipped: 0, pages: 0 };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed", stats, debug }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    debug.step = "read_body";
    const body = await req.json().catch(() => ({}));

    const dryRun = !!body?.dryRun;
    const startPage = Number.isFinite(body?.page) ? Number(body.page) : 0;
    const perPage = Number.isFinite(body?.perPage) ? Number(body.perPage) : 100;
    const maxPages = Number.isFinite(body?.maxPages) ? Number(body.maxPages) : 1;

    debug.step = "resolve_school_entity";
    const School =
      (globalThis as any)?.base44?.entities?.School ||
      (globalThis as any)?.base44?.entities?.Schools;

    if (!School?.create || !School?.update || !School?.filter) {
      debug.errors.push("School entity not available on globalThis.base44.entities");
      return new Response(JSON.stringify({ error: "School entity not available.", stats, debug }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    debug.step = "resolve_secret";
    const apiKey = s(Deno.env.get("SCORECARD_API_KEY"));
    if (!apiKey) {
      debug.errors.push("Missing SCORECARD_API_KEY (not visible in function runtime).");
      return new Response(JSON.stringify({ error: "Missing SCORECARD_API_KEY", stats, debug }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    debug.step = "loop_pages";
    for (let p = startPage; p < startPage + maxPages; p++) {
      debug.step = `fetch_page_${p}`;
      const resp = await fetchScorecard(apiKey, p, perPage);
      debug.pageCalls.push({ page: p, http: resp.http, url: resp.url });
      stats.pages += 1;

      if (resp.http >= 400) {
        debug.errors.push(`Scorecard HTTP ${resp.http} on page=${p}`);
        debug.errors.push(resp.txt ? resp.txt.slice(0, 220) : "no body");
        return new Response(JSON.stringify({ error: `Scorecard HTTP ${resp.http}`, stats, debug }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const results: any[] = Array.isArray(resp?.json?.results) ? resp.json.results : [];
      if (!results.length) {
        debug.step = `no_results_page_${p}`;
        break;
      }

      debug.step = `process_rows_page_${p}`;
      for (const r of results) {
        const unitid = r?.id != null ? String(r.id) : null;
        const name = s(r?.["school.name"] || r?.school?.name);
        const city = s(r?.["school.city"] || r?.school?.city);
        const state = s(r?.["school.state"] || r?.school?.state);
        const website = s(r?.["school.school_url"] || r?.school?.school_url);

        if (!unitid || !name) {
          stats.skipped += 1;
          continue;
        }

        const key = buildKey(unitid);

        const payload: AnyRec = {
          // Identity
          school_name: name,
          normalized_name: normName(name),

          // Source control
          source_platform: "scorecard",
          source_key: key,
          unitid: unitid,
          active: true,

          // Discover fields
          city: city,
          state: state,
          website_url: website,

          // Athletics fields (fill later)
          division: null,
          subdivision: null,
          conference: null,
          school_type: "College/University",
          country: "US",

          // Logo later
          logo_url: null,

          last_seen_at: new Date().toISOString(),
        };

        const existing = await listBySourceKey(School, key);

        if (dryRun) {
          if (debug.sample.length < 10) {
            debug.sample.push({
              mode: existing.length ? "would_update" : "would_create",
              unitid,
              name,
              state,
            });
          }
          continue;
        }

        if (existing.length && existing[0]?.id) {
          await School.update(String(existing[0].id), payload);
          stats.updated += 1;
        } else {
          await School.create(payload);
          stats.created += 1;
        }
      }
    }

    debug.step = "done";
    return new Response(JSON.stringify({ stats, debug }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    debug.errors.push(String(e?.message || e));
    return new Response(JSON.stringify({ error: String(e?.message || e), stats, debug }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});