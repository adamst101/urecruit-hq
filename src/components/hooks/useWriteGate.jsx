// src/components/hooks/useWriteGate.jsx
import { useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "./useSeasonAccess.jsx";
import { useAthleteIdentity } from "../useAthleteIdentity.jsx";

/**
 * useWriteGate
 *
 * Purpose:
 * Central guard for "write actions" like Favorite / Registered.
 * Discover.jsx expects: const ok = await writeGate.ensure("favorite")
 *
 * MVP Rules:
 * - If not authenticated -> route to Home with signin=1
 * - If authenticated but not entitled -> route to Subscribe
 * - If entitled but missing athlete profile -> route to Profile
 * - Otherwise -> allow (true)
 */
export function useWriteGate() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const ensure = useCallback(
    async (action = "write", options = {}) => {
      // Wait for season/identity to settle
      if (season?.isLoading || identityLoading) return false;

      const currentPath = (loc?.pathname || "") + (loc?.search || "");
      const nextParam = encodeURIComponent(currentPath);
      const campId = String(options?.campId || "").trim();
      const source = encodeURIComponent(`write_gate_${action}`);

      // 1) Not signed in
      if (!season?.accountId) {
        nav(
          createPageUrl("Home") +
            `?signin=1&source=${source}&next=${nextParam}` +
            (campId ? `&camp_id=${encodeURIComponent(campId)}` : ""),
          { replace: true }
        );
        return false;
      }

      // 2) Not entitled
      if (!season?.hasAccess) {
        nav(
          createPageUrl("Subscribe") +
            `?force=1&source=${source}&intent=${encodeURIComponent(action)}` +
            `&next=${nextParam}` +
            (campId ? `&camp_id=${encodeURIComponent(campId)}` : ""),
          { replace: true }
        );
        return false;
      }

      // 3) Paid but missing athlete profile
      if (!athleteProfile) {
        nav(createPageUrl("Profile") + `?next=${nextParam}`, { replace: true });
        return false;
      }

      // 4) Allowed
      return true;
    },
    [season?.isLoading, identityLoading, season?.accountId, season?.hasAccess, athleteProfile, nav, loc?.pathname, loc?.search]
  );

  // Return a stable contract
  return { ensure };
}

export default useWriteGate;
