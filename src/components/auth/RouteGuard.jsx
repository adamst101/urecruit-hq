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
 * Key fix:
 * - Do NOT treat "mode === paid" as paid unless user is actually authenticated.
 * - Prevents public visitors from being shoved into Profile setup.
 */
function getAuthedUserId() {
  try {
    const auth = base44?.auth;
    const user =
      auth?.user ||
      auth?.currentUser ||
      auth?.session?.user ||
      auth?.getSession?.()?.user ||
      null;

    const id = user?.id || user?._id || user?.uuid || null;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

export default function RouteGuard({
  requireAuth = false,
  requirePaid = false,
  requireProfile = false,
  children
}) {
  const nav = useNavigate();
  const loc = useLocation();

  const { isLoading: accessLoading, mode } = useSeasonAccess();
  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError,
    error: identityErrorObj
  } = useAthleteIdentity();

  const currentPath = useMemo(() => {
    return (loc?.pathname || "") + (loc?.search || "");
  }, [loc?.pathname, loc?.search]);

  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  // ✅ REAL auth check (NOT accountId)
  const authedUserId = useMemo(() => getAuthedUserId(), [loc?.pathname, loc?.search]);
  const isAuthed = !!authedUserId;

  // ✅ Only consider "paid" when authenticated
  const isPaid = mode === "paid" && isAuthed;

  // Only load identity when paid+profile is required
  const needsIdentity = requireProfile && isPaid;
  const loading = accessLoading || (needsIdentity && identityLoading);

  const safeReplace = (to) => {
    if (!to) return;
    if (to === currentPath) return;
    nav(to, { replace: true });
  };

  useEffect(() => {
    if (loading) return;

    // If paid+profile required but identity errored, route to Profile setup (recoverable)
    if (needsIdentity && identityError) {
      safeReplace(createPageUrl("Profile") + `?next=${nextParam}&err=profile_load_failed`);
      return;
    }

    // 1) Auth required
    if (requireAuth && !isAuthed) {
      safeReplace(createPageUrl("Home") + `?next=${nextParam}`);
      return;
    }

    // 2) Paid required (only when authed)
    if (requirePaid && !isPaid) {
      safeReplace(createPageUrl("Subscribe") + `?next=${nextParam}`);
      return;
    }

    // 3) Profile required (paid-only enforcement, paid-only when authed)
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
    identityErrorObj,
    isAuthed,
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
