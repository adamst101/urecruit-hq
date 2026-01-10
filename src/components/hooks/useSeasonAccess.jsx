// src/components/hooks/useSeasonAccess.jsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * useSeasonAccess
 * Single source of truth for demo vs paid access.
 *
 * Rules:
 * - Not authenticated => demo
 * - Authenticated + active entitlement for current UTC year => paid
 * - Else => demo
 *
 * Notes:
 * - Uses UTC year to avoid timezone edge cases
 * - Handles season_year stored as string or number
 * - Keeps return contract stable across the app
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

  // Who is the user?
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

  // Only check entitlements when auth is resolved
  const canCheckEntitlements = !!accountId && !meQuery.isLoading;

  const entitlementQuery = useQuery({
    queryKey: ["entitlement_current_year", accountId, currentYear],
    enabled: canCheckEntitlements,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      // 1) Strict filter (fast path)
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

      // 2) Fallback: pull all active for account and match in memory (handles string/number issues)
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

  const loading = meQuery.isLoading || (canCheckEntitlements && entitlementQuery.isLoading);

  const isPaid = !!accountId && !!entitlementQuery.data;
  const seasonYear = isPaid ? currentYear : demoYear;

  return {
    // canonical loading flags
    loading,
    isLoading: loading,

    // access mode
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
