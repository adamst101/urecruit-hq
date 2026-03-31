// src/pages/DemoStory.jsx
// Guided 2-step intro before handing off to the Marcus demo tour.
// Step 1: Parent Problem  |  Step 2: How URecruitHQ Helps
// After Step 2, routes into the actual demo pages with GuidedTourOverlay active.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";

const TOTAL_STEPS = 2;

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  headline: {
    fontSize: "clamp(22px, 3.8vw, 30px)",
    fontWeight: 700,
    color: "#f1f5f9",
    lineHeight: 1.3,
    margin: "0 0 16px",
  },
  body: {
    fontSize: 16,
    color: "#c0cad8",
    lineHeight: 1.75,
    margin: "0 0 14px",
  },
  card: {
    background: "#0b1221",
    border: "1px solid #1e2d45",
    borderRadius: 12,
  },
  label: {
    fontSize: 10,
    fontWeight: 700,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
};

// ── Horizontal 5-icon challenge row ───────────────────────────────────────────
const CHALLENGES = [
  { icon: "🗺️", label: "Recruiting",        desc: "Learn how the process works" },
  { icon: "🎯", label: "Real Opportunities", desc: "Know what interest is real" },
  { icon: "🏫", label: "Camps & Schools",    desc: "Choose better options" },
  { icon: "✈️", label: "Cost & Travel",      desc: "Manage time and logistics" },
  { icon: "💪", label: "Athlete Support",    desc: "Help without wasted effort" },
];

function ChallengesRow() {
  return (
    <div className="ds-challenges">
      {CHALLENGES.map((c) => (
        <div key={c.label} className="ds-challenge-item">
          <div style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "rgba(232,160,32,0.08)",
            border: "1px solid rgba(232,160,32,0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            margin: "0 auto 10px",
            flexShrink: 0,
          }}>
            {c.icon}
          </div>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#e2e8f0",
            marginBottom: 5,
            lineHeight: 1.3,
          }}>
            {c.label}
          </div>
          <div style={{
            fontSize: 11,
            color: "#5d6f84",
            lineHeight: 1.5,
          }}>
            {c.desc}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Step 1 — The Parent Problem ────────────────────────────────────────────────
function Step1() {
  return (
    <div>
      <h1 style={T.headline}>
        When a player says "I want to play in college," most parents aren't prepared for what comes next.
      </h1>

      <p style={{ ...T.body, marginBottom: 0 }}>
        The challenge expands in several directions at once.
      </p>

      <ChallengesRow />
    </div>
  );
}

// ── Step 2 — How URecruitHQ Helps ─────────────────────────────────────────────
const PILLARS = [
  {
    num: "1",
    icon: "📖",
    title: "Learn the process",
    desc: "A clear recruiting playbook so parents always know what matters at each stage and what to do next.",
  },
  {
    num: "2",
    icon: "📋",
    title: "Track real momentum",
    desc: "A way to tell the difference between real interest and noise, and see which programs are genuinely engaging.",
  },
  {
    num: "3",
    icon: "🔍",
    title: "Plan camps with confidence",
    desc: "One place to find, compare, and organize college camp options so the camp season has a real strategy behind it.",
  },
];

function PillarFramework() {
  return (
    <div className="ds-pillars">
      {PILLARS.map((p, i) => (
        <React.Fragment key={p.num}>
          {i > 0 && (
            <div className="ds-pillar-arrow" aria-hidden="true">
              &rsaquo;
            </div>
          )}
          <div className="ds-pillar">
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "rgba(232,160,32,0.12)",
                border: "1px solid rgba(232,160,32,0.25)",
                fontSize: 10,
                fontWeight: 700,
                color: "#e8a020",
                marginBottom: 10,
              }}
            >
              {p.num}
            </div>
            <div style={{ fontSize: 24, marginBottom: 9 }}>{p.icon}</div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#f1f5f9",
                marginBottom: 8,
                lineHeight: 1.3,
              }}
            >
              {p.title}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#9caab8",
                lineHeight: 1.65,
              }}
            >
              {p.desc}
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function Step2() {
  return (
    <div>
      <h1 style={T.headline}>URecruitHQ helps parents in three key ways.</h1>

      <p style={{ ...T.body, marginBottom: 20 }}>
        It gives families a better system for understanding the process, staying
        organized, and making smarter decisions over time.
      </p>

      <PillarFramework />

      <p style={{ fontSize: 14, color: "#6b7a8d", lineHeight: 1.65 }}>
        Instead of piecing everything together on their own, families get a
        single platform for all three.
      </p>
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
            background:
              i === step ? "#e8a020" : i < step ? "#374151" : "#1a2535",
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
export default function DemoStory() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);

  function goTo(s) {
    setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, s)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startTour() {
    // Hand off to the guided walkthrough through Marcus's actual pages
    nav("/Profile?demo=user&tour=profile&src=demo_story");
  }

  function skip() {
    nav("/Workspace?demo=user&src=demo_story_skip");
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

        /* ── Step 1: challenge icon row ── */
        .ds-challenges {
          display: flex;
          gap: 8px;
          margin: 20px 0 0;
        }
        .ds-challenge-item {
          flex: 1;
          min-width: 0;
          text-align: center;
          padding: 16px 8px 14px;
          background: rgba(14, 22, 40, 0.7);
          border: 1px solid #1a2740;
          border-radius: 12px;
        }
        @media (max-width: 520px) {
          .ds-challenges {
            flex-wrap: wrap;
            justify-content: center;
            gap: 8px;
          }
          .ds-challenge-item {
            flex: 0 0 calc(33.33% - 6px);
            padding: 14px 6px 12px;
          }
        }

        /* ── Step 2: three-pillar framework ── */
        .ds-pillars {
          display: grid;
          grid-template-columns: 1fr 28px 1fr 28px 1fr;
          border: 1px solid #1e2d45;
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 20px;
        }
        .ds-pillar {
          padding: 22px 16px 20px;
          text-align: center;
        }
        .ds-pillar:not(:last-child) {
          border-right: 1px solid #1e2d45;
        }
        .ds-pillar-arrow {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #253654;
          font-size: 20px;
          user-select: none;
        }
        @media (max-width: 520px) {
          .ds-pillars { grid-template-columns: 1fr; }
          .ds-pillar-arrow { display: none; }
          .ds-pillar:not(:last-child) {
            border-right: none;
            border-bottom: 1px solid #1e2d45;
          }
        }
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
            Skip to workspace
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
          {/* Back */}
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

          {/* Next / Start Tour */}
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
              Start Marcus's Tour
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
              How URecruitHQ Helps
              <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      </div>

      <div style={{ height: 32 }} />
    </div>
  );
}
