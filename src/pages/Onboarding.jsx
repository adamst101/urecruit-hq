import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, CheckCircle2, ArrowRight, UserCircle2 } from "lucide-react";

import { createPageUrl } from "../utils";
import { cn } from "../lib/utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

/**
 * Onboarding
 *
 * RULES (critical):
 * - NEVER redirect unless the user is:
 *   1) authenticated
 *   2) paid
 *   3) has a profile
 *
 * This prevents logout + identity cache loops.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const { mode, currentYear, demoYear, accountId } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  // ✅ SAFE redirect: only fully-qualified paid users
  useEffect(() => {
    if (identityLoading) return;

    if (accountId && mode === "paid" && athleteProfile) {
      navigate(createPageUrl("Discover"));
    }
  }, [identityLoading, accountId, mode, athleteProfile, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-deep-navy">Get Started</h1>
          <p className="text-slate-600 mt-1">
            Set up your athlete profile, then unlock the current season when you’re ready.
          </p>
        </div>

        {/* Paywall card — demo OR signed-out users */}
        <PaywallCard
          show={mode !== "paid"}
          currentYear={currentYear}
          demoYear={demoYear}
          onUpgrade={() => navigate(createPageUrl("Checkout"))}
          onKeepDemo={() => navigate(createPageUrl("Discover"))}
        />

        {/* Profile setup (works for signed-in users only) */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <UserCircle2 className="w-6 h-6 text-slate-600 mt-0.5" />
            <div className="flex-1">
              <div className="text-lg font-bold text-deep-navy">
                Create your athlete profile
              </div>

              <div className="text-sm text-slate-600 mt-1">
                This enables favorites, registrations, and personalization across Discover,
                Calendar, and MyCamps.
              </div>

              <div className="mt-4">
                <Button
                  className="w-full"
                  onClick={() => navigate(createPageUrl("Profile"))}
                  disabled={!accountId || identityLoading}
                >
                  Continue to Profile Setup
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>

              {!accountId && (
                <div className="mt-3 text-xs text-slate-500">
                  Sign in is required to create a profile.
                </div>
              )}

              {identityLoading && (
                <div className="mt-3 text-xs text-slate-500">
                  Loading your profile…
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="text-center">
          <button
            className="text-sm text-slate-600 underline hover:text-slate-900"
            onClick={() => navigate(createPageUrl("Discover"))}
          >
            Back to Discover
          </button>
        </div>
      </div>
    </div>
  );
}

function PaywallCard({ show, currentYear, demoYear, onUpgrade, onKeepDemo }) {
  if (!show) return null;

  return (
    <Card className="p-4 border-amber-200 bg-amber-50">
      <div className="flex items-start gap-3">
        <Lock className="w-5 h-5 text-amber-700 mt-0.5" />
        <div className="flex-1">
          <div className="font-semibold text-amber-900">
            Unlock Current Season Camps ({currentYear})
          </div>

          <div className="text-sm text-amber-900/80 mt-1">
            You’re currently browsing the demo dataset ({demoYear}). Upgrade to
            access the current season and full planning features.
          </div>

          <ul className="mt-3 space-y-1 text-sm text-amber-900/90">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Current-year camps & updates
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Favorites + registrations
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Calendar planning overlays
            </li>
          </ul>

          <div className="mt-4 flex gap-2">
            <Button className="flex-1" onClick={onUpgrade}>
              Upgrade / Subscribe
            </Button>
            <Button variant="outline" className="flex-1" onClick={onKeepDemo}>
              Keep Browsing Demo
            </Button>
          </div>

          <div className={cn("text-xs text-amber-900/70 mt-3")}>
            Access expires at the end of the season. Renew yearly.
          </div>
        </div>
      </div>
    </Card>
  );
}
