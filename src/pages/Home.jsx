// src/pages/Home.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LogIn, CheckCircle2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { getDemoDefaults, setDemoMode } from "../components/hooks/demoMode";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

/**
 * Base44-standard login redirect.
 * - Do NOT rely on window.base44 (it’s typically undefined in Base44 apps).
 * - Use base44.auth.redirectToLogin(nextUrl).  :contentReference[oaicite:1]{index=1}
 */
function base44LoginRedirect(nextUrl) {
  // Debug helper (optional): exposes SDK so you can inspect in console if you want
  try {
    if (typeof window !== "undefined") window.__B44 = base44;
  } catch {}

  const auth = base44?.auth;

  // Preferred / documented approach
  if (auth && typeof auth.redirectToLogin === "function") {
    auth.redirectToLogin(nextUrl);
    return true;
  }

  // Some apps expose a slightly different name—keep a safe fallback
  if (auth && typeof auth.login === "function") {
    auth.login({ nextUrl });
    return true;
  }

  return false;
}

export default function Home() {
  const nav = useNavigate();
  const { demoSeasonYear } = getDemoDefaults();
  const [logoOk, setLogoOk] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const key = "evt_home_viewed_v22";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "home_view",
      source: "home"
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTryDemo() {
    trackEvent({ event_name: "cta_demo_click", source: "home", demo_season: demoSeasonYear });
    setDemoMode(demoSeasonYear);
    trackEvent({ event_name: "demo_entered", source: "home", demo_season: demoSeasonYear });
    nav(`${createPageUrl("Discover")}?mode=demo&season=${encodeURIComponent(demoSeasonYear)}`);
  }

  // Log in -> redirect to Base44 hosted login -> returns to Discover
  function handleLoginOnly() {
    setAuthError(null);

    const nextUrl = createPageUrl("Discover"); // after login, land here
    trackEvent({ event_name: "cta_login_click", source: "home", next: nextUrl });

    const ok = base44LoginRedirect(nextUrl);
    if (!ok) {
      setAuthError(
        "Login isn’t configured yet. In Base44: enable OAuth/login provider AND use base44.auth.redirectToLogin(nextUrl)."
      );
      trackEvent({ event_name: "cta_login_failed_no_method", source: "home" });
    }
  }

  // View pricing / Sign-Up -> Subscribe (your paywall page)
  function handlePricingSignup() {
    trackEvent({ event_name: "cta_pricing_signup_click", source: "home" });
    nav(createPageUrl("Subscribe") + `?source=home_pricing`);
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
      <div className="max-w-5xl mx-auto px-6 py-6 md:py-10">
        <Card className="bg-white border-0 shadow-md rounded-2xl">
          <div className="p-6 md:p-10 space-y-6">
            {/* Brand row: big logo + login */}
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
                  <div className="text-4xl md:text-5xl font-extrabold text-brand leading-none">URecruit HQ</div>
                )}

                {/* Tagline */}
                <div className="mt-2 text-sm md:text-lg font-bold text-ink text-center md:text-left leading-tight">
                  Your college recruiting camp planning HQ
                </div>

                {/* Mobile login under tagline */}
                <div className="mt-3 w-full md:hidden">
                  <Button onClick={handleLoginOnly} className="btn-brand w-full">
                    <LogIn className="w-4 h-4 mr-2" />
                    Log in
                  </Button>
                </div>
              </div>

              {/* Desktop login right */}
              <div className="hidden md:flex">
                <Button variant="outline" onClick={handleLoginOnly} className="text-ink">
                  <LogIn className="w-4 h-4 mr-2" />
                  Log in
                </Button>
              </div>
            </div>

            {/* Auth error (only shows if no method exists) */}
            {authError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {authError}
              </div>
            )}

            {/* Copy */}
            <div className="max-w-3xl space-y-3 text-center md:text-left">
              <h1 className="text-3xl md:text-4xl font-extrabold leading-tight text-brand">{heroHeadline}</h1>
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
