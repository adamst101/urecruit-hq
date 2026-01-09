// src/components/hooks/useSeasonAccess.js
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * useSeasonAccess
 * Single source of truth for whether the user is in demo mode or paid mode.
 *
 * Rules:
 * - If user is NOT authenticated -> demo
 * - If authenticated AND has active Entitlement for currentYear -> paid
 * - Else -> demo
 *
 * Hardening:
 * - Use UTC year to avoid Jan 1 timezone edge cases
 * - Handle season_year stored as number OR string
 * - Keep query keys stable
 * - Return a consistent contract used across pages (Subscribe/Profile/Discover/etc.)
 */

// Try hard to extract a stable "account id" from base44.auth.me()
function resolveAccountId(me) {
  if (!me) return null;

  // Common Base44 patterns
  const candidates = [
    me.account_id,
    me.accountId,
    me.account?.id,
    me.account?._id,
    me.account?.uuid,
    me.org_id,
    me.orgId,

    // Last resort: user id (works only if your app uses user as account)
    me.id,
    me._id,
    me.uuid
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
    if (typeof c === "number" && Number.isFinite(c)) return String(c);
  }
  return null;
}

export function useSeasonAccess() {
  // Stable season years (UTC)
  const { currentYear, demoYear } = useMemo(() => {
    const now = new Date();
    const currentYearUTC = now.getUTCFullYear();
    return {
      currentYear: currentYearUTC,
      demoYear: currentYearUTC - 1
    };
  }, []);

  // Who is the user?
  const meQuery = useQuery({
    queryKey: ["auth_me"],
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      // Treat failures as "not logged in"
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    }
  });

  const me = meQuery.data || null;
  const accountId = resolveAccountId(me);

  // Only check entitlements when auth is resolved and we have an accountId
  const canCheckEntitlements = !!accountId && !meQuery.isLoading;

  const entitlementQuery = useQuery({
    queryKey: ["entitlement_current_year", accountId, currentYear],
    enabled: canCheckEntitlements,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      // 1) Fast path: strict filter
      try {
        const rows = await base44.entities.Entitlement.filter({
          account_id: accountId,
          season_year: currentYear,
          status: "active"
        });
        if (Array.isArray(rows) && rows[0]) return rows[0];
      } catch {
        // fall through
      }

      // 2) Fallback: pull active entitlements then match in memory
      let allActive = [];
      try {
        allActive = await base44.entities.Entitlement.filter({
          account_id: accountId,
          status: "active"
        });
      } catch {
        allActive = [];
      }

      const match = (allActive || []).find((e) => {
        const y = e?.season_year;
        return String(y) === String(currentYear);
      });

      return match || null;
    }
  });

  const loading =
    meQuery.isLoading || (canCheckEntitlements && entitlementQuery.isLoading);

  const isPaid = !!accountId && !!entitlementQuery.data;
  const seasonYear = isPaid ? currentYear : demoYear;

  return {
    // canonical
    loading,
    isLoading: loading,

    mode: isPaid ? "paid" : "demo",
    hasAccess: isPaid,

    // seasons
    currentYear,
    demoYear,
    seasonYear,
    season: seasonYear, // legacy alias

    // identity
    accountId,
    entitlement: entitlementQuery.data || null,
    me, // optional debug, harmless

    // flags
    isAuthenticated: !!accountId
  };
}
