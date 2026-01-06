// src/pages/Home.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LogIn } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

import { getDemoDefaults, setDemoMode } from "../utils/demoMode";
import { routeToWorkspace } from "../utils/routeToWorkspace";

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

// small helper: after sign-in, allow hooks to update without blocking render
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function Home() {
  const nav = useNavigate();

  // Hooks are allowed, but Home must not block render or auto-route based on them.
  const season = useSeasonAccess();
  const identity = useAthleteIdentity();

  // Keep latest values in refs for click-handlers (avoid stale closures)
  const seasonRef = useRef(season);
  const identityRef = useRef(identity);

  useEffect(() => {
    seasonRef.current = season;
  }, [season]);

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  const { demoSeasonYear } = getDemoDefaults();

  const authed = !!season.accountId;
  const paid = season.mode === "paid";
  const hasProfile = !!identity.athleteProfile;

  // Instrument: home view (dedupe per session)
  useEffect(() => {
    const key = "evt_home_viewed_v2";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "home_view",
      source: "home",
      auth_state: authed ? "authed" : "anon",
      mode: paid ? "paid" : "demo_or_anon"
    });
    // NOTE: intentionally not dependent on hooks to avoid refiring; this is a landing page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- CTA 1: Try Demo Season (no login required; no backend writes) -----
  function handleTryDemo() {
    trackEvent({
      event_name: "cta_demo_click",
      source: "home",
      demo_season: demoSeasonYear
    });

    // Explicit demo mode contract
    setDemoMode(demoSeasonYear);

    trackEvent({
      event_name: "demo_entered",
      source: "home",
      demo_season: demoSeasonYear
    });

    // Route into the real app surface with demo params
    nav(`${createPageUrl("Discover")}?mode=demo&season=${demoSeasonYear}`);
  }

  // ----- CTA 2: Start My Season (paid → subscribe → profile → workspace) -----
  async function handleStartMySeason() {
    trackEvent({
      event_name: "cta_start_click",
      source: "home",
      auth_state: authed ? "authed" : "anon"
    });

    // Step 1: if not signed in, sign in then continue
    if (!seasonRef.current.accountId) {
      trackEvent({ event_name: "cta_login_click", source: "home", via: "start_my_season" });
      const ok = await safeSignIn();
      if (!ok) return;

      // Give hooks a moment to refresh their state (no UI blocking)
      await sleep(350);
    }

    // Refresh snapshot after potential sign-in
    const s = seasonRef.current;
    const i = identityRef.current;

    const nowAuthed = !!s.accountId;
    const nowPaid = s.mode === "paid";
    const nowHasProfile = !!i.athleteProfile;

    const decision = routeToWorkspace({
      authed: nowAuthed,
      paid: nowPaid,
      hasProfile: nowHasProfile
    });

    trackEvent({
      event_name: "start_season_routed",
      source: "home",
      destination: decision.destination
    });

    if (decision.destination === "login") {
      // If we got here, something prevented auth state from landing; take them to login again.
      await safeSignIn();
      return;
    }

    nav(decision.url);
  }

  // ----- Top-right links -----
  async function handleLoginOnly() {
    trackEvent({ event_name: "cta_login_click", source: "home", via: "top_right" });
    await safeSignIn();
  }

  const badgeText = paid ? `Paid: ${season.currentYear ?? ""}` : `Demo: ${demoSeasonYear}`;
  const badgeClass = paid ? "bg-emerald-700 text-white" : "bg-slate-900 text-white";

  // Copy blocks (developer-safe text)
  const heroHeadline = "Plan the right recruiting camps — before the season passes you by.";
  const heroSubhead =
    "RecruitMe turns a chaotic camp season into a focused, athlete-specific planning workspace — so families choose when, where, and why to attend.";
  const reframeTitle = "Not a camp directory.";
  const reframeBody =
    "This isn’t a listings app. It’s a season workspace for decisions: targets, conflicts, favorites, and a calendar that makes tradeoffs obvious.";

  const howItWorks = useMemo(
    () => [
      { title: "Try Demo", body: "No login. Explore the full app experience with last season’s data (read-only)." },
      { title: "Subscribe", body: "Unlock the current season and planning tools." },
      { title: "Set up athlete", body: "Create athlete context once. Then your workspace unlocks." }
    ],
    []
  );

  const workspaceProof = useMemo(
    () => [
      { title: "MyCamps", body: "Your intent workspace: favorites, registered, completed. (Paid + profile)" },
      { title: "Calendar", body: "Conflict overlays across camps and intent. (Paid + profile)" },
      { title: "Discover", body: "Browse camps in demo or paid mode—same screens, different season + capabilities." }
    ],
    []
  );

  function handlePricingScroll() {
    trackEvent({ event_name: "pricing_scroll", source: "home" });
    const el = document.getElementById("pricing");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Top bar */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-3xl font-extrabold text-deep-navy">RecruitMe</div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={badgeClass}>{badgeText}</Badge>
              <div className="text-xs text-slate-500">
                {paid && hasProfile
                  ? "Workspace unlocked."
                  : paid && authed && !hasProfile
                  ? "Paid active. Athlete setup required for workspace."
                  : authed
                  ? "Signed in. Demo experience available."
                  : "Public demo available. No login required."}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePricingScroll}>
              Pricing
            </Button>
            <Button variant="outline" onClick={handleLoginOnly}>
              <LogIn className="w-4 h-4 mr-2" />
              Log in
            </Button>
          </div>
        </div>

        {/* HERO */}
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <Card className="p-7 space-y-4 border-slate-300 shadow-sm">
            <div className="space-y-2">
              <div className="text-2xl font-extrabold text-deep-navy leading-tight">{heroHeadline}</div>
              <div className="text-slate-600">{heroSubhead}</div>
              <div className="text-xs text-slate-500">Independent planning tool • Not affiliated with camps</div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button className="sm:flex-1" onClick={handleTryDemo}>
                Try the Demo Season
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button className="sm:flex-1" variant="outline" onClick={handleStartMySeason}>
                Start My Season
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <div className="text-xs text-slate-500">
              Demo is read-only and uses prior season data. Paid unlock enables current season + athlete workspace.
            </div>
          </Card>

          {/* Reframe */}
          <Card className="p-7 space-y-3">
            <div className="text-lg font-bold text-deep-navy">{reframeTitle}</div>
            <div className="text-sm text-slate-600">{reframeBody}</div>

            <div className="pt-2 grid gap-3">
              <div className="text-sm">
                <div className="font-semibold text-deep-navy">Value</div>
                <div className="text-slate-600">Decisions, tradeoffs, and conflicts—before weekends disappear.</div>
              </div>
              <div className="text-sm">
                <div className="font-semibold text-deep-navy">Risk</div>
                <div className="text-slate-600">Avoid double-booking and last-minute travel chaos.</div>
              </div>
              <div className="text-sm">
                <div className="font-semibold text-deep-navy">Velocity</div>
                <div className="text-slate-600">Same UI in demo and paid—upgrade without relearning.</div>
              </div>
            </div>
          </Card>
        </div>

        {/* How it works */}
        <Card className="p-7 space-y-4">
          <div className="text-lg font-bold text-deep-navy">How it works</div>
          <div className="grid md:grid-cols-3 gap-4">
            {howItWorks.map((x) => (
              <div key={x.title} className="text-sm">
                <div className="font-semibold text-deep-navy">{x.title}</div>
                <div className="text-slate-600">{x.body}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Workspace proof */}
        <Card className="p-7 space-y-4">
          <div className="text-lg font-bold text-deep-navy">MyCamps is the workspace</div>
          <div className="grid md:grid-cols-3 gap-4">
            {workspaceProof.map((x) => (
              <div key={x.title} className="text-sm">
                <div className="font-semibold text-deep-navy">{x.title}</div>
                <div className="text-slate-600">{x.body}</div>
              </div>
            ))}
          </div>

          {/* Final CTA repeat */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <Button className="sm:flex-1" onClick={handleTryDemo}>
              Try the Demo Season
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button className="sm:flex-1" variant="outline" onClick={handleStartMySeason}>
              Start My Season
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>

        {/* Pricing section anchor (simple placeholder; can move later) */}
        <div id="pricing" />
      </div>
    </div>
  );
}
