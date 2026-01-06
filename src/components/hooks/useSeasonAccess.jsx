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
    queryFn: async () => {
      // Treat failures as "not logged in"
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    },
    retry: false,
  });

  const accountId = meQuery.data?.id || null;

  // If auth is explicitly null, do not try entitlements
  const canCheckEntitlements = !!accountId && !meQuery.isLoading;

  // Does the user have a current-year entitlement?
  const entitlementQuery = useQuery({
    queryKey: ["entitlement_current_year", accountId, currentYear],
    enabled: canCheckEntitlements,
    retry: false,
    queryFn: async () => {
      // First attempt: strict filter (fastest when it works)
      let rows = [];
      try {
        rows = await base44.entities.Entitlement.filter({
          account_id: accountId,
          season_year: currentYear,
          status: "active",
        });
      } catch {
        rows = [];
      }

      if (Array.isArray(rows) && rows[0]) return rows[0];

      // Fallback: season_year might be stored as string, or filter might be picky.
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

  // Paid if logged in AND has entitlement for currentYear
  const isPaid = !!accountId && !!entitlementQuery.data;

  // Public season to use for data queries in the app
  const seasonYear = isPaid ? currentYear : demoYear;

  return {
    // ✅ canonical fields (use these going forward)
    loading,
    isLoading: loading,

    mode: isPaid ? "paid" : "demo",
    hasAccess: isPaid,

    // seasons
    currentYear,
    demoYear,
    seasonYear,
    season: seasonYear, // alias used by some pages

    // raw identity
    accountId,
    entitlement: entitlementQuery.data || null,

    // helpful debugging/status flags (safe to keep)
    isAuthenticated: !!accountId,
  };
}
