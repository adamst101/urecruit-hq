// functions/ingestRyzerEventSearchAndMapCamps.ts
//
// Pull Ryzer eventSearch results and enrich Camp rows by ryzer_camp_id.
// - Sets Camp.school_logo_url from event.logo ONLY when current logo is missing or Ryzer placeholder.
// - Sets Camp.host_name from event.organizer (default: only when missing; toggleable).
// - Does NOT attempt School mapping here (eventSearch doesn’t provide a reliable school domain).
//
// Rules:
// - Ryzer placeholder logo: https://register.ryzer.com/webart/logo.png
// - Only write logos that start with https://s3.amazonaws.com/
//
// Payload (POST JSON):
// {
//   "dryRun": true,
//   "seasonYear": 2026,
//   "ryzerAuth": "<JWT>",
//   "search": { ... },
//   "maxPages": 25,
//   "maxCampsToUpdate": 5000,
//   "updateHostNameMode": "missing_only", // "missing_only" | "always"
//   "updateCampName": false
// }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

const ENDPOINT = "https://ryzer.com/rest/controller/connect/event/eventSearch/";
const RYZER_PLACEHOLDER_LOGO = "https://register.ryzer.com/webart/logo.png";
const S3_PREFIX = "https://s3.amazonaws.com/";

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
  return s.replace(/#.*$/, "").replace(/\?.*$/, "").trim();
}

function isS3LogoUrl(u: string | null): boolean {
  const s = normalizeUrl(u);
  return !!s && s.startsWith(S3_PREFIX);
}

function isRyzerPlaceholderLogo(u: string | null): boolean {
  const s = normalizeUrl(u);
  return !!s && s === RYZER_PLACEHOLDER_LOGO;
}

function shouldReplaceLogo(existing: string | null, nextLogo: string | null): boolean {
  const ex = normalizeUrl(existing);
  const nx = normalizeUrl(nextLogo);
  if (!nx) return false;
  if (!isS3LogoUrl(nx)) return false;
  if (!ex) return true;
  if (isRyzerPlaceholderLogo(ex)) return true;
  return false;
}

function extractRyzerNumericCampId(url: string | null): string | null {
  const s = safeString(url);
  if (!s) return null;
  try {
    const u = new URL(s);
    const id = u.searchParams.get("id");
    if (!id) return null;
    const t = id.trim();
    return t ? t : null;
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

  // Ryzer returns json.data as stringified JSON
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

  return { status, json, decodedData, text };
}

function extractEvents(decodedData: any): any[] {
  if (!decodedData) return [];
  if (Array.isArray(decodedData?.events)) return decodedData.events;
  if (Array.isArray(decodedData?.Events)) return decodedData.Events;
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

    const maxPages = Math.max(1, Number(body?.maxPages ?? 25));
    const maxCampsToUpdate = Math.max(1, Number(body?.maxCampsToUpdate ?? 5000));
    const updateHostNameMode = String(body?.updateHostNameMode || "missing_only"); // missing_only | always
    const updateCampName = !!body?.updateCampName;

    if (!seasonYear) return Response.json({ ok: false, error: "seasonYear required" });
    if (!ryzerAuth) return Response.json({ ok: false, error: "ryzerAuth required" });
    if (!search) return Response.json({ ok: false, error: "search body required" });

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;

    if (!Camp || typeof Camp.filter !== "function" || typeof Camp.update !== "function") {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }

    // Load camps for the season and index by ryzer_camp_id
    const camps = asArray<any>(await Camp.filter({ season_year: seasonYear }, "-start_date", 10000));
    const byRyzerId = new Map<string, any[]>();

    for (const c of camps) {
      const rid = safeString(c?.ryzer_camp_id);
      if (!rid) continue;
      const arr = byRyzerId.get(rid) || [];
      arr.push(c);
      byRyzerId.set(rid, arr);
    }

    const stats: any = {
      seasonYear,
      pagesFetched: 0,
      eventsSeen: 0,
      eventsWithNumericId: 0,
      matchedCampRows: 0,
      updatedCampRows: 0,
      logoUpdated: 0,
      hostNameUpdated: 0,
      campNameUpdated: 0,
      skippedNoMatch: 0,
      dryRun,
      elapsedMs: 0,
    };

    const debug: any = {
      sampleEvents: [],
      sampleUpdates: [],
      notes: [],
    };

    let totalUpdatesAttempted = 0;

    for (let page = 0; page < maxPages; page++) {
      if (totalUpdatesAttempted >= maxCampsToUpdate) break;

      const pageBody = { ...(search || {}), Page: page };
      const { status, decodedData, json } = await ryzerEventSearch(ryzerAuth, pageBody);

      stats.pagesFetched += 1;

      if (status !== 200 || !json) {
        debug.notes.push(`page=${page} status=${status} non-json`);
        break;
      }

      const events = extractEvents(decodedData);
      stats.eventsSeen += events.length;

      if (page === 0 && events.length) {
        debug.sampleEvents.push({
          keys: Object.keys(events[0] || {}),
          example: events[0] || null,
        });
      }

      if (!events.length) break;

      for (const evt of events) {
        const rlink = safeString(evt?.rlink);
        const numericId = extractRyzerNumericCampId(rlink);
        if (!numericId) continue;
        stats.eventsWithNumericId += 1;

        const matches = byRyzerId.get(numericId) || [];
        if (!matches.length) {
          stats.skippedNoMatch += 1;
          continue;
        }

        const organizer = safeString(evt?.organizer);
        const logo = safeString(evt?.logo);
        const name = safeString(evt?.name);

        for (const camp of matches) {
          if (totalUpdatesAttempted >= maxCampsToUpdate) break;

          const campRowId = safeString(camp?.id);
          if (!campRowId) continue;

          const patch: any = {};

          // Logo
          if (shouldReplaceLogo(safeString(camp?.school_logo_url), logo)) {
            patch.school_logo_url = normalizeUrl(logo);
          }

          // Host name
          if (organizer) {
            const existingHost = safeString(camp?.host_name);
            if (updateHostNameMode === "always" || !existingHost) {
              patch.host_name = organizer;
            }
          }

          // Camp name (optional)
          if (updateCampName && name) {
            const existingName = safeString(camp?.camp_name) || safeString(camp?.name);
            if (!existingName) patch.camp_name = name;
          }

          if (Object.keys(patch).length === 0) continue;

          stats.matchedCampRows += 1;
          totalUpdatesAttempted += 1;

          if (!dryRun) {
            await Camp.update(campRowId, patch);
          }

          stats.updatedCampRows += 1;
          if (patch.school_logo_url) stats.logoUpdated += 1;
          if (patch.host_name) stats.hostNameUpdated += 1;
          if (patch.camp_name) stats.campNameUpdated += 1;

          if (debug.sampleUpdates.length < 10) {
            debug.sampleUpdates.push({
              ryzer_camp_id: numericId,
              campRowId,
              patch,
              organizer,
              logo,
              rlink,
            });
          }
        }
      }
    }

    stats.elapsedMs = Date.now() - t0;
    return Response.json({ ok: true, stats, debug });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});