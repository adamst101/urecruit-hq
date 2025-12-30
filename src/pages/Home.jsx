import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Lock, PlayCircle, UserCircle2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

/**
 * Home
 *
 * Critical behavior:
 * - By default, acts as canonical entry router (paid users go to Discover, etc.)
 * - BUT if `?signedout=1` is present, it must NOT auto-redirect anywhere.
 *   This prevents logout loops caused by transient/stale auth state.
 */
export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();

  const { mode, loading: accessLoading, currentYear, demoYear, accountId } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  // ✅ Escape hatch: if we just signed out, do NOT auto-route anywhere.
  const signedOut = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    return params.get("signedout") === "1";
  }, [location.search]);

  // Canonical entry routing (disabled when signedOut=1)
  useEffect(() => {
    if (signedOut) return;
    if (accessLoading || identityLoading) return;

    // Signed in + has profile
    if (accountId && athleteProfile) {
      if (mode === "paid") navigate(createPageUrl("Discover"));
      else navigate(createPageUrl("Onboarding"));
      return;
    }

    // Signed in but no profile
    if (accountId && !athleteProfile) {
      navigate(createPageUrl("Onboarding"));
    }
  }, [signedOut, accessLoading, identityLoading, accountId, athleteProfile, mode, navigate]);

  const handleSignIn = async () => {
    try {
      // Base44 auth UX varies by project.
      // If this method isn't available, fallback to Onboarding (often triggers auth UI).
      if (base44?.auth?.signIn) {
        await base44.auth.signIn();
        return;
      }
      navigate(createPageUrl("Onboarding"));
    } catch (e) {
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

          {signedOut && (
            <p className="text-sm text-slate-600 mt-3">
              You’re signed out.
            </p>
          )}
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
