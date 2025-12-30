import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Lock, PlayCircle, UserCircle2, Loader2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

/**
 * Home
 * Base44 convention route: /Home (and often "/")
 *
 * IMPORTANT:
 * - This page should NOT auto-redirect.
 * - It should be a true landing page with explicit CTAs.
 */
export default function Home() {
  const navigate = useNavigate();
  const { mode, loading: accessLoading, currentYear, demoYear, accountId } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const [authWorking, setAuthWorking] = useState(false);
  const loading = accessLoading || identityLoading;

  // Determine the best "continue" target WITHOUT auto-navigation
  const continueTarget = useMemo(() => {
    // Not signed in: we don't have a "continue" target
    if (!accountId) return null;

    // Signed in, no profile -> complete onboarding/profile
    if (!athleteProfile) return "Onboarding";

    // Signed in + profile:
    // paid -> Discover
    if (mode === "paid") return "Discover";

    // unpaid -> Onboarding (paywall hub)
    return "Onboarding";
  }, [accountId, athleteProfile, mode]);

  const continueLabel = useMemo(() => {
    if (!accountId) return null;
    if (!athleteProfile) return "Complete Setup";
    if (mode === "paid") return "Continue";
    return "Upgrade / Manage Access";
  }, [accountId, athleteProfile, mode]);

  const handleSignIn = async () => {
    setAuthWorking(true);
    try {
      // Base44 auth may vary; this is the best-known default
      await base44.auth.signIn();
      // after sign in, Home will re-render and show Continue
    } catch (e) {
      // Fallback: take them to Onboarding (often triggers auth UI)
      navigate(createPageUrl("Onboarding"));
    } finally {
      setAuthWorking(false);
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

          <div className="mt-3 flex gap-2">
            <Badge className="bg-slate-900 text-white">Demo: {demoYear}</Badge>
            <Badge className="bg-emerald-600 text-white">Current: {currentYear}</Badge>
            {accountId && (
              <Badge className={mode === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}>
                {mode === "paid" ? "Paid Access" : "Demo Mode"}
              </Badge>
            )}
          </div>
        </div>

        {/* If signed in, show a Continue button (but do NOT auto-redirect) */}
        {accountId && (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <UserCircle2 className="w-6 h-6 text-slate-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-deep-navy">Welcome back</div>
                <div className="text-sm text-slate-600 mt-1">
                  {athleteProfile
                    ? mode === "paid"
                      ? "You have access to the current season."
                      : "You’re signed in, but you haven’t unlocked the current season yet."
                    : "Finish setup to personalize camps and enable favorites/registrations."}
                </div>

                <div className="mt-4">
                  <Button
                    className="w-full"
                    onClick={() => navigate(createPageUrl(continueTarget || "Onboarding"))}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      <>
                        {continueLabel}
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

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
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSignIn}
                  disabled={authWorking}
                >
                  {authWorking ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    "Sign In / Continue"
                  )}
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
