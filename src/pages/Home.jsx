// src/pages/Home.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LogIn } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { getDemoDefaults, setDemoMode } from "../components/hooks/demoMode";

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

// Wait for season hook to reflect updated auth/mode after sign-in.
// Polling avoids "sleep and hope" and prevents stale reads.
async function waitForSeason(seasonRef, { timeoutMs = 2000, intervalMs = 100 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = seasonRef.current;
    if (s && s.accountId) return s;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return seasonRef.current;
}

export default function Home() {
  const nav = useNavigate();

  // Home should be marketing-first. It can read season state, but must not block render.
  const season = useSeasonAccess();
  const seasonRef = useRef(season);

  useEffect(() => {
    seasonRef.current = season;
  }, [season]);

  const { demoSeasonYear } = getDemoDefaults();

  const authed = !!season.accountId;
  const paid = season.mode === "paid";

  // Instrument: home view (dedupe per session)
  useEffect(() => {
    const key = "evt_home_viewed_v5";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "home_view",
      source: "home",
      auth_state: authed ? "authed" : "anon",
      mode: paid ? "paid" : "not_paid"
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- CTA 1: Access Demo Season (no login required; no backend writes) -----
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

    nav(`${createPageUrl("Discover")}?mode=demo&season=${encodeURIComponent(demoSeasonYear)}`);
  }

  // ----- CTA 2: Sign up to access current-year camps (login → subscribe OR workspace) -----
  async function handleStartMySeason() {
    trackEvent({
      event_name: "cta_start_click",
      source: "home",
      auth_state: authed ? "authed" : "anon"
    });

    // Ensure user is signed in
    if (!seasonRef.current?.accountId) {
      trackEvent({ event_name: "cta_login_click", source: "home", via: "start_live_season" });
      const ok = await safeSignIn();
      if (!ok) return;

      // wait for hook state to reflect login
      await waitForSeason(seasonRef);
    }

    const s = seasonRef.current || {};
    const nowAuthed = !!s.accountId;
    const nowPaid = s.mode === "paid";

    if (!nowAuthed) return;

    // - not paid -> Subscribe
    // - paid -> MyCamps (RouteGuard will force Profile if missing)
    const destination = nowPaid ? "mycamps" : "subscribe";

    trackEvent({
      event_name: "start_season_routed",
      source: "home",
      destination
    });

    if (!nowPaid) {
      nav(createPageUrl("Subscribe"));
      return;
    }

    nav(createPageUrl("MyCamps"));
  }

  // Existing members
  async function handleLoginOnly() {
    trackEvent({ event_name: "cta_login_click", source: "home", via: "existing_members" });
    await safeSignIn();
  }

  function handlePricingScroll() {
    trackEvent({ event_name: "pricing_scroll", source: "home" });
    const el = document.getElementById("pricing");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Keep badge simple: NEVER imply personalization when not paid.
  const badgeText = paid ? `Paid: Current Season` : `Demo: ${demoSeasonYear}`;
  const badgeClass = paid ? "bg-emerald-700 text-white" : "bg-slate-900 text-white";

  // Copy: problem-led narrative
  const heroHeadline = "Stop guessing which recruiting camps matter this season.";
  const heroContext =
    "Built for families navigating competitive recruiting seasons—turning spreadsheets, bookmarks, and guesswork into one plan.";
  const heroParagraph =
    "RecruitMe brings scattered camp dates into one season plan—so you can filter by position, overlay your target schools, and build the best sequence to attend before weekends and travel money disappear.";

  const heroBullets = useMemo(
    () => [
      "Find dates fast: camp dates are scattered across school sites—we bring them together.",
      "Plan the sequence: overlay schools + position-specific sessions to avoid conflicts and pick the right weekends.",
      "Track execution: keep “planning vs registered vs completed” in one place so the plan actually happens."
    ],
    []
  );

  const howItWorks = useMemo(
    () => [
      { title: "Collect", body: "Bring camps and dates into one place instead of chasing dozens of school sites." },
      { title: "Sequence", body: "Overlay schools + position-specific sessions to build the best order to attend." },
      { title: "Execute", body: "Track planning → registered → completed so nothing slips through the cracks." }
    ],
    []
  );

  const workspaceProof = useMemo(
    () => [
      { title: "Discover", body: "Browse camps and dates with filters that match your athlete and position." },
      { title: "MyCamps", body: "Your status board: planning, registered, completed—no spreadsheet required." },
      { title: "Calendar", body: "Conflict overlays across target schools so the sequence makes sense." }
    ],
    []
  );

  const LinkCta = ({ onClick, children }) => (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-semibold text-deep-navy underline underline-offset-4 hover:opacity-80 w-fit"
    >
      {children}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-3xl font-extrabold text-deep-navy">RecruitMe</div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={badgeClass}>{badgeText}</Badge>
              <div className="text-xs text-slate-500">
                {paid ? "Current season unlocked after login." : "Public demo available. No login required."}
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

        {/* TOP NARRATIVE HERO (single block) */}
        <Card className="p-8 space-y-4 border-slate-300 shadow-sm">
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-deep-navy leading-tight">{heroHeadline}</h1>

            <p className="text-sm font-medium text-slate-700">{heroContext}</p>

            <p className="text-slate-600">{heroParagraph}</p>

            <div className="pt-1 space-y-2">
              {heroBullets.map((t) => (
                <div key={t} className="flex gap-2 text-sm text-slate-700">
                  <div className="mt-[7px] h-1.5 w-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                  <div>{t}</div>
                </div>
              ))}
            </div>

            <div className="text-xs text-slate-500 pt-2">
              Independent planning tool · Not affiliated with camps · Demo uses prior-season data (read-only)
            </div>
          </div>

          {/* CTA cluster (requested order) */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <Button className="sm:flex-1" onClick={handleStartMySeason}>
              Sign up to access current-year camps
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <Button variant="outline" className="sm:flex-1" onClick={handleTryDemo}>
              Access Demo
            </Button>
          </div>

          <div className="pt-1">
            <LinkCta onClick={handleLoginOnly}>Existing Members Log In</LinkCta>
          </div>
        </Card>

        {/* Support sections (now lighter to avoid repetition) */}
        <Card className="p-7 space-y-4 border-slate-200">
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

        <Card className="p-7 space-y-4 border-slate-200">
          <div className="text-lg font-bold text-deep-navy">What you manage in one place</div>
          <div className="grid md:grid-cols-3 gap-4">
            {workspaceProof.map((x) => (
              <div key={x.title} className="text-sm">
                <div className="font-semibold text-deep-navy">{x.title}</div>
                <div className="text-slate-600">{x.body}</div>
              </div>
            ))}
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <Button className="sm:flex-1" onClick={handleStartMySeason}>
              Sign up to access current-year camps
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button variant="outline" className="sm:flex-1" onClick={handleTryDemo}>
              Access Demo
            </Button>
          </div>

          <div className="pt-1">
            <LinkCta onClick={handleLoginOnly}>Existing Members Log In</LinkCta>
          </div>
        </Card>

        {/* Pricing anchor (placeholder) */}
        <div id="pricing" />
      </div>
    </div>
  );
}
