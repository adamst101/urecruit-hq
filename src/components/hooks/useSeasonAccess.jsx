// src/components/hooks/useSeasonAccess.jsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * useSeasonAccess (canonical)
 *
 * Goals:
 * - Correctly detect auth + paid entitlement every time
 * - Avoid "stuck in demo" after login
 * - Never throw; failures degrade to demo mode
 *
 * Rules:
 * - Not authenticated => demo
 * - Authenticated + active entitlement for current UTC year => paid
 * - Else => demo
 *
 * Notes:
 * - Uses UTC year (avoids timezone edge cases)
 * - Handles season_year stored as number OR string
 * - Uses multiple fallback query strategies because Base44 entity filtering can vary
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
        // Base44 session-based auth
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
      // Helper: normalize year compare
      const matchesYear = (row) => String(row?.season_year) === String(currentYear);

      // 1) strict filter (best case)
      try {
        const rows = await base44.entities.Entitlement.filter({
          account_id: accountId,
          season_year: currentYear,
          status: "active"
        });
        const list = Array.isArray(rows) ? rows : [];
        const hit = list.find(matchesYear);
        if (hit) return hit;
      } catch {
        // fall through
      }

      // 2) strict filter with string year (common variation)
      try {
        const rows = await base44.entities.Entitlement.filter({
          account_id: accountId,
          season_year: String(currentYear),
          status: "active"
        });
        const list = Array.isArray(rows) ? rows : [];
        const hit = list.find(matchesYear);
        if (hit) return hit;
      } catch {
        // fall through
      }

      // 3) pull all active for account; match in memory (most reliable)
      try {
        const allActive = await base44.entities.Entitlement.filter({
          account_id: accountId,
          status: "active"
        });
        const list = Array.isArray(allActive) ? allActive : [];
        const hit = list.find(matchesYear);
        return hit || null;
      } catch {
        // fall through
      }

      // 4) last resort: list then filter client-side (some Base44 configs prefer list())
      try {
        const all = await base44.entities.Entitlement?.list?.();
        const list = Array.isArray(all) ? all : [];
        const mine = list.filter((e) => String(e?.account_id) === String(accountId));
        const active = mine.filter((e) => String(e?.status || "").toLowerCase() === "active");
        const hit = active.find(matchesYear);
        return hit || null;
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
