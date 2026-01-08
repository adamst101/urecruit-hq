// src/components/auth/RouteGuard.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { base44 } from "../../api/base44Client";
import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";

/**
 * RouteGuard
 *
 * Goals:
 * - Keep Home as public landing page (do NOT wrap Home)
 * - For protected pages: if not authed -> kick into Base44 auth flow
 * - Enforce: Paid users MUST create athlete profile before paid features
 *
 * Flags:
 * - requireAuth: must be signed in (accountId required)
 * - requirePaid: must be paid (mode === "paid")
 * - requireProfile: paid users must have athleteProfile
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

  const isPaid = mode === "paid";
  const needsIdentity = requireProfile && isPaid;

  // Only block on identity load when it's actually needed
  const loading = accessLoading || (needsIdentity && identityLoading);

  const safeReplace = (to) => {
    if (!to) return;
    if (to === currentPath) return;
    nav(to, { replace: true });
  };

  // This is the key fix: protected route -> trigger Base44 auth
  async function startBase44Login() {
    // prevent infinite loops if something is misconfigured
    const key = `auth_attempted:${currentPath}`;
    try {
      if (sessionStorage.getItem(key) === "1") {
        safeReplace(createPageUrl("Home") + `?next=${nextParam}&auth=unavailable`);
        return;
      }
      sessionStorage.setItem(key, "1");
    } catch {}

    try {
      // Standard Base44 method (available only when auth providers are enabled in Base44 settings)
      if (typeof base44?.auth?.signIn === "function") {
        await base44.auth.signIn();
        return; // usually redirects; if it returns, season hook should update shortly after
      }
    } catch {
      // fallthrough
    }

    // If we get here, auth isn't configured or Base44 auth API isn't available in this app
    safeReplace(createPageUrl("Home") + `?next=${nextParam}&auth=unavailable`);
  }

  useEffect(() => {
    if (loading) return;

    // If we need identity (paid + requireProfile) but identity errored,
    // route to Profile to recover (no loop)
    if (needsIdentity && identityError) {
      safeReplace(createPageUrl("Profile") + `?next=${nextParam}&err=profile_load_failed`);
      return;
    }

    // 1) Auth required
    if (requireAuth && !accountId) {
      startBase44Login();
      return;
    }

    // 2) Paid required
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
