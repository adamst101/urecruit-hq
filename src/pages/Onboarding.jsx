import React from "react";
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
 * Base44 convention route: /Onboarding
 *
 * Purpose (now):
 * - Landing step for demo users to upgrade
 * - Landing step for new users to finish setup
 *
 * IMPORTANT:
 * - We are NOT implementing payments here yet.
 * - This page is a funnel + clear next action.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const { mode, currentYear, demoYear } = useSeasonAccess();

  // Identity hook is the single source of truth (consistent with MyCamps/Discover/Calendar)
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  // If they already have an athlete profile, don’t trap them here.
  // Send them to the paid/demonstration entry point.
  if (!identityLoading && athleteProfile) {
    navigate(createPageUrl("Discover"));
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="pt-2">
          <h1 className="text-2xl font-bold text-deep-navy">Get Started</h1>
          <p className="text-slate-600 mt-1">
            Set up your athlete profile, then unlock the current season when you’re ready.
          </p>
        </div>

        {/* Paywall card shows ONLY in demo mode */}
        <PaywallCard
          show={mode !== "paid"}
          currentYear={currentYear}
          demoYear={demoYear}
          onUpgrade={() => navigate(createPageUrl("Checkout"))}
          onKeepDemo={() => navigate(createPageUrl("Discover"))}
        />

        {/* Setup card (works for everyone) */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <UserCircle2 className="w-6 h-6 text-slate-600 mt-0.5" />
            <div className="flex-1">
              <div className="text-lg font-bold text-deep-navy">Create your athlete profile</div>
              <div className="text-sm text-slate-600 mt-1">
                This enables favorites, registrations, and personalization across Discover, Calendar, and MyCamps.
              </div>

              <div className="mt-4">
                <Button className="w-full" onClick={() => navigate(createPageUrl("Profile"))}>
                  Continue to Profile Setup
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                If you already completed setup, you’ll be redirected to Discover automatically.
              </div>
            </div>
          </div>
        </Card>

        {/* Optional: direct path back to demo */}
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
            You’re currently browsing the demo dataset ({demoYear}). Upgrade to access the current season, plus the
            full planning experience.
          </div>

          <ul className="mt-3 space-y-1 text-sm text-amber-900/90">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Current-year camps & updates
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Favorites + registrations synced across pages
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Calendar overlays for planning
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
            Access expires at end of the season. Renew yearly to keep current-year camps.
          </div>
        </div>
      </div>
    </Card>
  );
}
