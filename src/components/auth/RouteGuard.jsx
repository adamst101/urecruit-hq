// src/components/auth/RouteGuard.jsx
import React, { useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { createPageUrl } from "../../utils";

// ✅ repo uses .jsx
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../useAthleteIdentity.jsx";

/**
 * RouteGuard
 *
 * Goals:
 * - Keep Home as a true front door (no auto-redirect here)
 * - Allow demo browsing where desired
 * - Enforce: Auth and/or Paid and/or Profile (paid-only) on protected pages
 *
 * Rules:
 * - If URL has ?mode=demo, bypass paid/profile gating (demo always works)
 * - Redirect unauth users to Login for protected pages
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

  // Only used when profile gating is actually needed
  const { athleteProfile, isLoading: identityLoading, isError: identityError } =
    useAthleteIdentity();

  const currentPath = useMemo(
    () => (loc?.pathname || "") + (loc?.search || ""),
    [loc?.pathname, loc?.search]
  );

  const nextParam = useMemo(
    () => encodeURIComponent(currentPath),
    [currentPath]
  );

  // Demo override via URL
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc?.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc?.search]);

  const isPaid = !forceDemo && mode === "paid";
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

    // If we need identity and it errored, route to Profile (recoverable)
    if (needsIdentity && identityError) {
      safeReplace(
        createPageUrl("Profile") +
          `?next=${nextParam}&err=profile_load_failed`
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
