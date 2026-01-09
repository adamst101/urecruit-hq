// src/components/hooks/useWriteGate.js
import { useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "./useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";

import { readDemoMode } from "./demoMode";

/**
 * useWriteGate
 *
 * Standardizes "where writes go":
 * - demo   => local writes allowed (no auth required)
 * - paid   => backend writes allowed ONLY when (accountId && athleteProfile)
 * - blocked => cannot write to backend; redirect to Profile/Subscribe depending on state
 *
 * IMPORTANT:
 * - Demo must be deterministic across the app:
 *     URL ?mode=demo wins, else local demoMode wins, else season.mode drives.
 * - In demo mode, never depend on athlete identity loading for allowing demo writes.
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

  // 2) Local demo contract (set by setDemoMode / clearDemoMode)
  const localDemo = useMemo(() => {
    return readDemoMode(); // { mode: "demo" | null, seasonYear: number|null }
  }, []);

  // Effective mode: URL demo > local demo > season access
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    if (localDemo?.mode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, localDemo?.mode, season.mode]);

  const isPaidMode = effectiveMode === "paid";
  const hasAccount = !!season.accountId;

  // Only read athlete identity when we truly need it (paid mode).
  // In demo mode, we should not block demo writes due to identity loading.
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
          : (loc?.pathname || createPageUrl("Discover")) + (loc?.search || "");

      // Paid mode + authed => profile completion
      if (isPaidMode && hasAccount) {
        navigate(createPageUrl("Profile") + `?next=${encodeURIComponent(next)}`, {
          replace: false,
        });
        return;
      }

      // Otherwise, ask for login
      navigate(createPageUrl("Login") + `?next=${encodeURIComponent(next)}`, {
        replace: false,
      });
    },
    [navigate, isPaidMode, hasAccount, loc?.pathname, loc?.search]
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
   * - If paid but blocked => Profile/Login depending on state
   */
  const requirePaid = useCallback(
    (opts = {}) => {
      const next =
        typeof opts?.next === "string" && opts.next.trim()
          ? opts.next
          : (loc?.pathname || createPageUrl("Discover")) + (loc?.search || "");

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
    [
      gate.mode,
      navigate,
      season.currentYear,
      defaultBlocked,
      loc?.pathname,
      loc?.search,
    ]
  );

  return {
    mode: gate.mode, // "demo" | "paid" | "blocked"
    reason: gate.reason,
    effectiveMode, // debug signal
    write,
    requirePaid,
  };
}
