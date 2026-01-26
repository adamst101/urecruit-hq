// src/layout.js
import React, { useMemo } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { createPageUrl } from "./utils";

import { Button } from "./components/ui/button";
import { useSeasonAccess } from "./components/hooks/useSeasonAccess.jsx";

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

  // ✅ Updated: Member Login routes through Subscribe gate and strips demo flags
  async function handleMemberLogin() {
    try {
      // Clear any persisted demo session so auth doesn't get "stuck" in demo
      try { sessionStorage.removeItem("demo_mode_v1"); } catch {}
      try { sessionStorage.removeItem("demo_year_v1"); } catch {}

      // Preserve where they came from, but DO NOT keep mode=demo in next
      const sp = new URLSearchParams(location.search || "");
      sp.delete("mode");
      sp.delete("src");
      sp.delete("source");

      const cleanNext = `${location.pathname}${sp.toString() ? `?${sp.toString()}` : ""}`;

      // Route through Subscribe gate after login (same pattern as Home)
      const fromUrl =
        `${window.location.origin}${createPageUrl("Subscribe")}` +
        `?source=auth_gate&next=${encodeURIComponent(cleanNext)}`;

      // Base44 login expects from_url as an ABSOLUTE URL
      const loginUrl = `${window.location.origin}/login?from_url=${encodeURIComponent(fromUrl)}`;
      window.location.assign(loginUrl);
    } catch {}
  }

  function handleGoHome() {
    nav(createPageUrl("Home"));
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Top bar */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={handleGoHome}
            className="font-bold text-deep-navy"
          >
            URecruit HQ
          </button>

          <div className="flex items-center gap-2">
            {/* Show Member Login when user isn't entitled */}
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
