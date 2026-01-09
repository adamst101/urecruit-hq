// src/components/hooks/useWriteGate.js
import { useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "../../utils";

import { useSeasonAccess } from "./useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";

import { readDemoMode, getDemoDefaults } from "./demoMode";

/**
 * useWriteGate
 *
 * Standardizes "where writes go":
 * - demo   => local writes allowed (no auth required)
 * - paid   => backend writes allowed ONLY when (accountId && athleteProfile)
 * - blocked => cannot write to backend; redirect to Profile/Subscribe depending on state
 *
 * Demo mode MUST be deterministic:
 * - URL override (?mode=demo) wins
 * - Otherwise localStorage demo mode (setDemoMode/readDemoMode) wins
 * - Otherwise fall back to season.mode from Entitlement
 */
export function useWriteGate() {
  const navigate = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();

  // 1) URL override: ?mode=demo always wins
  const urlMode = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      const m = sp.get("mode");
      return m ? String(m).toLowerCase() : null;
    } catch {
      return null;
    }
  }, [loc.search]);

  // 2) Local demo mode (set by setDemoMode)
  const localDemo = useMemo(() => readDemoMode(), []);
  const demoDefaults = useMemo(() => getDemoDefaults(), []);

  // Effective mode: URL demo OR local demo OR entitlement-paid
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    if (localDemo?.mode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, localDemo?.mode, season.mode]);

  // Helpful: which season year should demo read against (optional debug signal)
  const effectiveSeasonYear = useMemo(() => {
    if (effectiveMode !== "demo") return season.seasonYear;
    if (urlMode === "demo") return season.demoYear; // URL demo forces demo year
    if (localDemo?.mode === "demo" && Number.isFinite(localDemo?.seasonYear)) {
      return localDemo.seasonYear;
    }
    return demoDefaults?.demoSeasonYear || season.demoYear;
  }, [
    effectiveMode,
    urlMode,
    localDemo?.mode,
    localDemo?.seasonYear,
    demoDefaults?.demoSeasonYear,
    season.seasonYear,
    season.demoYear
  ]);

  const isPaidMode = effectiveMode === "paid";
  const hasAccount = !!season.accountId;

  // Identity hook is safe: it only fetches when accountId exists.
  // But we only *use* it for paid gating.
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();
  const hasProfile = !!athleteProfile;

  // Gate mode + reason
  const gate = useMemo(() => {
    // Demo mode: always allow local writes (even anonymous)
    if (!isPaidMode) {
      return { mode: "demo", reason: null };
    }

    // Paid mode but not ready -> blocked
    if (!hasAccount) {
      return { mode: "blocked", reason: "Sign in required" };
    }
    if (identityLoading) {
      return { mode: "blocked", reason: "Loading profile" };
    }
    if (!hasProfile) {
      return { mode: "blocked", reason: "Complete athlete profile" };
    }

    return { mode: "paid", reason: null };
  }, [isPaidMode, hasAccount, hasProfile, identityLoading]);

  /**
   * Default blocked behavior:
   * - Paid but missing profile => Profile
   * - Missing account => Login
   */
  const defaultBlocked = useCallback(
    (opts = {}) => {
      const next =
        typeof opts?.next === "string" && opts.next.trim()
          ? opts.next
          : createPageUrl("Discover");

      // Paid mode, authed, missing profile -> go Profile
      if (isPaidMode && hasAccount) {
        navigate(createPageUrl("Profile") + `?next=${encodeURIComponent(next)}`, {
          replace: false
        });
        return;
      }

      // Not authed -> Login (not Home)
      navigate(createPageUrl("Login") + `?next=${encodeURIComponent(next)}`, {
        replace: false
      });
    },
    [navigate, isPaidMode, hasAccount]
  );

  // Main router for writes
  const write = useCallback(
    async ({ demo, paid, blocked, next }) => {
      if (gate.mode === "paid") return paid ? await paid() : undefined;
      if (gate.mode === "demo") return demo ? await demo() : undefined;

      // blocked
      if (blocked) return await blocked(gate.reason);
      return defaultBlocked({ next });
    },
    [gate.mode, gate.reason, defaultBlocked]
  );

  /**
   * Helper for actions that MUST be paid.
   * - If in demo => Subscribe
   * - If paid but blocked => Profile (or Login if not authed)
   */
  const requirePaid = useCallback(
    (opts = {}) => {
      const next =
        typeof opts?.next === "string" && opts.next.trim()
          ? opts.next
          : createPageUrl("Discover");
      const source = opts?.source ? String(opts.source) : "write_gate";

      if (gate.mode === "paid") return true;

      if (gate.mode === "demo") {
        navigate(
          createPageUrl("Subscribe") +
            `?force=1&source=${encodeURIComponent(source)}&next=${encodeURIComponent(
              next
            )}&season=${encodeURIComponent(String(season.currentYear || ""))}`,
          { replace: false }
        );
        return false;
      }

      defaultBlocked({ next });
      return false;
    },
    [gate.mode, navigate, season.currentYear, defaultBlocked]
  );

  return {
    mode: gate.mode, // "demo" | "paid" | "blocked"
    reason: gate.reason,

    // useful debug signals
    effectiveMode,
    effectiveSeasonYear,

    write,
    requirePaid
  };
}
