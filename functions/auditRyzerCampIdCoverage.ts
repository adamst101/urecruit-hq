// functions/auditRyzerCampIdCoverage.ts
//
// Audit coverage of Camp.ryzer_camp_id for a given season_year.
//
// Payload:
// {
//   "seasonYear": 2026,
//   "maxScan": 10000
// }
//
// Response focuses on:
// - scanned
// - withId / withoutId
// - coveragePct
// - small samples to inspect mapping quality

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function safeString(x: any): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
}

function pickUrl(c: any): string | null {
  const candidates = [c?.link_url, c?.source_url, c?.url, c?.registration_url, c?.registration_link];
  for (const u of candidates) {
    const s = safeString(u);
    if (s) return s;
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    const maxScan = Math.max(1, Math.min(20000, Number(body?.maxScan ?? 10000)));
    if (!seasonYear) return Response.json({ ok: false, error: "seasonYear required" });

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;
    if (!Camp || typeof Camp.filter !== "function") {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }

    const rows: any[] = await Camp.filter({ season_year: seasonYear }, "id", maxScan);
    const scanned = (rows || []).length;

    let withId = 0;
    let withoutId = 0;

    const sampleWith: any[] = [];
    const sampleWithout: any[] = [];

    for (const c of rows || []) {
      const id = safeString(c?.id);
      if (!id) continue;
      const rid = safeString(c?.ryzer_camp_id);

      if (rid) {
        withId += 1;
        if (sampleWith.length < 10) {
          sampleWith.push({
            id,
            ryzer_camp_id: rid,
            link_url: safeString(c?.link_url),
            source_url: safeString(c?.source_url),
          });
        }
      } else {
        withoutId += 1;
        if (sampleWithout.length < 10) {
          sampleWithout.push({
            id,
            link_url: safeString(c?.link_url),
            source_url: safeString(c?.source_url),
            any_url: pickUrl(c),
          });
        }
      }
    }

    const coveragePct = scanned ? Math.round((withId / scanned) * 1000) / 10 : 0;

    return Response.json({
      ok: true,
      stats: { seasonYear, scanned, withId, withoutId, coveragePct },
      sampleWith,
      sampleWithout,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});