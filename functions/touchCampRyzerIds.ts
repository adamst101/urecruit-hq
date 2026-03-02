// functions/touchCampRyzerIds.ts
//
// Re-writes ryzer_camp_id on all rows that already have it, forcing the export
// engine to recognize the column.
//
// Payload: { "seasonYear": 2026, "dryRun": true, "maxCamps": 500 }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function safeString(x: any): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    const dryRun = body?.dryRun !== false;
    const maxCamps = Math.max(1, Number(body?.maxCamps ?? 500));

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;
    if (!Camp?.filter) return Response.json({ ok: false, error: "Camp entity not available" });

    const rows: any[] = await Camp.filter(seasonYear ? { season_year: seasonYear } : {}, "id", maxCamps);

    let touched = 0;
    let skipped = 0;
    let errors = 0;
    const sample: any[] = [];

    for (const r of rows || []) {
      const campId = safeString(r?.id);
      const rid = safeString(r?.ryzer_camp_id);
      if (!campId || !rid) { skipped += 1; continue; }

      if (!dryRun) {
        try {
          await Camp.update(campId, { ryzer_camp_id: rid });
          touched += 1;
        } catch {
          errors += 1;
        }
        await sleep(100);
      } else {
        touched += 1;
      }

      if (sample.length < 5) sample.push({ campId, ryzer_camp_id: rid });
    }

    return Response.json({ ok: true, stats: { seasonYear, touched, skipped, errors, dryRun }, sample });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});