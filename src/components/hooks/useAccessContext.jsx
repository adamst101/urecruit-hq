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

  const urlMode = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      const m = sp.get("mode");
      return m ? String(m).toLowerCase() : null;
    } catch {
      return null;
    }
  }, [loc.search]);

  const localDemo = useMemo(() => {
    try {
      return readDemoMode(); // { mode, seasonYear }
    } catch {
      return { mode: null, seasonYear: null };
    }
  }, []);

  const defaults = useMemo(() => getDemoDefaults(), []);

  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    if (localDemo?.mode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, localDemo?.mode, season.mode]);

  const seasonYear = useMemo(() => {
    if (effectiveMode === "paid") return season.currentYear;
    // demo: use locally stored seasonYear if present, else default demoYear
    return (
      (Number.isFinite(Number(localDemo?.seasonYear)) && Number(localDemo.seasonYear)) ||
      defaults.demoSeasonYear ||
      season.demoYear
    );
  }, [effectiveMode, localDemo?.seasonYear, defaults.demoSeasonYear, season.currentYear, season.demoYear]);

  const hasAccount = !!season.accountId;
  const hasProfile = !!athleteProfile;

  const canWriteBackend = useMemo(() => {
    // backend writes only allowed in paid mode + authed + profile loaded/present
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