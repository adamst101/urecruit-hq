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
    const rows = await base44.asServiceRole.entities.AthleteProfile.filter({
      account_id: accountId,
    });

    const list = Array.isArray(rows) ? rows : [];

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
