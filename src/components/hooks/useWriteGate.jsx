// src/components/hooks/useWriteGate.js
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { useAccessContext } from "./useAccessContext";

/**
 * useWriteGate (final)
 *
 * Standardizes where writes go:
 * - demo => local writes allowed (no auth required)
 * - paid => backend writes allowed ONLY when (accountId && athleteProfile)
 * - blocked => redirect to Subscribe/Profile/Login depending on state
 */
export function useWriteGate() {
  const navigate = useNavigate();
  const access = useAccessContext();

  const hasAccount = !!access.accountId;
  const hasProfile = !!access.athleteProfile;

  const gate =
    !access.isPaid
      ? { mode: "demo", reason: null }
      : !hasAccount
        ? { mode: "blocked", reason: "Sign in required" }
        : access.identityLoading
          ? { mode: "blocked", reason: "Loading profile" }
          : !hasProfile
            ? { mode: "blocked", reason: "Complete athlete profile" }
            : { mode: "paid", reason: null };

  const defaultBlocked = useCallback(
    (opts = {}) => {
      const next =
        typeof opts?.next === "string" && opts.next.trim()
          ? opts.next
          : createPageUrl("Discover");

      if (access.isPaid && hasAccount) {
        navigate(createPageUrl("Profile") + `?next=${encodeURIComponent(next)}`, {
          replace: false,
        });
        return;
      }

      navigate(createPageUrl("Home"), { replace: false });
    },
    [navigate, access.isPaid, hasAccount]
  );

  const write = useCallback(
    async ({ demo, paid, blocked, next }) => {
      if (gate.mode === "paid") return paid ? await paid() : undefined;
      if (gate.mode === "demo") return demo ? await demo() : undefined;

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
            `?force=1&source=${encodeURIComponent(source)}&next=${encodeURIComponent(next)}`,
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
    effectiveMode: access.effectiveMode,
    write,
    requirePaid,
  };
}
