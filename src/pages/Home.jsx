// src/pages/Home.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, LogIn, CheckCircle2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { getDemoDefaults, setDemoMode } from "../components/hooks/demoMode.jsx";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

function parseHomeParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const debug = sp.get("debug") === "1";
    const signin = sp.get("signin") === "1";
    const next = sp.get("next") || "";
    return { debug, signin, next };
  } catch {
    return { debug: false, signin: false, next: "" };
  }
}

export default function Home() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const seasonRef = useRef(season);

  useEffect(() => {
    seasonRef.current = season;
  }, [season]);

  const params = useMemo(() => parseHomeParams(loc?.search), [loc?.search]);
  const showDebug = !!params.debug;

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
      mode: season?.mode === "paid" ? "paid" : "demo",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTryDemo() {
    // Pick the demo year your hook is using (or fallback)
    const demoYear =
      season?.demoYear ||
      demoSeasonYear || // your getDemoDefaults()
      (season?.currentYear ? season.currentYear - 1 : null);

    trackEvent({ event_name: "cta_demo_click", source: "home", demo_season: demoYear });

    // Persist demo mode for the session (optional but helpful)
    if (demoYear) setDemoMode(demoYear);

    trackEvent({ event_name: "demo_entered", source: "home", demo_season: demoYear });

    // ✅ Critical: force demo with URL, DO NOT pass season (prevents season gate mismatch)
    nav(`${createPageUrl("Discover")}?mode=demo&src=home_demo`);
  }

  /**
   * Home "Log in" should behave like "Log in" (not "Subscribe").
   * We bypass AuthRedirect and send the user to Base44's login route:
   *   /login?from_url=<absolute Subscribe?source=auth_gate&next=/Discover>
   */
  function handleLogin() {
    trackEvent({ event_name: "cta_login_click", source: "home", via: "hero_login" });

    // ✅ If the user is choosing to log in, don’t keep them stuck in demo after auth
    try { sessionStorage.removeItem("demo_mode_v1"); } catch {}
    try { sessionStorage.removeItem("demo_year_v1"); } catch {}

    const nextPath = createPageUrl("Discover"); // typically "/Discover"

    // from_url must be an ABSOLUTE URL. We want to land users at Subscribe gate after login
    // (and preserve next=/Discover).
    const fromUrl =
      `${window.location.origin}${createPageUrl("Subscribe")}` +
      `?source=auth_gate&next=${encodeURIComponent(nextPath)}`;

    const loginUrl = `${window.location.origin}/login?from_url=${encodeURIComponent(fromUrl)}`;

    window.location.assign(loginUrl);
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
      { a: "Find dates fast.", b: "Camps and dates are scattered across school sites. We bring them together." },
      { a: "Plan the sequence.", b: "Overlay schools + position-specific sessions to avoid conflicts." },
      { a: "Track what’s real.", b: "Planning vs registered vs completed—so the plan actually happens." },
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

  const debugPayload = useMemo(() => {
    return {
      url: `${loc?.pathname || ""}${loc?.search || ""}`,
      signin: params.signin,
      next: params.next || null,
      season: {
        isLoading: !!season?.isLoading,
        mode: season?.mode,
        hasAccess: !!season?.hasAccess,
        accountId: season?.accountId || null,
        isAuthenticated: !!season?.isAuthenticated,
        currentYear: season?.currentYear ?? null,
        demoYear: season?.demoYear ?? null,
        seasonYear: season?.seasonYear ?? null,
        entitlementSeason: season?.entitlement?.season_year ?? null,
      },
      demoSession: {
        demo_mode_v1: (() => { try { return sessionStorage.getItem("demo_mode_v1"); } catch { return null; } })(),
        demo_year_v1: (() => { try { return sessionStorage.getItem("demo_year_v1"); } catch { return null; } })(),
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc?.pathname, loc?.search, params.signin, params.next, season]);

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-6 md:py-10">
        <Card className="bg-white border-0 shadow-md rounded-2xl">
          <div className="p-6 md:p-10 space-y-6">
            {/* DEBUG banner (only if ?debug=1) */}
            {showDebug && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] text-slate-700">
                <div className="font-semibold mb-2">DEBUG: Home</div>
                <pre className="whitespace-pre-wrap break-words leading-snug">
                  {JSON.stringify(debugPayload, null, 2)}
                </pre>
              </div>
            )}

            {/* If user was redirected here for signin, give them context */}
            {params.signin && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <div className="font-semibold">Sign in required</div>
                <div className="mt-1 text-amber-900/80">
                  Please log in to continue{params.next ? ` to ${decodeURIComponent(params.next)}` : ""}.
                </div>
                <div className="mt-3">
                  <Button onClick={handleLogin} className="btn-brand">
                    <LogIn className="w-4 h-4 mr-2" />
                    Log in
                  </Button>
                </div>
              </div>
            )}

            {/* Brand row: big logo + login (single login button) */}
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
                  <Button onClick={handleLogin} className="btn-brand w-full">
                    <LogIn className="w-4 h-4 mr-2" />
                    Log in
                  </Button>
                </div>
              </div>

              {/* Desktop: login to the right */}
              <div className="hidden md:flex">
                <Button variant="outline" onClick={handleLogin} className="text-ink">
                  <LogIn className="w-4 h-4 mr-2" />
                  Log in
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

            <div className="pt-2 text-xs text-muted text-center md:text-left">
              Independent planning tool · Not affiliated with camps · Demo uses prior-season data
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
