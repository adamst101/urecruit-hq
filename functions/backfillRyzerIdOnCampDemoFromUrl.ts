// functions/backfillRyzerIdOnCampDemoFromUrl.ts
//
// Fast pass: extract ryzer_camp_id directly from link_url / source_url on CampDemo rows
// (no HTTP fetching — only works for direct register.ryzer.com URLs).
//
// Payload:
// {
//   "seasonYear": 2026,
//   "dryRun": true,
//   "maxRows": 5000,
//   "onlyMissing": true
// }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function safeStr(x: any): string {
  return x == null ? "" : String(x).trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

function extractIdFromUrl(u: string): string | null {
  const s = safeStr(u);
  if (!s) return null;
  try {
    const url = new URL(s);
    const id = url.searchParams.get("id");
    if (id && id.trim()) return id.trim();
  } catch {}
  const m = s.match(/[?&]id=(\d{5,7})/i);
  return m?.[1] ? String(m[1]) : null;
}

function isRateLimitError(e: any): boolean {
  const msg = safeStr(e?.message || e).toLowerCase();
  return msg.includes("rate limit") || msg.includes("429") || msg.includes("too many");
}

async function updateWithRetry(Entity: any, id: string, patch: any, maxRetries = 6) {
  let lastErr: any = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      await Entity.update(id, patch);
      return { ok: true };
    } catch (e: any) {
      lastErr = e;
      if (!isRateLimitError(e) || i === maxRetries) break;
      await sleep(300 * Math.pow(2, i));
    }
  }
  return { ok: false, error: safeStr(lastErr?.message || lastErr) };
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    const dryRun = body?.dryRun !== false;
    const maxRows = Math.max(1, Number(body?.maxRows ?? 5000));
    const onlyMissing = body?.onlyMissing !== false;

    if (!seasonYear) return Response.json({ ok: false, error: "seasonYear required" });

    const base44 = createClientFromRequest(req);
    const CampDemo = base44?.entities?.CampDemo;

    if (!CampDemo?.filter || !CampDemo?.update) {
      return Response.json({ ok: false, error: "CampDemo entity not available" });
    }

    const rows: any[] = await CampDemo.filter({ season_year: seasonYear }, "id", Math.min(10000, maxRows));

    let eligible = 0;
    let extracted = 0;
    let wrote = 0;
    let errors = 0;
    const sample: any[] = [];

    for (const r of rows) {
      const id = safeStr(r?.id);
      if (!id) continue;

      if (onlyMissing && safeStr(r?.ryzer_camp_id)) continue;

      const rid =
        extractIdFromUrl(safeStr(r?.link_url)) ||
        extractIdFromUrl(safeStr(r?.source_url));

      if (!rid) continue;

      eligible += 1;
      extracted += 1;

      if (!dryRun) {
        const res = await updateWithRetry(CampDemo, id, { ryzer_camp_id: rid });
        if (res.ok) wrote += 1;
        else errors += 1;
        await sleep(50);
      }

      if (sample.length < 10) sample.push({ id, rid, link_url: safeStr(r?.link_url) });
    }

    return Response.json({
      ok: true,
      stats: {
        seasonYear,
        scanned: rows.length,
        eligible,
        extracted,
        wrote,
        errors,
        dryRun,
        elapsedMs: Date.now() - t0,
      },
      sample,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: safeStr(e?.message || e) });
  }
});