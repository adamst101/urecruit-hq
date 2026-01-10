// src/components/auth/RouteGuard.jsx
import React, { useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../useAthleteIdentity.jsx";

/**
 * RouteGuard
 *
 * Best-practice goals:
 * - Home remains a true front door (no auto-redirect)
 * - Supports demo override: ?mode=demo bypasses auth/paid/profile gating
 * - Enforces requireAuth / requirePaid / requireProfile consistently
 * - Avoids redirect loops by using a stable safeReplace callback
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

  // Demo override: if URL explicitly says demo, bypass ALL gating
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc?.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc?.search]);

  // Only treat as "paid" if not forceDemo
  const isPaid = !forceDemo && mode === "paid";

  // Only fetch/require identity when we are enforcing a paid-profile requirement
  const needsIdentity = requireProfile && isPaid;

  const loading = accessLoading || (needsIdentity && identityLoading);

  const safeReplace = useCallback(
    (to) => {
      if (!to) return;
      if (to === currentPath) return;
      nav(to, { replace: true });
    },
    [nav, currentPath]
  );

  useEffect(() => {
    if (loading) return;

    // 0) Demo override: bypass all redirects, render page as demo
    if (forceDemo) return;

    // 1) If we needed identity and it errored, route to Profile (recoverable)
    if (needsIdentity && identityError) {
      safeReplace(
        createPageUrl("Profile") + `?next=${nextParam}&err=profile_load_failed`
      );
      return;
    }

    // 2) Auth required
    if (requireAuth && !accountId) {
      safeReplace(createPageUrl("Login") + `?next=${nextParam}`);
      return;
    }

    // 3) Paid required
    if (requirePaid && !isPaid) {
      safeReplace(createPageUrl("Subscribe") + `?next=${nextParam}`);
      return;
    }

    // 4) Profile required (paid-only enforcement)
    if (requireProfile && isPaid && !athleteProfile) {
      const profileUrl = createPageUrl("Profile");
      if ((loc?.pathname || "") !== profileUrl) {
        safeReplace(profileUrl + `?next=${nextParam}`);
      }
    }
  }, [
    loading,
    forceDemo,
    needsIdentity,
    identityError,
    requireAuth,
    requirePaid,
    requireProfile,
    accountId,
    isPaid,
    athleteProfile,
    nextParam,
    loc?.pathname,
    safeReplace
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
