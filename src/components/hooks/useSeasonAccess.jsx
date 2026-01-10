// src/components/hooks/useSeasonAccess.jsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * useSeasonAccess
 * Single source of truth for:
 * - auth state (accountId)
 * - mode: "paid" vs "demo"
 * - seasonYear: currentYear when paid, demoYear when demo
 *
 * Best practices:
 * - Never throw from auth checks; treat failures as logged-out
 * - Normalize year comparisons (Entitlement.season_year can be number or string)
 * - Keep query keys stable and scoped by accountId/year
 * - Don’t depend on file extension imports anywhere else; THIS file is .jsx
 */
export function useSeasonAccess() {
  // Stable season years (UTC avoids Jan 1 timezone edge cases)
  const { currentYear, demoYear } = useMemo(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    return { currentYear: y, demoYear: y - 1 };
  }, []);

  // Who is the user?
  const meQuery = useQuery({
    queryKey: ["auth_me"],
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      try {
        // Base44 auth may throw if not signed in
        return await base44.auth.me();
      } catch {
        return null;
      }
    },
  });

  const accountId = meQuery.data?.id ? String(meQuery.data.id) : null;

  // Only check entitlements when auth is resolved and we have an accountId
  const canCheckEntitlements = !!accountId && !meQuery.isLoading;

  const entitlementQuery = useQuery({
    queryKey: ["entitlement_current_year", accountId, currentYear],
    enabled: canCheckEntitlements,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      // Fast path: strict filter
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

      // Fallback: pull active entitlements for account, match in memory
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
    // canonical loading flags
    loading,
    isLoading: loading,

    // mode
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
