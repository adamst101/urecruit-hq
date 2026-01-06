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
    queryFn: () => base44.auth.me(),
    retry: false
  });

  const accountId = meQuery.data?.id || null;

  // Does the user have a current-year entitlement?
  const entitlementQuery = useQuery({
    queryKey: ["entitlement_current_year", accountId, currentYear],
    enabled: !!accountId && !meQuery.isLoading && !meQuery.isError,
    retry: false,
    queryFn: async () => {
      // First attempt: strict filter (fastest when it works)
      let rows = [];
      try {
        rows = await base44.entities.Entitlement.filter({
          account_id: accountId,
          season_year: currentYear,
          status: "active"
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

  const loading = meQuery.isLoading || (!!accountId && entitlementQuery.isLoading);

  // If not logged in, always demo
  const isPaid = !!accountId && !!entitlementQuery.data;

  return {
    loading,
    mode: isPaid ? "paid" : "demo",

    // seasons
    currentYear,
    demoYear,

    // For demo hooks that accept seasonYear
    seasonYear: isPaid ? currentYear : demoYear,

    // raw
    accountId,
    entitlement: entitlementQuery.data || null
  };
}
