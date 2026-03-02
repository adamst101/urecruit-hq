// functions/backfillCampRyzerIds.ts
//
// Extracts numeric Ryzer camp id from existing Camp URL fields and stores it as camp.ryzer_camp_id
// Safe: default dryRun=true; only writes when it can extract an id.
//
// Payload:
// {
//   "seasonYear": 2026,
//   "dryRun": true,
//   "maxCamps": 2000,
//   "onlyMissing": true
// }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function safeString(x: any): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
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

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    const dryRun = body?.dryRun !== false; // default true
    const maxCamps = Math.max(1, Number(body?.maxCamps ?? 2000));
    const onlyMissing = body?.onlyMissing !== false; // default true

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;
    if (!Camp || typeof Camp.filter !== "function" || typeof Camp.update !== "function") {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }

    const where: any = seasonYear ? { season_year: seasonYear } : {};
    const rows: any[] = await Camp.filter(where, "-start_date", maxCamps);

    let scanned = 0;
    let found = 0;
    let wouldWrite = 0;
    let wrote = 0;

    const sample: any[] = [];

    for (const c of rows || []) {
      scanned += 1;
      const campId = safeString(c?.id);
      if (!campId) continue;

      const existing = safeString(c?.ryzer_camp_id);
      if (onlyMissing && existing) continue;

      const urls = [
        safeString(c?.source_url),
        safeString(c?.link_url),
        safeString(c?.url),
        safeString(c?.registration_url),
        safeString(c?.registration_link),
      ].filter(Boolean) as string[];

      let rid: string | null = null;
      for (const u of urls) {
        rid = extractRyzerNumericCampId(u);
        if (rid) break;
      }

      if (!rid) continue;

      found += 1;
      wouldWrite += 1;

      if (!dryRun) {
        await Camp.update(campId, { ryzer_camp_id: rid });
        wrote += 1;
      }

      if (sample.length < 10) {
        sample.push({ campId, ryzer_camp_id: rid, urls: urls.slice(0, 2) });
      }
    }

    return Response.json({
      ok: true,
      stats: { seasonYear, scanned, found, wouldWrite, wrote, dryRun },
      sample,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});