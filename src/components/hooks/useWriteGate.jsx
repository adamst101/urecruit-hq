import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "./useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";

/**
 * useWriteGate
 *
 * Standardizes "where writes go":
 * - demo  => local writes allowed (no auth required)
 * - paid  => backend writes allowed ONLY when (accountId && athleteProfile)
 * - blocked => cannot write to backend; redirect to Onboarding/Checkout
 *
 * Contract:
 * const gate = useWriteGate();
 * gate.mode: "demo" | "paid" | "blocked"
 * gate.reason: string | null
 * gate.write({ demo, paid, blocked })
 * gate.requirePaid()
 */
export function useWriteGate() {
  const navigate = useNavigate();

  const { mode, accountId } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const isPaidMode = mode === "paid";
  const hasAccount = !!accountId;
  const hasProfile = !!athleteProfile;

  // "Paid write ready" means backend writes are safe.
  const paidReady = isPaidMode && hasAccount && hasProfile && !identityLoading;

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

  // Default blocked behavior: push user to the right place
  const defaultBlocked = useCallback(() => {
    // In paid season, missing auth/profile -> onboarding is the safest path
    navigate(createPageUrl("Onboarding"));
  }, [navigate]);

  // Main router for writes
  const write = useCallback(
    async ({ demo, paid, blocked }) => {
      if (gate.mode === "paid") {
        return paid ? await paid() : undefined;
      }
      if (gate.mode === "demo") {
        return demo ? await demo() : undefined;
      }
      // blocked
      if (blocked) return await blocked(gate.reason);
      return defaultBlocked();
    },
    [gate.mode, gate.reason, defaultBlocked]
  );

  // Helper for actions that MUST be paid (optional)
  const requirePaid = useCallback(() => {
    if (gate.mode === "paid") return true;
    defaultBlocked();
    return false;
  }, [gate.mode, defaultBlocked]);

  return {
    mode: gate.mode,     // "demo" | "paid" | "blocked"
    reason: gate.reason, // null or string
    write,
    requirePaid
  };
}