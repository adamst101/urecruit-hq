// src/pages/CoachDemoStory.jsx
// Guided 2-step intro before entering the Coach HQ demo.
// Step 1: The Coach Problem  |  Step 2: What Coach HQ Helps With
// After Step 2, routes into CoachDashboard with the guided overlay active.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";

const TOTAL_STEPS = 2;

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  eyebrow: {
    fontSize: 10,
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    margin: "0 0 10px",
  },
  headline: {
    fontSize: "clamp(22px, 3.8vw, 30px)",
    fontWeight: 700,
    color: "#f1f5f9",
    lineHeight: 1.25,
    margin: "0 0 12px",
  },
  support: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 1.6,
    margin: "0 0 0",
    maxWidth: 480,
  },
};

// ── Coach problem points ────────────────────────────────────────────────────────
const PROBLEM_POINTS = [
  {
    icon: "📡",
    lead: "Recruiting updates are fragmented and incomplete",
    detail:
      "texts, screenshots, parent check-ins, and one-off conversations scattered across the season",
  },
  {
    icon: "📊",
    lead: "Hard to see what is really happening across the roster",
    detail:
      "which players are gaining real traction and where that traction is actually coming from",
  },
  {
    icon: "🤝",
    lead: "Difficult to know when to step in and support",
    detail:
      "athletes and families navigating a process that moves fast and punishes gaps in awareness",
  },
];

// ── Value pillars ──────────────────────────────────────────────────────────────
const PILLARS = [
  {
    icon: "👁️",
    lead: "See which athletes are getting attention",
    detail:
      "a live read on who has real college interest and how that interest is developing across the program",
  },
  {
    icon: "📈",
    lead: "Understand where interest is becoming real traction",
    detail:
      "distinguish surface-level contact from the consistent engagement that signals genuine recruiting momentum",
  },
  {
    icon: "🔗",
    lead: "Stay aligned with families without chasing scattered updates",
    detail:
      "one place where family-logged activity feeds directly into the program view coaches see",
  },
];

// ── Shared row component ───────────────────────────────────────────────────────
function PointRow({ points }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "24px 0 0" }}>
      {points.map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
            background: "rgba(14, 22, 40, 0.65)",
            border: "1px solid #1a2740",
            borderRadius: 12,
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(232,160,32,0.08)",
              border: "1px solid rgba(232,160,32,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            {p.icon}
          </div>
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#e8edf3",
                lineHeight: 1.35,
                marginBottom: 4,
              }}
            >
              {p.lead}
            </div>
            <div style={{ fontSize: 12.5, color: "#5d6f84", lineHeight: 1.55 }}>
              {p.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Step 1 — The Coach Problem ─────────────────────────────────────────────────
function Step1() {
  return (
    <div>
      <p style={T.eyebrow}>The Challenge</p>
      <h1 style={T.headline}>
        Coaches want to help athletes earn opportunities, but recruiting updates are often
        fragmented and incomplete.
      </h1>
      <p style={{ ...T.support, marginBottom: 28 }}>
        Recruiting information is often scattered across texts, conversations, screenshots, and
        parent or athlete updates, making it hard to see real traction across the roster and where
        a coach needs to step in.
      </p>
      <PointRow points={PROBLEM_POINTS} />
    </div>
  );
}

// ── Step 2 — What Coach HQ Helps With ─────────────────────────────────────────
function Step2() {
  return (
    <div>
      <p style={T.eyebrow}>The Solution</p>
      <h1 style={T.headline}>
        Coach HQ helps coaches see momentum, support families, and understand recruiting progress
        across the program.
      </h1>
      <p style={{ ...T.support, marginBottom: 28 }}>
        One dashboard. Real family-logged data. Clear signals on who is getting traction and where.
      </p>
      <PointRow points={PILLARS} />
    </div>
  );
}

// ── Progress indicator ─────────────────────────────────────────────────────────
function ProgressDots({ step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          style={{
            width: i === step ? 22 : 7,
            height: 7,
            borderRadius: 4,
            background: i === step ? "#e8a020" : i < step ? "#374151" : "#1a2535",
            transition: "all 0.2s ease",
          }}
        />
      ))}
      <span style={{ fontSize: 11, color: "#4b5563", marginLeft: 4 }}>
        {step + 1} of {TOTAL_STEPS}
      </span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CoachDemoStory() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);

  function goTo(s) {
    setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, s)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startTour() {
    nav("/CoachDashboard?demo=coach&tour=summary&src=coach_demo_story");
  }

  function skip() {
    nav("/CoachDashboard?demo=coach&src=coach_demo_skip");
  }

  const STEP_COMPONENTS = [Step1, Step2];
  const StepComponent = STEP_COMPONENTS[step];
  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#070c18",
        color: "#f1f5f9",
        fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
      `}</style>

      {/* ── Top bar ── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(7,12,24,0.94)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid #0f1a2b",
        }}
      >
        <div
          style={{
            maxWidth: 740,
            margin: "0 auto",
            padding: "11px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <img
            src={LOGO_URL}
            alt="URecruit HQ"
            style={{ height: 30, width: "auto", objectFit: "contain" }}
          />
          <button
            onClick={skip}
            style={{
              background: "none",
              border: "none",
              color: "#4b5563",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Skip to Coach HQ
            <ArrowRight style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div
        style={{
          flex: 1,
          maxWidth: 680,
          width: "100%",
          margin: "0 auto",
          padding: "32px 24px 24px",
          boxSizing: "border-box",
        }}
      >
        {/* Progress */}
        <div style={{ marginBottom: 28 }}>
          <ProgressDots step={step} />
        </div>

        {/* Step content */}
        <div key={step} style={{ marginBottom: 36 }}>
          <StepComponent />
        </div>

        {/* ── Navigation ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 20,
            borderTop: "1px solid #0f1a2b",
            gap: 12,
          }}
        >
          {step > 0 ? (
            <button
              onClick={() => goTo(step - 1)}
              style={{
                background: "none",
                border: "1px solid #1e2d45",
                borderRadius: 9,
                padding: "10px 18px",
                color: "#6b7280",
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
              }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
              Back
            </button>
          ) : (
            <div />
          )}

          {isLastStep ? (
            <button
              onClick={startTour}
              style={{
                background: "#e8a020",
                color: "#0a0e1a",
                border: "none",
                borderRadius: 9,
                padding: "12px 28px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
              }}
            >
              Start Coach HQ Tour
              <ArrowRight style={{ width: 15, height: 15 }} />
            </button>
          ) : (
            <button
              onClick={() => goTo(step + 1)}
              style={{
                background: "#e8a020",
                color: "#0a0e1a",
                border: "none",
                borderRadius: 9,
                padding: "11px 22px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
              }}
            >
              What Coach HQ Helps With
              <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      </div>

      <div style={{ height: 32 }} />
    </div>
  );
}
