// src/pages/AuthRedirect.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

/**
 * AuthRedirect.jsx (Base44)
 *
 * Purpose:
 * - Landing page after Base44 login when using /login?from_url=...
 * - Decide where to send the user next based on entitlement
 *
 * MVP Rules:
 * - If authenticated + entitled -> route to `next` (default /Workspace)
 * - If authenticated + NOT entitled -> HARD redirect to /Subscribe
 * - If not authenticated -> route to /Home (signin prompt)
 *
 * Key fix:
 * - Sanitize `next` to internal paths only and strip demo params (mode/src/source).
 * - Prefer `post_login_next` from sessionStorage to avoid nested encoding issues.
 */

const PATHS = {
  HOME: "/Home",
  WORKSPACE: "/Workspace",
  SUBSCRIBE: "/Subscribe",
  DISCOVER: "/Discover",
};

function safeString(x) {
  if (x == null) return "";
  return String(x);
}

function getNextFromSearch(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const next = sp.get("next");
    return next ? safeString(next) : "";
  } catch {
    return "";
  }
}

/**
 * Only allow internal paths.
 * Also strips demo-related params so paid users don't get bounced back into demo.
 */
function sanitizeNext(nextRaw) {
  const fallback = PATHS.WORKSPACE;
  const s = safeString(nextRaw).trim();
  if (!s) return fallback;

  // Block absolute URLs / open redirects
  if (s.startsWith("http://") || s.startsWith("https://")) return fallback;

  // Normalize to leading slash
  const pathish = s.startsWith("/") ? s : `/${s}`;

  // Strip demo flags from next URL (prevents "paid user returns to demo")
  try {
    const u = new URL(pathish, window.location.origin);

    u.searchParams.delete("mode");
    u.searchParams.delete("src");
    u.searchParams.delete("source");

    const cleaned = `${u.pathname}${u.search ? u.search : ""}`;
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

async function safeLogout() {
  try {
    if (base44?.auth?.logout) {
      await base44.auth.logout();
      return true;
    }
    if (base44?.auth?.signOut) {
      await base44.auth.signOut();
      return true;
    }
  } catch {}
  return false;
}

export default function AuthRedirect() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();

  // Next can arrive as query param OR (preferred) via sessionStorage fallback
  const next = useMemo(() => {
    const qNext = getNextFromSearch(loc?.search);
    if (qNext) return sanitizeNext(qNext);

    // Preferred: next stored by startMemberLogin() to avoid nested encoding issues
    try {
      const ss = sessionStorage.getItem("post_login_next");
      if (ss) {
        try {
          sessionStorage.removeItem("post_login_next"); // one-shot
        } catch {}
        return sanitizeNext(ss);
      }
    } catch {}

    // Default: Workspace (IMPORTANT: no mode=demo here)
    return PATHS.WORKSPACE;
  }, [loc?.search]);

  // Check if next destination is the Checkout page (free-code flow)
  const isCheckoutReturn = useMemo(() => {
    return next.startsWith("/Checkout");
  }, [next]);

  useEffect(() => {
    if (season?.isLoading) return;

    // Not authenticated -> go Home with signin prompt
    if (!season?.accountId) {
      nav(`${PATHS.HOME}?signin=1&next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }

    // Authenticated: clear demo stickiness (user chose to log in)
    try { sessionStorage.removeItem("demoMode_v1"); } catch {}
    try { sessionStorage.removeItem("demo_mode_v1"); } catch {}
    try { sessionStorage.removeItem("demo_year_v1"); } catch {}

    // Entitled -> go to sanitized next
    if (season?.hasAccess && season?.entitlement) {
      nav(next, { replace: true });
      return;
    }

    // If returning to Checkout (free-code flow), allow through without entitlement
    if (isCheckoutReturn) {
      nav(next, { replace: true });
      return;
    }

    // NOT entitled -> force Subscribe via HARD redirect (not back to demo)
    (async () => {
      await safeLogout();

      const subscribeUrl =
        `${window.location.origin}${PATHS.SUBSCRIBE}` +
        `?source=auth_gate_no_entitlement&reason=no_entitlement` +
        `&next=${encodeURIComponent(next || PATHS.DISCOVER)}`;

      window.location.assign(subscribeUrl);
    })();
  }, [season?.isLoading, season?.accountId, season?.hasAccess, season?.entitlement, next, nav]);

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#e8a020] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-sm text-[#9ca3af]">Signing you in…</p>
      </div>
    </div>
  );
}