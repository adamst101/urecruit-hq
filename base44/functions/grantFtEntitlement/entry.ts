// functions/grantFtEntitlement/entry.ts
// Admin-only server function to grant a test (ft_seed) entitlement for an account.
//
// Accepts { accountId } — the account to entitle.
// Uses asServiceRole to bypass client-read restrictions on the Entitlement entity.
// Returns { ok, granted, reason, accountId, seasonYear }.
//
// Caller must be authenticated as admin (role === "admin" or in the admin email list).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ADMIN_EMAILS = [
  "adamst101@gmail.com",
  "adamst1@gmail.com",
];

function ftSeasonYear(): number {
  const now = new Date();
  const y = now.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1));
  return now >= feb1 ? y : y - 1;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Require admin
  const caller = await base44.auth.me().catch(() => null);
  if (!caller) {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const isAdmin = caller.role === "admin" || ADMIN_EMAILS.includes(caller.email);
  if (!isAdmin) {
    return Response.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  let body: { accountId?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const { accountId } = body;
  if (!accountId) {
    return Response.json({ ok: false, error: "accountId required" }, { status: 400 });
  }

  const seasonYear = ftSeasonYear();

  try {
    // Check for existing active entitlement
    const existing = await base44.asServiceRole.entities.Entitlement.filter({
      account_id: accountId,
      status: "active",
    });

    if (Array.isArray(existing) && existing.length > 0) {
      return Response.json({ ok: true, granted: false, reason: "already_entitled", accountId, seasonYear });
    }

    // Create the entitlement
    await base44.asServiceRole.entities.Entitlement.create({
      account_id: accountId,
      season_year: seasonYear,
      status: "active",
      amount_paid: 0,
      source: "ft_seed",
    });

    return Response.json({ ok: true, granted: true, accountId, seasonYear });
  } catch (e) {
    console.error("grantFtEntitlement error:", (e as Error).message);
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});
