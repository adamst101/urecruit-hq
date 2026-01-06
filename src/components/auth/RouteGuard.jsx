import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";

/**
 * RouteGuard
 *
 * Controls access at the ROUTE level (not UI-level).
 *
 * Policy flags:
 * - requireAuth: must be signed in
 * - requirePaid: must have current-season entitlement
 * - requireProfile: must have athlete profile
 *
 * Design principles:
 * - Home is NEVER guarded
 * - Demo users can browse Discover/Calendar
 * - Paid features require entitlement + athlete profile
 * - Profile creation is allowed even without subscription
 */
export default function RouteGuard({
  requireAuth = false,
  requirePaid = false,
  requireProfile = false,
  children
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    loading: accessLoading,
    mode,
    accountId,
    currentYear
  } = useSeasonAccess();

  const {
    athleteProfile,
    isLoading: identityLoading
  } = useAthleteIdentity();

  useEffect(() => {
    if (accessLoading || identityLoading) return;

    const pathname = location.pathname;

    /* ----------------------------------------------------
       1) AUTH REQUIRED
    ---------------------------------------------------- */
    if (requireAuth && !accountId) {
      navigate(
        createPageUrl("Home") + `?next=${encodeURIComponent(pathname)}`,
        { replace: true }
      );
      return;
    }

    /* ----------------------------------------------------
       2) PAID REQUIRED
       (user must have entitlement for current season)
    ---------------------------------------------------- */
    if (requirePaid && mode !== "paid") {
      navigate(
        createPageUrl("Subscribe") + `?next=${encodeURIComponent(pathname)}`,
        { replace: true }
      );
      return;
    }

    /* ----------------------------------------------------
       3) ATHLETE PROFILE REQUIRED
       (only enforced for paid flows)
    ---------------------------------------------------- */
    if (requireProfile && mode === "paid" && !athleteProfile) {
      navigate(
        createPageUrl("Profile") + `?next=${encodeURIComponent(pathname)}`,
        { replace: true }
      );
      return;
    }
  }, [
    accessLoading,
    identityLoading,
    requireAuth,
    requirePaid,
    requireProfile,
    accountId,
    mode,
    athleteProfile,
    navigate,
    location.pathname
  ]);

  /* ----------------------------------------------------
     LOADING STATE
  ---------------------------------------------------- */
  if (accessLoading || identityLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  return <>{children}</>;
}
