// src/components/auth/RouteGuard.jsx
import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { LogIn } from "lucide-react";

import { Button } from "../ui/button";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";
import { startMemberLogin } from "../utils/memberLogin.jsx";

/**
 * RouteGuard
 * - Provides the top header (logo + login)
 * - Ensures the login button ALWAYS returns via AuthRedirect
 * - Ensures login does NOT “return to demo URL”
 */
export default function RouteGuard({ children }) {
  const loc = useLocation();
  const season = useSeasonAccess();

  // Remove demo-stickiness from the "next" path.
  // Keep "season=YYYY" if present (so it can properly gate after login),
  // but strip "mode=demo" and marketing params.
  const loginNextClean = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      sp.delete("mode");
      sp.delete("src");
      sp.delete("source");

      const qs = sp.toString();
      return `${loc.pathname}${qs ? `?${qs}` : ""}`;
    } catch {
      return loc.pathname || "/Discover";
    }
  }, [loc.pathname, loc.search]);

  const showLogin = !season?.isAuthenticated;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top header */}
      <div className="w-full bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Your existing logo/header area may already be elsewhere;
                keep this minimal to avoid breaking styling. */}
            <div className="font-bold text-deep-navy">URecruit HQ</div>
          </div>

          {showLogin ? (
            <Button
              variant="outline"
              onClick={() =>
                startMemberLogin({
                  nextPath: loginNextClean,
                  source: "top_nav_login"
                })
              }
            >
              <LogIn className="w-4 h-4 mr-2" />
              Log in
            </Button>
          ) : null}
        </div>
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
