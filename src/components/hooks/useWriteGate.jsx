// src/components/hooks/useWriteGate.jsx
import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { createPageUrl } from "../../utils";

// IMPORTANT: your repo is .jsx — do not import .js
import { useSeasonAccess } from "./useSeasonAccess.jsx";
import { useAthleteIdentity } from "../useAthleteIdentity.jsx";

/**
 * useWriteGate
 *
 * Best-practice goals:
 * - ONE authoritative place to decide: demo vs paid vs blocked
 * - Demo writes are always allowed locally (even if not signed in)
 * - Paid writes are allowed only when:
 *    - accountId exists AND
 *    - athleteProfile exists
 * - Never import demoMode.* (eliminates extension/path drift issues)
 * - URL ?mode=demo ALWAYS forces demo behavior (preview/sales flows)
 *
 * Returns:
 *  {
 *    mode: "demo" | "paid" | "blocked",
 *    reason: string|null,
 *    effectiveMode: "demo" | "paid",
 *    write({ demo, paid, blocked, next }),
 *    requirePaid({ next, source })
 *  }
 */

// --- local demo mode reader (no imports) ---
const RM_MODE_KEY = "rm_mode";

function readLocalDemoMode() {
  try {
    const mode = localStorage.getItem(RM_MODE_KEY);
    return mode === "demo";
  } catch {
    return false;
  }
}

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

  // 2) Local demo override: set by localStorage rm_mode=demo (if you use it anywhere)
  const localDemo = useMemo(() => readLocalDemoMode(), []);

  // 3) Effective mode
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    if (localDemo) return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, localDemo, season.mode]);

  const isPaidMode = effectiveMode === "paid";
  const hasAccount = !!season.accountId;

  // Only load athlete identity when we truly need it (paid mode).
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();
  const hasProfile = !!athleteProfile;

  // Gate decision
  const gate = useMemo(() => {
    // Demo: always allow local writes
    if (!isPaidMode) return { mode: "demo", reason: null };

    // Paid mode: block until ready
    if (!hasAccount) return { mode: "blocked", reason: "Sign in required" };
    if (identityLoading) return { mode: "blocked", reason: "Loading profile" };
    if (!hasProfile) return { mode: "blocked", reason: "Complete athlete profile" };

    return { mode: "paid", reason: null };
  }, [isPaidMode, hasAccount, identityLoading, hasProfile]);

  // Default blocked routing (best practice: deterministic + carries next)
  const defaultBlocked = useCallback(
    (opts = {}) => {
      const next =
        typeof opts?.next === "string" && opts.next.trim()
          ? opts.next
          : createPageUrl("Discover");

      // Paid mode, authed, missing profile => Profile
      if (isPaidMode && hasAccount) {
        navigate(createPageUrl("Profile") + `?next=${encodeURIComponent(next)}`, {
          replace: false
        });
        return;
      }

      // Not authed => Login
      navigate(createPageUrl("Login") + `?next=${encodeURIComponent(next)}`, {
        replace: false
      });
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
   * Helper for actions that MUST be paid (e.g., backend writes).
   * - If in demo => go Subscribe
   * - If blocked in paid => go Profile/Login as appropriate
   */
  const requirePaid = useCallback(
    (opts = {}) => {
      const next =
        typeof opts?.next === "string" && opts.next.trim()
          ? opts.next
          : createPageUrl("Discover");
      const source = opts?.source ? String(opts.source) : "write_gate";

      if (gate.mode === "paid") return true;

      // In demo => upgrade path
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

      // blocked in paid
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
