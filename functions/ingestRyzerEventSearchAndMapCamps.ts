// functions/ingestRyzerEventSearchAndMapCamps.ts
//
// Pulls Ryzer eventSearch results and (in dryRun by default) shows event schema.
// Also matches events to your Camps by Ryzer numeric camp id in rlink (id=12345).
//
// IMPORTANT:
// - Do NOT hardcode tokens in this file.
// - Pass ryzerAuth token in payload when running.
//
// Payload (POST JSON):
// {
//   "dryRun": true,
//   "seasonYear": 2026,
//   "ryzerAuth": "<JWT from browser>",
//   "search": { ...same body you captured... },
//   "maxPages": 1
// }
//
// Next step after this: once we see event keys, we’ll extract host_name/host_site_url (if present)
// and perform School mapping deterministically.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const ENDPOINT = "https://ryzer.com/rest/controller/connect/event/eventSearch/";

function asArray<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function safeString(x: any): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
}

function normalizeUrl(u: string | null): string | null {
  const s = safeString(u);
  if (!s) return null;
  return s.replace(/#.*$/, "").trim();
}

function extractRyzerNumericCampId(url: string | null): string | null {
  const s = safeString(url);
  if (!s) return null;
  try {
    const u = new URL(s);
    const id = u.searchParams.get("id");
    if (!id) return null;
    const trimmed = id.trim();
    return trimmed ? trimmed : null;
  } catch {
    const m = s.match(/[?&]id=(\d+)/i);
    return m?.[1] ? String(m[1]) : null;
  }
}

async function ryzerEventSearch(ryzerAuth: string, searchBody: any) {
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-type": "application/json; charset=UTF-8",
      authorization: String(ryzerAuth),
      Origin: "https://ryzer.com",
      Referer: "https://ryzer.com/events/?tab=eventSearch",
    },
    body: JSON.stringify(searchBody || {}),
  });

  const status = resp.status;
  const text = await resp.text().catch(() => "");
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  // ✅ Ryzer returns json.data as a STRING of JSON. Decode it.
  let decodedData: any = null;
  if (json && typeof json === "object") {
    const d = json?.data;
    if (typeof d === "string" && d.trim().startsWith("{")) {
      try {
        decodedData = JSON.parse(d);
      } catch {
        decodedData = null;
      }
    } else if (d && typeof d === "object") {
      decodedData = d;
    }
  }

  return { status, text, json, decodedData };
}

function extractEvents(decodedData: any): any[] {
  if (!decodedData) return [];
  if (Array.isArray(decodedData)) return decodedData;
  if (Array.isArray(decodedData?.events)) return decodedData.events;
  if (Array.isArray(decodedData?.Events)) return decodedData.Events;
  if (decodedData?.data && Array.isArray(decodedData.data?.events)) return decodedData.data.events;
  if (decodedData?.data && Array.isArray(decodedData.data?.Events)) return decodedData.data.Events;
  return [];
}

Deno.serve(async (req) => {
  const t0 = Date.now();

  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false; // default true
    const seasonYear = Number(body?.seasonYear || 0);
    const ryzerAuth = safeString(body?.ryzerAuth);
    const search = body?.search || null;

    const maxPages = Math.max(1, Number(body?.maxPages ?? 1));

    if (!ryzerAuth) return Response.json({ ok: false, error: "ryzerAuth required (from browser request)" });
    if (!search) return Response.json({ ok: false, error: "search body required" });

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;

    if (!Camp || typeof Camp.filter !== "function") {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }

    const stats: any = {
      seasonYear,
      pagesFetched: 0,
      eventsSeen: 0,
      campsMatched: 0,
      dryRun,
      elapsedMs: 0,
    };

    const debug: any = {
      ryzerTopKeys: [],
      ryzerDecodedKeys: [],
      ryzerSnippet: "",
      decodedSnippet: "",
      sampleEventKeys: [],
      sampleEvent: null,
      sampleMatches: [],
      notes: [],
    };

    // Preload camps for season to match by numeric id in URL
    const camps = seasonYear
      ? asArray<any>(await Camp.filter({ season_year: seasonYear }, "-start_date", 5000))
      : asArray<any>(await Camp.filter({}, "-start_date", 5000));

    const byRyzerNumericId = new Map<string, any[]>();
    for (const c of camps) {
      const regUrl = safeString(c?.source_url) || safeString(c?.link_url) || safeString(c?.url);
      const nurl = normalizeUrl(regUrl);
      const rid = extractRyzerNumericCampId(nurl);
      if (!rid) continue;
      const arr = byRyzerNumericId.get(rid) || [];
      arr.push(c);
      byRyzerNumericId.set(rid, arr);
    }

    for (let page = 0; page < maxPages; page++) {
      const pageBody = { ...(search || {}), Page: page };

      const { status, text, json, decodedData } = await ryzerEventSearch(ryzerAuth, pageBody);
      stats.pagesFetched += 1;

      if (page === 0) {
        debug.ryzerSnippet = String(text || "").slice(0, 800);
        debug.ryzerTopKeys = json && typeof json === "object" ? Object.keys(json) : [];
        debug.ryzerDecodedKeys = decodedData && typeof decodedData === "object" ? Object.keys(decodedData) : [];
        debug.decodedSnippet = decodedData ? JSON.stringify(decodedData).slice(0, 800) : "";
      }

      if (status !== 200 || !json) {
        debug.notes.push(`page=${page} status=${status} non-json or error`);
        break;
      }

      const events = extractEvents(decodedData);
      stats.eventsSeen += events.length;

      if (page === 0 && events.length) {
        debug.sampleEvent = events[0] || null;
        debug.sampleEventKeys = Object.keys(events[0] || {});
      }

      // Match some events to camps for proof-of-life
      for (const evt of events.slice(0, 25)) {
        const rlink = safeString(evt?.rlink) || safeString(evt?.RLink) || safeString(evt?.link) || safeString(evt?.url);
        const rid = extractRyzerNumericCampId(rlink);
        if (!rid) continue;

        const matches = byRyzerNumericId.get(rid) || [];
        if (!matches.length) continue;

        stats.campsMatched += matches.length;

        if (debug.sampleMatches.length < 10) {
          debug.sampleMatches.push({
            ryzerNumericId: rid,
            rlink,
            eventName: safeString(evt?.name) || safeString(evt?.Name) || null,
            logo: safeString(evt?.logo) || safeString(evt?.Logo) || null,
            matchedCampIds: matches.map((m) => m?.id).filter(Boolean).slice(0, 5),
          });
        }
      }
    }

    stats.elapsedMs = Date.now() - t0;
    return Response.json({ ok: true, stats, debug });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});