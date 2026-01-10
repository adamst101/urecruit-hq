// src/components/hooks/useSeasonAccess.jsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * useSeasonAccess (canonical)
 *
 * Contract:
 * - Always returns stable fields used across the app
 * - Never throws; failures degrade to demo mode
 *
 * Rules:
 * - Not authenticated => demo
 * - Authenticated + active entitlement for current UTC year => paid
 * - Else => demo
 *
 * Notes:
 * - Uses UTC year (avoids timezone edge cases on Jan 1)
 * - Handles season_year stored as number OR string
 * - Uses safe fallback query patterns if strict filters fail
 */
export function useSeasonAccess() {
  const { currentYear, demoYear } = useMemo(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    return { currentYear: y, demoYear: y - 1 };
  }, []);

  // --- Auth resolver (treat errors as logged out) ---
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

  // --- Entitlement resolver (only when authed) ---
  const canCheckEntitlements = !!accountId && !meQuery.isLoading;

  const entitlementQuery = useQuery({
    queryKey: ["entitlement_current_year", accountId, currentYear],
    enabled: canCheckEntitlements,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      // 1) strict filter
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

      // 2) fallback: pull all active for account; match in memory (string-safe)
      try {
        const allActive = await base44.entities.Entitlement.filter({
          account_id: accountId,
          status: "active"
        });

        const match = (Array.isArray(allActive) ? allActive : []).find((e) => {
          const y = e?.season_year;
          return String(y) === String(currentYear);
        });

        return match || null;
      } catch {
        return null;
      }
    }
  });

  const loading = meQuery.isLoading || (canCheckEntitlements && entitlementQuery.isLoading);

  const hasEntitlement = !!entitlementQuery.data;
  const mode = accountId && hasEntitlement ? "paid" : "demo";

  const seasonYear = mode === "paid" ? currentYear : demoYear;

  return {
    // canonical loading flags
    loading,
    isLoading: loading,

    // canonical access model
    mode, // "paid" | "demo"
    hasAccess: mode === "paid",

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
