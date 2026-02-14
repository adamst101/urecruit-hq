// functions/seedSchoolsMaster_scorecard.ts
// FIXED: Uses createClientFromRequest instead of globalThis
import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

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

async function fetchScorecard(apiKey: string, page: number, perPage: number) {
  const fields = "id,school.name,school.city,school.state,school.school_url";
  const params = new URLSearchParams({
    api_key: apiKey,
    fields,
    per_page: String(perPage),
    page: String(page),
  });
  
  const url = `https://api.data.gov/ed/collegescorecard/v1/schools?${params}`;
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
      return Response.json({ error: "Method not allowed", stats, debug }, { status: 405 });
    }

    debug.step = "read_body";
    const body = await req.json().catch(() => ({}));

    const dryRun = !!body?.dryRun;
    const startPage = Number.isFinite(body?.page) ? Number(body.page) : 0;
    const perPage = Number.isFinite(body?.perPage) ? Number(body.perPage) : 100;
    const maxPages = Number.isFinite(body?.maxPages) ? Number(body.maxPages) : 1;

    debug.step = "init_sdk";
    const base44 = createClientFromRequest(req);
    const School = base44?.entities?.School || base44?.entities?.Schools;

    if (!School?.create || !School?.update || !School?.filter) {
      debug.errors.push("School entity methods not available");
      return Response.json({ error: "School entity not available", stats, debug });
    }

    debug.step = "resolve_secret";
    const apiKey = s(Deno.env.get("SCORECARD_API_KEY"));
    if (!apiKey) {
      debug.errors.push("Missing SCORECARD_API_KEY");
      return Response.json({ error: "Missing SCORECARD_API_KEY", stats, debug });
    }

    debug.step = "loop_pages";
    for (let p = startPage; p < startPage + maxPages; p++) {
      debug.step = `fetch_page_${p}`;
      const resp = await fetchScorecard(apiKey, p, perPage);
      debug.pageCalls.push({ page: p, http: resp.http });
      stats.pages += 1;

      if (resp.http >= 400) {
        debug.errors.push(`Scorecard HTTP ${resp.http} on page=${p}`);
        return Response.json({ error: `Scorecard HTTP ${resp.http}`, stats, debug });
      }

      const results: any[] = Array.isArray(resp?.json?.results) ? resp.json.results : [];
      if (!results.length) break;

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
          school_name: name,
          normalized_name: normName(name),
          source_platform: "scorecard",
          source_key: key,
          unitid: unitid,
          active: true,
          city: city,
          state: state,
          website_url: website,
          division: null,
          subdivision: null,
          conference: null,
          school_type: "College/University",
          country: "US",
          logo_url: null,
          last_seen_at: new Date().toISOString(),
        };

        const existing = await School.filter({ source_key: key });

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
    return Response.json({ stats, debug });
  } catch (e: any) {
    debug.errors.push(String(e?.message || e));
    return Response.json({ error: String(e?.message || e), stats, debug });
  }
});