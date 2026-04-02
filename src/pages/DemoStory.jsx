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
  // Eyebrow — matches WhyPanel label treatment
  eyebrow: {
    fontSize: 10,
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    margin: "0 0 10px",
  },
  // Short display headline — visually dominant, not sentence-length
  headline: {
    fontSize: "clamp(24px, 4vw, 32px)",
    fontWeight: 700,
    color: "#f1f5f9",
    lineHeight: 1.2,
    margin: "0 0 12px",
  },
  // Supporting sentence — muted, constrained width
  support: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 1.6,
    margin: "0 0 0",
    maxWidth: 480,
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

// ── 3 stacked icon rows — parent problem points ────────────────────────────────
const POINTS = [
  {
    icon: "🗺️",
    lead: "How little you know about the process",
    detail: "camp strategy, exposure, communication, timelines, and expectations",
  },
  {
    icon: "🧩",
    lead: "How fragmented the information is",
    detail: "forcing parents to piece everything together on their own",
  },
  {
    icon: "🔀",
    lead: "How unclear the path is",
    detail: "since not every athlete follows the same recruiting route",
  },
];

function ProblemPoints() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "24px 0 0" }}>
      {POINTS.map((p, i) => (
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
          <div style={{
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
          }}>
            {p.icon}
          </div>
          <div>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#e8edf3",
              lineHeight: 1.35,
              marginBottom: 4,
            }}>
              {p.lead}
            </div>
            <div style={{
              fontSize: 12.5,
              color: "#5d6f84",
              lineHeight: 1.55,
            }}>
              {p.detail}
            </div>
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
      <p style={T.eyebrow}>The Challenge</p>
      <h1 style={T.headline}>Most Parents Aren't Ready</h1>
      <p style={{ ...T.support, marginBottom: 28 }}>
        When a player says, "I want to play in college," families are often unprepared for what comes next.
      </p>
      <ProblemPoints />
    </div>
  );
}

// ── Step 2 — How URecruitHQ Helps ─────────────────────────────────────────────
const PILLARS = [
  {
    icon: "📖",
    lead: "Understand the recruiting process",
    detail: "Giving parents a playbook so they can better understand the recruiting process, key stages, and what to focus on.",
  },
  {
    icon: "📋",
    lead: "Track real momentum, not just noise",
    detail: "Helping families track activity so they can see whether there is real momentum, not just noise.",
  },
  {
    icon: "🔍",
    lead: "Plan the camp season with clarity",
    detail: "Providing a single view of college camps so parents can plan their camp season more efficiently and avoid confusion and conflicts.",
  },
];

function PillarFramework() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "28px 0 0" }}>
      {PILLARS.map((p, i) => (
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
          <div style={{
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
          }}>
            {p.icon}
          </div>
          <div>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#e8edf3",
              lineHeight: 1.35,
              marginBottom: 4,
            }}>
              {p.lead}
            </div>
            <div style={{
              fontSize: 12.5,
              color: "#5d6f84",
              lineHeight: 1.55,
            }}>
              {p.detail}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Step2() {
  return (
    <div>
      <p style={T.eyebrow}>The Solution</p>
      <h1 style={T.headline}>How URecruitHQ Helps</h1>
      <p style={{ ...T.support, marginBottom: 28 }}>
        We give families a clearer playbook, better visibility into recruiting activity, and one place to plan camp season.
      </p>
      <PillarFramework />
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
        @media (max-width: 600px) {
          .demo-story-next { width: 100% !important; justify-content: center !important; }
          .demo-story-nav  { flex-direction: column-reverse !important; gap: 8px !important; }
          .demo-story-back { width: 100% !important; justify-content: center !important; }
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
              background: "rgba(255,255,255,0.04)",
              border: "1px solid #1e2d45",
              borderRadius: 8,
              padding: "7px 14px",
              color: "#94a3b8",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            Skip to Athlete HQ
            <ArrowRight style={{ width: 11, height: 11 }} />
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
          className="demo-story-nav"
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
              className="demo-story-back"
              onClick={() => goTo(step - 1)}
              style={{
                background: "none",
                border: "1px solid #1e2d45",
                borderRadius: 9,
                padding: "12px 18px",
                color: "#6b7280",
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
                minHeight: 44,
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
              className="demo-story-next"
              onClick={startTour}
              style={{
                background: "#e8a020",
                color: "#0a0e1a",
                border: "none",
                borderRadius: 9,
                padding: "14px 28px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
                minHeight: 44,
              }}
            >
              Start Marcus's Tour
              <ArrowRight style={{ width: 15, height: 15 }} />
            </button>
          ) : (
            <button
              className="demo-story-next"
              onClick={() => goTo(step + 1)}
              style={{
                background: "#e8a020",
                color: "#0a0e1a",
                border: "none",
                borderRadius: 9,
                padding: "14px 22px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
                minHeight: 44,
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
