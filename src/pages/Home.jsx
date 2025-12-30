import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Lock, PlayCircle, UserCircle2 } from "lucide-react";

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
 *   2) Signed in (but not ready) -> Finish setup / Upgrade
 *   3) Anonymous -> Demo
 */
export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();

  const { mode, loading: accessLoading, currentYear, demoYear, accountId } =
    useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const signedOut = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    return params.get("signedout") === "1";
  }, [location.search]);

  const logoutLatch = useMemo(() => {
    try {
      const t = Number(localStorage.getItem("logoutAt") || 0);
      if (!t) return false;
      return Date.now() - t < 5000;
    } catch {
      return false;
    }
  }, []);

  const isAuthed = !!accountId;
  const hasProfile = !!athleteProfile;
  const isPaid = mode === "paid";

  const readyPaid = isAuthed && isPaid && hasProfile;
  const signedInButNotReady = isAuthed && !readyPaid; // includes unpaid OR no profile

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

  // Optional: keep loading states simple
  const loading = accessLoading || (isAuthed && identityLoading);

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

  // ✅ Exclusive State 1: Paid + profile complete
  if (readyPaid) {
    return (
      <PaidHome
        currentYear={currentYear}
        showSignedOutNote={showSignedOutNote}
        onContinue={() => navigate(createPageUrl("Discover"))}
      />
    );
  }

  // ✅ Exclusive State 2: Signed in but not ready (unpaid or no profile)
  if (signedInButNotReady) {
    return (
      <SignedInHome
        currentYear={currentYear}
        demoYear={demoYear}
        isPaid={isPaid}
        hasProfile={hasProfile}
        showSignedOutNote={showSignedOutNote}
        onPrimary={() =>
          navigate(createPageUrl(isPaid ? "Onboarding" : "Checkout"))
        }
        onSecondary={() => navigate(createPageUrl("Discover"))} // demo as fallback
        onSignIn={handleSignIn}
      />
    );
  }

  // ✅ Exclusive State 3: Anonymous / demo
  return (
    <AnonymousHome
      currentYear={currentYear}
      demoYear={demoYear}
      showSignedOutNote={showSignedOutNote}
      onDemo={() => navigate(createPageUrl("Discover"))}
      onSignIn={handleSignIn}
      onUpgrade={() => navigate(createPageUrl("Onboarding"))}
    />
  );
}

/* -------------------------
   State components
-------------------------- */

function Shell({
  children,
  showSignedOutNote
}: {
  children: React.ReactNode;
  showSignedOutNote: boolean;
}) {
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

function PaidHome({
  currentYear,
  showSignedOutNote,
  onContinue
}: {
  currentYear: number | string;
  showSignedOutNote: boolean;
  onContinue: () => void;
}) {
  return (
    <Shell showSignedOutNote={showSignedOutNote}>
      <Card className="p-4 border-emerald-200 bg-emerald-50">
        <div className="flex items-start gap-3">
          <ArrowRight className="w-6 h-6 text-emerald-700 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-emerald-900">Welcome back</div>
            <div className="text-sm text-emerald-900/80 mt-1">
              Your current season ({currentYear}) planning is ready.
            </div>
            <div className="mt-4">
              <Button className="w-full" onClick={onContinue}>
                Continue to Discover
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </Shell>
  );
}

function SignedInHome({
  currentYear,
  demoYear,
  isPaid,
  hasProfile,
  showSignedOutNote,
  onPrimary,
  onSecondary
}: {
  currentYear: number | string;
  demoYear: number | string;
  isPaid: boolean;
  hasProfile: boolean;
  showSignedOutNote: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
  onSignIn: () => void; // not used here, but kept if you want it later
}) {
  const title = !isPaid
    ? "Unlock the current season"
    : !hasProfile
      ? "Finish your athlete profile"
      : "Continue setup";

  const body = !isPaid
    ? `Upgrade to access current-year camps (${currentYear}) and planning features.`
    : !hasProfile
      ? "Create your athlete profile to enable favorites, calendar overlays, and personalized filtering."
      : "Complete setup to personalize your experience.";

  const primaryLabel = !isPaid ? "Upgrade / Subscribe" : "Complete Setup";
  const secondaryLabel = `Browse demo (${demoYear}) instead`;

  return (
    <Shell showSignedOutNote={showSignedOutNote}>
      <Card className="p-4 border-amber-200 bg-amber-50">
        <div className="flex items-start gap-3">
          <Lock className="w-6 h-6 text-amber-700 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-amber-900">{title}</div>
            <div className="text-sm text-amber-900/80 mt-1">{body}</div>

            <div className="mt-4 space-y-2">
              <Button className="w-full" onClick={onPrimary}>
                {primaryLabel}
              </Button>
              <button
                className="w-full text-sm text-slate-700 underline hover:text-slate-900"
                onClick={onSecondary}
              >
                {secondaryLabel}
              </button>
            </div>
          </div>
        </div>
      </Card>
    </Shell>
  );
}

function AnonymousHome({
  currentYear,
  demoYear,
  showSignedOutNote,
  onDemo,
  onSignIn,
  onUpgrade
}: {
  currentYear: number | string;
  demoYear: number | string;
  showSignedOutNote: boolean;
  onDemo: () => void;
  onSignIn: () => void;
  onUpgrade: () => void;
}) {
  return (
    <Shell showSignedOutNote={showSignedOutNote}>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <PlayCircle className="w-6 h-6 text-slate-700 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-deep-navy">Try the demo</div>
            <div className="text-sm text-slate-600 mt-1">
              Browse last year’s camps ({demoYear}) with Discover + Calendar.
            </div>
            <div className="mt-4">
              <Button className="w-full" onClick={onDemo}>
                Try Demo
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <div className="mt-3 text-center text-sm text-slate-600">
              Want current-year camps ({currentYear})?
            </div>

            <div className="mt-3 space-y-2">
              <Button className="w-full" onClick={onUpgrade}>
                Unlock Current Season
              </Button>
              <button
                className="w-full text-sm text-slate-700 underline hover:text-slate-900"
                onClick={onSignIn}
              >
                Sign in
              </button>
            </div>
          </div>
        </div>
      </Card>
    </Shell>
  );
}
