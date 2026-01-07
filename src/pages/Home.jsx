// src/pages/Home.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LogIn, CheckCircle2 } from "lucide-react";

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
    const key = "evt_home_viewed_v7";
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
    // don't re-fire on hook changes; marketing page
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

    // If still not authed, stop (sign-in canceled or failed)
    if (!nowAuthed) return;

    // Decision:
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

  // Existing members / top-right login
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

  // Copy (problem-led)
  const heroHeadline = "Stop guessing which recruiting camps matter this season.";
  const heroContext =
    "Built for families navigating competitive recruiting seasons—turning spreadsheets, bookmarks, and guesswork into one plan.";
  const heroParagraph =
    "RecruitMe pulls scattered camp dates into one place so you can filter by position, overlay target schools, and build the best sequence to attend—without spreadsheet chaos.";

  // Short bullets for visual scan
  const bullets = useMemo(
    () => [
      {
        a: "Find dates fast.",
        b: "Camps and dates are scattered across school sites. RecruitMe brings them together."
      },
      { a: "Plan the sequence.", b: "Overlay schools + position-specific sessions to avoid conflicts." },
      { a: "Track what’s real.", b: "Planning vs registered vs completed—so the plan actually happens." }
    ],
    []
  );

  // Incorporated “How it works” into hero as a strip
  const howStrip = useMemo(
    () => [
      { title: "Collect", body: "Bring camps + dates into one place." },
      { title: "Sequence", body: "Overlay targets + position sessions." },
      { title: "Execute", body: "Track planning → registered → completed." }
    ],
    []
  );

  // Link CTA uses Tailwind built-ins (Base44 safe)
  const LinkCta = ({ onClick, children }) => (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-semibold text-slate-900 underline underline-offset-4 hover:opacity-80 w-fit"
    >
      {children}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Header (minimal) */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-2xl font-extrabold text-slate-900">RecruitMe</div>
            <Badge className={badgeClass}>{badgeText}</Badge>
            <div className="hidden sm:block text-xs text-slate-500">
              {paid ? "Current season unlocked after login." : "Public demo. No login required."}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={handlePricingScroll} className="text-slate-700">
              Pricing
            </Button>
            <Button variant="outline" onClick={handleLoginOnly}>
              <LogIn className="w-4 h-4 mr-2" />
              Log in
            </Button>
          </div>
        </div>

        {/* HERO (single module) */}
        <Card className="bg-white border-0 shadow-md rounded-2xl">
          <div className="p-8 md:p-10 space-y-6">
            {/* Copy */}
            <div className="max-w-3xl space-y-3">
              <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 leading-tight">{heroHeadline}</h1>

              <p className="text-sm md:text-base font-semibold text-slate-700">{heroContext}</p>

              <p className="text-slate-600 md:text-lg leading-relaxed">{heroParagraph}</p>
            </div>

            {/* Outcome cards */}
            <div className="grid md:grid-cols-3 gap-4">
              {bullets.map((x) => (
                <div key={x.a} className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 mt-0.5 text-slate-500" />
                    <div className="text-sm">
                      <div className="font-bold text-slate-900">{x.a}</div>
                      <div className="text-slate-600">{x.b}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* How it works strip */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="grid md:grid-cols-3 gap-4">
                {howStrip.map((x) => (
                  <div key={x.title} className="text-sm">
                    <div className="font-bold text-slate-900">{x.title}</div>
                    <div className="text-slate-600">{x.body}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust microcopy */}
            <div className="text-xs text-slate-500">
              Independent planning tool · Not affiliated with camps · Demo uses prior-season data (read-only)
            </div>

            {/* CTA cluster (requested order) */}
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <Button className="sm:flex-1" onClick={handleStartMySeason}>
                Sign up to access current-year camps
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>

              <Button variant="outline" className="sm:flex-1" onClick={handleTryDemo}>
                Access Demo
              </Button>

              <div className="sm:ml-2">
                <LinkCta onClick={handleLoginOnly}>Existing Members Log In</LinkCta>
              </div>
            </div>
          </div>
        </Card>

        {/* Pricing anchor (placeholder) */}
        <div id="pricing" />
      </div>
    </div>
  );
}
