// src/components/hooks/useWriteGate.jsx
import { useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "./useSeasonAccess.jsx";
import { useAthleteIdentity } from "../useAthleteIdentity.jsx";

import { readDemoMode, getDemoDefaults } from "./demoMode.jsx";

/**
 * useWriteGate
 *
 * Standardizes "where writes go":
 * - demo    => local writes allowed (no auth required)
 * - paid    => backend writes allowed ONLY when (accountId && athleteProfile)
 * - blocked => cannot write to backend; redirect to Profile/Subscribe depending on state
 *
 * Best-practice behaviors:
 * - URL ?mode=demo always wins (predictable)
 * - LocalStorage demo mode honored (readDemoMode)
 * - Only load athlete identity in paid mode (performance + avoids unwanted coupling)
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

  // 2) Local demo contract (set by setDemoMode)
  const localDemo = useMemo(() => readDemoMode(), []);

  // 3) Defaults (if local demo exists but seasonYear missing)
  const demoDefaults = useMemo(() => getDemoDefaults(), []);

  // Effective mode: demo wins if URL says demo OR localStorage says demo
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    if (localDemo?.mode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, localDemo?.mode, season.mode]);

  const isPaidMode = effectiveMode === "paid";
  const hasAccount = !!season.accountId;

  // Only read identity when we truly need it (paid mode)
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
  }, [isPaidMode, hasAccount, identityLoading, hasProfile]);

  /**
   * Default blocked behavior:
   * - Paid but missing profile => Profile
   * - Missing account => Home
   */
  const defaultBlocked = useCallback(
    (opts = {}) => {
      const next =
        typeof opts?.next === "string" && opts.next.trim()
          ? opts.next
          : createPageUrl("Discover");

      if (isPaidMode && hasAccount) {
        navigate(createPageUrl("Profile") + `?next=${encodeURIComponent(next)}`, {
          replace: false
        });
        return;
      }

      navigate(createPageUrl("Home"), { replace: false });
    },
    [navigate, isPaidMode, hasAccount]
  );

  // Main router for writes
  const write = useCallback(
    async ({ demo, paid, blocked, next } = {}) => {
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
   * - If paid but blocked => Profile (or Home if not authed)
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
        // If local demo mode had a seasonYear, keep it; else default to prior year
        const demoSeasonYear =
          Number.isFinite(Number(localDemo?.seasonYear))
            ? Number(localDemo.seasonYear)
            : Number(demoDefaults?.demoSeasonYear) || null;

        navigate(
          createPageUrl("Subscribe") +
            `?force=1&source=${encodeURIComponent(source)}&next=${encodeURIComponent(
              next
            )}` +
            (season.currentYear ? `&season=${encodeURIComponent(String(season.currentYear))}` : "") +
            (demoSeasonYear ? `&demoSeason=${encodeURIComponent(String(demoSeasonYear))}` : ""),
          { replace: false }
        );
        return false;
      }

      defaultBlocked({ next });
      return false;
    },
    [gate.mode, navigate, season.currentYear, defaultBlocked, localDemo?.seasonYear, demoDefaults?.demoSeasonYear]
  );

  return {
    mode: gate.mode, // "demo" | "paid" | "blocked"
    reason: gate.reason,
    effectiveMode,
    write,
    requirePaid
  };
}
