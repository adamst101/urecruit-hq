// src/components/hooks/useWriteGate.jsx
import { useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "./useSeasonAccess.jsx";
import { useAthleteIdentity } from "../useAthleteIdentity.jsx";

import { readDemoMode } from "./demoMode.jsx";

/**
 * useWriteGate
 *
 * Best-practice contract for "where writes go":
 * - demo   => local writes allowed (no auth required)
 * - paid   => backend writes allowed ONLY when (accountId && athleteProfile)
 * - blocked => cannot write to backend; redirect to Login/Profile depending on state
 *
 * Deterministic mode precedence:
 * 1) URL override: ?mode=demo wins
 * 2) Local demo mode: readDemoMode() (set by setDemoMode) next
 * 3) Server entitlement: useSeasonAccess().mode
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
  const localDemo = useMemo(() => {
    try {
      return readDemoMode(); // { mode: "demo" | null, seasonYear: number | null }
    } catch {
      return { mode: null, seasonYear: null };
    }
  }, []);

  // Effective mode
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    if (localDemo?.mode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, localDemo?.mode, season.mode]);

  const isPaidMode = effectiveMode === "paid";
  const hasAccount = !!season.accountId;

  // Identity is only meaningful in paid mode, but hook is safe because it no-ops when not authed.
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();
  const hasProfile = !!athleteProfile;

  // Gate mode + reason
  const gate = useMemo(() => {
    // Demo mode: always allow local writes (even anonymous)
    if (!isPaidMode) return { mode: "demo", reason: null };

    // Paid mode but not ready -> blocked
    if (!hasAccount) return { mode: "blocked", reason: "Sign in required" };
    if (identityLoading) return { mode: "blocked", reason: "Loading profile" };
    if (!hasProfile) return { mode: "blocked", reason: "Complete athlete profile" };

    return { mode: "paid", reason: null };
  }, [isPaidMode, hasAccount, identityLoading, hasProfile]);

  /**
   * Default blocked behavior:
   * - Paid but missing account => Login (with next)
   * - Paid + account but missing profile => Profile (with next)
   */
  const defaultBlocked = useCallback(
    (opts = {}) => {
      const next =
        typeof opts?.next === "string" && opts.next.trim()
          ? opts.next
          : createPageUrl("Discover");

      if (!hasAccount) {
        navigate(createPageUrl("Login") + `?next=${encodeURIComponent(next)}`, {
          replace: false
        });
        return;
      }

      navigate(createPageUrl("Profile") + `?next=${encodeURIComponent(next)}`, {
        replace: false
      });
    },
    [navigate, hasAccount]
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
   * - If paid but blocked => Login/Profile (defaultBlocked)
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
            `?force=1&source=${encodeURIComponent(source)}&next=${encodeURIComponent(next)}&season=${encodeURIComponent(
              String(season.currentYear || "")
            )}`,
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
    effectiveMode, // debug signal
    write,
    requirePaid
  };
}
