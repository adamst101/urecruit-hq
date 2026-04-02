// functions/revokeFtEntitlement/entry.ts
// Admin-only server function to revoke ft_seed entitlements for an account.
//
// VISIBILITY MODEL — three-step discovery:
//   Step 1: asServiceRole.filter()  — finds entitlements created via grantFtEntitlement
//           (asServiceRole-created, visible to asServiceRole)
//   Step 2: asServiceRole.list()    — list-scan fallback for asServiceRole-created records
//           that may not appear in filter results
//   Step 3: base44.entities.Entitlement.list() (caller admin auth) — finds entitlements
//           created via the client-side fallback in grantTestEntitlement, which are
//           NOT visible to asServiceRole at all
//
// Deletion uses the same auth context that found the record:
//   asServiceRole-found → asServiceRole.delete()
//   admin-auth-found    → base44.entities.delete() with asServiceRole fallback
//
// Returns { ok, revoked, accountId, deletedIds, errors }.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const ADMIN_EMAILS = [
  "adamst101@gmail.com",
  "adamst1@gmail.com",
];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const caller = await base44.auth.me().catch(() => null);
  if (!caller) return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  const isAdmin = caller.role === "admin" || ADMIN_EMAILS.includes(caller.email);
  if (!isAdmin) return Response.json({ ok: false, error: "Admin only" }, { status: 403 });

  let body: { accountId?: string } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const { accountId } = body;
  if (!accountId) return Response.json({ ok: false, error: "accountId required" }, { status: 400 });

  const errors: string[] = [];
  // Track which IDs came from which source so we delete with the right auth context
  const srIds: string[]   = [];  // found via asServiceRole — delete with asServiceRole
  const dbIds: string[]   = [];  // found via caller admin auth — delete with base44.entities
  const deletedIds: string[] = [];

  const sr = base44.asServiceRole;

  // ── Step 1: asServiceRole filter ────────────────────────────────────────────
  try {
    const res = await sr.entities.Entitlement.filter({
      account_id: accountId,
      source: "ft_seed",
      status: "active",
    });
    if (Array.isArray(res)) {
      res.forEach((r: Record<string, unknown>) => {
        const id = r.id as string | undefined;
        if (id) srIds.push(id);
      });
    }
  } catch (e) {
    errors.push(`sr_filter_failed: ${(e as Error).message}`);
  }

  // ── Step 2: asServiceRole list-scan ─────────────────────────────────────────
  if (srIds.length === 0) {
    try {
      const all = await sr.entities.Entitlement.list("-created_date", 500);
      if (Array.isArray(all)) {
        all
          .filter((e: Record<string, unknown>) =>
            e.account_id === accountId && e.source === "ft_seed" && e.status === "active"
          )
          .forEach((e: Record<string, unknown>) => {
            const id = e.id as string | undefined;
            if (id && !srIds.includes(id)) srIds.push(id);
          });
      }
    } catch (e) {
      errors.push(`sr_list_scan_failed: ${(e as Error).message}`);
    }
  }

  // ── Step 3: caller admin auth list (catches client-side-created entitlements) ─
  // admin sessions can list() Entitlement; regular users cannot.
  // Records created via grantTestEntitlement's client-side fallback are ONLY
  // visible here — asServiceRole steps 1 and 2 will not find them.
  try {
    const all = await base44.entities.Entitlement.list("-created_date", 500);
    if (Array.isArray(all)) {
      all
        .filter((e: Record<string, unknown>) =>
          e.account_id === accountId && e.source === "ft_seed" && e.status === "active"
        )
        .forEach((e: Record<string, unknown>) => {
          const id = e.id as string | undefined;
          if (id && !srIds.includes(id) && !dbIds.includes(id)) dbIds.push(id);
        });
    }
  } catch (e) {
    errors.push(`db_list_scan_failed: ${(e as Error).message}`);
  }

  console.log(`[revokeFtEntitlement] account=${accountId} srIds=${JSON.stringify(srIds)} dbIds=${JSON.stringify(dbIds)}`);

  // ── Delete — use the auth context that found the record ─────────────────────
  for (const id of srIds) {
    try {
      await sr.entities.Entitlement.delete(id);
      deletedIds.push(id);
    } catch (e) {
      // sr delete failed — try caller auth as fallback
      try {
        await base44.entities.Entitlement.delete(id);
        deletedIds.push(id);
      } catch (e2) {
        errors.push(`delete_failed(${id}): sr=${(e as Error).message} db=${(e2 as Error).message}`);
      }
    }
  }

  for (const id of dbIds) {
    try {
      await base44.entities.Entitlement.delete(id);
      deletedIds.push(id);
    } catch (e) {
      // db delete failed — try asServiceRole as fallback
      try {
        await sr.entities.Entitlement.delete(id);
        deletedIds.push(id);
      } catch (e2) {
        errors.push(`delete_failed(${id}): db=${(e as Error).message} sr=${(e2 as Error).message}`);
      }
    }
  }

  console.log(`[revokeFtEntitlement] account=${accountId} revoked=${deletedIds.length} errors=${errors.length}`);

  return Response.json({
    ok: true,
    functionVersion: "revokeFtEntitlement_v_livecheck_1",
    revoked: deletedIds.length,
    accountId,
    deletedIds,
    srIds,
    dbIds,
    errors,
  });
});
