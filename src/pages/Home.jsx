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

  // Raw loading from hooks
  const rawLoading = isLoading || (authed && identityLoading);

  // ---- Stuck-loading fuse: after 2.5s, stop blocking the user ----
  const [loadingFusedOpen, setLoadingFusedOpen] = useState(false);

  useEffect(() => {
    // Reset fuse whenever we go into a loading state
    if (!rawLoading) {
      setLoadingFusedOpen(false);
      return;
    }

    const t = setTimeout(() => setLoadingFusedOpen(true), 2500);
    return () => clearTimeout(t);
  }, [rawLoading]);

  // Effective loading: only show/disable while not fused open
  const loading = rawLoading && !loadingFusedOpen;

  // Years with safe fallback so UI never becomes undefined-dependent
  const demoY = demoYear ?? fallbackDemoYear();
  const currentY = currentYear ?? fallbackCurrentYear();

  // Home viewed (dedupe per session) — don’t wait forever if fuse trips
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

  // Copy
  const heroTitle = "Recruit smarter. Avoid conflicts. See the whole season.";
  const heroDesc =
    "Plan and prioritize college camps across your target schools—before weekends disappear.";
  const trustLine = "Independent planning tool • Not affiliated with camps";

  // Status line: do NOT show “Loading…” forever. If fused, show a helpful fallback.
  const statusLine = useMemo(() => {
    if (loading) return "Loading…";
    if (paid) return `Current season is unlocked (${currentY}).`;
    return `Demo shows last season (${demoY}). Current season (${currentY}) updates regularly.`;
  }, [loading, paid, currentY, demoY]);

  // Badge
  const badgeText = paid ? `Unlocked: ${currentY}` : `Demo: ${demoY}`;
  const badgeClass = paid ? "bg-emerald-700 text-white" : "bg-slate-900 text-white";

  // Primary CTA label
  const primaryLabel = useMemo(() => {
    if (loading) return "Loading…";
    if (paid && authed && !hasProfile) return "Set up athlete profile";
    return "View my recruiting season";
  }, [loading, paid, authed, hasProfile]);

  // Routing logic
  function getPrimaryTarget() {
    if (paid && authed && !hasProfile) return createPageUrl("Profile");
    if (authed) return next ? next : createPageUrl("Discover");
    return createPageUrl("Discover"); // demo path
  }

  function primaryCTA() {
    const target = getPrimaryTarget();

    trackEvent({
      event_name:
        paid && authed && !hasProfile
          ? "home_primary_to_profile_clicked"
          : "home_primary_clicked",
      mode: paid ? "paid" : "demo",
      season_year: paid ? currentY : demoY,
      source: "home",
      account_id: accountId || null,
      target,
      fused_open: loadingFusedOpen ? 1 : 0
    });

    nav(target);
  }

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
    nav(next ? next : createPageUrl("Discover"), { replace: true });
  }

  function goDemo() {
    trackEvent({
      event_name: "home_demo_clicked",
      mode: "demo",
      season_year: demoY,
      source: "home",
      fused_open: loadingFusedOpen ? 1 : 0
    });
    nav(createPageUrl("Discover"));
  }

  function goSubscribe() {
    if (paid) {
      nav(createPageUrl("Discover"));
      return;
    }
    trackEvent({
      event_name: "home_subscribe_clicked",
      mode: "demo",
      season_year: currentY,
      source: "home",
      fused_open: loadingFusedOpen ? 1 : 0
    });
    nav(createPageUrl("Subscribe"));
  }

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

              {/* Key change: if fuse opened, don’t show “Loading…”; show status/fallback */}
              <div className="text-xs text-slate-500">
                {loadingFusedOpen && rawLoading
                  ? "Having trouble loading status—continuing anyway."
                  : statusLine}
              </div>
            </div>

            <div className="text-xs text-slate-500">{trustLine}</div>
          </div>

          <div className="flex gap-2">
            {!authed ? (
              <Button variant="outline" onClick={handleLogin}>
                <LogIn className="w-4 h-4 mr-2" />
                Log in
              </Button>
            ) : (
              <Button variant="outline" onClick={() => nav(createPageUrl("Profile"))}>
                Manage profile
              </Button>
            )}
          </div>
        </div>

        {/* Main content */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6 space-y-4 border-slate-300 shadow-sm">
            <div className="space-y-1">
              <div className="text-lg font-bold text-deep-navy">Start here</div>
              <div className="text-sm text-slate-600">
                {paid
                  ? "You’re unlocked. Jump into the app and plan your season."
                  : "Explore the demo, then unlock the current season when you're ready."}
              </div>
            </div>

            {/* Key change: don’t block forever; fuse opens and enables */}
            <Button className="w-full" onClick={primaryCTA} disabled={loading}>
              {primaryLabel}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={goDemo} disabled={loading}>
                Explore demo ({demoY})
              </Button>

              {!paid ? (
                <Button variant="outline" onClick={goSubscribe} disabled={loading}>
                  Unlock {currentY}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => nav(createPageUrl("Discover"))}
                  disabled={loading}
                >
                  Go to Discover
                </Button>
              )}
            </div>

            {paid && authed && !hasProfile && (
              <div className="text-xs text-amber-700 flex items-start gap-2">
                <Lock className="w-4 h-4 mt-0.5" />
                <div>Athlete setup is required before using paid features.</div>
              </div>
            )}

            {/* Optional: subtle diagnostic hint if fuse opened */}
            {loadingFusedOpen && rawLoading ? (
              <div className="text-[11px] text-slate-400">
                Tip: your season/profile hooks are not resolving. Check console/network for
                useSeasonAccess / useAthleteIdentity calls.
              </div>
            ) : null}
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
              Demo is last season’s data. Current season unlock includes the latest updates.
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
