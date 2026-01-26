// src/pages/AuthRedirect.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { createPageUrl } from "../utils";
import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

/**
 * AuthRedirect.jsx (Base44)
 *
 * Purpose:
 * - Landing page after Base44 login when using /login?from_url=...
 * - Decide where to send the user next based on entitlement
 *
 * Rules:
 * - If authenticated + entitled -> route to `next` (default /Workspace)
 * - If authenticated + NOT entitled -> HARD redirect to Subscribe (and logout first)
 * - If not authenticated -> route to Home (signin prompt)
 */

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
 * Strips demo-related params so paid users don't get bounced into demo.
 */
function sanitizeNext(nextRaw) {
  const fallback = createPageUrl("Workspace");
  const s = safeString(nextRaw).trim();
  if (!s) return fallback;

  // Block absolute URLs / open redirects
  if (s.startsWith("http://") || s.startsWith("https://")) return fallback;

  // Normalize to leading slash
  const pathish = s.startsWith("/") ? s : `/${s}`;

  // Strip demo flags from next URL
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

  // next can arrive as query param or via sessionStorage fallback
  const next = useMemo(() => {
    const qNext = getNextFromSearch(loc?.search);
    if (qNext) return sanitizeNext(qNext);

    try {
      const ss = sessionStorage.getItem("post_login_next");
      if (ss) return sanitizeNext(ss);
    } catch {}

    // ✅ Default is Workspace now
    return createPageUrl("Workspace");
  }, [loc?.search]);

  useEffect(() => {
    if (season?.isLoading) return;

    // Not authenticated -> Home with signin prompt + next
    if (!season?.accountId) {
      nav(createPageUrl("Home") + `?signin=1&next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }

    // Authenticated: clear demo stickiness
    try { sessionStorage.removeItem("demo_mode_v1"); } catch {}
    try { sessionStorage.removeItem("demo_year_v1"); } catch {}

    // Entitled -> go to next (Workspace by default)
    if (season?.hasAccess && season?.entitlement) {
      nav(next, { replace: true });
      return;
    }

    // Not entitled -> force Subscribe via HARD redirect
    (async () => {
      await safeLogout();

      const subscribeUrl =
        `${window.location.origin}${createPageUrl("Subscribe")}` +
        `?source=auth_gate_no_entitlement&reason=no_entitlement` +
        `&next=${encodeURIComponent(next)}`;

      window.location.assign(subscribeUrl);
    })();
  }, [season?.isLoading, season?.accountId, season?.hasAccess, season?.entitlement, next, nav]);

  return <div className="min-h-screen bg-slate-50" />;
}
