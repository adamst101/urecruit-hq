// src/components/hooks/useWriteGate.js
import { useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { createPageUrl } from "../../utils";
import { useAccessContext } from "./useAccessContext";
import { readDemoMode } from "./demoMode";

/**
 * useWriteGate (fixed + aligned)
 *
 * Single, consistent write gating:
 * - Demo mode: allow LOCAL writes (even anonymous)
 * - Paid mode: allow BACKEND writes only when (accountId && hasProfile)
 * - Blocked: redirect to Profile (if authed) or Login/Home (if not)
 *
 * Mode resolution priority:
 * 1) URL ?mode=demo  (always wins)
 * 2) localStorage demoMode (setDemoMode/readDemoMode)
 * 3) accessContext.effectiveMode
 */
export function useWriteGate() {
  const navigate = useNavigate();
  const loc = useLocation();

  const { effectiveMode: accessMode, accountId, hasProfile, identityLoading } =
    useAccessContext();

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
    return readDemoMode(); // { mode: "demo" | null, seasonYear: number|null }
  }, []);

  // Effective mode
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    if (localDemo?.mode === "demo") return "demo";
    return accessMode === "paid" ? "paid" : "demo";
  }, [urlMode, localDemo?.mode, accessMode]);

  const isPaidMode = effectiveMode === "paid";
  const hasAccount = !!accountId;

  // Gate mode + reason
  const gate = useMemo(() => {
    // Demo mode: always allow local writes (even anonymous)
    if (!isPaidMode) {
      return { mode: "demo", reason: null };
    }

    // Paid mode: must be authed + have profile
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
   * - Missing account => Login (prefer) or Home (fallback)
   */
  const defaultBlocked = useCallback(
    (opts = {}) => {
      const next =
        typeof opts?.next === "string" && opts.next.trim()
          ? opts.next
          : createPageUrl("Discover");

      // If we're aiming for paid writes and user is authed, push them to Profile completion
      if (isPaidMode && hasAccount) {
        navigate(createPageUrl("Profile") + `?next=${encodeURIComponent(next)}`, {
          replace: false,
        });
        return;
      }

      // Otherwise, get them to auth front door
      navigate(createPageUrl("Login") + `?next=${encodeURIComponent(next)}`, {
        replace: false,
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
   * Helper for actions that MUST be paid:
   * - Demo => Subscribe (and come back)
   * - Blocked in paid => Profile (or Login)
   */
  const requirePaid = useCallback(
    (opts = {}) => {
      const next =
        typeof opts?.next === "string" && opts.next.trim()
          ? opts.next
          : createPageUrl("Discover");
      const source = opts?.source ? String(opts.source) : "write_gate";

      // Compute current year in UTC (stable for season switching)
      const currentYearUTC = new Date().getUTCFullYear();

      if (gate.mode === "paid") return true;

      if (gate.mode === "demo") {
        navigate(
          createPageUrl("Subscribe") +
            `?force=1&source=${encodeURIComponent(source)}&next=${encodeURIComponent(
              next
            )}&season=${encodeURIComponent(String(currentYearUTC))}`,
          { replace: false }
        );
        return false;
      }

      defaultBlocked({ next });
      return false;
    },
    [gate.mode, navigate, defaultBlocked]
  );

  return {
    mode: gate.mode, // "demo" | "paid" | "blocked"
    reason: gate.reason,
    effectiveMode,
    demoSeasonYear: localDemo?.seasonYear || null, // optional debug/use
    write,
    requirePaid,
  };
}
