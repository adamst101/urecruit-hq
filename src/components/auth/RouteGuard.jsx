// src/components/auth/RouteGuard.jsx
import React, { useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { createPageUrl } from "../../utils";
import { useAccessContext } from "../hooks/useAccessContext";

/**
 * RouteGuard (hardened)
 *
 * Uses useAccessContext as the single source of truth.
 * - effectiveMode: "demo" | "paid"
 * - loading: blocks redirects until mode/identity are resolved
 *
 * Rules:
 * 1) requireAuth  -> if not authed, go Login
 * 2) requirePaid  -> if not in paid mode, go Subscribe
 * 3) requireProfile -> ONLY enforced in paid mode; if missing, go Profile
 */
export default function RouteGuard({
  requireAuth = false,
  requirePaid = false,
  requireProfile = false,
  children,
}) {
  const nav = useNavigate();
  const loc = useLocation();

  const {
    effectiveMode,
    loading,
    accountId,
    hasProfile,
    identityError,
  } = useAccessContext();

  const currentPath = useMemo(() => {
    return (loc?.pathname || "") + (loc?.search || "");
  }, [loc?.pathname, loc?.search]);

  const nextParam = useMemo(
    () => encodeURIComponent(currentPath),
    [currentPath]
  );

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

    const isAuthed = !!accountId;
    const isPaid = effectiveMode === "paid";

    // If profile is required in paid mode and identity query errored, route to Profile with error
    if (requireProfile && isPaid && identityError) {
      safeReplace(
        createPageUrl("Profile") +
          `?next=${nextParam}&err=profile_load_failed`
      );
      return;
    }

    // 1) Auth required
    if (requireAuth && !isAuthed) {
      safeReplace(createPageUrl("Login") + `?next=${nextParam}`);
      return;
    }

    // 2) Paid required
    if (requirePaid && !isPaid) {
      safeReplace(createPageUrl("Subscribe") + `?next=${nextParam}`);
      return;
    }

    // 3) Profile required (paid-only enforcement)
    if (requireProfile && isPaid && !hasProfile) {
      const profileUrl = createPageUrl("Profile");
      if ((loc?.pathname || "") !== profileUrl) {
        safeReplace(profileUrl + `?next=${nextParam}`);
      }
      return;
    }
  }, [
    loading,
    effectiveMode,
    accountId,
    hasProfile,
    identityError,
    requireAuth,
    requirePaid,
    requireProfile,
    nextParam,
    safeReplace,
    loc?.pathname,
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
