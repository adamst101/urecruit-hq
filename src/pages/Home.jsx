// src/pages/Home.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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

// Try Base44 “standard” auth entrypoints (different builds expose different method names).
async function startBase44Login({ redirectTo } = {}) {
  const auth = base44?.auth;
  if (!auth) return { ok: false, reason: "No base44.auth found." };

  const attempts = [
    // Most common
    { name: "auth.signIn()", fn: auth.signIn, args: [] },
    { name: "auth.login()", fn: auth.login, args: [] },

    // OAuth-style variants (signatures vary, so we try a couple)
    { name: "auth.signInWithOAuth()", fn: auth.signInWithOAuth, args: [] },
    { name: "auth.signInWithOAuth({ redirectTo })", fn: auth.signInWithOAuth, args: [{ redirectTo }] },
    { name: "auth.signInWithOAuth({ provider:'base44', redirectTo })", fn: auth.signInWithOAuth, args: [{ provider: "base44", redirectTo }] },

    { name: "auth.startOAuth({ redirectTo })", fn: auth.startOAuth, args: [{ redirectTo }] },
    { name: "auth.authenticate({ redirectTo })", fn: auth.authenticate, args: [{ redirectTo }] }
  ];

  let lastErr = null;

  for (const a of attempts) {
    if (typeof a.fn !== "function") continue;
    try {
      await a.fn(...a.args);
      return { ok: true, used: a.name };
    } catch (e) {
      lastErr = e;
    }
  }

  return {
    ok: false,
    reason:
      lastErr?.message ||
      "No working sign-in method was found on base44.auth. Confirm Base44 OAuth is enabled and saved.",
    lastErr
  };
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
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const key = "evt_home_viewed_v22";
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
  const handleTryDemo = useCallback(() => {
    setLoginError("");
    trackEvent({ event_name: "cta_demo_click", source: "home", demo_season: demoSeasonYear });
    setDemoMode(demoSeasonYear);
    trackEvent({ event_name: "demo_entered", source: "home", demo_season: demoSeasonYear });
    nav(`${createPageUrl("Discover")}?mode=demo&season=${encodeURIComponent(demoSeasonYear)}`);
  }, [demoSeasonYear, nav]);

  // Log in -> Discover (paid flow)
  const handleLoginOnly = useCallback(
    async (e) => {
      // Prevent “flash” from submit-like behavior
      try {
        e?.preventDefault?.();
        e?.stopPropagation?.();
      } catch {}

      if (loginWorking) return;

      setLoginError("");
      setLoginWorking(true);

      trackEvent({ event_name: "cta_login_click", source: "home", via: "hero_login" });

      const redirectTo = `${window.location.origin}${createPageUrl("Discover")}`;

      const res = await startBase44Login({ redirectTo });

      if (!res.ok) {
        setLoginWorking(false);
        setLoginError(
          res.reason ||
            "Login failed. Check Base44 Authentication settings (Default Base44 OAuth) and click Update/Save."
        );
        return;
      }

      // If auth is popup-based, wait briefly for session to populate, then navigate.
      await waitForSeason(seasonRef);
      setLoginWorking(false);

      // Go to Discover; your RouteGuard will enforce auth/profile on paid routes.
      nav(createPageUrl("Discover"));
    },
    [loginWorking, nav]
  );

  // View pricing / Sign-Up -> Subscribe
  const handlePricingSignup = useCallback(() => {
    setLoginError("");
    trackEvent({ event_name: "cta_pricing_signup_click", source: "home" });
    nav(createPageUrl("Subscribe") + `?source=home_pricing`);
  }, [nav]);

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

                <div className="mt-2 text-base md:text-lg font-bold text-ink text-center md:text-left leading-tight">
                  Your college recruiting camp planning HQ
                </div>

                {/* Mobile: login under tagline */}
                <div className="mt-3 w-full md:hidden">
                  <Button
                    type="button"
                    onClick={handleLoginOnly}
                    className="btn-brand w-full"
                    disabled={loginWorking}
                  >
                    {loginWorking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
                    Log in
                  </Button>
                </div>
              </div>

              {/* Desktop: login to the right */}
              <div className="hidden md:flex">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLoginOnly}
                  className="text-ink"
                  disabled={loginWorking}
                >
                  {loginWorking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
                  Log in
                </Button>
              </div>
            </div>

            {/* Visible auth error */}
            {loginError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {loginError}
              </div>
            ) : null}

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
              <Button type="button" className="sm:flex-1 btn-brand" onClick={handlePricingSignup}>
                View pricing / Sign-Up
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>

              <Button type="button" className="sm:flex-1 btn-brand" onClick={handleTryDemo}>
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
