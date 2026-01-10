// src/components/hooks/useSeasonAccess.jsx
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
 * - Return a consistent contract used across pages
 */
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

  // Auth identity (treat failure as logged out)
  const meQuery = useQuery({
    queryKey: ["auth_me"],
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    }
  });

  const accountId = meQuery.data?.id || null;

  // Only check entitlements when we have accountId and auth is resolved
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

      // 2) Fallback: match season_year as string
      let allActive = [];
      try {
        allActive = await base44.entities.Entitlement.filter({
          account_id: accountId,
          status: "active"
        });
      } catch {
        allActive = [];
      }

      const match = (allActive || []).find((e) => String(e?.season_year) === String(currentYear));
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

    // flags
    isAuthenticated: !!accountId
  };
}

/**
 * Backward-compatible default export.
 * Some files may import `useSeasonAccess` as default.
 */
export default useSeasonAccess;
