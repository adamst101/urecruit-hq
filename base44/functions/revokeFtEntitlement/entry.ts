// functions/revokeFtEntitlement/entry.ts
// Admin-only server function to revoke ft_seed entitlements for an account.
//
// Mirror of grantFtEntitlement — uses asServiceRole for the same visibility
// guarantee. base44.entities.Entitlement.list() (client-side) cannot see
// records created by asServiceRole, so revocation MUST go through this function.
//
// Accepts { accountId } — the account whose ft_seed entitlements to remove.
// Uses two-step discovery:
//   Step 1: asServiceRole.filter({ account_id, source: "ft_seed", status: "active" })
//   Step 2: asServiceRole.list() + in-process filter (fallback for records that
//           may have been created via client-side entity.create(), which are NOT
//           visible to asServiceRole.filter())
//
// Returns { ok, revoked, accountId, errors }.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const ADMIN_EMAILS = [
  "adamst101@gmail.com",
  "adamst1@gmail.com",
];

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

  const errors: string[] = [];
  const deletedIds: string[] = [];

  try {
    // Step 1: filter by account_id + source — asServiceRole can find records it created
    let rows: Record<string, unknown>[] = [];
    try {
      const res = await base44.asServiceRole.entities.Entitlement.filter({
        account_id: accountId,
        source: "ft_seed",
        status: "active",
      });
      if (Array.isArray(res)) rows = res;
    } catch (e) {
      errors.push(`filter_failed: ${(e as Error).message}`);
    }

    // Step 2: list-scan fallback — catches records created via client-side entity.create()
    // that are NOT visible to asServiceRole.filter()
    if (rows.length === 0) {
      try {
        const all = await base44.asServiceRole.entities.Entitlement.list("-created_date", 500);
        if (Array.isArray(all)) {
          rows = all.filter(
            (e: Record<string, unknown>) =>
              e.account_id === accountId && e.source === "ft_seed" && e.status === "active"
          );
        }
      } catch (e) {
        errors.push(`list_scan_failed: ${(e as Error).message}`);
      }
    }

    // Delete each found record
    for (const row of rows) {
      const id = (row as Record<string, unknown>).id as string | undefined;
      if (!id) continue;
      try {
        await base44.asServiceRole.entities.Entitlement.delete(id);
        deletedIds.push(id);
      } catch (e) {
        errors.push(`delete_failed(${id}): ${(e as Error).message}`);
      }
    }

    console.log(
      "revokeFtEntitlement — account:", accountId,
      "revoked:", deletedIds.length,
      "errors:", errors.length
    );

    return Response.json({
      ok: true,
      revoked: deletedIds.length,
      accountId,
      deletedIds,
      errors,
    });
  } catch (err) {
    console.error("revokeFtEntitlement error:", (err as Error).message);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
