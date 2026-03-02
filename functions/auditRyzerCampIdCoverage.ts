// functions/auditRyzerCampIdCoverage.ts
//
// Counts ryzer_camp_id coverage for a season and returns a small sample.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function safeString(x: any): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));
    const seasonYear = Number(body?.seasonYear || 0);
    const limit = Math.max(200, Math.min(10000, Number(body?.limit ?? 5000)));

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;
    if (!Camp?.filter) return Response.json({ ok: false, error: "Camp entity not available" });

    const rows: any[] = await Camp.filter(seasonYear ? { season_year: seasonYear } : {}, "id", limit);

    let scanned = 0;
    let withId = 0;
    let withoutId = 0;

    const sampleWith: any[] = [];
    const sampleWithout: any[] = [];

    for (const r of rows || []) {
      scanned += 1;
      const rid = safeString(r?.ryzer_camp_id);
      if (rid) {
        withId += 1;
        if (sampleWith.length < 10) sampleWith.push({ id: r?.id, ryzer_camp_id: rid, link_url: r?.link_url, source_url: r?.source_url });
      } else {
        withoutId += 1;
        if (sampleWithout.length < 10) sampleWithout.push({ id: r?.id, link_url: r?.link_url, source_url: r?.source_url });
      }
    }

    return Response.json({
      ok: true,
      stats: { seasonYear, scanned, withId, withoutId, coveragePct: scanned ? Math.round((withId / scanned) * 1000) / 10 : 0 },
      sampleWith,
      sampleWithout,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});