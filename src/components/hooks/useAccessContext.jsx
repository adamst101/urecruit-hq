// src/components/hooks/useAccessContext.js
import { useMemo } from "react";
import { useLocation } from "react-router-dom";

import { useSeasonAccess } from "./useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";
import { readDemoMode, getDemoDefaults } from "./demoMode";

/**
 * useAccessContext
 *
 * SINGLE SOURCE OF TRUTH for:
 * - effectiveMode: "demo" | "paid"
 * - seasonYear (demo year vs current year)
 * - canWriteBackend (paid + authed + hasProfile)
 * - accountId / entitlement
 * - hasProfile
 * - loading (prevents early redirects)
 *
 * Precedence:
 * 1) URL ?mode=demo (force demo)
 * 2) localStorage demo mode (setDemoMode)
 * 3) season entitlement (useSeasonAccess)
 */
export function useAccessContext() {
  const loc = useLocation();
  const season = useSeasonAccess();

  const { athleteProfile, isLoading: identityLoading, isError: identityError } =
    useAthleteIdentity();

  // --- URL override ---
  const urlMode = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      const m = sp.get("mode");
      return m ? String(m).toLowerCase() : null;
    } catch {
      return null;
    }
  }, [loc.search]);

  // --- Local demo mode (READ EVERY RENDER; same-tab changes won't trigger storage event) ---
  const localDemo = (() => {
    try {
      return readDemoMode(); // { mode: "demo" | null, seasonYear: number|null }
    } catch {
      return { mode: null, seasonYear: null };
    }
  })();

  const defaults = useMemo(() => getDemoDefaults(), []);

  // --- Effective mode (single truth) ---
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    if (localDemo?.mode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, localDemo?.mode, season.mode]);

  // --- Season year selection ---
  const seasonYear = useMemo(() => {
    if (effectiveMode === "paid") return season.currentYear;

    const localYear = Number(localDemo?.seasonYear);
    if (Number.isFinite(localYear) && localYear > 1900) return localYear;

    return defaults.demoSeasonYear || season.demoYear;
  }, [
    effectiveMode,
    localDemo?.seasonYear,
    defaults.demoSeasonYear,
    season.currentYear,
    season.demoYear,
  ]);

  const hasAccount = !!season.accountId;
  const hasProfile = !!athleteProfile;

  // --- Loading (critical to stop premature redirects) ---
  const accessLoading = !!season.isLoading || !!season.loading;

  // Only consider identity loading when in paid mode (demo should not wait on profile)
  const loading =
    accessLoading || (effectiveMode === "paid" && hasAccount && identityLoading);

  // --- Capability ---
  const canWriteBackend = useMemo(() => {
    if (effectiveMode !== "paid") return false;
    if (!hasAccount) return false;
    if (identityLoading) return false;
    if (!hasProfile) return false;
    return true;
  }, [effectiveMode, hasAccount, identityLoading, hasProfile]);

  return {
    // canonical
    effectiveMode, // "demo" | "paid"
    seasonYear,

    // loading
    accessLoading,
    loading,

    // identity/subscription
    accountId: season.accountId || null,
    entitlement: season.entitlement || null,
    isAuthenticated: !!season.accountId,

    // profile
    athleteProfile: athleteProfile || null,
    hasProfile,
    identityLoading,
    identityError,

    // capabilities
    canWriteBackend,
  };
}
