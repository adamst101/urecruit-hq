import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useIdentity } from "./useIdentity";
import { createPageUrl } from "../../utils";

/**
 * Policy:
 * - requireAuth: blocks if not signed in
 * - requireSub: blocks if not subscribed
 * - requireChild: blocks if no child profile (forces Profile)
 *
 * allowProfileWithoutSub: lets non-subscribed users create/manage children (good for conversion)
 */
export default function RouteGuard({
  requireAuth = false,
  requireSub = false,
  requireChild = false,
  allowProfileWithoutSub = true,
  children,
}) {
  const nav = useNavigate();
  const loc = useLocation();
  const id = useIdentity();

  useEffect(() => {
    if (id.loading) return;

    // Not authed
    if (requireAuth && !id.isAuthed) {
      nav(createPageUrl("Home") + `?next=${encodeURIComponent(loc.pathname)}`, { replace: true });
      return;
    }

    // Subscription required
    if (requireSub && id.isAuthed && !id.isSubscribed) {
      nav(createPageUrl("Subscribe") + `?next=${encodeURIComponent(loc.pathname)}`, { replace: true });
      return;
    }

    // Child required
    if (requireChild && id.isAuthed) {
      // If not subscribed but we allow Profile, route to Profile not Subscribe
      if (!id.hasChild) {
        const target = allowProfileWithoutSub ? "Profile" : "Subscribe";
        nav(createPageUrl(target) + `?next=${encodeURIComponent(loc.pathname)}`, { replace: true });
        return;
      }
    }
  }, [id.loading, id.isAuthed, id.isSubscribed, id.hasChild, requireAuth, requireSub, requireChild, allowProfileWithoutSub, nav, loc.pathname]);

  if (id.loading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Loading…</div>
      </div>
    );
  }

  return <>{children}</>;
}