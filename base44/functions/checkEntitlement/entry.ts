// functions/checkEntitlement/entry.ts
// Returns the active entitlement(s) for the currently authenticated user.
// Uses asServiceRole to bypass client-side entity read permissions — this is
// intentional, as the Entitlement entity does not allow direct client reads.
// Called by useSeasonAccess in place of client-side entity queries.
//
// Two-step discovery (mirrors getMyAthleteProfiles pattern):
//   Step 1: asServiceRole.filter({ account_id, status: "active" }) — fast, authoritative
//           for records created via asServiceRole (grantFtEntitlement, stripeWebhook, etc.)
//   Step 2: asServiceRole.list() + in-process filter — fallback for records created via
//           client-side entity.create() (grantTestEntitlement fallback path), which are
//           NOT visible to asServiceRole.filter()

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me().catch(() => null);
  if (!user) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const accountId = user.id;
  const errors: string[] = [];
  let resolvedBy = "none";

  try {
    // Step 1: filter — fast path for asServiceRole-created entitlements
    let list: Record<string, unknown>[] = [];
    try {
      const rows = await base44.asServiceRole.entities.Entitlement.filter({
        account_id: accountId,
        status: "active",
      });
      if (Array.isArray(rows)) list = rows;
    } catch (e) {
      errors.push(`filter_failed: ${(e as Error).message}`);
    }

    if (list.length > 0) {
      resolvedBy = "filter";
    } else {
      // Step 2: list-scan fallback — catches client-side-created entitlements
      // (grantTestEntitlement fallback path when server function was unavailable)
      try {
        const all = await base44.asServiceRole.entities.Entitlement.list("-created_date", 500);
        if (Array.isArray(all)) {
          list = all.filter(
            (e: Record<string, unknown>) =>
              e.account_id === accountId && e.status === "active"
          );
        }
        if (list.length > 0) resolvedBy = "list_scan";
      } catch (e) {
        errors.push(`list_scan_failed: ${(e as Error).message}`);
      }
    }

    return Response.json({
      ok: true,
      accountId,
      entitlements: list,
      _meta: { resolvedBy, errors },
    });
  } catch (e) {
    console.error("checkEntitlement error:", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
