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

// ── Hub-and-spoke problem map ──────────────────────────────────────────────────
function ProblemMap() {
  const cx = 290, cy = 205, cr = 56, R = 145;

  // angle: degrees clockwise from top (0 = top, 90 = right)
  // lines: label text split across up to 2 lines
  // anchor: SVG text-anchor ("middle" / "start" / "end")
  // tx, ty: label anchor offset from spoke endpoint
  const nodes = [
    {
      angle: 0,
      lines: ["Navigating the", "recruiting process"],
      anchor: "middle",
      tx: 0,
      ty: -18,
    },
    {
      angle: 72,
      lines: ["Identifying real", "opportunities"],
      anchor: "start",
      tx: 16,
      ty: 0,
    },
    {
      angle: 144,
      lines: ["Choosing the right", "camps and schools"],
      anchor: "start",
      tx: 16,
      ty: 0,
    },
    {
      angle: 216,
      lines: ["Managing cost,", "timing and logistics"],
      anchor: "end",
      tx: -16,
      ty: 0,
    },
    {
      angle: 288,
      lines: ["Supporting without", "wasting time or money"],
      anchor: "end",
      tx: -16,
      ty: 0,
    },
  ];

  const LH = 16; // line height for labels

  return (
    <svg
      viewBox="0 0 580 410"
      style={{ width: "100%", display: "block" }}
      aria-label="Diagram showing five challenges that expand from the central goal of college athletics"
    >
      <defs>
        <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(232,160,32,0.1)" />
          <stop offset="100%" stopColor="rgba(232,160,32,0)" />
        </radialGradient>
      </defs>

      {/* Soft glow behind center hub */}
      <circle cx={cx} cy={cy} r={115} fill="url(#hubGlow)" />

      {nodes.map((n, i) => {
        const sinA = Math.sin((n.angle * Math.PI) / 180);
        const cosA = Math.cos((n.angle * Math.PI) / 180);
        // Spoke endpoint
        const ex = cx + R * sinA;
        const ey = cy - R * cosA;
        // Line: center-circle edge to just before endpoint dot
        const lx1 = cx + cr * sinA;
        const ly1 = cy - cr * cosA;
        const lx2 = ex - 11 * sinA;
        const ly2 = ey + 11 * cosA;
        // Label position
        const labelX = ex + n.tx;
        const labelY = ey + n.ty;
        const totalH = n.lines.length * LH;

        return (
          <g key={i}>
            <line
              x1={lx1} y1={ly1} x2={lx2} y2={ly2}
              stroke="#253654"
              strokeWidth="1.5"
              strokeDasharray="5 5"
            />
            <circle
              cx={ex} cy={ey} r="8"
              fill="#111827"
              stroke="#2e4268"
              strokeWidth="1.5"
            />
            {n.lines.map((line, li) => (
              <text
                key={li}
                x={labelX}
                y={labelY - totalH / 2 + LH * li + LH * 0.45}
                textAnchor={n.anchor}
                dominantBaseline="middle"
                fill="#aab4c8"
                fontSize="11"
                fontFamily="DM Sans, Inter, system-ui, sans-serif"
                fontWeight="500"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}

      {/* Center hub */}
      <circle
        cx={cx} cy={cy} r={cr}
        fill="rgba(232,160,32,0.08)"
        stroke="rgba(232,160,32,0.35)"
        strokeWidth="1.5"
      />
      <text
        x={cx} y={cy - 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#f1f5f9"
        fontSize="10.5"
        fontWeight="700"
        letterSpacing="0.06em"
        fontFamily="DM Sans, Inter, system-ui, sans-serif"
      >
        MY ATHLETE WANTS
      </text>
      <text
        x={cx} y={cy + 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#f1f5f9"
        fontSize="10.5"
        fontWeight="700"
        letterSpacing="0.06em"
        fontFamily="DM Sans, Inter, system-ui, sans-serif"
      >
        TO PLAY IN COLLEGE
      </text>
    </svg>
  );
}

// ── Step 1 — The Parent Problem ────────────────────────────────────────────────
function Step1() {
  return (
    <div>
      <h1 style={T.headline}>
        When an athlete says they want to play in college, most parents suddenly
        face a process they were not prepared for.
      </h1>

      <p style={T.body}>
        The challenge expands quickly, in multiple directions at once.
      </p>

      <div style={{ margin: "8px 0 22px", maxWidth: 520 }}>
        <ProblemMap />
      </div>

      <p style={{ ...T.body, fontSize: 15, color: "#8896a8", margin: 0 }}>
        What starts as a dream becomes a complicated, multi-year process that
        requires strategy, organization, and informed decision-making.
      </p>
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
