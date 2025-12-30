import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Lock, PlayCircle, Loader2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";

/**
 * Home
 * Marketing-style landing page.
 *
 * Intentional behavior:
 * - Do NOT show "Welcome back" or any session-aware UI.
 * - Even if the user is already authenticated, keep the landing page clean.
 * - Users choose: Try Demo or Sign In / Continue or Upgrade.
 */
export default function Home() {
  const navigate = useNavigate();
  const { loading: accessLoading, currentYear, demoYear } = useSeasonAccess();

  const [authWorking, setAuthWorking] = useState(false);

  const handleSignIn = async () => {
    setAuthWorking(true);
    try {
      // Base44 auth varies; this is the best-known default.
      await base44.auth.signIn();
      // After sign-in, send to onboarding hub (profile + paywall)
      navigate(createPageUrl("Onboarding"));
    } catch (e) {
      // Fallback: Onboarding (often triggers auth UI)
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
          </div>
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
                <Button className="w-full" onClick={() => navigate(createPageUrl("Onboarding"))} disabled={accessLoading}>
                  {accessLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    "Upgrade"
                  )}
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
