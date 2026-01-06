import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";

/**
 * RouteGuard
 *
 * Goals:
 * - Keep Home as a true front door (no auto-redirect here)
 * - Allow demo browsing without auth (Discover demo)
 * - Enforce: Paid users MUST have an athlete profile before using paid features
 *
 * Flags:
 * - requireAuth: user must be signed in (accountId required)
 * - requirePaid: user must have access (mode === "paid")
 * - requireProfile: user must have athlete profile (paid-only enforcement)
 *
 * Notes:
 * - requireProfile only triggers when mode === "paid"
 * - If you want "profile allowed without paid" you can route to Profile without requirePaid.
 */
export default function RouteGuard({
  requireAuth = false,
  requirePaid = false,
  requireProfile = false,
  children,
}) {
  const nav = useNavigate();
  const loc = useLocation();

  const { isLoading: accessLoading, mode, accountId } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const loading = accessLoading || (mode === "paid" && identityLoading);

  const nextParam = useMemo(() => encodeURIComponent(loc.pathname + (loc.search || "")), [loc.pathname, loc.search]);

  useEffect(() => {
    if (loading) return;

    // 1) Auth required
    if (requireAuth && !accountId) {
      nav(createPageUrl("Home") + `?next=${nextParam}`, { replace: true });
      return;
    }

    // 2) Paid required
    if (requirePaid && mode !== "paid") {
      nav(createPageUrl("Subscribe") + `?next=${nextParam}`, { replace: true });
      return;
    }

    // 3) Profile required (paid-only enforcement)
    if (requireProfile && mode === "paid" && !athleteProfile) {
      nav(createPageUrl("Profile") + `?next=${nextParam}`, { replace: true });
      return;
    }
  }, [loading, requireAuth, requirePaid, requireProfile, accountId, mode, athleteProfile, nav, nextParam]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-600">Loading…</div>
      </div>
    );
  }

  return <>{children}</>;
}
