// functions/enrichSchoolsMaster_scorecard.ts
// Enrich School master with UNITID + city/state + website_url via College Scorecard API.
// Requires backend secret: SCORECARD_API_KEY
//
// Design goals:
// - Never throw (avoid Base44 500s)
// - Return stats + debug so you can see what's happening
// - Confidence gate on name matching

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

function tokenScore(a: string, b: string) {
  const A = normName(a);
  const B = normName(b);
  if (!A || !B) return 0;
  if (A === B) return 100;

  const ta = new Set(A.split(" ").filter(Boolean));
  const tb = new Set(B.split(" ").filter(Boolean));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const denom = Math.max(ta.size, tb.size, 1);
  return Math.round((inter / denom) * 100);
}

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

async function scorecardSearch(apiKey: string, name: string, state?: string | null) {
  const fields = ["id", "school.name", "school.city", "school.state", "school.school_url"].join(",");

  const params = new URLSearchParams();
  params.set("api_key", apiKey);
  params.set("fields", fields);
  params.set("per_page", "10");
  params.set("school.name", name);
  if (state) params.set("school.state", state);

  const url = `https://api.data.gov/ed/collegescorecard/v1/schools?${params.toString()}`;

  const r = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; Base44Bot/1.0)",
    },
  });

  const txt = await safeText(r);

  let json: any = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    json = null;
  }

  return { http: r.status, url, txt, json };
}

async function listAllSchools(School: any): Promise<any[]> {
  if (School && typeof School.filter === "function") {
    const rows = await School.filter({});
    return Array.isArray(rows) ? rows : [];
  }
  if (School && typeof School.list === "function") {
    try {
      const rows = await School.list({ where: {} });
      return Array.isArray(rows) ? rows : [];
    } catch {
      const rows = await School.list({});
      return Array.isArray(rows) ? rows : [];
    }
  }
  if (School && typeof School.all === "function") {
    const rows = await School.all();
    return Array.isArray(rows) ? rows : [];
  }
  return [];
}

function jsonResp(payload: AnyRec) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const stats: AnyRec = {
    apiKeyPresent: false,
    apiKeyPrefix: null,
    apiKeyWhere: null,
    candidates: 0,
    matched: 0,
    updated: 0,
    noMatch: 0,
    errors: 0,
  };

  const debug: AnyRec = {
    startedAt: new Date().toISOString(),
    notes: [],
    errors: [],
    samples: [],
    secretTries: {},
    scorecard: { last_http: null, last_url: null, last_body_snippet: null },
  };

  try {
    if (req.method !== "POST") return jsonResp({ error: "Method not allowed", stats, debug });

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body?.dryRun;
    const batchLimit = Number(body?.batchLimit || 75);

    // Try multiple secret sources
    let apiKey: string | null = null;
    
    try {
      const denoKey = (globalThis as any)?.Deno?.env?.get?.("SCORECARD_API_KEY");
      debug.secretTries.deno = !!denoKey;
      if (denoKey) {
        apiKey = s(denoKey);
        stats.apiKeyWhere = "Deno.env.get";
      }
    } catch {
      debug.secretTries.deno = "error";
    }

    if (!apiKey) {
      try {
        const procKey = (globalThis as any)?.process?.env?.SCORECARD_API_KEY;
        debug.secretTries.process = !!procKey;
        if (procKey) {
          apiKey = s(procKey);
          stats.apiKeyWhere = "process.env";
        }
      } catch {
        debug.secretTries.process = "error";
      }
    }

    if (!apiKey) {
      try {
        const base44Key = (globalThis as any)?.base44?.secrets?.SCORECARD_API_KEY;
        debug.secretTries.base44Secrets = !!base44Key;
        if (base44Key) {
          apiKey = s(base44Key);
          stats.apiKeyWhere = "base44.secrets";
        }
      } catch {
        debug.secretTries.base44Secrets = "error";
      }
    }

    stats.apiKeyPresent = !!apiKey;
    stats.apiKeyPrefix = apiKey ? String(apiKey).slice(0, 6) + "…" : null;

    const School =
      (globalThis as any)?.base44?.entities?.School ||
      (globalThis as any)?.base44?.entities?.Schools;

    if (!School) {
      stats.errors += 1;
      debug.errors.push("School entity not found on globalThis.base44.entities");
      return jsonResp({ stats, debug });
    }

    if (!apiKey) {
      debug.notes.push("SCORECARD_API_KEY not present to backend runtime.");
      return jsonResp({ stats, debug });
    }

    const all = await listAllSchools(School);
    const candidates = all
      .filter((r) => {
        const name = s(r?.school_name) || s(r?.name);
        if (!name) return false;
        return !s(r?.unitid) || !s(r?.city) || !s(r?.state) || !s(r?.website_url);
      })
      .slice(0, batchLimit);

    stats.candidates = candidates.length;

    // Probe request so you can see if egress/key works
    if (candidates.length > 0) {
      const probe = await scorecardSearch(apiKey, "Harvard University", "MA");
      debug.scorecard.last_http = probe.http;
      debug.scorecard.last_url = probe.url;
      debug.scorecard.last_body_snippet = probe.txt ? probe.txt.slice(0, 220) : null;

      if (probe.http >= 400) {
        stats.errors += 1;
        debug.errors.push(`Scorecard probe failed HTTP ${probe.http}. Key invalid, blocked egress, or rate limit.`);
        return jsonResp({ stats, debug });
      }
    }

    for (const r of candidates) {
      const id = s(r?.id);
      const name = s(r?.school_name) || s(r?.name);
      if (!id || !name) continue;

      const st = s(r?.state) || null;

      try {
        const resp = await scorecardSearch(apiKey, name, st);
        debug.scorecard.last_http = resp.http;
        debug.scorecard.last_url = resp.url;
        debug.scorecard.last_body_snippet = resp.txt ? resp.txt.slice(0, 220) : null;

        const arr = Array.isArray(resp?.json?.results) ? resp.json.results : [];
        if (!arr.length) {
          stats.noMatch += 1;
          continue;
        }

        let best = arr[0];
        let bestScore = -1;

        for (const c of arr) {
          const candName = c?.["school.name"] || c?.school?.name || "";
          const sc = tokenScore(name, String(candName));
          if (sc > bestScore) {
            bestScore = sc;
            best = c;
          }
        }

        if (bestScore < 85) {
          stats.noMatch += 1;
          continue;
        }

        stats.matched += 1;

        const patch: AnyRec = {};
        const unitid = best?.id != null ? String(best.id) : null;
        const city = best?.["school.city"] || best?.school?.city || null;
        const state = best?.["school.state"] || best?.school?.state || null;
        const url = best?.["school.school_url"] || best?.school?.school_url || null;

        if (!s(r?.unitid) && unitid) patch.unitid = unitid;
        if (!s(r?.city) && s(city)) patch.city = s(city);
        if (!s(r?.state) && s(state)) patch.state = s(state);
        if (!s(r?.website_url) && s(url)) patch.website_url = s(url);

        if (Object.keys(patch).length === 0) continue;

        if (dryRun) {
          if (debug.samples.length < 8) debug.samples.push({ school_id: id, name, matchScore: bestScore, patch });
          continue;
        }

        if (typeof School.update !== "function") {
          stats.errors += 1;
          debug.errors.push("School.update is not available on this entity.");
          break;
        }

        await School.update(String(id), patch);
        stats.updated += 1;
      } catch (e) {
        stats.errors += 1;
        debug.errors.push(`Row failed (school_id=${id}): ${String((e as any)?.message || e)}`);
      }
    }

    return jsonResp({ stats, debug, sample: debug.samples });
  } catch (e) {
    stats.errors += 1;
    debug.errors.push("Fatal: " + String((e as any)?.message || e));
    return jsonResp({ stats, debug });
  }
});