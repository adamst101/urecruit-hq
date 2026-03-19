// src/pages/Home.jsx
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
        @media (max-width: 480px) {
          .nav-right-btns button {
            font-size: 12px !important;
            padding: 6px 10px !important;
          }
        }
        @keyframes why-ping {
          0%   { transform: scale(1);   opacity: 0.7; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        @keyframes why-slide-up {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .why-bubble-btn {
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .why-bubble-btn:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 8px 32px rgba(232,160,32,0.45) !important;
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

          <div className="nav-right-btns" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {isAuthed && isMember ? (
              <>
                <button onClick={handleContinue} style={S.navBtnAmberText}>
                  Go to HQ <ArrowRight style={{ width: 14, height: 14, marginLeft: 4 }} />
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

              <p style={{ fontSize: 12, color: "#ffffffff", fontWeight: 600, marginTop: 14 }}>
                ⚡ Summer camp season opens March–April. Early registrations fill fast.
              </p>
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

        {/* ── SCROLL NUDGE — inside hero, anchored to bottom ── */}
        <div style={{
          position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
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

      {/* ── EMAIL ALERTS ── */}
      <section style={{ background: '#0a0e1a', padding: '80px 24px', borderTop: '1px solid #1f2937' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Section header */}
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 3, height: 28, background: '#e8a020', borderRadius: 2 }} />
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 3, color: '#e8a020', textTransform: 'uppercase' }}>
                WE DO THE WORK. YOU SHOW UP READY.
              </span>
              <div style={{ width: 3, height: 28, background: '#e8a020', borderRadius: 2 }} />
            </div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(36px, 5vw, 56px)', color: '#f9fafb', margin: '0 0 16px', lineHeight: 1.05 }}>
              NEVER MISS A CAMP.<br />NEVER FORGET A DATE.
            </h2>
            <p style={{ fontSize: 18, color: '#9ca3af', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
              We send two types of emails that keep your family one step ahead all season long — no app-checking required.
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
                  A curated list of every camp happening that month — organized by date, filterable by division, and ready to forward to your athlete. Plan the full month before it starts.
                </p>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['All camps for the month in one place', 'Sorted by date — easy to scan', 'Includes price, location, and division', 'Printable format for the fridge'].map(item => (
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
                  Seven days before any camp on your calendar, we send a prep reminder — what to bring, what coaches are watching for, and a final check on travel logistics. Show up prepared, not scrambling.
                </p>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['Triggered by your personal calendar', 'What to bring checklist', 'Travel and timing reminders', 'What coaches evaluate at camp'].map(item => (
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

      <WhyPanel />
    </div>
  );
}



/* ── Why Bubble ── */
function WhyPanel() {
  const [open, setOpen] = useState(false);
  const [pinged, setPinged] = useState(false);

  // Fire the attention-ping 2.5 s after mount, then once more at 7 s
  useEffect(() => {
    const t1 = setTimeout(() => setPinged(true),  2500);
    const t2 = setTimeout(() => setPinged(false), 4000);
    const t3 = setTimeout(() => setPinged(true),  7000);
    const t4 = setTimeout(() => setPinged(false), 8500);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const bubbleBg = open ? "#1e293b" : "#e8a020";
  const bubbleColor = open ? "#f9fafb" : "#0a0e1a";

  return (
    <div style={{
      position: "fixed", bottom: 28, right: 24, zIndex: 200,
      fontFamily: "'DM Sans', sans-serif",
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0,
    }}>

      {/* ── Content panel — slides up above bubble ── */}
      {open && (
        <div style={{
          width: "min(320px, calc(100vw - 48px)",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 12px 48px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)",
          marginBottom: 12,
          animation: "why-slide-up 0.22s ease",
          overflow: "hidden",
        }}>
          {/* Amber accent top bar */}
          <div style={{ background: "#e8a020", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1.5, color: "#0a0e1a" }}>
              WHAT NOBODY TELLS YOU
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#0a0e1a", fontSize: 18, lineHeight: 1, padding: 0, opacity: 0.6 }}
              aria-label="Close"
            >×</button>
          </div>

          <div style={{ padding: "16px 18px 18px" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#111827", lineHeight: 1.4, margin: "0 0 8px" }}>
              The recruiting process starts before most parents realize it.
            </p>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, margin: "0 0 14px" }}>
              From parents who've already lived it — here's what we wish someone had told us early.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              {[
                ["Other families already have a system.", " Starting early is the difference."],
                ["Not all camps are equal.", " \"Coaches in attendance\" isn't the same as a school-run camp where staff are evaluating you for their roster."],
                ["The paperwork adds up fast.", " Missed deadlines cost your athlete real opportunities."],
              ].map(([bold, rest], i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                  <span style={{ color: "#e8a020", flexShrink: 0, fontWeight: 700, marginTop: 1 }}>▸</span>
                  <span><span style={{ fontWeight: 600 }}>{bold}</span>{rest}</span>
                </div>
              ))}
            </div>

            <div style={{ background: "#f9fafb", borderRadius: 10, border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: 14 }}>
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.8 }}>Most families</div>
                <p style={{ fontSize: 13, color: "#6b7280", margin: "3px 0 0", lineHeight: 1.5 }}>
                  Spreadsheets and manual tracking — until something slips.
                </p>
              </div>
              <div style={{ height: 1, background: "#e5e7eb" }} />
              <div style={{ padding: "10px 12px", background: "rgba(232,160,32,0.05)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: 0.8 }}>URecruit HQ families</div>
                <p style={{ fontSize: 13, color: "#374151", margin: "3px 0 0", lineHeight: 1.5 }}>
                  Let the app handle tracking. Focus on the right camps, the right coaches.
                </p>
              </div>
            </div>

            <p style={{ fontSize: 12, color: "#9ca3af", margin: 0, lineHeight: 1.5 }}>
              Built by parents of NCAA athletes.
            </p>
          </div>
        </div>
      )}

      {/* ── Speech bubble trigger ── */}
      <div style={{ position: "relative" }}>
        {/* Pulse ring — fires on pinged state */}
        {pinged && !open && (
          <div style={{
            position: "absolute", inset: -10, borderRadius: 999,
            border: "2px solid rgba(232,160,32,0.6)",
            animation: "why-ping 1.2s ease-out forwards",
            pointerEvents: "none",
          }} />
        )}

        <button
          className="why-bubble-btn"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "11px 18px 11px 14px",
            background: bubbleBg,
            color: bubbleColor,
            border: "none",
            borderRadius: 999,
            cursor: "pointer",
            boxShadow: open
              ? "0 4px 20px rgba(0,0,0,0.35)"
              : "0 4px 24px rgba(232,160,32,0.35)",
            whiteSpace: "nowrap",
            position: "relative",
          }}
        >
          {/* Icon */}
          <div style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
            background: open ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14,
          }}>
            {open ? "×" : "💬"}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {open ? "Close" : "Most parents don't know this."}
          </span>
          {!open && (
            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>tap →</span>
          )}
        </button>

        {/* Speech bubble tail — small downward triangle */}
        {!open && (
          <div style={{
            position: "absolute", bottom: -7, right: 28,
            width: 0, height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: `8px solid ${bubbleBg}`,
            filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.15))",
          }} />
        )}
      </div>
    </div>
  );
}

/* ── Shared styles ── */
const S = {
  navBtnAmberText: {
    background: "transparent",
    color: "#e8a020",
    border: "none",
    borderRadius: 8,
    padding: "8px 4px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  navBtnTextMuted: {
    background: "transparent",
    color: "#6b7280",
    border: "none",
    borderRadius: 8,
    padding: "8px 4px",
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