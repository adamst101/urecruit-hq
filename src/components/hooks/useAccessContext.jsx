// src/components/hooks/useAccessContext.js
import { useMemo } from "react";
import { useLocation } from "react-router-dom";

import { useSeasonAccess } from "./useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";
import { readDemoMode } from "./demoMode";

/**
 * useAccessContext
 *
 * Single canonical truth for:
 * - accountId / entitlement / paid vs demo
 * - effectiveMode resolution (URL ?mode=demo wins, then localStorage demoMode, then season access)
 * - athleteProfile presence (only meaningful for paid mode)
 *
 * Why this exists:
 * You currently have multiple “identity systems” that disagree.
 * This hook becomes the ONE source pages/components should read.
 */
export function useAccessContext() {
  const loc = useLocation();

  // Base canonical access (auth + entitlement -> paid/demo)
  const season = useSeasonAccess(); // { isLoading, mode, accountId, entitlement, currentYear, demoYear, seasonYear, ... }

  // URL override: ?mode=demo always wins
  const urlMode = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      const m = sp.get("mode");
      return m ? String(m).toLowerCase() : null;
    } catch {
      return null;
    }
  }, [loc.search]);

  // Local demo mode (set by setDemoMode)
  const localDemo = useMemo(() => readDemoMode(), []);

  // Effective mode (the only mode the UI should trust)
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    if (localDemo?.mode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, localDemo?.mode, season.mode]);

  const isPaid = effectiveMode === "paid";
  const isDemo = !isPaid;

  // Athlete identity (profile) resolver
  // NOTE: useAthleteIdentity currently runs whenever accountId exists.
  // We'll tighten that in a later step, but this hook standardizes how callers interpret it.
  const identity = useAthleteIdentity(); // { athleteProfile, isLoading, isError, error }

  const hasProfile = useMemo(() => {
    // Only enforce/meaningfully report profile in paid mode.
    if (!isPaid) return false;
    return !!identity.athleteProfile;
  }, [isPaid, identity.athleteProfile]);

  const loading = useMemo(() => {
    // In demo mode we should NOT block UI waiting on identity
    if (isDemo) return !!season.isLoading;
    // Paid mode: season + identity can matter
    return !!season.isLoading || !!identity.isLoading;
  }, [isDemo, season.isLoading, identity.isLoading]);

  return {
    // loading
    loading,
    accessLoading: !!season.isLoading,
    identityLoading: !!identity.isLoading,

    // mode
    effectiveMode, // "demo" | "paid"
    mode: season.mode, // raw seasonAccess mode (still useful for debugging)
    isPaid,
    isDemo,

    // identity / access
    accountId: season.accountId || null,
    entitlement: season.entitlement || null,
    athleteProfile: identity.athleteProfile || null,
    hasProfile,

    // season years
    currentYear: season.currentYear,
    demoYear: season.demoYear,
    seasonYear: season.seasonYear,

    // debug signals (optional)
    urlMode,
    localDemoSeasonYear: localDemo?.seasonYear || null,
    identityError: identity.isError ? identity.error : null,
  };
}
