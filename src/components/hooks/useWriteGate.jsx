// src/components/hooks/useWriteGate.jsx
import { useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "./useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";

import { readDemoMode, getDemoDefaults } from "./demoMode";

/**
 * useWriteGate
 *
 * Best-practice behavior:
 * - Demo mode: allow local-only writes (no auth/profile required)
 * - Paid mode: backend writes allowed ONLY when (accountId && athleteProfile)
 * - Blocked: route user to correct next action (Login / Subscribe / Profile)
 *
 * Deterministic mode precedence:
 * 1) URL param ?mode=demo
 * 2) LocalStorage demo toggle (readDemoMode)
 * 3) Season access (paid vs demo)
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

  // 2) Local demo contract from storage (set via setDemoMode)
  const storedDemo = useMemo(() => readDemoMode(), []);

  // Defaults (year) — not a mode flag
  const demoDefaults = useMemo(() => getDemoDefaults(), []);

  // Effective mode
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    if (storedDemo?.mode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, storedDemo?.mode, season.mode]);

  const isPaidMode = effectiveMode === "paid";
  const hasAccount = !!season.accountId;

  // Only identity is relevant in paid mode
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();
  const hasProfile = !!athleteProfile;

  // Gate mode + reason
  const gate = useMemo(() => {
    // Demo mode: always allow local writes (even anonymous)
    if (!isPaidMode) return { mode: "demo", reason: null };

    // Paid mode: enforce auth + profile
    if (!hasAccount) return { mode: "blocked", reason: "Sign in required" };
    if (identityLoading) return { mode: "blocked", reason: "Loading profile" };
    if (!hasProfile) return { mode: "blocked", reason: "Complete athlete profile" };

    return { mode: "paid", reason: null };
  }, [isPaidMode, hasAccount, identityLoading, hasProfile]);

  /**
   * Default blocked behavior:
   * - Paid but missing profile => Profile (return to next)
   * - Missing account => Login (return to next)
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

      // authed but missing profile
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
   * - If in demo => Subscribe (carry user back)
   * - If paid but blocked => Login/Profile
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
    effectiveMode, // debug/telemetry
    demoSeasonYear: storedDemo?.seasonYear ?? demoDefaults?.demoSeasonYear ?? season.demoYear,
    write,
    requirePaid
  };
}
