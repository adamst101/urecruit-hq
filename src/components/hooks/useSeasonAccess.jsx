// src/components/hooks/useSeasonAccess.js
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * useSeasonAccess (final)
 *
 * Rules:
 * - If NOT authenticated -> demo
 * - If authenticated AND has active Entitlement for currentYear -> paid
 * - Else -> demo
 */
export function useSeasonAccess() {
  const { currentYear, demoYear } = useMemo(() => {
    const now = new Date();
    const currentYearUTC = now.getUTCFullYear();
    return { currentYear: currentYearUTC, demoYear: currentYearUTC - 1 };
  }, []);

  const meQuery = useQuery({
    queryKey: ["auth_me"],
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      try {
        return await base44.auth?.me?.();
      } catch {
        return null;
      }
    },
  });

  const accountId = meQuery.data?.id || null;
  const canCheckEntitlements = !!accountId && !meQuery.isLoading;

  const entitlementQuery = useQuery({
    queryKey: ["entitlement_current_year", accountId, currentYear],
    enabled: canCheckEntitlements,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      // Fast path
      try {
        const rows = await base44.entities.Entitlement.filter({
          account_id: accountId,
          season_year: currentYear,
          status: "active",
        });
        if (Array.isArray(rows) && rows[0]) return rows[0];
      } catch {}

      // Fallback pull + match in memory
      let allActive = [];
      try {
        allActive = await base44.entities.Entitlement.filter({
          account_id: accountId,
          status: "active",
        });
      } catch {
        allActive = [];
      }

      const match = (allActive || []).find((e) => String(e?.season_year) === String(currentYear));
      return match || null;
    },
  });

  const loading = meQuery.isLoading || (canCheckEntitlements && entitlementQuery.isLoading);

  const isPaid = !!accountId && !!entitlementQuery.data;
  const seasonYear = isPaid ? currentYear : demoYear;

  return {
    loading,
    isLoading: loading,

    mode: isPaid ? "paid" : "demo",
    hasAccess: isPaid,

    currentYear,
    demoYear,
    seasonYear,
    season: seasonYear,

    accountId,
    entitlement: entitlementQuery.data || null,

    isAuthenticated: !!accountId,
  };
}
