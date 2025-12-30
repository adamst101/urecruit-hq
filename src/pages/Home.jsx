import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Lock, PlayCircle, UserCircle2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

export default function Home() {
  const navigate = useNavigate();
  const { mode, loading: accessLoading, currentYear, demoYear, accountId } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  // Canonical entry routing
  useEffect(() => {
    if (accessLoading || identityLoading) return;

    // If signed in + profile:
    if (accountId && athleteProfile) {
      // Paid users go straight in
      if (mode === "paid") navigate(createPageUrl("Discover"));
      // Unpaid users go to Onboarding paywall hub
      else navigate(createPageUrl("Onboarding"));
      return;
    }

    // If signed in but no profile, route to Onboarding to complete setup
    if (accountId && !athleteProfile) {
      navigate(createPageUrl("Onboarding"));
    }
  }, [accessLoading, identityLoading, accountId, athleteProfile, mode, navigate]);

  const handleSignIn = async () => {
    // Base44 auth UX varies. This is the safest "kick off auth" call pattern:
    // If your project uses a different method, Base44 AI can tell you the correct one.
    try {
      await base44.auth.signIn();
    } catch (e) {
      // If signIn isn’t available in your SDK, fall back to Onboarding (often triggers auth UI)
      navigate(createPageUrl("Onboarding"));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4 pt-8">
        <div>
          <h1 className="text-3xl font-bold text-deep-navy">RecruitMe</h1>
          <p className="text-slate-600 mt-2">
            Plan and compare college camps across the recruiting calendar — before you commit.
          </p>
        </div>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <PlayCircle className="w-6 h-6 text-slate-700 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-deep-navy">Try the demo</div>
              <div className="text-sm text-slate-600 mt-1">
                Browse last year’s camps ({demoYear}) with Discover + Calendar.
              </div>
              <div className="mt-4">
                <Button className="w-full" onClick={() => navigate(createPageUrl("Discover"))}>
                  Try Demo
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <Lock className="w-6 h-6 text-amber-700 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900">Unlock the current season</div>
              <div className="text-sm text-amber-900/80 mt-1">
                Upgrade to access current-year camps ({currentYear}) and planning features.
              </div>
              <div className="mt-4 space-y-2">
                <Button className="w-full" onClick={() => navigate(createPageUrl("Onboarding"))}>
                  Upgrade
                </Button>
                <Button variant="outline" className="w-full" onClick={handleSignIn}>
                  Sign In / Continue
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <UserCircle2 className="w-6 h-6 text-slate-700 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-deep-navy">Already have an account?</div>
              <div className="text-sm text-slate-600 mt-1">
                Sign in to manage favorites, registrations, and your camp calendar.
              </div>
              <div className="mt-4">
                <Button variant="outline" className="w-full" onClick={handleSignIn}>
                  Sign In
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <div className="text-xs text-slate-500 text-center pt-2">
          Demo = last year’s dataset. Paid = current year. Renews annually.
        </div>
      </div>
    </div>
  );
}
