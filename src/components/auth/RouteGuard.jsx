// src/components/auth/RouteGuard.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { useIdentity } from "./useIdentity";

/**
 * RouteGuard (updated)
 *
 * Policy:
 * - requireAuth: blocks if not signed in
 * - requireSub: blocks if not subscribed (paid mode)
 * - requireChild: blocks if no child/athlete profile
 *
 * allowProfileWithoutSub:
 * - If true, lets non-subscribed users create/manage athlete profiles (good for conversion)
 *
 * Hardening:
 * - Preserve full path + query in next= (not just pathname)
 * - Avoid redirect loops by not redirecting if already on target page
 * - Don’t treat "requireChild" as requiring subscription unless requireSub is true
 */
export default function RouteGuard({
  requireAuth = false,
  requireSub = false,
  requireChild = false,
  allowProfileWithoutSub = true,
  children
}) {
  const nav = useNavigate();
  const loc = useLocation();
  const id = useIdentity();

  // Preserve full return URL (path + query + hash)
  const nextUrl = useMemo(() => {
    const path = loc?.pathname || "";
    const search = loc?.search || "";
    const hash = loc?.hash || "";
    return `${path}${search}${hash}`;
  }, [loc?.pathname, loc?.search, loc?.hash]);

  useEffect(() => {
    if (id.loading) return;

    const here = loc?.pathname || "";

    // 1) Auth required
    if (requireAuth && !id.isAuthed) {
      const target = createPageUrl("Home");
      if (here !== target) {
        nav(`${target}?next=${encodeURIComponent(nextUrl)}`, { replace: true });
      }
      return;
    }

    // 2) Subscription required (paid)
    if (requireSub && id.isAuthed && !id.isSubscribed) {
      const target = createPageUrl("Subscribe");
      if (here !== target) {
        nav(`${target}?next=${encodeURIComponent(nextUrl)}&force=1`, { replace: true });
      }
      return;
    }

    // 3) Child/athlete profile required
    if (requireChild && id.isAuthed) {
      if (!id.hasChild) {
        // If subscription is not required, and we allow profile creation, go Profile.
        // If subscription IS required, prefer Subscribe first unless you explicitly want Profile-first.
        const shouldGoProfile = allowProfileWithoutSub && !requireSub;
        const targetPage = shouldGoProfile ? "Profile" : "Subscribe";
        const target = createPageUrl(targetPage);

        if (here !== target) {
          const qs =
            targetPage === "Subscribe"
              ? `?next=${encodeURIComponent(nextUrl)}&force=1`
              : `?next=${encodeURIComponent(nextUrl)}`;

          nav(`${target}${qs}`, { replace: true });
        }
        return;
      }
    }
  }, [
    id.loading,
    id.isAuthed,
    id.isSubscribed,
    id.hasChild,
    requireAuth,
    requireSub,
    requireChild,
    allowProfileWithoutSub,
    nav,
    loc?.pathname,
    nextUrl
  ]);

  if (id.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-slate-600">Loading…</div>
      </div>
    );
  }

  return <>{children}</>;
}
