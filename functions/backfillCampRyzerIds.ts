// functions/backfillCampRyzerIds.ts
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

function pickUrlFields(c: any) {
  // include lots of likely variants to avoid schema mismatch
  const candidates: Array<[string, any]> = [
    ["source_url", c?.source_url],
    ["link_url", c?.link_url],
    ["url", c?.url],
    ["registration_url", c?.registration_url],
    ["registration_link", c?.registration_link],
    ["sourceUrl", c?.sourceUrl],
    ["linkUrl", c?.linkUrl],
    ["registrationUrl", c?.registrationUrl],
    ["registrationLink", c?.registrationLink],
    ["camp_url", c?.camp_url],
    ["campUrl", c?.campUrl],
  ];

  const present: any[] = [];
  for (const [k, v] of candidates) {
    const s = safeString(v);
    if (s) present.push({ field: k, value: s });
  }
  return present;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    const dryRun = body?.dryRun !== false; // default true
    const maxCamps = Math.max(1, Number(body?.maxCamps ?? 250));
    const onlyMissing = body?.onlyMissing !== false; // default true
    const startAt = Math.max(0, Number(body?.startAt ?? 0));

    const base44 = createClientFromRequest(req);
    const Camp = base44?.entities?.Camp ?? base44?.entities?.Camps;

    if (!Camp || typeof Camp.filter !== "function" || typeof Camp.update !== "function") {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }

    const where: any = seasonYear ? { season_year: seasonYear } : {};
    const rows: any[] = await Camp.filter(where, "id", Math.min(10000, startAt + maxCamps));
    const slice = rows.slice(startAt, startAt + maxCamps);

    let scanned = 0;
    let found = 0;

    const debugSample: any[] = [];

    for (const c of slice) {
      scanned += 1;

      const campId = safeString(c?.id);
      if (!campId) continue;

      const existing = safeString(c?.ryzer_camp_id);
      if (onlyMissing && existing) continue;

      const presentUrls = pickUrlFields(c);

      let rid: string | null = null;
      for (const u of presentUrls) {
        rid = extractRyzerNumericCampId(u.value);
        if (rid) break;
      }

      if (rid) found += 1;

      if (debugSample.length < 10) {
        debugSample.push({
          campId,
          season_year: c?.season_year,
          existing_ryzer_camp_id: existing || null,
          presentUrlFields: presentUrls.slice(0, 5), // keep small
          extractedRid: rid,
          keyCount: Object.keys(c || {}).length,
        });
      }
    }

    return Response.json({
      ok: true,
      stats: { seasonYear, startAt, scanned, found, dryRun, onlyMissing },
      debugSample,
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});