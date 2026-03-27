// functions/checkEntitlement/entry.ts
// Returns the active entitlement(s) for the currently authenticated user.
// Uses asServiceRole to bypass client-side entity read permissions — this is
// intentional, as the Entitlement entity does not allow direct client reads.
// Called by useSeasonAccess in place of client-side entity queries.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me().catch(() => null);
  if (!user) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const accountId = user.id;

  try {
    const rows = await base44.asServiceRole.entities.Entitlement.filter({
      account_id: accountId,
      status: "active",
    });

    const list = Array.isArray(rows) ? rows : [];

    return Response.json({
      ok: true,
      accountId,
      entitlements: list,
    });
  } catch (e) {
    console.error("checkEntitlement error:", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
