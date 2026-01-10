// src/components/auth/RouteGuard.jsx
import React, { useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess";
import { useAthleteIdentity } from "../useAthleteIdentity";

/**
 * RouteGuard
 *
 * Principles:
 * - Home is a true front door (don’t auto-redirect here)
 * - Demo override via ?mode=demo bypasses paid/profile gating (but NOT auth gating)
 * - Paid-only pages enforce: paid + profile when required
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
  const { athleteProfile, isLoading: identityLoading, isError: identityError } =
    useAthleteIdentity();

  const currentPath = useMemo(() => {
    return (loc?.pathname || "") + (loc?.search || "");
  }, [loc?.pathname, loc?.search]);

  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  // Demo override: only affects paid/profile enforcement
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc?.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc?.search]);

  const isPaid = useMemo(() => {
    if (forceDemo) return false;
    return mode === "paid";
  }, [forceDemo, mode]);

  const needsIdentity = useMemo(() => requireProfile && isPaid, [requireProfile, isPaid]);

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

    // If identity is required and it errored, route to Profile for recovery
    if (needsIdentity && identityError) {
      safeReplace(createPageUrl("Profile") + `?next=${nextParam}&err=profile_load_failed`);
      return;
    }

    // 1) Auth required (demo does NOT bypass auth)
    if (requireAuth && !accountId) {
      safeReplace(createPageUrl("Login") + `?next=${nextParam}`);
      return;
    }

    // 2) Paid required (bypassed in demo override)
    if (requirePaid && !isPaid) {
      safeReplace(createPageUrl("Subscribe") + `?next=${nextParam}`);
      return;
    }

    // 3) Profile required (paid-only)
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
    safeReplace,
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
