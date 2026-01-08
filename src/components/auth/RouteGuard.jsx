// src/components/auth/RouteGuard.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";

/**
 * RouteGuard
 *
 * Goals:
 * - Keep Home as a true front door (no auto-redirect here)
 * - Allow demo browsing without auth where desired
 * - Enforce: Paid users MUST create athlete profile before accessing paid features
 *
 * Flags:
 * - requireAuth: user must be signed in (accountId required)
 * - requirePaid: user must be paid (mode === "paid")
 * - requireProfile: paid users must have athleteProfile
 *
 * Notes:
 * - requireProfile only enforced when mode === "paid"
 * - Do NOT wrap Home with RouteGuard
 * - Do NOT wrap Profile with requireProfile (or you’ll redirect-loop)
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
    isError: identityError,
    error: identityErrorObj
  } = useAthleteIdentity();

  const currentPath = useMemo(() => {
    return (loc?.pathname || "") + (loc?.search || "");
  }, [loc?.pathname, loc?.search]);

  // Build "next" once, stable.
  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  // Only block on identity load if the route actually needs identity AND user is paid.
  const isPaid = mode === "paid";
  const needsIdentity = requireProfile && isPaid;
  const loading = accessLoading || (needsIdentity && identityLoading);

  // Safe navigation: avoid redirect loops / redundant replace calls.
  const safeReplace = (to) => {
    if (!to) return;
    if (to === currentPath) return;
    nav(to, { replace: true });
  };

  useEffect(() => {
    if (loading) return;

    // If we need identity (paid + requireProfile) but identity errored,
    // do NOT bounce endlessly — show a controlled error surface by routing to Profile setup.
    // (Profile page should be able to recover/retry.)
    if (needsIdentity && identityError) {
      safeReplace(createPageUrl("Profile") + `?next=${nextParam}&err=profile_load_failed`);
      return;
    }

    // 1) Auth required
    if (requireAuth && !accountId) {
      base44.auth.redirectToLogin(currentPath);
      return;
    }

    // 2) Paid required
    // Treat anything other than explicit "paid" as not paid.
    if (requirePaid && !isPaid) {
      safeReplace(createPageUrl("Subscribe") + `?next=${nextParam}`);
      return;
    }

    // 3) Profile required (paid-only enforcement)
    if (requireProfile && isPaid && !athleteProfile) {
      // If already on Profile, don't redirect (prevents loops).
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
    identityErrorObj,
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