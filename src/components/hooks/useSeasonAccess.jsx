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
 * - Authenticated AND active Entitlement for current UTC year => paid
 * - Else => demo
 *
 * Contract (stable):
 * {
 *   loading, isLoading,
 *   mode: "paid" | "demo",
 *   hasAccess,
 *   currentYear, demoYear, seasonYear, season,
 *   accountId, entitlement,
 *   isAuthenticated
 * }
 */
export function useSeasonAccess() {
  // Stable season years (UTC)
  const { currentYear, demoYear } = useMemo(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    return { currentYear: y, demoYear: y - 1 };
  }, []);

  // Auth user (treat any failure as logged out)
  const meQuery = useQuery({
    queryKey: ["auth_me"],
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      try {
        // base44.auth.me exists on this platform when auth is configured
        const me = await base44.auth.me();
        return me || null;
      } catch {
        return null;
      }
    }
  });

  const accountId = meQuery.data?.id ? String(meQuery.data.id) : null;

  const canCheckEntitlements = !!accountId && !meQuery.isLoading;

  const entitlementQuery = useQuery({
    queryKey: ["entitlement_current_year", accountId, currentYear],
    enabled: canCheckEntitlements,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      // 1) strict filter (best case)
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

      // 2) fallback: pull active entitlements and match year in-memory
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
    loading,
    isLoading: loading,

    mode: isPaid ? "paid" : "demo",
    hasAccess: isPaid,

    currentYear,
    demoYear,
    seasonYear,
    season: seasonYear, // legacy alias

    accountId,
    entitlement: entitlementQuery.data || null,

    isAuthenticated: !!accountId
  };
}
