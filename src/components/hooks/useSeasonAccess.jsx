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
 * - Work around Base44 filter operator variance
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
      demoYear: currentYearUTC - 1,
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
    },
  });

  const accountId = meQuery.data?.id || null;

  // Only check entitlements when auth is resolved and we have an accountId
  const canCheckEntitlements = !!accountId && !meQuery.isLoading;

  const entitlementQuery = useQuery({
    queryKey: ["entitlement_current_year", accountId, currentYear],
    enabled: canCheckEntitlements,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      // 1) Fast path: strict filter (works when Base44 supports equality filters well)
      try {
        const rows = await base44.entities.Entitlement.filter({
          account_id: accountId,
          season_year: currentYear,
          status: "active",
        });
        if (Array.isArray(rows) && rows[0]) return rows[0];
      } catch {
        // fall through
      }

      // 2) Fallback: season_year might be stored as string OR filter might be picky.
      // Pull active entitlements for the account and match in memory.
      let allActive = [];
      try {
        allActive = await base44.entities.Entitlement.filter({
          account_id: accountId,
          status: "active",
        });
      } catch {
        allActive = [];
      }

      const match = (allActive || []).find((e) => {
        const y = e?.season_year;
        return String(y) === String(currentYear);
      });

      return match || null;
    },
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
    isAuthenticated: !!accountId,
  };
}
