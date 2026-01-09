// src/components/auth/RouteGuard.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";
import { readDemoMode } from "../hooks/demoMode";

/**
 * RouteGuard
 *
 * Goals:
 * - Keep Home as a true front door (no auto-redirect here)
 * - Allow demo browsing where desired
 * - Enforce: Auth and/or Paid and/or Profile (paid-only) on protected pages
 *
 * Rules:
 * - URL override (?mode=demo) always wins
 * - Local demo mode (setDemoMode) is the secondary override
 */
export default function RouteGuard({
  requireAuth = false,
  requirePaid = false,
  requireProfile = false,
  children
}) {
  const nav = useNavigate();
  const loc = useLocation();

  const { isLoading: accessLoading, mode, accountId } = useSeasonAccess();
  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError
  } = useAthleteIdentity();

  const currentPath = useMemo(() => {
    return (loc?.pathname || "") + (loc?.search || "");
  }, [loc?.pathname, loc?.search]);

  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  // URL demo override
  const urlForcesDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc?.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc?.search]);

  // Local demo override (persisted)
  const localDemo = useMemo(() => {
    try {
      const d = readDemoMode(); // { mode, seasonYear }
      return d?.mode === "demo";
    } catch {
      return false;
    }
  }, []);

  const forceDemo = urlForcesDemo || localDemo;

  // Paid means: seasonAccess says paid AND we are not forcing demo
  const isPaid = !forceDemo && mode === "paid";

  // Only require identity when profile gating applies in paid mode
  const needsIdentity = requireProfile && isPaid;

  const loading = accessLoading || (needsIdentity && identityLoading);

  const safeReplace = (to) => {
    if (!to) return;
    if (to === currentPath) return;
    nav(to, { replace: true });
  };

  useEffect(() => {
    if (loading) return;

    // If we need identity and it errored, route to Profile (recoverable)
    if (needsIdentity && identityError) {
      safeReplace(
        createPageUrl("Profile") + `?next=${nextParam}&err=profile_load_failed`
      );
      return;
    }

    // 1) Auth required
    if (requireAuth && !accountId) {
      safeReplace(createPageUrl("Login") + `?next=${nextParam}`);
      return;
    }

    // 2) Paid required (ignored in demo override)
    if (requirePaid && !isPaid) {
      safeReplace(createPageUrl("Subscribe") + `?next=${nextParam}`);
      return;
    }

    // 3) Profile required (paid-only enforcement)
    if (requireProfile && isPaid && !athleteProfile) {
      const profileUrl = createPageUrl("Profile");
      if ((loc?.pathname || "") !== profileUrl) {
        safeReplace(profileUrl + `?next=${nextParam}`);
      }
      return;
    }
  }, [
    loading,
    requireAuth,
    requirePaid,
    requireProfile,
    needsIdentity,
    identityError,
    accountId,
    isPaid,
    athleteProfile,
    nextParam,
    currentPath,
    nav,
    loc?.pathname
  ]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return <>{children}</>;
}
