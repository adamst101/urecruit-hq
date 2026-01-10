// src/components/auth/RouteGuard.jsx
import React, { useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../useAthleteIdentity.jsx";

/**
 * RouteGuard (best-practice hardened for Base44)
 *
 * Goals:
 * - Home stays a true front door (no auto-redirect unless the page itself is guarded)
 * - Allow demo browsing when URL has ?mode=demo
 * - Enforce: Auth and/or Paid and/or Profile on protected pages
 *
 * IMPORTANT (Base44 reality):
 * - Do NOT redirect to a non-existent /Login page (causes 404).
 * - For auth-required pages, route to Home with signin intent + next param.
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

  // URL override: ?mode=demo forces demo behavior even if user is paid
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc?.search || "");
      return String(sp.get("mode") || "").toLowerCase() === "demo";
    } catch {
      return false;
    }
  }, [loc?.search]);

  // Paid is only true when not forcing demo
  const isPaid = !forceDemo && mode === "paid";

  // Only require identity when profile is required AND we're truly in paid mode
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
        createPageUrl("Profile") + `?next=${nextParam}&err=profile_load_failed`
      );
      return;
    }

    // 1) Auth required
    // Base44 note: don’t route to /Login (often not implemented). Use Home as sign-in gateway.
    if (requireAuth && !accountId) {
      safeReplace(createPageUrl("Home") + `?signin=1&next=${nextParam}`);
      return;
    }

    // 2) Paid required (ignored when forceDemo is true)
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
    safeReplace,
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
