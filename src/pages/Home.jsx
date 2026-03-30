// src/pages/Home.jsx — rebuild trigger
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, LogIn, CheckCircle2 } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess, clearSeasonAccessCache } from "../components/hooks/useSeasonAccess.jsx";
import { getDemoDefaults, setDemoMode, clearDemoMode } from "../components/hooks/demoMode.jsx";
import { startMemberLogin } from "../components/utils/memberLogin.jsx";
import TestimonialsSection from "../components/home/TestimonialsSection.jsx";
import DifferentiatorsSection from "../components/home/DifferentiatorsSection.jsx";
import laptopImg from "../../Images/laptop image.png";

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
        const [allCamps, allSchools] = await Promise.all([
          base44.entities.Camp.filter({ active: true }),
          base44.entities.School.filter({}),
        ]);
        if (cancelled) return;
        setCampCount(allCamps.length);
        setSchoolCount(Array.isArray(allSchools) ? allSchools.length : 0);
      } catch {
        if (!cancelled) {
          setCampCount(760);
          setSchoolCount(170);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const campDisplay = formatCount(campCount) || "750+";
  const schoolDisplay = schoolCount != null ? `${schoolCount}` : "170+";
  const campRaw = campCount || 750;
  const schoolRaw = schoolCount || 170;

  // ?preview=anon forces anonymous UI for testing
  const previewAnon = useMemo(() => {
    try {
      return new URLSearchParams(loc?.search || "").get("preview") === "anon";
    } catch { return false; }
  }, [loc?.search]);

  const isAuthed = previewAnon ? false : !!season?.accountId;
  const isAdmin = !previewAnon && season?.role === "admin";
  const isCoach = !previewAnon && (season?.role === "coach" || season?.role === "coach_pending");
  const isMember = previewAnon ? false :
    isCoach ||
    (!!season?.accountId && !!season?.hasAccess && (!!season?.entitlement || season?.role === "admin"));

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

    nav(`/Workspace?demo=user&src=home_demo`);
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
    clearSeasonAccessCache();
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
        @keyframes bounce-down { 0%,100%{transform:translateY(0)}50%{transform:translateY(8px)} }
        @media (max-width: 640px) {
          .nav-right-btns {
            gap: 8px !important;
          }
          .nav-right-btns button {
            font-size: 13px !important;
            padding: 10px 16px !important;
            min-height: 44px !important;
            border-radius: 8px !important;
          }
        }

        /* ── HERO RESPONSIVE ── */
        @media (max-width: 767px) {
          .hero-label-wrap span { font-size: 11px !important; letter-spacing: 1px !important; }
          .hero-h1-line1 { white-space: normal !important; font-size: 10vw !important; }
          .hero-h1-line2 { font-size: 10vw !important; }
          .hero-cols { flex-direction: column !important; margin-top: 8px !important; }
          .hero-text-col { flex: 0 0 100% !important; width: 100% !important; }
          .hero-subtext { font-size: 16px !important; max-width: 100% !important; }
          .hero-subtext br { display: none !important; }
          .hero-proof-strip { font-size: 11px !important; }
          .hero-proof-strip-wrap { display: none !important; }
          .hero-scroll-nudge { display: none !important; }
          .stats-bar-desktop { display: none !important; }
          .all-camps-img-mobile { display: block !important; }
        }
        @media (min-width: 768px) and (max-width: 1024px) {
          .hero-h1-line1 { font-size: 3.2vw !important; }
          .hero-h1-line2 { font-size: 3.2vw !important; }
          .hero-cols { margin-top: -16px !important; }
          .hero-text-col { flex: 0 0 50% !important; padding-top: 24px !important; }
          .hero-img-col { margin-left: -5% !important; }
        }
        @keyframes why-float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-6px); }
        }
        @keyframes why-fade-in {
          from { opacity: 0; transform: translateY(6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .why-bubble-closed {
          animation: why-float 3.6s ease-in-out infinite;
          cursor: pointer;
        }
        .why-bubble-closed:hover {
          filter: brightness(1.04);
        }
      `}</style>

      {/* ── NAV ── */}
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
          minHeight: 56,
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "8px 24px",
            minHeight: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
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

          <div className="nav-right-btns" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isAuthed && (isMember || isAdmin) ? (
              <>
                <button onClick={handleContinue} style={S.navBtnAmberText}>
                  Go to HQ
                </button>
                <button onClick={handleLogout} style={S.navBtnTextMuted}>Log out</button>
              </>
            ) : isAuthed && !isMember ? (
              <>
                <button onClick={handlePricingSignup} style={S.navBtnAmber}>
                  Get Season Pass
                </button>
                <button onClick={handleLogout} style={S.navBtnGhost}>Log out</button>
              </>
            ) : (
              <>
                <button onClick={handleMemberLogin} style={S.navBtnMemberLogin}>
                  Members Login
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Banner for logged-in users without paid access */}
      {isAuthed && !isMember && !isAdmin && (
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
          display: "flex",
          flexDirection: "column",
          minHeight: "82vh",
          overflow: "hidden",
          paddingBottom: 52,
        }}
      >
        {/* Background: deep navy with blue bloom on right, gold at bottom-right */}
        <div style={{
          position: "absolute", inset: 0,
          background:
            "radial-gradient(ellipse 65% 75% at 80% 55%, rgba(30,45,120,0.55) 0%, transparent 65%)," +
            "radial-gradient(ellipse 45% 50% at 70% 85%, rgba(232,160,32,0.12) 0%, transparent 60%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 60px, rgba(255,255,255,0.012) 60px, rgba(255,255,255,0.012) 61px)",
          pointerEvents: "none",
        }} />

        {/* Main content */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: 1200,
          margin: "0 auto",
          padding: "48px 32px 0",
          width: "100%",
          position: "relative",
          zIndex: 1,
        }}>
          {/* Label */}
          <div className="hero-label-wrap" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 3, height: 28, background: "#e8a020", borderRadius: 2, flexShrink: 0 }} />
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 18, letterSpacing: 3,
              color: "#e8a020", textTransform: "uppercase",
            }}>
              COLLEGE FOOTBALL, WITH A SMARTER PLAN
            </span>
          </div>

          {/* HEADLINE — spans full container width, one line each */}
          <h1 style={{ margin: 0, lineHeight: 1 }}>
            <span className="hero-h1-line1" style={{
              display: "block",
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: "clamp(36px, 4.8vw, 62px)",
              color: "#f9fafb",
              letterSpacing: 1,
              lineHeight: 1.0,
              whiteSpace: "nowrap",
            }}>
              YOUR ATHLETE WANTS TO PLAY COLLEGE FOOTBALL.
            </span>
            <span className="hero-h1-line2" style={{
              display: "block",
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: "clamp(36px, 4.8vw, 62px)",
              color: "#e8a020",
              letterSpacing: 1,
              lineHeight: 1.05,
            }}>
              NOW WHAT?
            </span>
          </h1>

          {/* Two-column row: subtext/CTAs left, image right with overlap */}
          <div className="hero-cols" style={{ display: "flex", alignItems: "center", gap: 0, marginTop: -32 }}>
            {/* LEFT — subtext, CTAs, bullets */}
            <div className="hero-text-col" style={{ flex: "0 0 44%", minWidth: 0, position: "relative", zIndex: 2, paddingTop: 40 }}>
              {/* Subtext */}
              <p className="hero-subtext" style={{
                fontSize: 18,
                color: "#9ca3af",
                lineHeight: 1.65,
                margin: "0 0 16px",
                maxWidth: 420,
              }}>
                URecruit HQ helps football families organize camps, track progress, and understand the process earlier — so they can support the dream with more clarity, structure, and confidence.
              </p>
              <div style={{ margin: "0 0 28px", maxWidth: 460 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: "#d1d5db", lineHeight: 1.55, margin: "0 0 5px" }}>
                  Support the dream with more than camps, posts, and hope.
                </p>
                <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.55, margin: 0 }}>
                  Built by a parent who went through the process and wanted one place to manage it all.
                </p>
              </div>

              {/* CTAs — demo is primary conversion goal */}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 28 }}>
                <div>
                  <button onClick={handleTryDemo} style={S.ctaPrimary}>
                    Try Free Demo{" "}
                    <ArrowRight style={{ width: 18, height: 18, marginLeft: 6 }} />
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    onClick={handlePricingSignup}
                    style={S.ctaOutline}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#0a0e1a"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#f9fafb"; }}
                  >
                    Get Season Pass
                  </button>
                  <span style={{ fontSize: 11, color: "#6b7280", textAlign: "center", letterSpacing: 0.3 }}>
                    $49 · one season (one-time payment)
                  </span>
                </div>
              </div>

              {/* Coach / trainer entry — two-path: demo first, signup second */}
              <div style={{ borderTop: "1px solid #1a2535", paddingTop: 14, marginBottom: 24 }}>
                <p style={{ fontSize: 11, color: "#4b5563", margin: "0 0 9px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
                  Are you a coach or trainer?
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <button
                    onClick={() => nav("/CoachDashboard?demo=coach")}
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      color: "#cbd5e1",
                      borderRadius: 8,
                      padding: "7px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    View Coach Demo →
                  </button>
                  <button
                    onClick={() => nav("/CoachSignup")}
                    style={{ background: "none", border: "none", color: "#6b7280", fontSize: 13, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2, padding: 0 }}
                  >
                    Create a free account
                  </button>
                </div>
              </div>

              {/* Checkmark bullets */}
              {[
                [campDisplay + " Verified", "College Football Camps"],
                ["New camps added", "weekly from official school sites"],
                ["Built for", "football families"],
              ].map(([bold, rest]) => (
                <div key={bold} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <CheckCircle2 style={{ width: 18, height: 18, color: "#e8a020", flexShrink: 0 }} />
                  <span style={{ fontSize: 14, color: "#d1d5db" }}>
                    <strong style={{ color: "#f9fafb" }}>{bold}</strong> {rest}
                  </span>
                </div>
              ))}

              <p style={{ fontSize: 12, color: "#e8a020", fontWeight: 500, marginTop: 18 }}>
                ⚡ Summer camp season opens March–April — early registrations fill fast.
              </p>
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                No auto-renew · Cancel anytime · Secure checkout (Stripe)
              </p>
            </div>

          {/* RIGHT — laptop image (hidden on mobile) */}
          <div
            className="hero-img-col hidden md:block"
            style={{ flex: 1, position: "relative", minHeight: 420, marginLeft: "-10%" }}
          >
            {/* Gold glow at bottom of image */}
            <div style={{
              position: "absolute", bottom: "-8%", left: "5%",
              width: "90%", height: "40%",
              background: "radial-gradient(ellipse, rgba(232,160,32,0.25) 0%, transparent 65%)",
              filter: "blur(30px)", zIndex: 0, pointerEvents: "none",
            }} />
            {/* Blue/indigo glow center */}
            <div style={{
              position: "absolute", top: "10%", left: "0%",
              width: "100%", height: "75%",
              background: "radial-gradient(ellipse, rgba(59,82,255,0.22) 0%, rgba(99,102,241,0.1) 45%, transparent 70%)",
              filter: "blur(28px)", zIndex: 0, pointerEvents: "none",
            }} />

            <img
              src={laptopImg}
              alt="URecruitHQ camp planning platform on desktop and mobile"
              style={{
                position: "relative", zIndex: 1,
                display: "block", width: "100%", height: "auto",
                WebkitMaskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent), linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)",
                maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent), linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)",
                WebkitMaskComposite: "destination-in",
                maskComposite: "intersect",
              }}
            />

            <style>{`
              @keyframes hero-float {
                0%, 100% { transform: translateY(0px); }
                50%       { transform: translateY(-10px); }
              }
            `}</style>
          </div>
          </div>{/* end two-column row */}
        </div>{/* end main content */}

        {/* Proof strip — normal-flow at bottom of hero, visually anchored above stats bar */}
        <div className="hero-proof-strip-wrap" style={{
          textAlign: "center",
          padding: "14px 24px",
          position: "relative",
          zIndex: 2,
        }}>
          <p className="hero-proof-strip" style={{ fontSize: 15, color: "#9ca3af", margin: 0 }}>
            100%&nbsp;<em style={{ fontStyle: "italic", color: "#d1d5db" }}>College</em>&nbsp;Coaching Staffs &nbsp;·&nbsp; Zero Club Camps &nbsp;·&nbsp; All Divisions
          </p>
        </div>

        {/* ── SCROLL NUDGE ── */}
        <div className="hero-scroll-nudge" style={{
          position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          zIndex: 5, pointerEvents: "none",
        }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2, color: "rgba(249,250,251,0.45)", textTransform: "uppercase" }}>scroll</span>
          <div style={{ animation: "bounce-down 1.8s ease-in-out infinite", display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
            <svg width="22" height="14" viewBox="0 0 24 14" fill="none" stroke="rgba(249,250,251,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2 2 12 12 22 2" />
            </svg>
            <svg width="22" height="14" viewBox="0 0 24 14" fill="none" stroke="rgba(249,250,251,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2 2 12 12 22 2" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── STATIC STATS BAR — hidden on mobile ── */}
      <div className="stats-bar-desktop" style={{
        background: "#e8a020",
        padding: "14px 24px",
        textAlign: "center",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}>
        <span style={{
          fontSize: 14, fontWeight: 700, color: "#0a0e1a",
          textTransform: "uppercase", letterSpacing: 1,
        }}>
          {campDisplay} Verified College Football Camps &nbsp;·&nbsp; {schoolDisplay} Programs &nbsp;·&nbsp; FBS · FCS · D2 · D3 · NAIA · JUCO &nbsp;·&nbsp; New camps added every week from official school sites
        </span>
      </div>

      {/* ── MOBILE ONLY: laptop image break between hero and Why section ── */}
      <div className="all-camps-img-mobile" style={{ display: "none", background: "#0a0e1a", padding: "0 0 0" }}>
        <img
          src={laptopImg}
          alt="URecruitHQ camp planning platform"
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </div>

      {/* ── HIDDEN TRUTH ── */}
      <section style={{ background: '#0d1117', padding: '80px 24px', borderTop: '1px solid #1f2937' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 3, height: 28, background: '#e8a020', borderRadius: 2 }} />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 3, color: '#e8a020', textTransform: 'uppercase' }}>
                WHAT MOST FAMILIES DO NOT REALIZE
              </span>
              <div style={{ width: 3, height: 28, background: '#e8a020', borderRadius: 2 }} />
            </div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 4.5vw, 52px)', color: '#f9fafb', margin: '0 0 16px', lineHeight: 1.05, letterSpacing: 1 }}>
              Playing college football does not usually<br />happen by accident.
            </h2>
            <p style={{ fontSize: 18, color: '#9ca3af', maxWidth: 600, margin: '0 auto', lineHeight: 1.65 }}>
              Most families want to help, but they do not realize early enough how much visibility, timing, and organization can shape the path.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {[
              {
                accent: '#e8a020',
                icon: '📣',
                title: 'Camps and posting are not the whole plan',
                body: 'Most families start with social posts and camps, then hope interest follows. But without structure and intentional next steps, effort can stay scattered.'
              },
              {
                accent: '#3b82f6',
                icon: '🎯',
                title: 'Exposure often has to be built',
                body: 'For many athletes, the path to opportunity is not passive. It usually takes better timing, more focused effort, and a clearer plan than families expect.'
              },
              {
                accent: '#10b981',
                icon: '⏱️',
                title: 'Waiting for interest can put families behind',
                body: 'A lack of early attention does not mean a lack of potential. It often means the family needs more direction before time, money, and opportunities are wasted.'
              }
            ].map(({ accent, icon, title, body }) => (
              <div key={title} style={{ background: '#111827', borderRadius: 16, padding: 32, borderTop: `4px solid ${accent}` }}>
                <div style={{ fontSize: 40, marginBottom: 16, lineHeight: 1 }}>{icon}</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#f9fafb', letterSpacing: 0.5, marginBottom: 12, lineHeight: 1.2 }}>{title}</div>
                <p style={{ fontSize: 15, color: '#9ca3af', lineHeight: 1.7, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SOUND FAMILIAR ── */}
      <section style={{ background: '#111827', padding: '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 3, height: 28, background: '#e8a020', borderRadius: 2 }} />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 3, color: '#e8a020', textTransform: 'uppercase' }}>
                FOR FOOTBALL FAMILIES
              </span>
              <div style={{ width: 3, height: 28, background: '#e8a020', borderRadius: 2 }} />
            </div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(36px, 5vw, 56px)', color: '#f9fafb', margin: '0 0 14px', lineHeight: 1.05, letterSpacing: 1 }}>
              Sound familiar?
            </h2>
            <p style={{ fontSize: 18, color: '#9ca3af', maxWidth: 540, margin: '0 auto', lineHeight: 1.6 }}>
              Most parents are trying to support the goal without a clear system.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {[
              {
                quote: '"We post on X, go to camps, and hope the right coaches see him."',
                body: 'That is where many families start. But most do not realize how much more intentional the process often needs to be.'
              },
              {
                quote: '"We are spending time and money, but we are not sure what is actually moving things forward."',
                body: 'Without better structure, families can stay busy without knowing whether they are making the right decisions.'
              },
              {
                quote: '"We want to help, but we do not really know what to do next."',
                body: 'That uncertainty is common. URecruit HQ is designed to give families more clarity and a better path forward.'
              }
            ].map(({ quote, body }) => (
              <div key={quote} style={{ background: '#0a0e1a', borderRadius: 16, padding: 32, border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ borderLeft: '3px solid #e8a020', paddingLeft: 16 }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: '#f9fafb', lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>{quote}</p>
                </div>
                <p style={{ fontSize: 15, color: '#9ca3af', lineHeight: 1.7, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DIFFERENTIATORS ── */}
      <DifferentiatorsSection campDisplay={campDisplay} schoolDisplay={schoolDisplay} />

      {/* ── EMAIL ALERTS ── */}
      <section style={{ background: '#0a0e1a', padding: '80px 24px', borderTop: '1px solid #1f2937' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Section header */}
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 3, height: 28, background: '#e8a020', borderRadius: 2 }} />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 3, color: '#e8a020', textTransform: 'uppercase' }}>
                STAY AHEAD OF CAMP SEASON
              </span>
              <div style={{ width: 3, height: 28, background: '#e8a020', borderRadius: 2 }} />
            </div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(36px, 5vw, 56px)', color: '#f9fafb', margin: '0 0 16px', lineHeight: 1.05 }}>
              Stay ahead without carrying the whole<br />process in your head.
            </h2>
            <p style={{ fontSize: 18, color: '#9ca3af', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
              URecruit HQ helps football families keep up with camp season, key dates, and next steps — without relying on memory, screenshots, or spreadsheets.
            </p>
          </div>

          {/* Two column layout */}
          <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* LEFT — two email type cards */}
            <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Email type 1 — Monthly Agenda */}
              <div style={{ background: '#111827', borderRadius: 16, borderLeft: '4px solid #e8a020', padding: '24px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(232,160,32,0.12)', border: '1px solid rgba(232,160,32,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>📅</div>
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#f9fafb', letterSpacing: 1 }}>MONTHLY CAMP AGENDA</div>
                    <div style={{ fontSize: 12, color: '#e8a020', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Sent first week of each month</div>
                  </div>
                </div>
                <p style={{ fontSize: 15, color: '#9ca3af', lineHeight: 1.65, margin: 0 }}>
                  A clean monthly view so your family can plan smarter, spot issues earlier, and stay ahead of deadlines.
                </p>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['All camps for the month in one place', 'Sorted by date for fast scanning', 'Includes price, location, and division', 'Easy to use as a planning reference'].map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#d1d5db' }}>
                      <span style={{ color: '#e8a020', fontSize: 14, flexShrink: 0 }}>✓</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* Email type 2 — Camp Week Alert */}
              <div style={{ background: '#111827', borderRadius: 16, borderLeft: '4px solid #10b981', padding: '24px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔔</div>
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: '#f9fafb', letterSpacing: 1 }}>CAMP WEEK ALERT</div>
                    <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Sent 7 days before your camps</div>
                  </div>
                </div>
                <p style={{ fontSize: 15, color: '#9ca3af', lineHeight: 1.65, margin: 0 }}>
                  Everything your family needs before camp week — logistics, reminders, and prep — so your athlete shows up ready.
                </p>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['Triggered by your saved camp schedule', 'Helps reduce last-minute scrambling', 'Includes prep and timing reminders', 'Keeps camp week organized'].map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#d1d5db' }}>
                      <span style={{ color: '#10b981', fontSize: 14, flexShrink: 0 }}>✓</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT — mock email preview */}
            <div style={{ flex: '1 1 400px', position: 'sticky', top: 80 }}>
              <div style={{ background: '#111827', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)' }}>

                {/* Email client top bar */}
                <div style={{ background: '#1f2937', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #374151' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b' }} />
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#10b981' }} />
                  <div style={{ flex: 1, marginLeft: 8, background: '#374151', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#9ca3af' }}>inbox</div>
                </div>

                {/* Email header */}
                <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1f2937' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#f9fafb' }}>URecruit HQ</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Today, 7:02 AM</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#f9fafb', marginBottom: 4 }}>🔔 Camp Week Alert — TCU is in 7 days</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>to jake.adams@email.com</div>
                </div>

                {/* Email body preview */}
                <div style={{ padding: '20px 20px' }}>
                  {/* School banner */}
                  <div style={{ background: 'linear-gradient(135deg, #1a0a00, #2d1500)', border: '1px solid rgba(232,160,32,0.3)', borderLeft: '4px solid #e8a020', borderRadius: 10, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #e8a020, #c4841d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#fff', flexShrink: 0 }}>T</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#f9fafb' }}>TCU Horned Frogs Football</div>
                      <div style={{ fontSize: 13, color: '#9ca3af' }}>📅 June 14 · 📍 Fort Worth, TX · 💰 $65</div>
                    </div>
                  </div>

                  {/* Checklist preview */}
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your prep checklist</div>
                  {[
                    { done: true, text: 'Registration confirmed ✓' },
                    { done: true, text: 'Hotel booked — Fort Worth Marriott' },
                    { done: false, text: 'Pack cleats, shorts, numbered pinnie' },
                    { done: false, text: 'Download updated camp schedule' },
                    { done: false, text: 'Review what WRs should show at TCU' }
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < 4 ? '1px solid #1f2937' : 'none', fontSize: 14, color: item.done ? '#6b7280' : '#d1d5db', textDecoration: item.done ? 'line-through' : 'none' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: item.done ? 'none' : '2px solid #374151', background: item.done ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, color: '#fff' }}>
                        {item.done ? '✓' : ''}
                      </div>
                      {item.text}
                    </div>
                  ))}

                  {/* Faded bottom */}
                  <div style={{ marginTop: 16, height: 60, background: 'linear-gradient(to bottom, transparent, #111827)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#4b5563' }}>+ travel notes, what coaches look for, and more...</span>
                  </div>
                </div>
              </div>

              {/* Caption */}
              <p style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', marginTop: 16, fontStyle: 'italic' }}>
                Example camp week alert — personalized to your calendar
              </p>
            </div>
          </div>


        </div>
      </section>

      {/* ── CLARITY NOT CHAOS ── */}
      <section style={{ background: '#f9fafb', padding: '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 3, height: 28, background: '#e8a020', borderRadius: 2 }} />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 3, color: '#b45309', textTransform: 'uppercase' }}>
                FOR FAMILIES WHO WANT TO HELP THE RIGHT WAY
              </span>
              <div style={{ width: 3, height: 28, background: '#e8a020', borderRadius: 2 }} />
            </div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 4.5vw, 52px)', color: '#0a0e1a', margin: '0 0 16px', lineHeight: 1.05, letterSpacing: 1 }}>
              Replace guesswork with a clearer plan.
            </h2>
            <p style={{ fontSize: 18, color: '#4b5563', maxWidth: 600, margin: '0 auto', lineHeight: 1.65 }}>
              URecruit HQ helps football families support the goal of playing in college with more structure, less wasted effort, and more confidence.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
            {[
              { icon: '🧭', title: 'Less guesswork', body: 'Know what matters, when it matters, and where to focus next.' },
              { icon: '⏳', title: 'Less wasted time and money', body: 'Avoid bad scheduling, unnecessary camp mistakes, and scattered effort that does not move the process forward.' },
              { icon: '💪', title: 'More confidence', body: 'Support your athlete with a plan instead of just hoping the right things happen.' }
            ].map(({ icon, title, body }) => (
              <div key={title} style={{ background: '#ffffff', borderRadius: 16, padding: 32, border: '1px solid #e5e7eb', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 40, marginBottom: 16, lineHeight: 1 }}>{icon}</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: '#0a0e1a', letterSpacing: 0.5, marginBottom: 12 }}>{title}</div>
                <p style={{ fontSize: 15, color: '#4b5563', lineHeight: 1.7, margin: 0 }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RECRUITING GUIDANCE ── */}
      <section style={{ background: '#0a0e1a', padding: '80px 24px', borderTop: '1px solid #1f2937' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 3, height: 28, background: '#e8a020', borderRadius: 2 }} />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 3, color: '#e8a020', textTransform: 'uppercase' }}>
                PRACTICAL RECRUITING GUIDANCE
              </span>
              <div style={{ width: 3, height: 28, background: '#e8a020', borderRadius: 2 }} />
            </div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(32px, 4.5vw, 52px)', color: '#f9fafb', margin: '0 0 16px', lineHeight: 1.05, letterSpacing: 1 }}>
              The recruiting guidance most football<br />parents wish they had earlier
            </h2>
            <p style={{ fontSize: 18, color: '#9ca3af', maxWidth: 600, margin: '0 auto', lineHeight: 1.65 }}>
              Clear, parent-friendly guidance on timelines, contact rules, camps, offers, film, and social media — all in one place.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { icon: '📆', title: 'Recruiting Timeline', desc: 'Understand when each phase of recruiting typically happens and when to take action.' },
              { icon: '📧', title: 'How to Contact Coaches', desc: 'What to say, when to reach out, and how to make the right impression.' },
              { icon: '🏆', title: 'Understanding Offers', desc: 'What different types of offers actually mean and how to evaluate them.' },
              { icon: '🏕️', title: 'Building Your Camp Strategy', desc: 'Which camps matter most, how to prioritize, and how to make each visit count.' },
              { icon: '🎬', title: 'Film That Coaches Watch', desc: 'What coaches look for in film and how to make sure the right people see the right things.' },
              { icon: '📱', title: 'Social Media Strategy', desc: 'How to use X and other platforms to support visibility without making costly mistakes.' }
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ background: '#111827', borderRadius: 14, padding: '24px 24px', border: '1px solid #1f2937', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(232,160,32,0.1)', border: '1px solid rgba(232,160,32,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{icon}</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: '#f9fafb', letterSpacing: 0.5, lineHeight: 1.2 }}>{title}</div>
                </div>
                <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.65, margin: 0 }}>{desc}</p>
                <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                  <span style={{ fontSize: 12, color: '#e8a020', fontWeight: 600 }}>Included with Season Pass →</span>
                </div>
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
            ONE SEASON. ONE PRICE.<br />ONE SMARTER WAY TO SUPPORT THE GOAL.
          </h2>

          <p style={{ fontSize: 17, color: '#9ca3af', maxWidth: 480, margin: '0 auto 32px', lineHeight: 1.6, textAlign: 'center' }}>
            For less than the cost of one extra camp mistake, URecruit HQ helps your family plan smarter all season.
          </p>

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
                  One-time payment · Add multiple athletes
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(232,160,32,0.3)", margin: "24px 0" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                "Current season camp data",
                "Unlimited favorites & registration tracking",
                "Calendar conflict detection",
                "Multiple athletes under one account",
                "Monthly camp agenda + camp week alerts",
                "Practical recruiting guidance"
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

            <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", marginTop: 16, lineHeight: 1.6 }}>
              Not what you expected? We'll refund you — no questions asked.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
              {[
                { icon: "🔒", label: "Secure checkout via Stripe" },
                { icon: "📅", label: "No auto-renew" },
                { icon: "🛡️", label: "We never sell your data" },
                { icon: "🏈", label: "Built for football families" }
              ].map((b) => (
                <span key={b.label} style={{ fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 13 }}>{b.icon}</span> {b.label}
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

      {/* ── MORE SPORTS COMING ── */}
      <section style={{ padding: "0 24px 48px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <div style={{ borderTop: "1px solid #1f2937", paddingTop: 40 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#6b7280", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
            MORE SPORTS COMING SOON
          </div>
          <h3 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: '#f9fafb', margin: '0 0 20px', letterSpacing: 1 }}>
            We're starting with football.
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 20 }}>
            {["Baseball", "Basketball", "Gymnastics", "Lacrosse", "Soccer", "Softball", "Volleyball"].map((s) => (
              <span key={s} style={{
                background: "#111827", border: "1px solid #1f2937",
                borderRadius: 20, padding: "5px 14px",
                fontSize: 13, color: "#9ca3af", fontWeight: 500,
              }}>
                {s}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>
            URecruit HQ is currently built for football families. We plan to expand next to Baseball, Basketball, Gymnastics, Lacrosse, Soccer, Softball, and Volleyball. Follow along as we expand.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <a
              href="https://www.facebook.com/profile.php?id=61586121124133"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "#111827", border: "1px solid #1f2937",
                borderRadius: 8, padding: "10px 18px",
                fontSize: 14, fontWeight: 600, color: "#f9fafb",
                textDecoration: "none", transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4267B2"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1f2937"; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#4267B2"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
              Facebook
            </a>
            <a
              href="https://www.instagram.com/urecruithq/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "#111827", border: "1px solid #1f2937",
                borderRadius: 8, padding: "10px 18px",
                fontSize: 14, fontWeight: 600, color: "#f9fafb",
                textDecoration: "none", transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#E1306C"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1f2937"; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="url(#ig-grad)"><defs><linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stopColor="#F58529"/><stop offset="50%" stopColor="#DD2A7B"/><stop offset="100%" stopColor="#8134AF"/></linearGradient></defs><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              Instagram
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid #1f2937", padding: "36px 24px 28px", background: "#0a0e1a" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
            {/* Brand */}
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb" }}>
              URecruit<span style={{ color: "#e8a020" }}>HQ</span>
            </div>
            {/* Links */}
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              {[
                { label: "Terms of Service", href: "/TermsOfService" },
                { label: "Privacy Policy", href: "/PrivacyPolicy" },
                { label: "Contact", href: "mailto:support@urecruithq.com" },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#9ca3af"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#6b7280"; }}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>
          <div style={{ borderTop: "1px solid #1f2937", paddingTop: 20, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
            <p style={{ fontSize: 12, color: "#4b5563", margin: 0 }}>
              © 2026 URecruitHQ · Independent planning tool · Not affiliated with any school or camp program
            </p>
            <p style={{ fontSize: 12, color: "#4b5563", margin: 0 }}>
              We never sell your data.
            </p>
          </div>
        </div>
      </footer>

      <WhyPanel onTryDemo={handleTryDemo} />
    </div>
  );
}



/* ── Parent Insight Bubble — static, no expand/collapse ── */
function WhyPanel({ onTryDemo }) {
  return (
    <div className="hidden md:block" style={{
      position: "fixed",
      top: "clamp(100px, 28vh, 220px)",
      right: 28,
      zIndex: 200,
      fontFamily: "'DM Sans', sans-serif",
      width: 248,
    }}>
      <div className="why-bubble-closed" style={{
        position: "relative",
        background: "#f1f5f9",
        border: "1.5px solid #e2e8f0",
        borderRadius: 16,
        padding: "16px 18px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.15)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
          FROM A RECRUITING PARENT
        </div>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", lineHeight: 1.35, margin: "0 0 8px" }}>
          Most families think camps, posts, and patience are enough.
        </p>
        <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, margin: "0 0 12px" }}>
          They usually don't realize how intentional this process really is. A better plan gives your athlete a better chance.
        </p>
        <button
          onClick={onTryDemo}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 700, color: "#e8a020",
            padding: 0, textDecoration: "underline", textUnderlineOffset: 2,
          }}
        >
          Try the demo →
        </button>

        {/* Tail pointing bottom-left toward the hero CTAs */}
        <div style={{
          position: "absolute", bottom: -10, left: 24,
          width: 0, height: 0,
          borderLeft: "10px solid transparent",
          borderRight: "10px solid transparent",
          borderTop: "11px solid #f1f5f9",
          filter: "drop-shadow(0 3px 2px rgba(0,0,0,0.12))",
        }} />
      </div>
    </div>
  );
}

/* ── Shared styles ── */
const S = {
  navBtnAmberText: {
    background: "#e8a020",
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  navBtnTextMuted: {
    background: "transparent",
    color: "#111827",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
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
    background: "#e8a020",
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    textDecoration: "none",
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
