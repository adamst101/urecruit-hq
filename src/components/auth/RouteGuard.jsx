// src/components/auth/RouteGuard.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../useAthleteIdentity.jsx";

/**
 * RouteGuard (Base44-safe)
 *
 * Rules:
 * - Home is the front door (no auto-redirect here)
 * - Demo override: ?mode=demo bypasses paid/profile gating
 * - If auth is required but user is not authed:
 *     -> send to Home with next=...
 * - Paid gating is season-aware:
 *     -> if requirePaid and user isn't entitled for the requested season,
 *        route to Subscribe?season=YYYY&next=...
 * - Profile gating applies only when paid (and not demo override)
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
    isLoading: accessLoading,
    mode,
    accountId,
    hasAccess,
    seasonYear, // effective season per entitlement (paid) or demo year
  } = useSeasonAccess();

  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError,
  } = useAthleteIdentity();

  const currentPath = useMemo(
    () => (loc?.pathname || "") + (loc?.search || ""),
    [loc?.pathname, loc?.search]
  );

  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  // URL forces demo mode when explicitly set
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc?.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc?.search]);

  // Requested season from URL (if a paid route is season-specific)
  const requestedSeason = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc?.search || "");
      const s = sp.get("season");
      const y = Number(s);
      return Number.isFinite(y) ? y : null;
    } catch {
      return null;
    }
  }, [loc?.search]);

  // Paid means: not demo override AND hook says paid AND entitlement present
  // (hasAccess is the entitlement-backed truth)
  const isPaid = !forceDemo && mode === "paid" && !!hasAccess;

  // Profile gating only makes sense in paid mode (and not demo override)
  const needsIdentity = requireProfile && isPaid;

  const loading = accessLoading || (needsIdentity && identityLoading);

  const safeReplace = (to) => {
    if (!to) return;
    if (to === currentPath) return;
    nav(to, { replace: true });
  };

  // Build the correct Subscribe URL for the season being requested
  const subscribeUrl = useMemo(() => {
    const y = requestedSeason || seasonYear || null; // fallback defensively
    const base = createPageUrl("Subscribe");
    const seasonPart = y ? `season=${encodeURIComponent(y)}` : "";
    const join = seasonPart ? "&" : "";
    return (
      base +
      `?${seasonPart}${join}source=${encodeURIComponent("route_guard")}` +
      `&next=${nextParam}`
    );
  }, [requestedSeason, seasonYear, nextParam]);

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
    if (requireAuth && !accountId) {
      // Base44-safe: don't assume Login route exists
      safeReplace(createPageUrl("Home") + `?signin=1&next=${nextParam}`);
      return;
    }

    // 2) Paid required (ignored in demo override)
    // Season-aware: if they don't have entitlement, push to Subscribe with season
    if (requirePaid && !isPaid) {
      safeReplace(subscribeUrl);
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
    nav,
    loc?.pathname,
    subscribeUrl,
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
