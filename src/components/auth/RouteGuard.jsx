// src/components/auth/RouteGuard.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../useAthleteIdentity.jsx";

/**
 * RouteGuard
 *
 * Principles:
 * - Home is a true front door (no auto-redirect here)
 * - Demo mode (?mode=demo) bypasses paid/profile gating
 * - Auth gating sends to Login
 * - Paid gating sends to Subscribe
 * - Profile gating only applies in PAID mode
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
  const { athleteProfile, isLoading: identityLoading, isError: identityError } =
    useAthleteIdentity();

  const currentPath = useMemo(() => {
    return (loc?.pathname || "") + (loc?.search || "");
  }, [loc?.pathname, loc?.search]);

  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  // URL override: ?mode=demo always wins
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc?.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc?.search]);

  // Paid only when not forced demo
  const isPaid = !forceDemo && mode === "paid";

  // Only require athlete identity when profile is required AND in paid mode
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
      safeReplace(createPageUrl("Profile") + `?next=${nextParam}&err=profile_load_failed`);
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
