import React, { useEffect, useMemo, useState } from "react";
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

function fallbackDemoYear() {
  const y = new Date().getFullYear();
  return y - 1;
}
function fallbackCurrentYear() {
  return new Date().getFullYear();
}

export default function Home() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next");

  const { isLoading, mode, accountId, currentYear, demoYear } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const authed = !!accountId;
  const paid = mode === "paid";
  const hasProfile = !!athleteProfile;

  // ---- Stuck-loading fuse (Home must never brick) ----
  const rawLoading = isLoading || (authed && identityLoading);
  const [loadingFusedOpen, setLoadingFusedOpen] = useState(false);

  useEffect(() => {
    if (!rawLoading) {
      setLoadingFusedOpen(false);
      return;
    }
    const t = setTimeout(() => setLoadingFusedOpen(true), 2500);
    return () => clearTimeout(t);
  }, [rawLoading]);

  const loading = rawLoading && !loadingFusedOpen;

  const demoY = demoYear ?? fallbackDemoYear();
  const currentY = currentYear ?? fallbackCurrentYear();

  // ---- Track home viewed (don’t wait forever if fuse trips) ----
  useEffect(() => {
    if (rawLoading && !loadingFusedOpen) return;

    const key = `evt_home_viewed_${mode || "demo"}_${currentY}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "home_viewed",
      mode: mode || "demo",
      season_year: paid ? currentY : demoY,
      source: "home",
      account_id: accountId || null,
      fused_open: loadingFusedOpen ? 1 : 0
    });
  }, [rawLoading, loadingFusedOpen, mode, currentY, demoY, paid, accountId]);

  // ---- Copy: aligned to your model (no personalization unless paid+profile) ----
  const heroTitle = "Recruit smarter. Avoid conflicts. See the whole season.";
  const heroDesc =
    "Plan and prioritize college camps across your target schools—before weekends disappear.";
  const trustLine = "Independent planning tool • Not affiliated with camps";

  // ---- Status line: clearly separate demo vs paid current season ----
  const statusLine = useMemo(() => {
    if (loading) return "Loading…";
    if (paid) return `Current season mode (${currentY}). Paid workspaces require athlete setup.`;
    return `Demo mode (${demoY}). Unlock ${currentY} for the current season and planning tools.`;
  }, [loading, paid, currentY, demoY]);

  // Badge
  const badgeText = paid ? `Paid: ${currentY}` : `Demo: ${demoY}`;
  const badgeClass = paid ? "bg-emerald-700 text-white" : "bg-slate-900 text-white";

  // ---- Navigation helpers ----
  async function handleLogin() {
    trackEvent({
      event_name: "home_login_clicked",
      mode: mode || "demo",
      season_year: paid ? currentY : demoY,
      source: "home",
      fused_open: loadingFusedOpen ? 1 : 0
    });

    const ok = await safeSignIn();
    if (!ok) {
      nav(createPageUrl("Home"), { replace: true });
      return;
    }

    // After login: honor next if provided, otherwise go Discover (demo-friendly).
    // Paid users without profile will be routed by guards when they attempt paid workspaces.
    nav(next ? next : createPageUrl("Discover"), { replace: true });
  }

  function goDiscoverDemo() {
    trackEvent({
      event_name: "home_demo_discover_clicked",
      mode: "demo",
      season_year: demoY,
      source: "home",
      fused_open: loadingFusedOpen ? 1 : 0
    });
    nav(createPageUrl("Discover"));
  }

  function goSubscribe() {
    if (paid) {
      // Paid users shouldn’t land here; keep them moving.
      trackEvent({
        event_name: "home_paid_subscribe_clicked",
        mode: "paid",
        season_year: currentY,
        source: "home"
      });
      nav(createPageUrl("MyCamps"));
      return;
    }

    trackEvent({
      event_name: "home_subscribe_clicked",
      mode: authed ? "demo" : "anon",
      season_year: currentY,
      source: "home",
      fused_open: loadingFusedOpen ? 1 : 0
    });
    nav(createPageUrl("Subscribe"));
  }

  function goProfile() {
    trackEvent({
      event_name: "home_profile_clicked",
      mode: paid ? "paid" : authed ? "demo" : "anon",
      season_year: paid ? currentY : demoY,
      source: "home"
    });
    nav(createPageUrl("Profile"));
  }

  function goMyCamps() {
    trackEvent({
      event_name: "home_mycamps_clicked",
      mode: "paid",
      season_year: currentY,
      source: "home"
    });
    nav(createPageUrl("MyCamps"));
  }

  function goCalendar() {
    trackEvent({
      event_name: "home_calendar_clicked",
      mode: "paid",
      season_year: currentY,
      source: "home"
    });
    nav(createPageUrl("Calendar"));
  }

  // ---- Primary CTA policy (matches your guard model) ----
  const primary = useMemo(() => {
    // Paid workspaces are paid-only + requireProfile
    if (paid && authed && !hasProfile) {
      return {
        label: "Set up athlete profile",
        action: goProfile,
        key: "primary_profile_required"
      };
    }
    if (paid && authed && hasProfile) {
      return {
        label: "Go to My Camps",
        action: goMyCamps,
        key: "primary_mycamps"
      };
    }

    // Not paid (anon or authed demo): primary is demo Discover
    return {
      label: `Explore demo camps (${demoY})`,
      action: goDiscoverDemo,
      key: "primary_demo_discover"
    };
  }, [paid, authed, hasProfile, demoY]);

  function primaryCTA() {
    trackEvent({
      event_name: "home_primary_clicked",
      primary_key: primary.key,
      mode: paid ? "paid" : authed ? "demo" : "anon",
      season_year: paid ? currentY : demoY,
      source: "home",
      account_id: accountId || null
    });

    primary.action();
  }

  // ---- Secondary CTA policy (no redundancy) ----
  const secondaryLeft = useMemo(() => {
    if (!authed) {
      return { label: "Log in", action: handleLogin };
    }
    // Signed-in demo OR paid: profile is always accessible for auth users
    return { label: "Account", action: goProfile };
  }, [authed, paid, hasProfile]);

  const secondaryRight = useMemo(() => {
    if (!paid) {
      return { label: `Unlock ${currentY}`, action: goSubscribe };
    }
    // Paid user: offer Calendar (paid-only workspace)
    return { label: "Open Calendar", action: goCalendar };
  }, [paid, currentY]);

  const outcomeBullets = [
    { title: "Clarity", text: "See camps only from schools you actually care about." },
    { title: "Control", text: "Spot date conflicts early—before you commit weekends." },
    { title: "Confidence", text: "Track favorites and registrations for multiple athletes." }
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-3xl font-extrabold text-deep-navy">RecruitMe</div>

            <div className="text-xl font-bold text-deep-navy leading-snug">{heroTitle}</div>
            <div className="text-slate-600">{heroDesc}</div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={badgeClass}>{badgeText}</Badge>
              <div className="text-xs text-slate-500">
                {loadingFusedOpen && rawLoading
                  ? "Having trouble loading status—continuing anyway."
                  : statusLine}
              </div>
            </div>

            <div className="text-xs text-slate-500">{trustLine}</div>
          </div>

          {/* Top-right utility: keep it simple */}
          <div className="flex gap-2">
            {!authed ? (
              <Button variant="outline" onClick={handleLogin}>
                <LogIn className="w-4 h-4 mr-2" />
                Log in
              </Button>
            ) : (
              <Button variant="outline" onClick={goProfile}>
                Account
              </Button>
            )}
          </div>
        </div>

        {/* Main */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6 space-y-4 border-slate-300 shadow-sm">
            <div className="space-y-1">
              <div className="text-lg font-bold text-deep-navy">Start here</div>
              <div className="text-sm text-slate-600">
                {!paid
                  ? "Explore the demo, then unlock the current season when you’re ready."
                  : !hasProfile
                  ? "Paid workspaces require athlete setup. Create an athlete to continue."
                  : "You’re unlocked. Jump into your paid season workspace."}
              </div>
            </div>

            <Button className="w-full" onClick={primaryCTA} disabled={loading}>
              {loading ? "Loading…" : primary.label}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={secondaryLeft.action} disabled={loading}>
                {secondaryLeft.label}
              </Button>

              <Button variant="outline" onClick={secondaryRight.action} disabled={loading}>
                {secondaryRight.label}
              </Button>
            </div>

            {paid && authed && !hasProfile && (
              <div className="text-xs text-amber-700 flex items-start gap-2">
                <Lock className="w-4 h-4 mt-0.5" />
                <div>Profile is required to access MyCamps, Calendar, CampDetail, and Planner.</div>
              </div>
            )}
          </Card>

          <Card className="p-6 space-y-4">
            <div className="text-lg font-bold text-deep-navy">What you get</div>

            <div className="space-y-3">
              {outcomeBullets.map((b) => (
                <div key={b.title} className="text-sm">
                  <div className="font-semibold text-deep-navy">{b.title}</div>
                  <div className="text-slate-600">{b.text}</div>
                </div>
              ))}
            </div>

            <div className="text-xs text-slate-500">
              Demo is last season’s data (read-only). Paid unlock enables current-season planning tools.
            </div>
          </Card>
        </div>

        <div className="text-xs text-slate-500">
          Built for recruiting families who need fewer mistakes, fewer conflicts, and clearer tradeoffs.
        </div>
      </div>
    </div>
  );
}
