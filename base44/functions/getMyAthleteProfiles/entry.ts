// functions/getMyAthleteProfiles/entry.ts
// Returns all AthleteProfile records for the currently authenticated user.
// Uses asServiceRole to bypass client-side entity read permissions — records
// created via asServiceRole (stripeWebhook, linkStripePayment, activateFreeAccess)
// are NOT readable by client-side base44.entities.AthleteProfile.filter().
// Called by useAthleteIdentity in place of client-side entity queries.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let bodyAccountId = "";
  try {
    const body = await req.clone().json().catch(() => ({}));
    bodyAccountId = body?.accountId || "";
  } catch {}

  const user = await base44.auth.me().catch(() => null);
  if (!user && !bodyAccountId) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const accountId = user?.id || bodyAccountId;

  try {
    // Attempt 1: filter by account_id directly (works when Base44 respects field filter)
    let list: unknown[] = [];
    try {
      const rows = await base44.asServiceRole.entities.AthleteProfile.filter({
        account_id: accountId,
      });
      list = Array.isArray(rows) ? rows : [];
    } catch (_filterErr) {
      list = [];
    }

    // Attempt 2: if filter returned nothing, fall back to listing all and matching in-process.
    // This handles the case where Base44 treats account_id as a system field and ignores
    // it as a filter predicate (returning all or none instead of the matching subset).
    if (list.length === 0) {
      try {
        const all = await base44.asServiceRole.entities.AthleteProfile.list("-created_date", 2000);
        if (Array.isArray(all)) {
          list = all.filter((r: Record<string, unknown>) => r.account_id === accountId);
          console.log(`[getMyAthleteProfiles] filter fallback: scanned ${all.length} total, found ${list.length} matching account_id=${accountId}`);
        }
      } catch (listErr) {
        console.warn("[getMyAthleteProfiles] list fallback failed:", (listErr as Error).message);
      }
    }

    return Response.json({
      ok: true,
      accountId,
      profiles: list,
    });
  } catch (e) {
    console.error("getMyAthleteProfiles error:", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
