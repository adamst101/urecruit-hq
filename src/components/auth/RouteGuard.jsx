// src/components/auth/RouteGuard.jsx
import React, { useEffect, useMemo, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { createPageUrl } from "../../utils";
import { useAccessContext } from "../hooks/useAccessContext";

/**
 * RouteGuard
 *
 * Enforces:
 * - requireAuth
 * - requirePaid
 * - requireProfile (paid-only)
 *
 * Demo override is already handled by useAccessContext (URL/local demo wins).
 */
export default function RouteGuard({
  requireAuth = false,
  requirePaid = false,
  requireProfile = false,
  children,
}) {
  const nav = useNavigate();
  const loc = useLocation();

  const access = useAccessContext();

  const currentPath = useMemo(
    () => (loc?.pathname || "") + (loc?.search || ""),
    [loc?.pathname, loc?.search]
  );

  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  const safeReplace = useCallback(
    (to) => {
      if (!to) return;
      if (to === currentPath) return;
      nav(to, { replace: true });
    },
    [nav, currentPath]
  );

  const loading = access.loading;

  useEffect(() => {
    if (loading) return;

    // 1) Auth required
    if (requireAuth && !access.accountId) {
      safeReplace(createPageUrl("Login") + `?next=${nextParam}`);
      return;
    }

    // 2) Paid required
    if (requirePaid && !access.isPaid) {
      safeReplace(createPageUrl("Subscribe") + `?next=${nextParam}`);
      return;
    }

    // 3) Profile required (paid only)
    if (requireProfile && access.isPaid && !access.hasProfile) {
      const profileUrl = createPageUrl("Profile");
      if ((loc?.pathname || "") !== profileUrl) {
        safeReplace(profileUrl + `?next=${nextParam}`);
      }
    }
  }, [
    loading,
    requireAuth,
    requirePaid,
    requireProfile,
    access.accountId,
    access.isPaid,
    access.hasProfile,
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
