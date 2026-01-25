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
 * MVP Rules:
 * - If authenticated + entitled -> route to `next` (default /Discover)
 * - If authenticated + NOT entitled -> HARD redirect to Subscribe (and optionally logout first)
 * - If not authenticated -> route to Home (signin prompt)
 *
 * Important:
 * - Use hard redirects (window.location.assign) when moving between Base44 auth pages
 *   to avoid SPA state/caching weirdness.
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

async function safeLogout() {
  try {
    // Base44 may or may not have logout; try common patterns safely
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

  // next can arrive as query param (some flows) or via sessionStorage fallback
  const next = useMemo(() => {
    const qNext = getNextFromSearch(loc?.search);
    if (qNext) return qNext;

    try {
      const ss = sessionStorage.getItem("post_login_next");
      if (ss) return ss;
    } catch {}

    // Default: Discover (IMPORTANT: do not include mode=demo here)
    return createPageUrl("Discover");
  }, [loc?.search]);

  useEffect(() => {
    // Wait for season hook to resolve auth + entitlement
    if (season?.isLoading) return;

    // Not authenticated -> go Home with signin prompt
    if (!season?.accountId) {
      nav(createPageUrl("Home") + `?signin=1&next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }

    // Entitled -> go to next (SPA nav is fine here)
    if (season?.hasAccess && season?.entitlement) {
      nav(next, { replace: true });
      return;
    }

    // ✅ Step 4: NOT entitled -> force Subscribe via HARD redirect (not back to demo)
    (async () => {
      // Optional: mimic "no login unless paid"
      // We end the Base44 session so "member login" feels exclusive to paid users.
      await safeLogout();

      const subscribeUrl =
        `${window.location.origin}${createPageUrl("Subscribe")}` +
        `?source=auth_gate_no_entitlement&reason=no_entitlement` +
        `&next=${encodeURIComponent(next)}`;

      window.location.assign(subscribeUrl);
      return;
    })();
  }, [season?.isLoading, season?.accountId, season?.hasAccess, season?.entitlement, next, nav]);

  // Minimal blank screen (avoid flicker); you can swap for a spinner later.
  return <div className="min-h-screen bg-slate-50" />;
}
