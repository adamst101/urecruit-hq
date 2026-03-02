// functions/scrubBadLogosFromCamp.ts
//
// Scans Camp rows and nulls out school_logo_url values that are vendor placeholders
// or otherwise bad (Ryzer default logo, SportsUSA, etc.).
//
// Run this BEFORE enrichCampsFromRyzerCampPage so the enrichment function sees
// blank fields and fills them with real S3 logos.
//
// ─── Dry run (audit mode — no writes) ───────────────────────────────────────
// {
//   "seasonYear": 2026,
//   "dryRun": true,
//   "maxRows": 500,
//   "startAt": 0
// }
//
// ─── Write mode ─────────────────────────────────────────────────────────────
// {
//   "seasonYear": 2026,
//   "dryRun": false,
//   "maxRows": 500,
//   "startAt": 0
// }
// Page through with startAt = stats.nextStartAt until stats.done === true.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

// ─── bad logo detection ───────────────────────────────────────────────────────

const BAD_LOGO_PATTERNS = [
  "register.ryzer.com",   // Ryzer generic placeholder: /webart/logo.png
  "ryzer.com/webart",     // any ryzer webart asset
  "sportsusa",
  "sportscamps",
  "placeholder",
];

function isBadLogoUrl(url: any): boolean {
  const s = String(url || "").trim().toLowerCase();
  if (!s) return false; // blank is not "bad", just absent — don't touch it
  return BAD_LOGO_PATTERNS.some((p) => s.includes(p));
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeString(x: any): string | null {
  if (x == null) return null;
  const s = String(x).trim();
  return s || null;
}

function isRateLimitError(e: any) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("too many") || msg.includes("429");
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

async function updateWithRetry(Camp: any, campId: string, patch: any, maxRetries: number) {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await Camp.update(campId, patch);
      return { ok: true };
    } catch (e: any) {
      lastErr = e;
      if (!isRateLimitError(e) || attempt === maxRetries) break;
      await sleep(250 * Math.pow(2, attempt));
    }
  }
  return { ok: false, error: String(lastErr?.message || lastErr) };
}

// ─── handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const t0 = Date.now();

  try {
    if (req.method !== "POST") return Response.json({ ok: false, error: "POST only" });
    const body = await req.json().catch(() => ({}));

    const seasonYear = Number(body?.seasonYear || 0);
    const dryRun     = body?.dryRun !== false;   // default: true (safe)
    const maxRows    = Math.max(1, Math.min(2000, Number(body?.maxRows ?? 500)));
    const startAt    = Math.max(0, Number(body?.startAt ?? 0));
    const maxRetries = Math.max(0, Number(body?.maxRetries ?? 4));
    const throttleMs = Math.max(0, Number(body?.throttleMs ?? 20));

    if (!seasonYear) return Response.json({ ok: false, error: "seasonYear is required (e.g. 2026)" });

    const base44 = createClientFromRequest(req);
    const Camp   = base44?.entities?.Camp ?? base44?.entities?.Camps;

    if (!Camp?.filter || !Camp?.update) {
      return Response.json({ ok: false, error: "Camp entity not available" });
    }

    const pageLimit = Math.min(10_000, startAt + maxRows);
    const rows: any[] = await Camp.filter({ season_year: seasonYear }, "id", pageLimit);
    const slice = (rows || []).slice(startAt, startAt + maxRows);
    const nextStartAt = startAt + slice.length;

    const stats: Record<string, any> = {
      seasonYear,
      startAt,
      nextStartAt,
      scanned:    slice.length,
      hasBadLogo: 0,
      scrubbed:   0,
      errors:     0,
      dryRun,
      elapsedMs:  0,
      done:       slice.length < maxRows,
    };

    // Breakdown by pattern so you can see which source is most common
    const patternCounts: Record<string, number> = {};
    for (const p of BAD_LOGO_PATTERNS) patternCounts[p] = 0;

    const scrubSamples:  any[] = [];
    const errorSamples:  any[] = [];

    for (const r of slice) {
      const campId = safeString(r?.id);
      if (!campId) continue;

      const currentLogo = safeString(r?.school_logo_url);
      if (!currentLogo) continue; // blank already — nothing to do

      if (!isBadLogoUrl(currentLogo)) continue; // looks fine — leave it

      stats.hasBadLogo += 1;

      // Track which pattern matched
      const matched = BAD_LOGO_PATTERNS.find((p) => currentLogo.toLowerCase().includes(p));
      if (matched) patternCounts[matched] = (patternCounts[matched] || 0) + 1;

      if (scrubSamples.length < 20) {
        scrubSamples.push({
          campId,
          camp_name:          r?.camp_name ?? null,
          bad_logo_url:       currentLogo,
          matched_pattern:    matched ?? "unknown",
          ryzer_camp_id:      r?.ryzer_camp_id ?? null,
        });
      }

      if (!dryRun) {
        const res = await updateWithRetry(Camp, campId, { school_logo_url: null }, maxRetries);
        if (res.ok) {
          stats.scrubbed += 1;
        } else {
          stats.errors += 1;
          if (errorSamples.length < 5) errorSamples.push({ campId, error: res.error });
        }
      }

      if (throttleMs) await sleep(throttleMs);
    }

    stats.elapsedMs = Date.now() - t0;

    return Response.json({
      ok: true,
      stats,
      patternCounts,
      scrubSamples,
      errorSamples,
      nextStep: stats.done
        ? "Run enrichCampsFromRyzerCampPage to fill scrubbed logos with real S3 logos."
        : `Not done — run again with startAt: ${nextStartAt}`,
    });

  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
});