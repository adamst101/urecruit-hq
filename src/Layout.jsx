// src/pages/Layout.jsx
import React, { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { createPageUrl } from "../utils";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

/**
 * Layout.jsx
 *
 * Goal:
 * - Provide a consistent shell
 * - Provide a single, correct “Member Login” handler that:
 *   1) clears demo session
 *   2) preserves current page as `next` (but strips demo flags)
 *   3) routes through Subscribe gate after login (same as Home)
 */

export default function Layout() {
  const location = useLocation();
  const nav = useNavigate();
  const season = useSeasonAccess();

  const showDebug = useMemo(() => {
    try {
      const sp = new URLSearchParams(location.search || "");
      return sp.get("debug") === "1";
    } catch {
      return false;
    }
  }, [location.search]);

  // ✅ DROP-IN REPLACEMENT (as requested)
  async function handleMemberLogin() {
    try {
      // Clear any persisted demo session so auth doesn't get "stuck" in demo
      try {
        sessionStorage.removeItem("demo_mode_v1");
      } catch {}
      try {
        sessionStorage.removeItem("demo_year_v1");
      } catch {}

      // Preserve where they came from, but DO NOT keep mode=demo in next
      const sp = new URLSearchParams(location.search || "");
      sp.delete("mode");
      sp.delete("src");
      sp.delete("source");

      const cleanNext = `${location.pathname}${sp.toString() ? `?${sp.toString()}` : ""}`;

      const fromUrl =
        `${window.location.origin}${createPageUrl("Subscribe")}` +
        `?source=auth_gate&next=${encodeURIComponent(cleanNext)}`;

      const loginUrl = `${window.location.origin}/login?from_url=${encodeURIComponent(fromUrl)}`;
      window.location.assign(loginUrl);
    } catch {}
  }

  function handleGoHome() {
    nav(createPageUrl("Home"));
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Simple top bar (optional, safe) */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={handleGoHome}
            className="font-bold text-deep-navy"
          >
            URecruit HQ
          </button>

          {/* Right-side actions */}
          <div className="flex items-center gap-2">
            {/* If not authenticated or not entitled, show Member Login */}
            {(!season?.accountId || !season?.hasAccess) ? (
              <Button variant="outline" onClick={handleMemberLogin}>
                Member Login
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Debug banner (only when ?debug=1) */}
      {showDebug ? (
        <div className="max-w-5xl mx-auto px-4 pt-3">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
            <div className="font-semibold mb-1">DEBUG: Layout</div>
            <pre className="whitespace-pre-wrap break-words">
              {JSON.stringify(
                {
                  url: `${location.pathname}${location.search || ""}`,
                  season: {
                    isLoading: !!season?.isLoading,
                    mode: season?.mode,
                    hasAccess: !!season?.hasAccess,
                    accountId: season?.accountId || null,
                    isAuthenticated: !!season?.isAuthenticated,
                    currentYear: season?.currentYear ?? null,
                    demoYear: season?.demoYear ?? null,
                    seasonYear: season?.seasonYear ?? null,
                    entitlementSeason: season?.entitlement?.season_year ?? null,
                  },
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>
      ) : null}

      {/* Routed pages */}
      <main className="max-w-5xl mx-auto px-4 py-4">
        <Outlet />
      </main>
    </div>
  );
}
