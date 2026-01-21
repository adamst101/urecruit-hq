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

const FORCE_DEMO_SESSION_KEY = "force_demo_session_v1";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

function isDebugOn() {
  try {
    const sp = new URLSearchParams(window.location.search || "");
    return sp.get("debug") === "1";
  } catch {
    return false;
  }
}

/**
 * ✅ clearDemoFlags is defined HERE (inside Home.jsx).
 * This resets any demo-mode flags you've used during iteration/testing.
 * It does NOT log the user out; it only clears local/session toggles.
 */
function clearDemoFlags() {
  // demoMode.jsx commonly uses localStorage; clear defensively
  const keys = [
    "demo_mode_v1",
    "demoMode",
    "demoSeasonYear",
    "demo_season_year",
    "demoSeason",
    "demo_mode",
  ];

  try {
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {}

  // if you ever added workspace intent (optional)
  try {
    sessionStorage.removeItem("workspace_intent_v1");
  } catch {}

  // ✅ also clear force-demo session override
  try {
    sessionStorage.removeItem(FORCE_DEMO_SESSION_KEY);
  } catch {}
}

function setForceDemoSession(on) {
  try {
    if (on) sessionStorage.setItem(FORCE_DEMO_SESSION_KEY, "1");
    else sessionStorage.removeItem(FORCE_DEMO_SESSION_KEY);
  } catch {}
}

async function logoutBase44() {
  // You verified this exists: typeof base44.auth.logout === "function"
  try {
    await base44.auth.logout();
    return true;
  } catch {
    return false;
  }
}

export default function Home() {
  const nav = useNavigate();

  const season = useSeasonAccess();
  const seasonRef = useRef(season);

  useEffect(() => {
    seasonRef.current = season;
  }, [season]);

  const showDebug = useMemo(() => isDebugOn(), []);
  const { demoSeasonYear } = getDemoDefaults();

  const [logoOk, setLogoOk] = useState(true);

  // One-time page view tracking
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

  // Expose base44 to console only when debug=1
  useEffect(() => {
    if (!showDebug) return;

    try {
      window.base44 = base44;
      // eslint-disable-next-line no-console
      console.log("base44.auth keys:", Object.keys(base44?.auth || {}));
      // eslint-disable-next-line no-console
      console.log("logout type:", typeof base44?.auth?.logout);
      // eslint-disable-next-line no-console
      console.log(
        "force_demo_session_v1:",
        sessionStorage.getItem(FORCE_DEMO_SESSION_KEY)
      );
    } catch {}
  }, [showDebug]);

  // ✅ DEMO CTA (HARD NAV): forces demo session + persists demo season, prevents query stripping
  function handleTryDemo() {
    trackEvent({
      event_name: "cta_demo_click",
      source: "home",
      demo_season: demoSeasonYear,
    });

    // ✅ Force demo for this session (so paid doesn't override demo during testing)
    setForceDemoSession(true);

    // Persist demo selection
    setDemoMode(demoSeasonYear);

    trackEvent({
      event_name: "demo_entered",
      source: "home",
      demo_season: demoSeasonYear,
      force_demo_session: 1,
    });

    const url =
      `${window.location.origin}${createPageUrl("Discover")}` +
      `?mode=demo&season=${encodeURIComponent(demoSeasonYear)}` +
      `&src=home_demo`;

    window.location.assign(url);
  }

  /**
   * Login should behave like login (not subscribe).
   * We send the user to Base44 built-in /login with a from_url that returns to Subscribe gate.
   */
  function handleLogin() {
    trackEvent({ event_name: "cta_login_click", source: "home", via: "hero_login" });

    // ✅ Clear forced demo session when user chooses to login
    setForceDemoSession(false);

    const nextPath = createPageUrl("Discover"); // typically "/Discover"
    const fromUrl =
      `${window.location.origin}${createPageUrl("Subscribe")}` +
      `?source=auth_gate&next=${encodeURIComponent(nextPath)}`;

    const loginUrl = `${window.location.origin}/login?from_url=${encodeURIComponent(fromUrl)}`;
    window.location.assign(loginUrl);
  }

  function handlePricingSignup() {
    trackEvent({ event_name: "cta_pricing_signup_click", source: "home" });

    // ✅ Pricing is a paid intent; clear forced demo session
    setForceDemoSession(false);

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

            {/* DEBUG: useSeasonAccess() */}
            {showDebug ? (
              <div className="rounded-xl border border-default bg-white p-4 text-xs">
                <div className="font-bold mb-2">DEBUG: useSeasonAccess()</div>
                <pre className="whitespace-pre-wrap break-words">{JSON.stringify(season || {}, null, 2)}</pre>

                <div className="mt-3 rounded-lg border border-default bg-slate-50 p-3">
                  <div className="font-bold mb-2">DEBUG: Auth / Demo Controls</div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        trackEvent({ event_name: "debug_logout_clicked", source: "home" });
                        try {
                          clearDemoFlags(); // also clears force demo session
                          await logoutBase44();
                        } finally {
                          window.location.assign(
                            `${window.location.origin}${createPageUrl("Home")}?debug=1`
                          );
                        }
                      }}
                    >
                      Log out (force demo testing)
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => {
                        trackEvent({
                          event_name: "debug_go_demo_discover",
                          source: "home",
                          demo_season: demoSeasonYear,
                        });
                        try {
                          clearDemoFlags();
                          setForceDemoSession(true);
                          setDemoMode(demoSeasonYear);
                        } finally {
                          const url =
                            `${window.location.origin}${createPageUrl("Discover")}` +
                            `?mode=demo&season=${encodeURIComponent(demoSeasonYear)}&src=debug`;
                          window.location.assign(url);
                        }
                      }}
                    >
                      Go to Demo Discover
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => {
                        trackEvent({ event_name: "debug_clear_force_demo_session", source: "home" });
                        setForceDemoSession(false);
                        window.location.assign(
                          `${window.location.origin}${createPageUrl("Home")}?debug=1`
                        );
                      }}
                    >
                      Clear force-demo session
                    </Button>
                  </div>

                  <div className="mt-2 text-[11px] text-slate-500">
                    Debug-only controls for testing. Hide/remove before production launch.
                  </div>
                </div>
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
