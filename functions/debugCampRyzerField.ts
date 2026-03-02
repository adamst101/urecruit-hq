// functions/debugCampRyzerField.ts
//
// Prints the actual field names present on Camp rows so we can see
// whether it's ryzer_camp_id, ryzerCampId, or something else.
//
// Payload:
// { "seasonYear": 2026, "limit": 3 }

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

function pick(obj: any, keys: string[]) {
  const out: any = {};
  for (const k of keys) out[k] = obj?.[k] ?? null;
  return out;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    const limit = Math.max(1, Math.min(10, Number(body?.limit ?? 3)));

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;
    if (!Camp?.filter) return Response.json({ ok: false, error: "Camp entity not available" });

    const rows: any[] = await Camp.filter(seasonYear ? { season_year: seasonYear } : {}, "id", limit);

    const samples = (rows || []).map((r) => ({
      id: r?.id ?? null,
      season_year: r?.season_year ?? null,
      // show any likely URL fields
      urls: pick(r, [
        "source_url",
        "link_url",
        "url",
        "registration_url",
        "registration_link",
        "sourceUrl",
        "linkUrl",
      ]),
      // show any likely ryzer id fields
      ryzer: pick(r, [
        "ryzer_camp_id",
        "ryzerCampId",
        "ryzer_id",
        "ryzerId",
        "ryzer_campid",
      ]),
      // show the keys so we see what actually exists
      keys: Object.keys(r || {}).filter((k) => k.toLowerCase().includes("ryzer") || k.toLowerCase().includes("camp_id")),
    }));

    return Response.json({ ok: true, samples });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});