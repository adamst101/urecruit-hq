// src/pages/Home.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, LogIn, CheckCircle2 } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { getDemoDefaults, setDemoMode, clearDemoMode } from "../components/hooks/demoMode.jsx";
import { startMemberLogin } from "../components/utils/memberLogin.jsx";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/f3ee1058c_2e6caa2c-a149-4031-83db-38b917c5a134.png";

function trackEvent(payload) {
  try {
    base44.analytics.track({
      eventName: payload.event_name,
      properties: payload
    });
  } catch {}
}

export default function Home() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { demoSeasonYear } = getDemoDefaults();
  const [logoOk, setLogoOk] = useState(true);

  // ?preview=anon forces anonymous UI for testing
  const previewAnon = useMemo(() => {
    try {
      return new URLSearchParams(loc?.search || "").get("preview") === "anon";
    } catch { return false; }
  }, [loc?.search]);

  const isAuthed = previewAnon ? false : !!season?.accountId;
  const isMember = previewAnon ? false :
    !!season?.accountId && !!season?.hasAccess && !!season?.entitlement;

  useEffect(() => {
    const key = "evt_home_viewed_v24";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "home_view",
      source: "home",
      auth_state: isAuthed ? "authed" : "anon",
      mode: isMember ? "paid" : "demo"
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTryDemo() {
    const demoYear =
      season?.demoYear ||
      demoSeasonYear ||
      (season?.currentYear ? season.currentYear - 1 : null);

    trackEvent({
      event_name: "cta_demo_click",
      source: "home",
      demo_season: demoYear
    });

    if (demoYear) setDemoMode(demoYear);

    trackEvent({
      event_name: "demo_entered",
      source: "home",
      demo_season: demoYear
    });

    nav(`/Workspace?mode=demo&src=home_demo`);
  }

  function handleMemberLogin() {
    trackEvent({
      event_name: "cta_login_click",
      source: "home",
      via: "hero_login"
    });
    startMemberLogin({ nextPath: "/Workspace", source: "home_member_login" });
  }

  function handleContinue() {
    trackEvent({
      event_name: "cta_continue_click",
      source: "home",
      dest: "workspace"
    });
    nav("/Workspace");
  }

  function handlePricingSignup() {
    trackEvent({ event_name: "cta_pricing_signup_click", source: "home" });
    nav(`/Subscribe?source=home_pricing`);
  }

  async function handleLogout() {
    clearDemoMode();
    try {
      if (base44?.auth?.logout) { await base44.auth.logout("/Home"); return; }
      if (base44?.auth?.signOut) { await base44.auth.signOut(); }
    } catch {}
    window.location.assign("/Home");
  }

  return (
    <div
      style={{
        background: "#0a0e1a",
        color: "#f9fafb",
        minHeight: "100vh",
        fontFamily: "'DM Sans', Inter, system-ui, sans-serif"
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');
        .hero-card-stack { transition: transform 0.3s ease; }
        .hero-card-stack:hover { transform: translateY(-4px); }
      `}</style>

      {/* ── NAV ── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(10,14,26,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1f2937",
          height: 48
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "0 24px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          {/* Left: logo + brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {logoOk && <img src={LOGO_URL} alt="URecruit HQ" onError={() => setLogoOk(false)} style={{ height: 36, width: "auto", objectFit: "contain" }} />}
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 1, color: "#f9fafb" }}>URECRUIT HQ</span>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {isAuthed && isMember ? (
              <>
                <button onClick={handleContinue} style={S.navBtnAmber}>
                  Go to HQ{" "}
                  <ArrowRight style={{ width: 16, height: 16, marginLeft: 4 }} />
                </button>
                <button onClick={handleLogout} style={S.navBtnLogout}>Log out</button>
              </>
            ) : isAuthed && !isMember ? (
              <>
                <button onClick={handlePricingSignup} style={S.navBtnAmber}>
                  Subscribe
                </button>
                <button onClick={handleLogout} style={S.navBtnLogout}>Log out</button>
              </>
            ) : (
              <>
                <button onClick={handleMemberLogin} style={S.navBtnGhost}>
                  <LogIn style={{ width: 14, height: 14, marginRight: 6 }} />
                  Member Login
                </button>
                <button onClick={handlePricingSignup} style={S.navBtnAmber}>
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "flex-start"
        }}
      >
        {/* Background effects */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 60% 50% at 80% 20%, rgba(232,160,32,0.08) 0%, transparent 70%)",
            pointerEvents: "none"
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 60px, rgba(255,255,255,0.015) 60px, rgba(255,255,255,0.015) 61px)",
            pointerEvents: "none"
          }}
        />

        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "6px 24px 40px",
            width: "100%",
            position: "relative",
            zIndex: 1
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 60 }}>
            {/* Left */}
            <div style={{ flex: "1 1 55%", minWidth: 0 }}>
              {/* Hero Logo only (large, top, no text beside it) */}
              <div
                style={{
                  marginTop: 2,
                  marginBottom:0,
                  display: "flex",
                  alignItems: "center"
                }}
              >
                {logoOk && (
                  <img
                    src={LOGO_URL}
                    alt="URecruit HQ"
                    onError={() => setLogoOk(false)}
                    style={{
                      height: "clamp(160px, 22vw, 288px)",
                      width: "auto",
                      objectFit: "contain",
                      filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.35))"
                    }}
                  />
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 6
                }}
              >
                <div
                  style={{
                    width: 3,
                    height: 28,
                    background: "#e8a020",
                    borderRadius: 2
                  }}
                />
                <span
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 20,
                    letterSpacing: 3,
                    color: "#e8a020",
                    textTransform: "uppercase"
                  }}
                >
                  College Football Recruiting Camps
                </span>
              </div>

              <h1
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: "clamp(48px, 7vw, 84px)",
                  lineHeight: 0.95,
                  margin: 0,
                  color: "#f9fafb",
                  letterSpacing: 1
                }}
              >
                STOP MISSING
                <br />
                THE CAMPS THAT
                <br />
                MATTER.
              </h1>

              <p
                style={{
                  fontSize: 20,
                  color: "#9ca3af",
                  lineHeight: 1.6,
                  marginTop: 16,
                  maxWidth: 540
                }}
              >
                759 college football camps. One place to discover, plan, and
                track your recruiting journey — without the spreadsheet chaos.
              </p>

              <div
                style={{
                  display: "flex",
                  gap: 14,
                  marginTop: 22,
                  flexWrap: "wrap"
                }}
              >
                <button onClick={handleTryDemo} style={S.ctaPrimary}>
                  Start Free Demo{" "}
                  <ArrowRight style={{ width: 18, height: 18, marginLeft: 6 }} />
                </button>
                <button onClick={handlePricingSignup} style={S.ctaOutline}>
                  View Pricing
                </button>
              </div>

              <div
                style={{ display: "flex", gap: 20, marginTop: 22, flexWrap: "wrap" }}
              >
                {["759 camps", "260 college programs", "All divisions", "Updated weekly"].map(
                  (t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 15,
                        color: "#9ca3af",
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      <span style={{ color: "#e8a020", fontSize: 17 }}>✓</span> {t}
                    </span>
                  )
                )}
              </div>
            </div>

            {/* Right — decorative camp card stack (hidden on mobile) */}
            <div
              className="hidden md:block hero-card-stack"
              style={{
                flex: "1 1 45%",
                position: "relative",
                minHeight: 480,
                perspective: 800
              }}
            >
              {/* Card 3 — back */}
              <div style={{
                position: "absolute", top: 280, left: 40,
                transform: "rotate(3deg)",
                background: "#111827", borderRadius: 16,
                borderLeft: "4px solid #e8a020",
                padding: 20, width: 340,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                opacity: 0.7, zIndex: 1
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "linear-gradient(135deg, #e8a020, #c4841d)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 18, color: "#fff", flexShrink: 0
                  }}>P</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#f9fafb", flex: 1 }}>Penn State Football</div>
                  <span style={{
                    background: "#e8a020", color: "#0a0e1a",
                    fontSize: 11, fontWeight: 700, padding: "3px 9px",
                    borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5
                  }}>FBS</span>
                </div>
                <div style={{ fontSize: 14, color: "#9ca3af", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📅</span> July 5, 2026 · <span>📍</span> State College, PA
                </div>
                <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>💰</span> $60
                </div>
              </div>

              {/* Card 2 — middle */}
              <div style={{
                position: "absolute", top: 140, left: 20,
                transform: "rotate(1deg)",
                background: "#111827", borderRadius: 16,
                borderLeft: "4px solid #e8a020",
                padding: 20, width: 340,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                zIndex: 2
              }}>
                <div style={{
                  position: "absolute", top: 12, right: 12,
                  background: "#e8a020", color: "#0a0e1a",
                  fontSize: 12, fontWeight: 700, padding: "4px 12px",
                  borderRadius: 20
                }}>★ Favorited</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "linear-gradient(135deg, #e8a020, #c4841d)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 18, color: "#fff", flexShrink: 0
                  }}>A</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#f9fafb", flex: 1 }}>Alabama Crimson Tide</div>
                  <span style={{
                    background: "#e8a020", color: "#0a0e1a",
                    fontSize: 11, fontWeight: 700, padding: "3px 9px",
                    borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5
                  }}>FBS</span>
                </div>
                <div style={{ fontSize: 14, color: "#9ca3af", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📅</span> June 21, 2026 · <span>📍</span> Tuscaloosa, AL
                </div>
                <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>💰</span> $65 · <span>🎓</span> Grades 9-12
                </div>
              </div>

              {/* Card 1 — front */}
              <div style={{
                position: "absolute", top: 0, left: 0,
                transform: "rotate(-2deg)",
                background: "#111827", borderRadius: 16,
                borderLeft: "4px solid #e8a020",
                padding: 20, width: 340,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                zIndex: 3
              }}>
                <div style={{
                  position: "absolute", top: 12, right: 12,
                  background: "#10b981", color: "#fff",
                  fontSize: 12, fontWeight: 700, padding: "4px 12px",
                  borderRadius: 20
                }}>✓ Registered</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "linear-gradient(135deg, #e8a020, #c4841d)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: 18, color: "#fff", flexShrink: 0
                  }}>O</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#f9fafb", flex: 1 }}>Ohio State Football</div>
                  <span style={{
                    background: "#e8a020", color: "#0a0e1a",
                    fontSize: 11, fontWeight: 700, padding: "3px 9px",
                    borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5
                  }}>FBS</span>
                </div>
                <div style={{ fontSize: 14, color: "#9ca3af", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>📅</span> June 14, 2026 · <span>📍</span> Columbus, OH
                </div>
                <div style={{ fontSize: 14, color: "#9ca3af", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>💰</span> $75 · <span>🎓</span> Grades 9-12
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section
        style={{
          position: "relative",
          background: "#e8a020",
          padding: "48px 24px",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -1,
            left: 0,
            right: 0,
            height: 40,
            background: "#0a0e1a",
            clipPath: "polygon(0 0, 100% 0, 100% 60%, 0 100%)"
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -1,
            left: 0,
            right: 0,
            height: 40,
            background: "#0a0e1a",
            clipPath: "polygon(0 40%, 100% 0, 100% 100%, 0 100%)"
          }}
        />
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 24,
            textAlign: "center",
            position: "relative",
            zIndex: 1
          }}
        >
          {[
            { num: "759", label: "Football Camps" },
            { num: "260", label: "College Programs" },
            { num: "98%", label: "School Match Rate" },
            { num: "Free", label: "Demo Access" }
          ].map((s) => (
            <div key={s.label}>
              <div
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 60,
                  color: "#0a0e1a",
                  lineHeight: 1
                }}
              >
                {s.num}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#0a0e1a",
                  opacity: 0.75,
                  marginTop: 6,
                  textTransform: "uppercase",
                  letterSpacing: 1
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ background: "#0a0e1a", padding: "80px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 48,
              textAlign: "center",
              marginBottom: 48,
              color: "#f9fafb"
            }}
          >
            HOW IT WORKS
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 40
            }}
          >
            {[
              {
                n: "01",
                t: "DISCOVER",
                d: "Browse 759 football camps filtered by division, state, and date."
              },
              {
                n: "02",
                t: "PLAN",
                d: "Overlay your target schools, spot conflicts, build the perfect sequence."
              },
              {
                n: "03",
                t: "TRACK",
                d: "Mark favorites, track registrations, never miss a deadline."
              }
            ].map((step) => (
              <div key={step.n}>
                <div
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 64,
                    color: "#e8a020",
                    lineHeight: 1,
                    opacity: 0.8
                  }}
                >
                  {step.n}
                </div>
                <div
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 30,
                    color: "#f9fafb",
                    marginTop: 8,
                    letterSpacing: 1
                  }}
                >
                  {step.t}
                </div>
                <p
                  style={{
                    color: "#9ca3af",
                    fontSize: 17,
                    lineHeight: 1.6,
                    marginTop: 8
                  }}
                >
                  {step.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section style={{ background: "#111827", padding: "80px 24px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
          <h2
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 48,
              color: "#f9fafb",
              marginBottom: 32
            }}
          >
            ONE SEASON. ONE PRICE.
          </h2>

          <div
            style={{
              background: "#0a0e1a",
              border: "2px solid #e8a020",
              borderRadius: 16,
              padding: "36px 28px",
              textAlign: "left"
            }}
          >
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 24,
                color: "#e8a020",
                letterSpacing: 2,
                textTransform: "uppercase"
              }}
            >
              Season Pass
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              <span
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 64,
                  color: "#f9fafb",
                  lineHeight: 1
                }}
              >
                $49
              </span>
              <span style={{ color: "#9ca3af", fontSize: 16 }}>
                per season · all camps · all features
              </span>
            </div>

            <div style={{ height: 1, background: "rgba(232,160,32,0.3)", margin: "24px 0" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "Current season camp data",
                "Unlimited favorites & registration tracking",
                "Calendar conflict detection",
                "Multiple athletes under one account"
              ].map((f) => (
                <div
                  key={f}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 16,
                    color: "#f9fafb"
                  }}
                >
                  <span style={{ color: "#e8a020", fontSize: 18, flexShrink: 0 }}>✓</span> {f}
                </div>
              ))}
            </div>

            <button
              onClick={handlePricingSignup}
              style={{
                ...S.ctaPrimary,
                width: "100%",
                justifyContent: "center",
                marginTop: 28
              }}
            >
              Get Started <ArrowRight style={{ width: 18, height: 18, marginLeft: 6 }} />
            </button>
          </div>

          <p style={{ color: "#9ca3af", fontSize: 16, marginTop: 20 }}>
            Or try a free demo with last season's data — no signup required
          </p>
          <button
            onClick={handleTryDemo}
            style={{
              background: "none",
              border: "none",
              color: "#e8a020",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              marginTop: 8
            }}
          >
            Access Demo →
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid #1f2937", padding: "28px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 14, color: "#6b7280" }}>
          URecruit HQ · Independent planning tool · Not affiliated with any camp or school
        </p>
      </footer>
    </div>
  );
}



/* ── Shared styles ── */
const S = {
  navBtnAmber: {
    background: "#e8a020",
    color: "#0a0e1a",
    border: "none",
    borderRadius: 8,
    padding: "10px 20px",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center"
  },
  navBtnGhost: {
    background: "transparent",
    color: "#f9fafb",
    border: "1px solid #1f2937",
    borderRadius: 8,
    padding: "10px 18px",
    fontSize: 16,
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center"
  },
  ctaPrimary: {
    background: "#e8a020",
    color: "#0a0e1a",
    border: "none",
    borderRadius: 10,
    padding: "16px 32px",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center"
  },
  ctaOutline: {
    background: "transparent",
    color: "#f9fafb",
    border: "1px solid rgba(249,250,251,0.25)",
    borderRadius: 10,
    padding: "16px 32px",
    fontSize: 18,
    fontWeight: 600,
    cursor: "pointer"
  },
  navBtnLogout: {
    background: "transparent",
    color: "#9ca3af",
    border: "none",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: 2
  }
};