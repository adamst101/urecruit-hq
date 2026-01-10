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
 * - demo     => local writes allowed (no auth required)
 * - paid     => backend writes allowed ONLY when (accountId && athleteProfile)
 * - blocked  => cannot write to backend; redirect to Profile/Subscribe depending on state
 *
 * Deterministic mode precedence:
 *  1) URL ?mode=demo
 *  2) LocalStorage demo mode (readDemoMode)
 *  3) useSeasonAccess mode
 */
export function useWriteGate() {
  const navigate = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();

  // 1) URL override
  const urlMode = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      const m = sp.get("mode");
      return m ? String(m).toLowerCase() : null;
    } catch {
      return null;
    }
  }, [loc.search]);

  // 2) Local demo mode (persisted)
  const localDemo = useMemo(() => {
    const r = readDemoMode();
    if (r?.mode === "demo" && Number.isFinite(Number(r?.seasonYear))) {
      return { mode: "demo", seasonYear: Number(r.seasonYear) };
    }
    const d = getDemoDefaults();
    return { mode: null, seasonYear: d?.demoSeasonYear ?? null };
  }, []);

  // Effective mode
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

  // Gate
  const gate = useMemo(() => {
    // Demo: always allow local writes
    if (!isPaidMode) return { mode: "demo", reason: null };

    // Paid but not ready => blocked
    if (!hasAccount) return { mode: "blocked", reason: "Sign in required" };
    if (identityLoading) return { mode: "blocked", reason: "Loading profile" };
    if (!hasProfile) return { mode: "blocked", reason: "Complete athlete profile" };

    return { mode: "paid", reason: null };
  }, [isPaidMode, hasAccount, hasProfile, identityLoading]);

  const defaultBlocked = useCallback(
    (opts = {}) => {
      const next =
        typeof opts?.next === "string" && opts.next.trim()
          ? opts.next
          : createPageUrl("Discover");

      // Paid but missing profile
      if (isPaidMode && hasAccount) {
        navigate(createPageUrl("Profile") + `?next=${encodeURIComponent(next)}`, {
          replace: false
        });
        return;
      }

      // Not authed
      navigate(createPageUrl("Home"), { replace: false });
    },
    [navigate, isPaidMode, hasAccount]
  );

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
    effectiveMode,
    write,
    requirePaid
  };
}
