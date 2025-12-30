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
 */
export function useSeasonAccess() {
  // You can change these any time
  const now = new Date();
  const currentYear = now.getFullYear();
  const demoYear = currentYear - 1;

  // Who is the user?
  const meQuery = useQuery({
    queryKey: ["auth_me"],
    queryFn: () => base44.auth.me(),
    retry: false
  });

  const accountId = meQuery.data?.id;

  // Does the user have a current-year entitlement?
  const entitlementQuery = useQuery({
    queryKey: ["entitlement", accountId, currentYear],
    enabled: !!accountId && !meQuery.isLoading && !meQuery.isError,
    retry: false,
    queryFn: async () => {
      const rows = await base44.entities.Entitlement.filter({
        account_id: accountId,
        season_year: currentYear,
        status: "active"
      });
      return rows?.[0] || null;
    }
  });

  const loading = meQuery.isLoading || (accountId ? entitlementQuery.isLoading : false);

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
