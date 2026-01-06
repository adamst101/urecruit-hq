import React, { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Lock, LogIn } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

async function safeSignIn() {
  try {
    if (typeof base44.auth?.signIn === "function") {
      await base44.auth.signIn();
      return true;
    }
  } catch {}
  return false;
}

export default function Home() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next");

  const { isLoading, mode, accountId, currentYear, demoYear } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const authed = !!accountId;
  const hasProfile = !!athleteProfile;

  // Home viewed (dedupe per session)
  useEffect(() => {
    if (isLoading) return;

    const key = `evt_home_viewed_${mode}_${currentYear}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "home_viewed",
      mode: mode || "demo",
      season_year: mode === "paid" ? currentYear : demoYear,
      source: "home",
      account_id: accountId || null
    });
  }, [isLoading, mode, currentYear, demoYear, accountId]);

  const loading = isLoading || (authed && identityLoading);

  const subtitle = useMemo(() => {
    if (loading) return "Loading…";
    if (!authed) return `Demo: Prior Season (${demoYear}) • Unlock Current Season (${currentYear})`;
    if (mode === "paid") return `Unlocked: Current Season (${currentYear})`;
    return `Demo: Prior Season (${demoYear}) • Unlock Current Season (${currentYear})`;
  }, [loading, authed, mode, currentYear, demoYear]);

  async function handleLogin() {
    trackEvent({
      event_name: "home_login_clicked",
      mode: mode || "demo",
      season_year: mode === "paid" ? currentYear : demoYear,
      source: "home"
    });

    const ok = await safeSignIn();

    if (ok) {
      // After login:
      // - If they have paid access, Profile gating will be enforced if missing.
      // - If next exists, respect it.
      nav(next ? next : createPageUrl("Discover"), { replace: true });
      return;
    }

    nav(createPageUrl("Home"), { replace: true });
  }

  function goDemo() {
    trackEvent({
      event_name: "home_demo_clicked",
      mode: "demo",
      season_year: demoYear,
      source: "home"
    });
    nav(createPageUrl("Discover"));
  }

  function goSubscribe() {
    trackEvent({
      event_name: "home_subscribe_clicked",
      mode: mode === "paid" ? "paid" : "demo",
      season_year: currentYear,
      source: "home"
    });
    nav(createPageUrl("Subscribe"));
  }

  function primaryContinue() {
    // Paid user without profile should be pushed to Profile.
    // Paid user with profile goes Discover.
    if (mode === "paid" && !hasProfile) {
      trackEvent({
        event_name: "home_continue_to_profile_clicked",
        mode: "paid",
        season_year: currentYear,
        source: "home"
      });
      nav(createPageUrl("Profile"));
      return;
    }

    trackEvent({
      event_name: "home_continue_clicked",
      mode: mode || "demo",
      season_year: mode === "paid" ? currentYear : demoYear,
      source: "home"
    });
    nav(createPageUrl("Discover"));
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-3xl font-extrabold text-deep-navy">RecruitMe</div>
            <div className="text-slate-600 mt-1">
              Plan and prioritize college sports camps across your target schools.
            </div>
            <div className="mt-2">
              <Badge className={mode === "paid" ? "bg-emerald-700 text-white" : "bg-slate-900 text-white"}>
                {mode === "paid" ? `Unlocked: ${currentYear}` : `Demo: ${demoYear}`}
              </Badge>
              <div className="text-xs text-slate-500 mt-2">{subtitle}</div>
            </div>
          </div>

          {/* Top actions (no duplicates) */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={goDemo}>
              View demo
            </Button>
            <Button onClick={goSubscribe}>Subscribe</Button>
            {!authed ? (
              <Button variant="outline" onClick={handleLogin}>
                <LogIn className="w-4 h-4 mr-2" />
                Log in
              </Button>
            ) : null}
          </div>
        </div>

        {/* Main content */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-5 space-y-3">
            <div className="text-lg font-bold text-deep-navy">What you get</div>
            <ul className="text-slate-600 text-sm space-y-1 list-disc list-inside">
              <li>Discover camps tied to target schools (not generic lists)</li>
              <li>Calendar overlays to spot conflicts early</li>
              <li>Favorites + registration tracking</li>
              <li>Multiple athletes under one account</li>
            </ul>

            <div className="pt-2 flex gap-2">
              <Button onClick={primaryContinue} disabled={loading}>
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button variant="outline" onClick={goSubscribe}>
                See pricing
              </Button>
            </div>

            {mode === "paid" && authed && !hasProfile && (
              <div className="mt-2 text-xs text-amber-700 flex items-start gap-2">
                <Lock className="w-4 h-4 mt-0.5" />
                <div>
                  Athlete setup is required before using paid features. You’ll be prompted automatically.
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5 space-y-3">
            <div className="text-lg font-bold text-deep-navy">Fast paths</div>
            <div className="text-sm text-slate-600">
              Choose one:
            </div>

            <div className="space-y-2">
              <Button variant="outline" className="w-full" onClick={goDemo}>
                Browse demo camps ({demoYear})
              </Button>

              <Button className="w-full" onClick={goSubscribe}>
                Unlock current season ({currentYear})
              </Button>

              {!authed && (
                <Button variant="outline" className="w-full" onClick={handleLogin}>
                  Log in
                </Button>
              )}

              {authed && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => nav(createPageUrl("Profile"))}
                >
                  Manage athlete profile
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
