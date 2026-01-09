// src/pages/Profile.jsx
import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { createPageUrl } from "../utils";
import RouteGuard from "../components/auth/RouteGuard";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

export default function Profile() {
  const nav = useNavigate();
  const loc = useLocation();

  const { mode, accountId, isLoading: accessLoading } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  // If someone hits Profile in demo mode, send them back to Home (Profile is paid-only).
  useEffect(() => {
    if (accessLoading) return;
    if (mode !== "paid") {
      nav(createPageUrl("Home"), { replace: true });
    }
  }, [accessLoading, mode, nav]);

  // OPTIONAL: If paid user already has a profile, don't make Profile the destination;
  // send them to MyCamps (or wherever your workspace entry is).
  useEffect(() => {
    if (accessLoading || identityLoading) return;
    if (mode === "paid" && accountId && athleteProfile) {
      // respect ?next if provided
      let next = null;
      try {
        const sp = new URLSearchParams(loc.search || "");
        next = sp.get("next");
      } catch {}
      nav(next || createPageUrl("MyCamps"), { replace: true });
    }
  }, [accessLoading, identityLoading, mode, accountId, athleteProfile, loc.search, nav]);

  return (
    <RouteGuard requireAuth={true} requirePaid={true}>
      {/* 
        KEEP / REPLACE THIS WITH YOUR REAL PROFILE UI.
        The key fix here is: requirePaid=true, and we prevent demo from living here.
      */}
      <div className="min-h-screen p-6">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-deep-navy">Athlete Profile</h1>
          <p className="text-slate-600 mt-2">
            Complete your athlete profile to unlock your paid season workspace.
          </p>

          <div className="mt-6 p-4 rounded-lg border border-slate-200 bg-white">
            <p className="text-sm text-slate-600">
              Paste your existing Profile form here (name, grad year, positions, etc.).
            </p>
          </div>
        </div>
      </div>
    </RouteGuard>
  );
}
