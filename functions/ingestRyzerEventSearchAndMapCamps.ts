// functions/ingestRyzerEventSearchAndMapCamps.ts
//
// Pulls Ryzer eventSearch results (host name/logo/site) and uses them to:
// - attach host identity fields to Camp rows
// - map Camp.school_id using host domain -> SchoolSportSite (unique match only)
// - optionally map by exact host name -> School.school_name (off by default)
//
// IMPORTANT:
// - Do NOT hardcode tokens in this file.
// - Pass ryzerAuth token in payload when running (dry run first).
//
// Payload (POST JSON):
// {
//   "dryRun": true,
//   "seasonYear": 2026,
//   "ryzerAuth": "<JWT from browser>",
//   "search": { ...same body you captured... },
//   "maxPages": 5,
//   "allowRemapSchoolId": false,
//   "enableNameMatch": false,
//   "maxSchoolSportSites": 12000,
//   "maxSchools": 5000
// }

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

function normalizeStr(x: any): string {
  return String(x || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeUrl(u: string | null): string | null {
  const s = safeString(u);
  if (!s) return null;
  return s.replace(/#.*$/, "").trim();
}

function getDomain(u: string | null): string | null {
  const s = safeString(u);
  if (!s) return null;
  try {
    const uu = new URL(s);
    const host = (uu.hostname || "").toLowerCase().trim();
    if (!host) return null;
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

function isRyzerDomain(domain: string | null): boolean {
  const d = (domain || "").toLowerCase();
  return d === "ryzer.com" || d.endsWith(".ryzer.com") || d === "register.ryzer.com" || d.endsWith(".ryzer.com");
}

function extractRyzerCampId(url: string | null): string | null {
  const s = safeString(url);
  if (!s) return null;
  try {
    const u = new URL(s);
    const id = u.searchParams.get("id");
    if (!id) return null;
    const trimmed = id.trim();
    return trimmed ? trimmed : null;
  } catch {
    // sometimes url isn't parseable; try regex
    const m = s.match(/[?&]id=(\d+)/i);
    return m?.[1] ? String(m[1]) : null;
  }
}

function addToDomainIndex(idx: Map<string, string[]>, domain: string | null, schoolId: string) {
  if (!domain) return;
  const d = domain.toLowerCase().trim();
  if (!d) return;
  const arr = idx.get(d) || [];
  arr.push(schoolId);
  idx.set(d, arr);
}

function uniqueDomainMatch(idx: Map<string, string[]>, domain: string | null) {
  if (!domain) return { schoolId: null as string | null, count: 0 };
  const matches = idx.get(domain.toLowerCase().trim()) || [];
  const uniq = Array.from(new Set(matches));
  if (uniq.length === 1) return { schoolId: uniq[0], count: 1 };
  return { schoolId: null, count: uniq.length };
}

async function buildSchoolDomainIndex(SchoolSportSite: any, maxSites: number) {
  const idx = new Map<string, string[]>();
  const limit = Math.max(200, Math.min(20000, Number(maxSites) || 12000));
  const rows = asArray<any>(await SchoolSportSite.filter({}, "-updated_at", limit));

  for (const r of rows) {
    const schoolId = safeString(r?.school_id);
    if (!schoolId) continue;

    const urls = [r?.site_url, r?.url, r?.athletics_url, r?.homepage_url];
    for (const u of urls) {
      const dom = getDomain(safeString(u));
      addToDomainIndex(idx, dom, schoolId);
    }
  }

  return { idx, scanned: rows.length };
}

async function buildSchoolNameIndex(School: any, maxSchools: number) {
  // normalized school_name -> [schoolId]
  const idx = new Map<string, string[]>();
  const limit = Math.max(200, Math.min(10000, Number(maxSchools) || 5000));
  const rows = asArray<any>(await School.filter({}, "school_name", limit));

  for (const s of rows) {
    const sid = safeString(s?.id);
    if (!sid) continue;
    const nm = normalizeStr(s?.school_name || s?.name);
    if (!nm) continue;
    const arr = idx.get(nm) || [];
    arr.push(sid);
    idx.set(nm, arr);
  }

  return { idx, scanned: rows.length };
}

function uniqueNameMatch(idx: Map<string, string[]>, name: string | null) {
  const key = normalizeStr(name || "");
  if (!key) return { schoolId: null as string | null, count: 0 };
  const matches = idx.get(key) || [];
  const uniq = Array.from(new Set(matches));
  if (uniq.length === 1) return { schoolId: uniq[0], count: 1 };
  return { schoolId: null, count: uniq.length };
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

  return { status, text, json };
}

// Attempt to find the array of events in any plausible response shape.
function extractEvents(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const candidates = [
    payload?.data,
    payload?.Data,
    payload?.results,
    payload?.Results,
    payload?.events,
    payload?.Events,
    payload?.items,
    payload?.Items,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
    if (c && Array.isArray(c?.items)) return c.items;
    if (c && Array.isArray(c?.results)) return c.results;
  }

  // Last resort: scan first-level keys for an array of objects that "looks" like events
  for (const k of Object.keys(payload || {})) {
    const v = payload?.[k];
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
  }

  return [];
}

function pickEventField(evt: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = safeString(evt?.[k]);
    if (v) return v;
  }
  return null;
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

    const maxPages = Math.max(1, Number(body?.maxPages ?? 5));
    const allowRemapSchoolId = !!body?.allowRemapSchoolId;
    const enableNameMatch = !!body?.enableNameMatch;

    const maxSchoolSportSites = Math.max(200, Number(body?.maxSchoolSportSites ?? 12000));
    const maxSchools = Math.max(200, Number(body?.maxSchools ?? 5000));

    if (!ryzerAuth) return Response.json({ ok: false, error: "ryzerAuth required (from browser request)" });
    if (!search) return Response.json({ ok: false, error: "search body required" });

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;
    const SchoolSportSite = base44?.entities?.SchoolSportSite ?? base44?.entities?.SchoolSportSites;
    const School = base44?.entities?.School ?? base44?.entities?.Schools;

    if (!Camp || typeof Camp.filter !== "function" || typeof Camp.update !== "function") {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }
    if (!SchoolSportSite || typeof SchoolSportSite.filter !== "function") {
      return Response.json({ ok: false, error: "SchoolSportSite entity not available" });
    }
    if (enableNameMatch && (!School || typeof School.filter !== "function")) {
      return Response.json({ ok: false, error: "School entity not available for name matching" });
    }

    const stats: any = {
      seasonYear,
      pagesFetched: 0,
      eventsSeen: 0,
      campsMatched: 0,
      campsUpdatedHost: 0,
      schoolIdSet: 0,
      schoolIdSkippedAmbiguous: 0,
      schoolIdNoMatch: 0,
      dryRun,
      elapsedMs: 0,
    };

    const debug: any = {
      sampleEvents: [],
      sampleUpdates: [],
      notes: [],
    };

    const { idx: domainIdx, scanned: domainScanned } = await buildSchoolDomainIndex(SchoolSportSite, maxSchoolSportSites);
    debug.notes.push(`domainIndexScanned=${domainScanned}`);

    let schoolNameIdx: Map<string, string[]> | null = null;
    if (enableNameMatch) {
      const r = await buildSchoolNameIndex(School, maxSchools);
      schoolNameIdx = r.idx;
      debug.notes.push(`schoolNameIndexScanned=${r.scanned}`);
    }

    // Preload camps for this season by ryzer id to avoid N calls.
    const camps = seasonYear
      ? asArray<any>(await Camp.filter({ season_year: seasonYear }, "-start_date", 5000))
      : asArray<any>(await Camp.filter({}, "-start_date", 5000));

    const byRyzerId = new Map<string, any[]>();
    const byUrl = new Map<string, any[]>();

    for (const c of camps) {
      const campId = safeString(c?.id);
      if (!campId) continue;

      const regUrl = safeString(c?.source_url) || safeString(c?.link_url) || safeString(c?.url);
      const nurl = normalizeUrl(regUrl);
      if (nurl) {
        const arr = byUrl.get(nurl) || [];
        arr.push(c);
        byUrl.set(nurl, arr);

        const rid = extractRyzerCampId(nurl);
        if (rid) {
          const arr2 = byRyzerId.get(rid) || [];
          arr2.push(c);
          byRyzerId.set(rid, arr2);
        }
      }
    }

    for (let page = 0; page < maxPages; page++) {
      const pageBody = { ...(search || {}), Page: page };
      const { status, json, text } = await ryzerEventSearch(ryzerAuth, pageBody);

      stats.pagesFetched += 1;

      if (status !== 200 || !json) {
        debug.notes.push(`page=${page} status=${status} non-json or error`);
        debug.notes.push(`page=${page} bodySnippet=${String(text || "").slice(0, 200)}`);
        break;
      }

      const events = extractEvents(json);
      stats.eventsSeen += events.length;

      if (debug.sampleEvents.length < 5) {
        debug.sampleEvents.push({
          page,
          status,
          exampleKeys: Object.keys(events?.[0] || {}),
          example: events?.[0] || null,
        });
      }

      if (!events.length) break;

      for (const evt of events) {
        const regUrl =
          pickEventField(evt, ["RegistrationUrl", "registrationUrl", "registration_url", "RegisterUrl", "registerUrl", "Url", "url", "EventUrl", "eventUrl"]) ||
          null;

        const evtId =
          safeString(evt?.EventId) ||
          safeString(evt?.eventId) ||
          safeString(evt?.Id) ||
          safeString(evt?.id) ||
          extractRyzerCampId(regUrl);

        const hostName =
          pickEventField(evt, ["AccountName", "accountName", "OrganizationName", "organizationName", "HostName", "hostName", "SchoolName", "schoolName"]) ||
          null;

        const hostLogo =
          pickEventField(evt, ["AccountLogo", "accountLogo", "OrganizationLogo", "organizationLogo", "LogoUrl", "logoUrl", "Logo", "logo"]) ||
          null;

        const hostSite =
          pickEventField(evt, ["AccountUrl", "accountUrl", "OrganizationUrl", "organizationUrl", "Website", "website", "SiteUrl", "siteUrl"]) ||
          null;

        const location =
          pickEventField(evt, ["LocationDisplay", "locationDisplay", "Location", "location", "CityState", "cityState"]) ||
          null;

        const hostDomain = (() => {
          const d1 = getDomain(hostSite);
          if (d1 && !isRyzerDomain(d1)) return d1;
          const d2 = getDomain(regUrl);
          if (d2 && !isRyzerDomain(d2)) return d2;
          return null;
        })();

        let matchedCamps: any[] = [];

        if (evtId) {
          const arr = byRyzerId.get(String(evtId)) || [];
          matchedCamps = matchedCamps.concat(arr);
        }

        if (!matchedCamps.length && regUrl) {
          const arr = byUrl.get(normalizeUrl(regUrl) || "") || [];
          matchedCamps = matchedCamps.concat(arr);
        }

        if (!matchedCamps.length) continue;

        stats.campsMatched += matchedCamps.length;

        let mappedSchoolId: string | null = null;
        let schoolMatchCount = 0;

        if (hostDomain) {
          const dm = uniqueDomainMatch(domainIdx, hostDomain);
          mappedSchoolId = dm.schoolId;
          schoolMatchCount = dm.count;
          if (!mappedSchoolId && dm.count > 1) stats.schoolIdSkippedAmbiguous += 1;
        }

        if (!mappedSchoolId && enableNameMatch && schoolNameIdx && hostName) {
          const nm = uniqueNameMatch(schoolNameIdx, hostName);
          mappedSchoolId = nm.schoolId;
          schoolMatchCount = nm.count;
          if (!mappedSchoolId && nm.count > 1) stats.schoolIdSkippedAmbiguous += 1;
        }

        for (const camp of matchedCamps) {
          const campRowId = safeString(camp?.id);
          if (!campRowId) continue;

          const patch: any = {};
          if (hostName) patch.host_name = hostName;
          if (hostLogo) patch.host_logo_url = normalizeUrl(hostLogo);
          if (hostSite) patch.host_site_url = normalizeUrl(hostSite);
          if (location) patch.host_location = location;

          const currentSchoolId = safeString(camp?.school_id);
          if (mappedSchoolId && (!currentSchoolId || allowRemapSchoolId)) {
            patch.school_id = mappedSchoolId;
          }

          if (Object.keys(patch).length) {
            stats.campsUpdatedHost += 1;
            if (patch.school_id) stats.schoolIdSet += 1;

            if (!dryRun) {
              await Camp.update(campRowId, patch);
            }

            if (debug.sampleUpdates.length < 10) {
              debug.sampleUpdates.push({
                campRowId,
                evtId,
                regUrl,
                hostName,
                hostDomain,
                schoolMatchCount,
                mappedSchoolId,
                patchKeys: Object.keys(patch),
              });
            }
          } else {
            if (!mappedSchoolId) stats.schoolIdNoMatch += 1;
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