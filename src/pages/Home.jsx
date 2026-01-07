// src/pages/Home.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LogIn, CheckCircle2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

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
async function waitForSeason(seasonRef, { timeoutMs = 2500, intervalMs = 100 } = {}) {
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

  // Home UI stays anonymous; we only read season state for routing after login.
  const season = useSeasonAccess();
  const seasonRef = useRef(season);

  useEffect(() => {
    seasonRef.current = season;
  }, [season]);

  const { demoSeasonYear } = getDemoDefaults();

  // Instrument: home view (dedupe per session)
  useEffect(() => {
    const key = "evt_home_viewed_v11";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "home_view",
      source: "home",
      auth_state: season?.accountId ? "authed" : "anon",
      mode: season?.mode === "paid" ? "paid" : "not_paid"
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Demo (no login required)
  function handleTryDemo() {
    trackEvent({ event_name: "cta_demo_click", source: "home", demo_season: demoSeasonYear });

    setDemoMode(demoSeasonYear);

    trackEvent({ event_name: "demo_entered", source: "home", demo_season: demoSeasonYear });

    nav(`${createPageUrl("Discover")}?mode=demo&season=${encodeURIComponent(demoSeasonYear)}`);
  }

  // Top-right login: after sign-in, go to UserHome (or swap to whatever you call it)
  async function handleLoginOnly() {
    trackEvent({ event_name: "cta_login_click", source: "home", via: "top_right" });
    const ok = await safeSignIn();
    if (!ok) return;
    await waitForSeason(seasonRef);
    nav(createPageUrl("UserHome"));
  }

  function handlePricingScroll() {
    trackEvent({ event_name: "cta_pricing_signup_click", source: "home" });
    const el = document.getElementById("pricing");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Copy
  const heroHeadline = "Stop guessing which recruiting camps matter this season.";
  const heroParagraph =
    "URecruit HQ pulls scattered camp dates into one place so you can filter by position, overlay target schools, and build the best sequence to attend—without spreadsheet chaos.";

  const bullets = useMemo(
    () => [
      { a: "Find dates fast.", b: "Camps and dates are scattered across school sites. We bring them together." },
      { a: "Plan the sequence.", b: "Overlay schools + position-specific sessions to avoid conflicts." },
      { a: "Track what’s real.", b: "Planning vs registered vs completed—so the plan actually happens." }
    ],
    []
  );

  const howStrip = useMemo(
    () => [
      { title: "Collect", body: "Bring camps + dates into one place." },
      { title: "Sequence", body: "Overlay targets + position sessions." },
      { title: "Execute", body: "Track planning → registered → completed." }
    ],
    []
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--brand-bg)" }}>
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Top brand header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-3xl md:text-4xl font-extrabold text-brand leading-tight">URecruit HQ</div>
            <div className="text-sm md:text-base text-slate-600 font-semibold">
              Your college recruiting camp planning HQ
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

        {/* HERO */}
        <Card className="bg-white border-0 shadow-md rounded-2xl">
          <div className="p-8 md:p-10 space-y-6">
            {/* Copy */}
            <div className="max-w-3xl space-y-3">
              <h1 className="text-3xl md:text-4xl font-extrabold leading-tight text-brand">{heroHeadline}</h1>
              <p className="text-slate-600 md:text-lg leading-relaxed">{heroParagraph}</p>
            </div>

            {/* Outcome cards */}
            <div className="grid md:grid-cols-3 gap-4">
              {bullets.map((x) => (
                <div key={x.a} className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 mt-0.5 text-slate-500" />
                    <div className="text-sm">
                      <div className="font-bold text-brand">{x.a}</div>
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
                    <div className="font-bold text-brand">{x.title}</div>
                    <div className="text-slate-600">{x.body}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust microcopy (kept, but no "public demo" messaging) */}
            <div className="text-xs text-slate-500">
              Independent planning tool · Not affiliated with camps · Demo uses prior-season data (read-only)
            </div>

            {/* CTAs (navy buttons w/ white text) */}
            <div className="flex flex-col sm:flex-row gap-2 items-stretch">
              <Button
                className="sm:flex-1 bg-brand text-white hover:bg-brand-dark"
                onClick={handlePricingScroll}
              >
                View pricing / Sign-Up
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>

              <Button className="sm:flex-1 bg-brand text-white hover:bg-brand-dark" onClick={handleTryDemo}>
                Access Demo
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Pricing anchor (placeholder) */}
        <div id="pricing" />
      </div>
    </div>
  );
}
