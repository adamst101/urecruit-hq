// src/pages/Home.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LogIn, CheckCircle2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { getDemoDefaults, setDemoMode } from "../components/hooks/demoMode";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

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

async function waitForSeason(seasonRef, { timeoutMs = 2500, intervalMs = 100 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = seasonRef.current;
    if (s && s.accountId) return s;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return seasonRef.current;
}

// Optional: detect profile (only used after paid=true)
// If you already have a hook for this (useAthleteIdentity), swap it in.
async function hasAthleteProfile() {
  try {
    // If this exists in your app, it’s the cleanest check:
    if (typeof base44.functions?.getAthleteProfile === "function") {
      const p = await base44.functions.getAthleteProfile();
      return !!p;
    }
  } catch {}
  return false;
}

export default function Home() {
  const nav = useNavigate();

  const season = useSeasonAccess();
  const seasonRef = useRef(season);

  useEffect(() => {
    seasonRef.current = season;
  }, [season]);

  const { demoSeasonYear } = getDemoDefaults();
  const [logoOk, setLogoOk] = useState(true);

  useEffect(() => {
    const key = "evt_home_viewed_v23";
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

  // Login (header)
  async function handleLoginOnly() {
    trackEvent({ event_name: "cta_login_click", source: "home", via: "header" });
    const ok = await safeSignIn();
    if (!ok) return;
    await waitForSeason(seasonRef);
    nav(createPageUrl("UserHome"));
  }

  // ✅ Primary CTA: View pricing / Sign-Up (must route, not scroll)
  async function handlePricingSignup() {
    trackEvent({ event_name: "cta_pricing_signup_click", source: "home" });

    // 1) Ensure signed in (your product requires login to purchase)
    if (!seasonRef.current?.accountId) {
      trackEvent({ event_name: "cta_login_click", source: "home", via: "pricing_signup" });
      const ok = await safeSignIn();
      if (!ok) return;
      await waitForSeason(seasonRef);
    }

    const s = seasonRef.current || {};
    const authed = !!s.accountId;
    const paid = s.mode === "paid";

    if (!authed) return;

    // 2) If not paid -> go to Subscribe (checkout)
    if (!paid) {
      nav(createPageUrl("Subscribe"));
      return;
    }

    // 3) Paid but missing profile -> go to Profile setup (your “select sport” page)
    const profileExists = await hasAthleteProfile();
    if (!profileExists) {
      nav(createPageUrl("Profile"));
      return;
    }

    // 4) Paid + profile -> go to UserHome
    nav(createPageUrl("UserHome"));
  }

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
    <div className="min-h-screen bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-6 md:py-8 space-y-8">
        {/* Tagline */}
        <div className="text-sm md:text-lg text-muted font-semibold">
          Your college recruiting camp planning HQ
        </div>

        {/* HERO */}
        <Card className="bg-white border-0 shadow-md rounded-2xl">
          <div className="p-7 md:p-10 space-y-6">
            <div className="max-w-3xl space-y-3">
              <h1 className="text-3xl md:text-4xl font-extrabold leading-tight text-brand">{heroHeadline}</h1>
              <div className="h-1 w-14 rounded bg-accent" />
              <p className="text-muted md:text-lg leading-relaxed text-center md:text-left">{heroParagraph}</p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {bullets.map((x) => (
                <div key={x.a} className="rounded-xl bg-surface border border-default p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 mt-0.5 text-muted" />
                    <div className="text-sm">
                      <div className="font-bold text-brand">{x.a}</div>
                      <div className="text-muted">{x.b}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-default bg-white p-4">
              <div className="grid md:grid-cols-3 gap-4">
                {howStrip.map((x) => (
                  <div key={x.title} className="text-sm">
                    <div className="font-bold text-brand">{x.title}</div>
                    <div className="text-muted">{x.body}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-2 items-stretch">
              <Button className="sm:flex-1 btn-brand" onClick={handlePricingSignup}>
                View pricing / Sign-Up
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>

              <Button className="sm:flex-1 btn-brand" onClick={handleTryDemo}>
                Access Demo
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            <div className="pt-2 text-xs text-muted">
              Independent planning tool · Not affiliated with camps · Demo uses prior-season data
            </div>
          </div>
        </Card>

        <div id="pricing" />
      </div>
    </div>
  );
}