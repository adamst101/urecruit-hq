// src/components/hooks/useSeasonAccess.jsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

// Safely read a season year from URL (optional)
function getSeasonFromUrl() {
  try {
    const sp = new URLSearchParams(window.location.search || "");
    const s = sp.get("season");
    if (!s) return null;
    const y = Number(s);
    return Number.isFinite(y) ? y : null;
  } catch {
    return null;
  }
}

export function useSeasonAccess() {
  // Keep your existing year model (as currently observed on your debug box)
  // currentYear: 2026, demoYear: 2025
  const { currentYear, demoYear } = useMemo(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    return { currentYear: y, demoYear: y - 1 };
  }, []);

  // Optional: allow pages to request a specific season (single-season model)
  const targetPaidYear = useMemo(() => getSeasonFromUrl() || currentYear, [currentYear]);

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
    },
  });

  const accountId = meQuery.data?.id || null;

  // --- Entitlement resolver (only when authed) ---
  const canCheckEntitlements = !!accountId && !meQuery.isLoading;

  const entitlementQuery = useQuery({
    queryKey: ["entitlement_for_season", accountId, targetPaidYear],
    enabled: canCheckEntitlements,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const matchesYear = (row) => String(row?.season_year) === String(targetPaidYear);
      const isActive = (row) => String(row?.status || "").toLowerCase() === "active";

      // 1) strict filter (number year)
      try {
        const rows = await base44.entities.Entitlement.filter({
          account_id: accountId,
          season_year: targetPaidYear,
          status: "active",
        });
        const list = Array.isArray(rows) ? rows : [];
        const hit = list.find((r) => isActive(r) && matchesYear(r));
        if (hit) return hit;
      } catch {}

      // 2) strict filter (string year)
      try {
        const rows = await base44.entities.Entitlement.filter({
          account_id: accountId,
          season_year: String(targetPaidYear),
          status: "active",
        });
        const list = Array.isArray(rows) ? rows : [];
        const hit = list.find((r) => isActive(r) && matchesYear(r));
        if (hit) return hit;
      } catch {}

      // 3) pull all active for account; match in memory
      try {
        const allActive = await base44.entities.Entitlement.filter({
          account_id: accountId,
          status: "active",
        });
        const list = Array.isArray(allActive) ? allActive : [];
        const hit = list.find((r) => isActive(r) && matchesYear(r));
        return hit || null;
      } catch {}

      // 4) last resort: list then client-side filter (if supported)
      try {
        const all = await base44.entities.Entitlement?.list?.();
        const list = Array.isArray(all) ? all : [];
        const mine = list.filter((e) => String(e?.account_id) === String(accountId));
        const active = mine.filter(isActive);
        const hit = active.find(matchesYear);
        return hit || null;
      } catch {
        return null;
      }
    },
  });

  const loading =
    meQuery.isLoading || (canCheckEntitlements && entitlementQuery.isLoading);

  const entitlement = entitlementQuery.data || null;
  const hasEntitlement = !!entitlement;

  // Mode + season selection:
  // - paid => targetPaidYear (single-season purchase)
  // - demo => demoYear
  const mode = accountId && hasEntitlement ? "paid" : "demo";
  const seasonYear = mode === "paid" ? targetPaidYear : demoYear;

  return {
    loading,
    isLoading: loading,

    mode, // "paid" | "demo"
    hasAccess: mode === "paid",

    currentYear,
    demoYear,

    seasonYear,
    season: seasonYear,

    accountId,
    entitlement,

    isAuthenticated: !!accountId,
  };
}
