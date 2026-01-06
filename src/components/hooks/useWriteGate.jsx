// src/components/hooks/useWriteGate.js
import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "./useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";

/**
 * useWriteGate
 *
 * Standardizes "where writes go":
 * - demo   => local writes allowed (no auth required)
 * - paid   => backend writes allowed ONLY when (accountId && athleteProfile)
 * - blocked => cannot write to backend; redirect to Profile/Subscribe depending on state
 *
 * Contract:
 * const gate = useWriteGate();
 * gate.mode: "demo" | "paid" | "blocked"
 * gate.reason: string | null
 * gate.write({ demo, paid, blocked })
 * gate.requirePaid({ next, source })
 */
export function useWriteGate() {
  const navigate = useNavigate();

  const { mode, accountId, currentYear } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const isPaidMode = mode === "paid";
  const hasAccount = !!accountId;
  const hasProfile = !!athleteProfile;

  // Gate mode + reason (single source of truth)
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
   * - If you're in paid mode, you're *entitled*, so missing profile should go to Profile (not Onboarding).
   * - If somehow account is missing (rare), go Home.
   */
  const defaultBlocked = useCallback(
    (opts = {}) => {
      const next =
        typeof opts?.next === "string" && opts.next.trim()
          ? opts.next
          : createPageUrl("Discover");

      // If we're paid but missing profile, the correct fix is Profile (sport selection / athlete profile)
      if (isPaidMode && hasAccount) {
        navigate(
          createPageUrl("Profile") + `?next=${encodeURIComponent(next)}`,
          { replace: false }
        );
        return;
      }

      // Otherwise (no account), go Home (they need to sign in)
      navigate(createPageUrl("Home"), { replace: false });
    },
    [navigate, isPaidMode, hasAccount]
  );

  // Main router for writes
  const write = useCallback(
    async ({ demo, paid, blocked, next }) => {
      if (gate.mode === "paid") {
        return paid ? await paid() : undefined;
      }
      if (gate.mode === "demo") {
        return demo ? await demo() : undefined;
      }

      // blocked
      if (blocked) return await blocked(gate.reason);
      return defaultBlocked({ next });
    },
    [gate.mode, gate.reason, defaultBlocked]
  );

  /**
   * Helper for actions that MUST be paid.
   * Sends user to Subscribe (with next) when not paid.
   * Sends user to Profile when paid but missing profile.
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
            )}&season=${encodeURIComponent(String(currentYear || ""))}`,
          { replace: false }
        );
        return false;
      }

      // blocked while paid (most likely profile still loading/missing)
      defaultBlocked({ next });
      return false;
    },
    [gate.mode, navigate, currentYear, defaultBlocked]
  );

  return {
    mode: gate.mode, // "demo" | "paid" | "blocked"
    reason: gate.reason, // null or string
    write,
    requirePaid,
  };
}
