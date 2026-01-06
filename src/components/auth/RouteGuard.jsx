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
  children,
}) {
  const nav = useNavigate();
  const loc = useLocation();

  const { isLoading: accessLoading, mode, accountId } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  // Build "next" once, stable.
  const nextParam = useMemo(() => {
    const path = (loc?.pathname || "") + (loc?.search || "");
    return encodeURIComponent(path);
  }, [loc?.pathname, loc?.search]);

  // Only block on identity load if the route actually needs identity AND user is paid.
  const needsIdentity = requireProfile && mode === "paid";
  const loading = accessLoading || (needsIdentity && identityLoading);

  useEffect(() => {
    if (loading) return;

    // 1) Auth required
    if (requireAuth && !accountId) {
      nav(createPageUrl("Home") + `?next=${nextParam}`, { replace: true });
      return;
    }

    // 2) Paid required (demo users get routed to Subscribe)
    if (requirePaid && mode !== "paid") {
      nav(createPageUrl("Subscribe") + `?next=${nextParam}`, { replace: true });
      return;
    }

    // 3) Profile required (paid-only enforcement)
    // If they are paid and don't have an athlete profile, force Profile creation.
    if (requireProfile && mode === "paid" && !athleteProfile) {
      nav(createPageUrl("Profile") + `?next=${nextParam}`, { replace: true });
      return;
    }
  }, [
    loading,
    requireAuth,
    requirePaid,
    requireProfile,
    accountId,
    mode,
    athleteProfile,
    nav,
    nextParam,
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
