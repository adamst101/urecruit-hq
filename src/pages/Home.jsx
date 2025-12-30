import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Lock, PlayCircle } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

/**
 * Home (Landing)
 * - NEVER auto-redirects
 * - Renders ONE of 3 mutually exclusive states:
 *   1) Paid + profile -> Continue
 *   2) Signed in but not ready -> Finish setup / Upgrade
 *   3) Anonymous -> Demo
 */
export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();

  const { mode, loading: accessLoading, currentYear, demoYear, accountId } =
    useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } =
    useAthleteIdentity();

  const signedOut = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    return params.get("signedout") === "1";
  }, [location.search]);

  const logoutLatch = useMemo(() => {
    try {
      const t = Number(localStorage.getItem("logoutAt") || 0);
      return t && Date.now() - t < 5000;
    } catch {
      return false;
    }
  }, []);

  const isAuthed = !!accountId;
  const hasProfile = !!athleteProfile;
  const isPaid = mode === "paid";

  const readyPaid = isAuthed && isPaid && hasProfile;
  const signedInButNotReady = isAuthed && !readyPaid;

  const loading = accessLoading || (isAuthed && identityLoading);
  const showSignedOutNote = signedOut || logoutLatch;

  const handleSignIn = async () => {
    try {
      if (base44?.auth?.signIn) {
        await base44.auth.signIn();
        return;
      }
      navigate(createPageUrl("Onboarding"));
    } catch {
      navigate(createPageUrl("Onboarding"));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-md mx-auto pt-8">
          <h1 className="text-3xl font-bold text-deep-navy">RecruitMe</h1>
          <p className="text-slate-600 mt-2">Loading…</p>
        </div>
      </div>
    );
  }

  if (readyPaid) {
    return (
      <Shell showSignedOutNote={showSignedOutNote}>
        <Card className="p-4 border-emerald-200 bg-emerald-50">
          <div className="font-semibold text-emerald-900">Welcome back</div>
          <p className="text-sm text-emerald-900/80 mt-1">
            Your current season ({currentYear}) is ready.
          </p>
          <Button
            className="w-full mt-4"
            onClick={() => navigate(createPageUrl("Discover"))}
          >
            Continue to Discover
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Card>
      </Shell>
    );
  }

  if (signedInButNotReady) {
    return (
      <Shell showSignedOutNote={showSignedOutNote}>
        <Card className="p-4 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <Lock className="w-6 h-6 text-amber-700 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900">
                {isPaid ? "Finish setup" : "Unlock the current season"}
              </div>
              <p className="text-sm text-amber-900/80 mt-1">
                {isPaid
                  ? "Complete your athlete profile to personalize camps."
                  : `Upgrade to access current-year camps (${currentYear}).`}
              </p>

              <Button
                className="w-full mt-4"
                onClick={() =>
                  navigate(createPageUrl(isPaid ? "Onboarding" : "Checkout"))
                }
              >
                {isPaid ? "Complete Setup" : "Upgrade / Subscribe"}
              </Button>

              <button
                className="mt-3 w-full text-sm underline"
                onClick={() => navigate(createPageUrl("Discover"))}
              >
                Browse demo ({demoYear}) instead
              </button>
            </div>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell showSignedOutNote={showSignedOutNote}>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <PlayCircle className="w-6 h-6 text-slate-700 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-deep-navy">Try the demo</div>
            <p className="text-sm text-slate-600 mt-1">
              Browse last year’s camps ({demoYear}).
            </p>

            <Button
              className="w-full mt-4"
              onClick={() => navigate(createPageUrl("Discover"))}
            >
              Try Demo
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <button
              className="mt-4 w-full text-sm underline"
              onClick={handleSignIn}
            >
              Sign in for current season ({currentYear})
            </button>
          </div>
        </div>
      </Card>
    </Shell>
  );
}

/* ---------- Shared layout ---------- */

function Shell({ children, showSignedOutNote }) {
  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4 pt-8">
        <div>
          <h1 className="text-3xl font-bold text-deep-navy">RecruitMe</h1>
          <p className="text-slate-600 mt-2">
            Plan and compare college camps across the recruiting calendar — before you commit.
          </p>
          {showSignedOutNote && (
            <p className="text-sm text-slate-600 mt-3">You’re signed out.</p>
          )}
        </div>

        {children}

        <div className="text-xs text-slate-500 text-center pt-2">
          Demo = last year’s dataset. Paid = current year. Renews annually.
        </div>
      </div>
    </div>
  );
}
