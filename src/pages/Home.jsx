// src/pages/Home.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LogIn, CheckCircle2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { getDemoDefaults, setDemoMode } from "../components/hooks/demoMode.jsx";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

const POST_LOGIN_NEXT_KEY = "rm_post_login_next";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

function getAuthEntry() {
  // We do NOT assume a fake /Login page exists.
  // We detect what Base44 exposed in this app build.
  const a = base44?.auth;

  const fn =
    a?.redirectToLogin ||
    a?.signIn ||
    a?.login ||
    a?.startLogin ||
    a?.openLogin;

  return typeof fn === "function" ? fn : null;
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
  const [authUnavailable, setAuthUnavailable] = useState(false);

  // Track once per session
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
      mode: season?.mode === "paid" ? "paid" : "demo",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If user comes back from Base44 auth and we stored a "next", honor it once.
  useEffect(() => {
    if (!season?.accountId) return;

    try {
      const next = sessionStorage.getItem(POST_LOGIN_NEXT_KEY);
      if (next) {
        sessionStorage.removeItem(POST_LOGIN_NEXT_KEY);
        nav(next, { replace: true });
      }
    } catch {}
  }, [season?.accountId, nav]);

  function handleTryDemo() {
    trackEvent({
      event_name: "cta_demo_click",
      source: "home",
      demo_season: demoSeasonYear,
    });

    setDemoMode(demoSeasonYear);

    trackEvent({
      event_name: "demo_entered",
      source: "home",
      demo_season: demoSeasonYear,
    });

    nav(
      `${createPageUrl("Discover")}?mode=demo&season=${encodeURIComponent(
        demoSeasonYear
      )}`
    );
  }

  function handleLogin() {
    trackEvent({ event_name: "cta_login_click", source: "home", via: "hero_login" });

    // Already authed? Just go in.
    if (season?.accountId) {
      nav(createPageUrl("Discover"));
      return;
    }

    // Use Base44's built-in auth entry (if enabled in dashboard).
    const next = createPageUrl("Discover");

    try {
      sessionStorage.setItem(POST_LOGIN_NEXT_KEY, next);
    } catch {}

    const authEntry = getAuthEntry();
    if (authEntry) {
      try {
        // Some implementations accept a return URL, some ignore it. Safe either way.
        authEntry(next);
      } catch {
        // If auth is misconfigured at runtime, show message instead of 404 loops.
        setAuthUnavailable(true);
      }
      return;
    }

    // No auth methods exposed => auth not configured/enabled for this app build.
    // Best-practice: do NOT route to a fake /Login page that doesn’t exist.
    setAuthUnavailable(true);
  }

  function handlePricingSignup() {
    trackEvent({ event_name: "cta_pricing_signup_click", source: "home" });
    nav(createPageUrl("Subscribe") + `?source=home_pricing`);
  }

  const heroHeadline = "Stop guessing which recruiting camps matter this season.";
  const heroParagraph =
    "URecruit HQ pulls scattered camp dates into one place so you can filter by position, overlay target schools, and build the best sequence to attend—without spreadsheet chaos.";

  const bullets = useMemo(
    () => [
      {
        a: "Find dates fast.",
        b: "Camps and dates are scattered across school sites. We bring them together.",
      },
      {
        a: "Plan the sequence.",
        b: "Overlay schools + position-specific sessions to avoid conflicts.",
      },
      {
        a: "Track what’s real.",
        b: "Planning vs registered vs completed—so the plan actually happens.",
      },
    ],
    []
  );

  const howStrip = useMemo(
    () => [
      { title: "Collect", body: "Bring camps + dates into one place." },
      { title: "Sequence", body: "Overlay targets + position sessions." },
      { title: "Execute", body: "Track planning → registered → completed." },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-6 md:py-10">
        <Card className="bg-white border-0 shadow-md rounded-2xl">
          <div className="p-6 md:p-10 space-y-6">
            {/* Brand row */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex flex-col items-center md:items-start">
                {logoOk ? (
                  <img
                    src={LOGO_URL}
                    alt="URecruit HQ"
                    loading="eager"
                    onError={() => setLogoOk(false)}
                    className="h-24 md:h-40 w-auto block object-contain"
                  />
                ) : (
                  <div className="text-4xl md:text-5xl font-extrabold text-brand leading-none">
                    URecruit HQ
                  </div>
                )}

                <div className="mt-2 text-base md:text-lg font-bold text-ink text-center md:text-left leading-tight">
                  Your college recruiting camp planning HQ
                </div>

                {/* Mobile login */}
                <div className="mt-3 w-full md:hidden">
                  <Button onClick={handleLogin} className="btn-brand w-full">
                    <LogIn className="w-4 h-4 mr-2" />
                    Log in
                  </Button>
                </div>
              </div>

              {/* Desktop login */}
              <div className="hidden md:flex">
                <Button variant="outline" onClick={handleLogin} className="text-ink">
                  <LogIn className="w-4 h-4 mr-2" />
                  Log in
                </Button>
              </div>
            </div>

            {/* If auth isn't configured, show a clear message (no 404 loops). */}
            {authUnavailable && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="font-semibold mb-1">Login isn’t configured yet.</div>
                <div className="opacity-90">
                  Base44 auth methods aren’t available in this build. Enable Authentication/SSO in your Base44
                  Dashboard settings, then republish.
                </div>
              </div>
            )}

            {/* Copy */}
            <div className="max-w-3xl space-y-3 text-center md:text-left">
              <h1 className="text-3xl md:text-4xl font-extrabold leading-tight text-brand">
                {heroHeadline}
              </h1>
              <div className="h-1 w-14 rounded bg-accent mx-auto md:mx-0" />
              <p className="text-muted md:text-lg leading-relaxed">{heroParagraph}</p>
            </div>

            {/* Outcome cards */}
            <div className="grid md:grid-cols-3 gap-4">
              {bullets.map((x) => (
                <div key={x.a} className="rounded-xl bg-surface border border-default p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 mt-0.5 text-muted" />
                    <div className="text-sm text-left">
                      <div className="font-bold text-brand">{x.a}</div>
                      <div className="text-muted">{x.b}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* How it works */}
            <div className="rounded-xl border border-default bg-white p-4">
              <div className="grid md:grid-cols-3 gap-4">
                {howStrip.map((x) => (
                  <div key={x.title} className="text-sm text-left">
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

            <div className="pt-2 text-xs text-muted text-center md:text-left">
              Independent planning tool · Not affiliated with camps · Demo uses prior-season data
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
