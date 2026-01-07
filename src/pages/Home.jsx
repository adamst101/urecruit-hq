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

  const season = useSeasonAccess();
  const seasonRef = useRef(season);

  useEffect(() => {
    seasonRef.current = season;
  }, [season]);

  const { demoSeasonYear } = getDemoDefaults();

  const authed = !!season.accountId;
  const paid = season.mode === "paid";

  useEffect(() => {
    const key = "evt_home_viewed_v8";
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

  function handleTryDemo() {
    trackEvent({ event_name: "cta_demo_click", source: "home", demo_season: demoSeasonYear });

    setDemoMode(demoSeasonYear);

    trackEvent({ event_name: "demo_entered", source: "home", demo_season: demoSeasonYear });

    nav(`${createPageUrl("Discover")}?mode=demo&season=${encodeURIComponent(demoSeasonYear)}`);
  }

  async function handleStartMySeason() {
    trackEvent({ event_name: "cta_start_click", source: "home", auth_state: authed ? "authed" : "anon" });

    if (!seasonRef.current?.accountId) {
      trackEvent({ event_name: "cta_login_click", source: "home", via: "start_live_season" });
      const ok = await safeSignIn();
      if (!ok) return;
      await waitForSeason(seasonRef);
    }

    const s = seasonRef.current || {};
    const nowAuthed = !!s.accountId;
    const nowPaid = s.mode === "paid";
    if (!nowAuthed) return;

    const destination = nowPaid ? "mycamps" : "subscribe";

    trackEvent({ event_name: "start_season_routed", source: "home", destination });

    if (!nowPaid) return nav(createPageUrl("Subscribe"));
    nav(createPageUrl("MyCamps"));
  }

  async function handleLoginOnly() {
    trackEvent({ event_name: "cta_login_click", source: "home", via: "existing_members" });
    await safeSignIn();
  }

  function handlePricingScroll() {
    trackEvent({ event_name: "pricing_scroll", source: "home" });
    const el = document.getElementById("pricing");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Brand tokens (Base44-safe via Tailwind arbitrary values)
  const BRAND = "#0B1F3A"; // deep navy
  const BG = "#F6F8FB"; // soft background

  const badgeText = paid ? `Paid: Current Season` : `Demo: ${demoSeasonYear}`;
  const badgeClass = paid ? "bg-emerald-700 text-white" : "bg-slate-900 text-white";

  const heroHeadline = "Stop guessing which recruiting camps matter this season.";
  const heroContext =
    "Built for families navigating competitive recruiting seasons—turning spreadsheets, bookmarks, and guesswork into one plan.";
  const heroParagraph =
    "RecruitMe pulls scattered camp dates into one place so you can filter by position, overlay target schools, and build the best sequence to attend—without spreadsheet chaos.";

  const bullets = useMemo(
    () => [
      { a: "Find dates fast.", b: "Camps and dates are scattered across school sites. RecruitMe brings them together." },
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

  const LinkCta = ({ onClick, children }) => (
    <button
      type="button"
      onClick={onClick}
      className={`text-sm font-semibold underline underline-offset-4 hover:opacity-80 w-fit text-[${BRAND}]`}
    >
      {children}
    </button>
  );

  return (
    <div className={`min-h-screen bg-[${BG}]`}>
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`text-2xl font-extrabold text-[${BRAND}]`}>RecruitMe</div>
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

        {/* HERO */}
        <Card className="bg-white border-0 shadow-md rounded-2xl">
          <div className="p-8 md:p-10 space-y-6">
            {/* Copy */}
            <div className="max-w-3xl space-y-3">
              <h1 className={`text-3xl md:text-4xl font-extrabold leading-tight text-[${BRAND}]`}>
                {heroHeadline}
              </h1>

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
                      <div className={`font-bold text-[${BRAND}]`}>{x.a}</div>
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
                    <div className={`font-bold text-[${BRAND}]`}>{x.title}</div>
                    <div className="text-slate-600">{x.body}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust */}
            <div className="text-xs text-slate-500">
              Independent planning tool · Not affiliated with camps · Demo uses prior-season data (read-only)
            </div>

            {/* CTA cluster */}
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <Button
                className={`sm:flex-1 bg-[${BRAND}] text-white hover:bg-[#081a31]`}
                onClick={handleStartMySeason}
              >
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
