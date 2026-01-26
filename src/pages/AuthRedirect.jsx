// src/pages/AuthRedirect.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { createPageUrl } from "../utils";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

/**
 * AuthRedirect.jsx (Base44)
 *
 * Purpose:
 * - Landing page after Base44 login when using /login?from_url=...
 * - Decide where to send the user next based on entitlement
 *
 * MVP Rules:
 * - If authenticated + entitled -> HARD redirect to `next` (default /Discover)
 * - If authenticated + NOT entitled -> HARD redirect to Subscribe
 * - If not authenticated -> route to Home (signin prompt)
 *
 * Important:
 * - Avoid "login returns to demo" by sanitizing `next`:
 *   - internal paths only
 *   - strip demo params (mode/src/source) from next URL
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
 * Also strips demo-related params so paid users don't get bounced back into demo.
 */
function sanitizeNext(nextRaw) {
  const fallback = createPageUrl("Discover");
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

export default function AuthRedirect() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();

  const next = useMemo(() => {
    const qNext = getNextFromSearch(loc?.search);
    if (qNext) return sanitizeNext(qNext);

    try {
      const ss = sessionStorage.getItem("post_login_next");
      if (ss) return sanitizeNext(ss);
    } catch {}

    return createPageUrl("Discover");
  }, [loc?.search]);

  useEffect(() => {
    if (season?.isLoading) return;

    // Not authenticated -> go Home with signin prompt
    if (!season?.accountId) {
      nav(createPageUrl("Home") + `?signin=1&next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }

    // Authenticated: clear demo stickiness (user chose to log in)
    try { sessionStorage.removeItem("demo_mode_v1"); } catch {}
    try { sessionStorage.removeItem("demo_year_v1"); } catch {}

    // Entitled -> HARD redirect to next (avoids SPA cache weirdness post-auth)
    if (season?.hasAccess && season?.entitlement) {
      const target = `${window.location.origin}${next}`;
      window.location.assign(target);
      return;
    }

    // Not entitled -> HARD redirect to Subscribe (no logout; less confusion/loops)
    const subscribeUrl =
      `${window.location.origin}${createPageUrl("Subscribe")}` +
      `?source=auth_gate_no_entitlement&reason=no_entitlement` +
      `&next=${encodeURIComponent(next)}`;

    window.location.assign(subscribeUrl);
  }, [season?.isLoading, season?.accountId, season?.hasAccess, season?.entitlement, next, nav]);

  return <div className="min-h-screen bg-slate-50" />;
}
