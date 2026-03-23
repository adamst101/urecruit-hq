// src/components/hooks/useAccessContext.js
import { useMemo } from "react";
import { useLocation } from "react-router-dom";

import { useSeasonAccess } from "./useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";
import { readDemoMode } from "./demoMode";

/**
 * Single source of truth:
 * - effectiveMode: URL ?mode=demo wins, then localStorage demoMode, then seasonAccess mode
 * - paid/demo booleans
 * - accountId + entitlement
 * - athleteProfile (only relevant in paid mode)
 *
 * Goal: eliminate competing truths across RouteGuard/useWriteGate/BottomNav/etc.
 */
export function useAccessContext() {
  const loc = useLocation();
  const season = useSeasonAccess();

  const urlMode = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      const m = sp.get("mode");
      return m ? String(m).toLowerCase() : null;
    } catch {
      return null;
    }
  }, [loc.search]);

  const localDemo = useMemo(() => readDemoMode(), []);
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    if (localDemo?.mode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, localDemo?.mode, season.mode]);

  const isPaid = effectiveMode === "paid";
  const isDemo = !isPaid;

  // Fetch athlete identity only when paid-mode matters
  const identity = useAthleteIdentity({ enabled: isPaid });

  const hasProfile = useMemo(() => {
    if (!isPaid) return false;
    if (season.role === "admin") return true;
    return !!identity.athleteProfile;
  }, [isPaid, season.role, identity.athleteProfile]);

  // In demo mode, never block UI waiting on identity
  const loading = useMemo(() => {
    if (isDemo) return !!season.isLoading;
    return !!season.isLoading || !!identity.isLoading;
  }, [isDemo, season.isLoading, identity.isLoading]);

  return {
    loading,
    accessLoading: !!season.isLoading,
    identityLoading: !!identity.isLoading,

    effectiveMode, // "demo" | "paid"
    isPaid,
    isDemo,

    accountId: season.accountId || null,
    entitlement: season.entitlement || null,

    athleteProfile: identity.athleteProfile || null,
    hasProfile,

    currentYear: season.currentYear,
    demoYear: season.demoYear,
    seasonYear: season.seasonYear,

    // debug signals
    urlMode,
    localDemoSeasonYear: localDemo?.seasonYear ?? null,
    identityError: identity.isError ? identity.error : null,
  };
}
