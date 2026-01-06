import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, LogIn, CalendarDays, Compass, Star } from "lucide-react";

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

  const rawLoading = isLoading || (authed && identityLoading);

  // Fuse so Home never bricks
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

  // marketing copy
  const heroTitle = "Recruit smarter. Avoid conflicts. See the whole season.";
  const heroDesc =
    "Plan and prioritize college camps across your target schools—before weekends disappear.";
  const trustLine = "Independent planning tool • Not affiliated with camps";

  // Badge should reflect the *data mode* currently available
  const badgeText = paid ? `Current season: ${currentY}` : `Demo season: ${demoY}`;
  const badgeClass = paid ? "bg-emerald-700 text-white" : "bg-slate-900 text-white";

  const statusLine = useMemo(() => {
    if (loading) return "Loading…";
    if (paid) return "Full access enabled. Planning tools and write actions unlocked.";
    if (authed) return "Signed in with demo access. Same screens, demo data, read-only actions.";
    return "Explore the demo or subscribe for current season + planning tools.";
  }, [loading, paid, authed]);

  // Track view once/session
  useEffect(() => {
    if (rawLoading && !loadingFusedOpen) return;

    const key = `evt_home_viewed_${paid ? "paid" : authed ? "demo_authed" : "anon"}_${currentY}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "home_viewed",
      mode: paid ? "paid" : authed ? "demo" : "anon",
      season_year: paid ? currentY : demoY,
      source: "home",
      account_id: accountId || null,
      fused_open: loadingFusedOpen ? 1 : 0
    });
  }, [rawLoading, loadingFusedOpen, paid, authed, currentY, demoY, accountId]);

  async function handleLogin() {
    trackEvent({
      event_name: "home_login_clicked",
      mode: paid ? "paid" : authed ? "demo" : "anon",
      season_year: paid ? currentY : demoY,
      source: "home"
    });

    const ok = await safeSignIn();
    if (!ok) {
      nav(createPageUrl("Home"), { replace: true });
      return;
    }

    // After login: if they had a deep link, honor it; otherwise drop them into Discover (demo-safe)
    nav(next ? next : createPageUrl("Discover"), { replace: true });
  }

  function goSubscribe() {
    trackEvent({
      event_name: "home_subscribe_clicked",
      mode: authed ? "demo" : "anon",
      season_year: currentY,
      source: "home"
    });
    nav(createPageUrl("Subscribe"));
  }

  // Demo should feel like the real app: route into app pages, but they will read demo data.
  function goDemo() {
    trackEvent({
      event_name: "home_demo_clicked",
      mode: "demo",
      season_year: demoY,
      source: "home"
    });
    nav(createPageUrl("Discover"));
  }

  // Paid workspace links
  const showWorkspace = paid && authed && hasProfile;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
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

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleLogin}>
              <LogIn className="w-4 h-4 mr-2" />
              Log in
            </Button>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid md:grid-cols-3 gap-4">
          {/* Marketing / Start */}
          <Card className="p-6 space-y-4 md:col-span-2 border-slate-300 shadow-sm">
            <div className="space-y-2">
              <div className="text-lg font-bold text-deep-navy">Start with the demo</div>
              <div className="text-sm text-slate-600">
                Same screens as subscribers—just demo data. Upgrade anytime to unlock current season,
                write actions, and your athlete context.
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="sm:flex-1" onClick={goDemo} disabled={loading}>
                {loading ? "Loading…" : `View demo (${demoY})`}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>

              <Button className="sm:flex-1" variant="outline" onClick={goSubscribe} disabled={loading}>
                {`Sign up / Unlock ${currentY}`}
              </Button>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 pt-2">
              <div className="text-sm">
                <div className="font-semibold text-deep-navy">Clarity</div>
                <div className="text-slate-600">
                  See camps only from schools you actually care about.
                </div>
              </div>
              <div className="text-sm">
                <div className="font-semibold text-deep-navy">Control</div>
                <div className="text-slate-600">
                  Spot conflicts early—before you commit weekends.
                </div>
              </div>
              <div className="text-sm">
                <div className="font-semibold text-deep-navy">Confidence</div>
                <div className="text-slate-600">
                  Plan the season with fewer mistakes and clearer tradeoffs.
                </div>
              </div>
            </div>
          </Card>

          {/* Workspace (paid-only) */}
          <Card className="p-6 space-y-3">
            <div className="text-lg font-bold text-deep-navy">Workspace</div>

            {showWorkspace ? (
              <>
                <div className="text-sm text-slate-600">
                  You’re unlocked. Jump into your season tools.
                </div>

                <div className="space-y-2">
                  <Button className="w-full" onClick={() => nav(createPageUrl("MyCamps"))}>
                    <Star className="w-4 h-4 mr-2" />
                    Favorites (My Camps)
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => nav(createPageUrl("Discover"))}>
                    <Compass className="w-4 h-4 mr-2" />
                    Discover
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => nav(createPageUrl("Calendar"))}>
                    <CalendarDays className="w-4 h-4 mr-2" />
                    Calendar
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-slate-600">
                  Favorites and planning tools unlock after subscription + athlete setup.
                </div>

                <div className="space-y-2">
                  <Button variant="outline" className="w-full" onClick={goDemo} disabled={loading}>
                    View demo
                  </Button>
                  <Button className="w-full" onClick={goSubscribe} disabled={loading}>
                    Unlock {currentY}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="text-xs text-slate-500">
          Built for recruiting families who need fewer mistakes, fewer conflicts, and clearer tradeoffs.
        </div>
      </div>
    </div>
  );
}
