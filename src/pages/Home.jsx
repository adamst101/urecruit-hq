// src/pages/Home.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LogIn, CheckCircle2, Loader2 } from "lucide-react";

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

// Try a few likely auth entrypoints; return a useful error if none exist.
async function safeSignIn() {
  const auth = base44?.auth;

  if (!auth) {
    return { ok: false, error: new Error("Auth is not available (base44.auth missing).") };
  }

  const candidates = [
    auth.signIn,
    auth.signInWithRedirect,
    auth.login,
    auth.startAuth
  ].filter((fn) => typeof fn === "function");

  if (!candidates.length) {
    return { ok: false, error: new Error("No sign-in method found on base44.auth.") };
  }

  try {
    // Call the first available method
    await candidates[0]();
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

async function waitForSeason(seasonRef, { timeoutMs = 8000, intervalMs = 150 } = {}) {
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
  const [logoOk, setLogoOk] = useState(true);

  const [loginWorking, setLoginWorking] = useState(false);
  const [loginError, setLoginError] = useState(null);

  useEffect(() => {
    const key = "evt_home_viewed_v21";
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

  // Access Demo (no login required)
  function handleTryDemo() {
    trackEvent({ event_name: "cta_demo_click", source: "home", demo_season: demoSeasonYear });
    setDemoMode(demoSeasonYear);
    trackEvent({ event_name: "demo_entered", source: "home", demo_season: demoSeasonYear });
    nav(`${createPageUrl("Discover")}?mode=demo&season=${encodeURIComponent(demoSeasonYear)}`);
  }

  // Log in -> Discover (and show errors if auth fails)
  async function handleLoginOnly() {
    if (loginWorking) return;

    setLoginError(null);
    setLoginWorking(true);

    trackEvent({ event_name: "cta_login_click", source: "home", via: "hero_login" });

    const res = await safeSignIn();

    if (!res.ok) {
      const msg = res.error?.message || "Sign-in failed.";
      setLoginError(msg);

      trackEvent({
        event_name: "cta_login_failed",
        source: "home",
        via: "hero_login",
        error: msg
      });

      setLoginWorking(false);
      return;
    }

    // Give the auth state time to hydrate
    const s = await waitForSeason(seasonRef);

    // If we still don't have accountId, don't silently “do nothing”
    if (!s?.accountId) {
      setLoginError(
        "Login started, but we couldn’t confirm your session yet. If nothing happens, check popup blockers and try again."
      );
      trackEvent({ event_name: "cta_login_no_session", source: "home" });
      setLoginWorking(false);
      return;
    }

    trackEvent({ event_name: "cta_login_success", source: "home" });
    setLoginWorking(false);

    // Discover may still route-guard to Profile if needed (expected)
    nav(createPageUrl("Discover"));
  }

  // View pricing / Sign-Up -> Subscribe
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
        {/* HERO ONLY (no top bar header to avoid duplicate logo/login) */}
        <Card className="bg-white border-0 shadow-md rounded-2xl">
          <div className="p-6 md:p-10 space-y-6">
            {/* Brand row: big logo + login (single login button, responsive layout) */}
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

                {/* Tagline directly under logo */}
                <div className="mt-2 text-base md:text-lg font-bold text-ink text-center md:text-left leading-tight">
                  Your college recruiting camp planning HQ
                </div>

                {/* Mobile: login under tagline */}
                <div className="mt-3 w-full md:hidden">
                  <Button
                    onClick={handleLoginOnly}
                    className="btn-brand w-full"
                    disabled={loginWorking}
                  >
                    {loginWorking ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Logging in…
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4 mr-2" />
                        Log in
                      </>
                    )}
                  </Button>
                </div>

                {/* Visible login error (mobile + desktop) */}
                {loginError && (
                  <div className="mt-3 w-full text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                    {loginError}
                  </div>
                )}
              </div>

              {/* Desktop: login to the right (only one login total) */}
              <div className="hidden md:flex">
                <Button
                  variant="outline"
                  onClick={handleLoginOnly}
                  className="text-ink"
                  disabled={loginWorking}
                >
                  {loginWorking ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Logging in…
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4 mr-2" />
                      Log in
                    </>
                  )}
                </Button>
              </div>
            </div>

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

            {/* How it works strip */}
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

            {/* Trust microcopy */}
            <div className="pt-2 text-xs text-muted text-center md:text-left">
              Independent planning tool · Not affiliated with camps · Demo uses prior-season data
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
