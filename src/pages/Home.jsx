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
import TestimonialsSection from "../components/home/TestimonialsSection.jsx";
import DifferentiatorsSection from "../components/home/DifferentiatorsSection.jsx";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

function trackEvent(payload) {
  try {
    base44.analytics.track({
      eventName: payload.event_name,
      properties: payload
    });
  } catch {}
}

function formatCount(n) {
  if (n == null || n === 0) return null;
  const rounded = Math.floor(n / 10) * 10;
  if (rounded >= 1000) return rounded.toLocaleString() + "+";
  return rounded + "+";
}

export default function Home() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { demoSeasonYear } = getDemoDefaults();
  const [logoOk, setLogoOk] = useState(true);

  const [campCount, setCampCount] = useState(null);
  const [schoolCount, setSchoolCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const allCamps = await base44.entities.Camp.filter({ active: true });
        if (cancelled) return;
        setCampCount(allCamps.length);
        const uniqueSchools = new Set(
          allCamps.filter(c => c.school_id).map(c => c.school_id)
        );
        setSchoolCount(uniqueSchools.size);
      } catch {
        if (!cancelled) {
          setCampCount(760);
          setSchoolCount(260);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const campDisplay = formatCount(campCount) || "750+";
  const schoolDisplay = formatCount(schoolCount) || "250+";
  const campRaw = campCount || 750;
  const schoolRaw = schoolCount || 250;

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
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
          height: 56
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
          {/* Left: logo */}
          <div>
            {logoOk ? (
              <img
                src={LOGO_URL}
                alt="URecruit HQ"
                onError={() => setLogoOk(false)}
                style={{ height: 36, width: "auto", objectFit: "contain" }}
              />
            ) : (
              <span style={{ fontSize: 20, fontWeight: 800 }}>
                <span style={{ color: "#111827" }}>URecruit</span>
                <span style={{ color: "#e8a020" }}>HQ</span>
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {isAuthed && isMember ? (
              <>
                <button onClick={handleContinue} style={S.navBtnAmber}>
                  Go to HQ <ArrowRight style={{ width: 14, height: 14, marginLeft: 4 }} />
                </button>
                <button onClick={handleLogout} style={S.navBtnGhost}>Log out</button>
              </>
            ) : isAuthed && !isMember ? (
              <>
                <button onClick={handlePricingSignup} style={S.navBtnAmber}>
                  Get Season Pass
                </button>
                <button onClick={handleLogout} style={S.navBtnGhost}>Log out</button>
              </>
            ) : (
              <button onClick={handleMemberLogin} style={S.navBtnMemberLogin}>
                Member Login
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Banner for logged-in users without paid access */}
      {isAuthed && !isMember && (
        <div style={{
          background: "#111827",
          borderBottom: "2px solid #e8a020",
          padding: "12px 24px",
          textAlign: "center",
          fontSize: 15,
          color: "#f9fafb",
        }}>
          Your account doesn't have an active season pass.{" "}
          <button
            onClick={handlePricingSignup}
            style={{ color: "#e8a020", fontWeight: 700, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            Get access now →
          </button>
        </div>
      )}

      {/* ── HERO ── */}
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          minHeight: "85vh"
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
            padding: "48px 24px 60px",
            width: "100%",
            position: "relative",
            zIndex: 1
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 80 }}>
            {/* Left */}
            <div style={{ flex: "1 1 55%", minWidth: 0 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 3, height: 28, background: "#e8a020", borderRadius: 2 }} />
                  <span style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 18, letterSpacing: 3,
                    color: "#e8a020", textTransform: "uppercase",
                  }}>
                    THE COLLEGE FOOTBALL CAMP PLANNING PLATFORM
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "#9ca3af", paddingLeft: 13 }}>
                  100% College Coaching Staffs · Zero Club Camps · All Divisions
                </div>
              </div>

              <h1
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: "clamp(48px, 7vw, 72px)",
                  lineHeight: 0.95,
                  margin: 0,
                  color: "#f9fafb",
                  letterSpacing: 1
                }}
              >
                THE CAMPS THAT GET
                <br />
                ATHLETES RECRUITED.
                <br />
                ALL IN ONE PLACE.
              </h1>

              <p
                style={{
                  fontSize: 20,
                  color: "#9ca3af",
                  lineHeight: 1.6,
                  marginTop: 24,
                  maxWidth: 540
                }}
              >
                Camp dates are scattered across hundreds of school websites.
                We pull them all together, flag scheduling conflicts, and warn
                you when back-to-back camps require a flight — so your athlete
                shows up to every camp that matters.
              </p>

              <div
                style={{
                  display: "flex",
                  gap: 14,
                  marginTop: 32,
                  flexWrap: "wrap"
                }}
              >
                <button onClick={handlePricingSignup} style={S.ctaPrimary}>
                  Get Season Pass{" "}
                  <ArrowRight style={{ width: 18, height: 18, marginLeft: 6 }} />
                </button>
                <button
                  onClick={handleTryDemo}
                  style={S.ctaOutline}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#0a0e1a"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#f9fafb"; }}
                >
                  Try Free Demo
                </button>
              </div>

              <p style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic", marginTop: 14 }}>
                ⚡ Summer camp season opens March–April. Early registrations fill fast.
              </p>

              <div
                style={{ display: "flex", gap: 20, marginTop: 24, flexWrap: "wrap" }}
              >
                {[`${campDisplay} camps`, `${schoolDisplay} college programs`, "D1 FBS through JUCO", "Updated every Monday"].map(
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
                minHeight: 520,
                perspective: 800
              }}
            >
              {/* Card 3 — back */}
              <div style={{
                position: "absolute", top: 300, left: 60,
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
                position: "absolute", top: 150, left: 30,
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

      {/* ── STATIC STATS BAR ── */}
      <div style={{
        background: "#e8a020",
        padding: "14px 24px",
        textAlign: "center",
        position: "relative",
        zIndex: 2,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}>
        <span style={{
          fontSize: 14, fontWeight: 700, color: "#0a0e1a",
          textTransform: "uppercase", letterSpacing: 1,
        }}>
          {campDisplay} Verified College Football Camps &nbsp;·&nbsp; {schoolDisplay} Programs &nbsp;·&nbsp; FBS · FCS · D2 · D3 · NAIA · JUCO &nbsp;·&nbsp; Updated Every Monday
        </span>
      </div>

      {/* ── DIFFERENTIATORS ── */}
      <DifferentiatorsSection campDisplay={campDisplay} schoolDisplay={schoolDisplay} />

      {/* ── TESTIMONIALS ── */}
      <TestimonialsSection />

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
              <div>
                <span style={{ color: "#9ca3af", fontSize: 16 }}>
                  per season · all camps · all features
                </span>
                <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                  Cancel anytime · Add multiple athletes
                </div>
              </div>
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
              Get Season Pass <ArrowRight style={{ width: 18, height: 18, marginLeft: 6 }} />
            </button>

            {/* Trust badges */}
            <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 20, flexWrap: "wrap" }}>
              {[
                { icon: "🔒", label: "Secure checkout" },
                { icon: "↩️", label: "Cancel anytime" },
                { icon: "👨‍👩‍👧", label: "Multi-athlete" }
              ].map((b) => (
                <span key={b.label} style={{ fontSize: 12, color: "#9ca3af", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 14 }}>{b.icon}</span> {b.label}
                </span>
              ))}
            </div>
          </div>

          <p style={{ fontSize: 13, color: "#6b7280", textAlign: "center", marginTop: 16 }}>
            Not sure yet?{" "}
            <button
              onClick={handleTryDemo}
              style={{ color: "#e8a020", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
            >
              Try the free demo
            </button>
            {" "}— no account needed.
          </p>
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
    color: "#111827",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "10px 18px",
    fontSize: 16,
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center"
  },
  navBtnMemberLogin: {
    background: "transparent",
    color: "#6b7280",
    border: "none",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    textDecoration: "underline",
    textUnderlineOffset: 2,
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
    border: "2px solid #ffffff",
    borderRadius: 10,
    padding: "16px 32px",
    fontSize: 18,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.2s, color 0.2s"
  },
  navBtnLogout: {
    background: "transparent",
    color: "#6b7280",
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