// src/pages/DemoStory.jsx
// Guided 4-step demo entry flow for the ?demo=user family experience.
// Problem → Solution → Demo orientation → Enter workspace.
// Production flows are not affected — only reached from Home.jsx demo CTA.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DEMO_JOURNEY } from "../lib/demoUserData.js";

const TOTAL_STEPS = 4;

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

// ── Shared tokens ──────────────────────────────────────────────────────────────
const T = {
  headline: {
    fontSize: "clamp(21px, 3.5vw, 28px)",
    fontWeight: 700,
    color: "#f9fafb",
    lineHeight: 1.35,
    margin: "0 0 16px",
  },
  body: {
    fontSize: 15,
    color: "#9ca3af",
    lineHeight: 1.72,
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
    color: "#4b5563",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
};

// ── Hub-and-spoke problem map (SVG) ────────────────────────────────────────────
function ProblemMap() {
  const cx = 280, cy = 188, cr = 52, R = 130;

  // angle: degrees clockwise from top (0 = top)
  // lines: text lines for the spoke label
  // anchor: SVG text-anchor for label positioning
  // tx/ty: offset from spoke endpoint to label anchor point
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
      lines: ["Identifying", "real opportunities"],
      anchor: "start",
      tx: 15,
      ty: 0,
    },
    {
      angle: 144,
      lines: ["Choosing the right", "camps & schools"],
      anchor: "start",
      tx: 15,
      ty: 0,
    },
    {
      angle: 216,
      lines: ["Managing cost,", "timing & logistics"],
      anchor: "end",
      tx: -15,
      ty: 0,
    },
    {
      angle: 288,
      lines: ["Supporting without", "wasting time or money"],
      anchor: "end",
      tx: -15,
      ty: 0,
    },
  ];

  const LH = 13; // line-height for spoke labels

  return (
    <svg
      viewBox="0 0 560 376"
      style={{ width: "100%", display: "block" }}
      aria-label="Problem map showing five parent challenges surrounding the central goal of college athletics"
    >
      {/* Subtle radial glow behind center */}
      <defs>
        <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(232,160,32,0.08)" />
          <stop offset="100%" stopColor="rgba(232,160,32,0)" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={110} fill="url(#hubGlow)" />

      {nodes.map((n, i) => {
        const sinA = Math.sin((n.angle * Math.PI) / 180);
        const cosA = Math.cos((n.angle * Math.PI) / 180);
        // Spoke endpoint
        const ex = cx + R * sinA;
        const ey = cy - R * cosA;
        // Line: from edge of center circle to just before endpoint
        const lx1 = cx + cr * sinA;
        const ly1 = cy - cr * cosA;
        const lx2 = ex - 9 * sinA;
        const ly2 = ey + 9 * cosA;
        // Label anchor point
        const labelX = ex + n.tx;
        const labelY = ey + n.ty;
        const totalH = n.lines.length * LH;

        return (
          <g key={i}>
            <line
              x1={lx1} y1={ly1} x2={lx2} y2={ly2}
              stroke="#1e3354"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            <circle
              cx={ex} cy={ey} r="7"
              fill="#111827"
              stroke="#2a3d5a"
              strokeWidth="1.5"
            />
            {n.lines.map((line, li) => (
              <text
                key={li}
                x={labelX}
                y={labelY - totalH / 2 + LH * li + LH * 0.5}
                textAnchor={n.anchor}
                dominantBaseline="middle"
                fill="#6b7280"
                fontSize="9.2"
                fontFamily="DM Sans, Inter, system-ui, sans-serif"
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
        fill="rgba(232,160,32,0.07)"
        stroke="rgba(232,160,32,0.3)"
        strokeWidth="1.5"
      />
      <text
        x={cx} y={cy - 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#f9fafb"
        fontSize="8.8"
        fontWeight="700"
        letterSpacing="0.06em"
        fontFamily="DM Sans, Inter, system-ui, sans-serif"
      >
        MY ATHLETE WANTS
      </text>
      <text
        x={cx} y={cy + 6}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#f9fafb"
        fontSize="8.8"
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
        The challenge expands quickly — in multiple directions at once.
      </p>

      {/* Hub-and-spoke visual */}
      <div style={{ margin: "4px 0 20px", maxWidth: 520 }}>
        <ProblemMap />
      </div>

      <p style={{ ...T.body, color: "#6b7280", fontSize: 14, margin: 0 }}>
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
    desc: "A clear recruiting playbook so parents always know what matters at each stage — and what to do next.",
  },
  {
    num: "2",
    icon: "📋",
    title: "Track real momentum",
    desc: "A way to tell the difference between real interest and noise — and see which programs are genuinely engaging over time.",
  },
  {
    num: "3",
    icon: "🔍",
    title: "Plan camps with confidence",
    desc: "One place to find, compare, and organize college camp options — so the camp season has a real strategy behind it.",
  },
];

function PillarFramework() {
  return (
    <>
      <style>{`
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
          color: #1e3354;
          font-size: 18px;
          user-select: none;
        }
        @media (max-width: 520px) {
          .ds-pillars {
            grid-template-columns: 1fr;
          }
          .ds-pillar-arrow {
            display: none;
          }
          .ds-pillar:not(:last-child) {
            border-right: none;
            border-bottom: 1px solid #1e2d45;
          }
        }
      `}</style>
      <div className="ds-pillars">
        {PILLARS.map((p, i) => (
          <React.Fragment key={p.num}>
            {i > 0 && (
              <div className="ds-pillar-arrow">›</div>
            )}
            <div className="ds-pillar">
              {/* Step number */}
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "rgba(232,160,32,0.1)",
                border: "1px solid rgba(232,160,32,0.22)",
                fontSize: 10,
                fontWeight: 700,
                color: "#e8a020",
                marginBottom: 10,
              }}>
                {p.num}
              </div>
              <div style={{ fontSize: 22, marginBottom: 9 }}>{p.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f9fafb", marginBottom: 7, lineHeight: 1.3 }}>
                {p.title}
              </div>
              <div style={{ fontSize: 11.5, color: "#6b7280", lineHeight: 1.58 }}>
                {p.desc}
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
    </>
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

      <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
        Instead of piecing everything together on their own, families get a
        single platform for all three.
      </p>
    </div>
  );
}

// ── Step 3 — Marcus and the Demo Workspace ────────────────────────────────────
const DEMO_PAGES = [
  {
    icon: "👤",
    name: "Athlete Profile",
    desc: "Core info — position, grad year, school, and context for the recruiting journey.",
  },
  {
    icon: "📖",
    name: "The Playbook",
    desc: "Learn how recruiting works, what matters at each stage, and what to do next.",
  },
  {
    icon: "🔍",
    name: "Discover Camps",
    desc: "Explore college camp options by sport, region, date, and division level.",
  },
  {
    icon: "⭐",
    name: "My Camps",
    desc: "All saved and registered camps tracked in one organized view.",
  },
  {
    icon: "📅",
    name: "My Calendar",
    desc: "A clear timeline of camp dates and key windows across the season.",
  },
  {
    icon: "📋",
    name: "Recruiting Tracker",
    desc: "Log and follow activity over time — from early signals to real recruiting momentum.",
  },
];

function JourneyPath() {
  return (
    <div style={{ position: "relative", paddingLeft: 0 }}>
      {/* Vertical connector line */}
      <div style={{
        position: "absolute",
        left: 14,
        top: 30,
        bottom: 14,
        width: 2,
        background: "linear-gradient(to bottom, rgba(232,160,32,0.25), rgba(30,45,69,0.4))",
        borderRadius: 2,
      }} />

      {DEMO_PAGES.map((p, i) => (
        <div
          key={p.name}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            marginBottom: i < DEMO_PAGES.length - 1 ? 18 : 0,
            position: "relative",
          }}
        >
          {/* Number node */}
          <div style={{
            width: 29,
            height: 29,
            borderRadius: "50%",
            flexShrink: 0,
            background: "#070c18",
            border: `1.5px solid ${i < 3 ? "rgba(232,160,32,0.4)" : "#1e2d45"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            color: i < 3 ? "#e8a020" : "#374151",
            position: "relative",
            zIndex: 1,
          }}>
            {i + 1}
          </div>

          {/* Content */}
          <div style={{ paddingTop: 4 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#e2e8f0",
              marginBottom: 3,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              <span>{p.icon}</span>
              <span>{p.name}</span>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.55 }}>
              {p.desc}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Step3() {
  return (
    <div>
      <h1 style={T.headline}>
        Next, you will step into a sample family journey already in progress.
      </h1>

      <p style={T.body}>
        You are about to view the demo workspace for Marcus Johnson — a sample
        athlete whose family has been using URecruitHQ to navigate the
        recruiting process.
      </p>

      {/* Marcus context card */}
      <div style={{
        ...T.card,
        padding: "14px 18px",
        marginBottom: 24,
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb", marginBottom: 2 }}>
            {DEMO_JOURNEY.athleteName}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {DEMO_JOURNEY.position} · Class of {DEMO_JOURNEY.gradYear} · {DEMO_JOURNEY.school}
          </div>
          <div style={{ fontSize: 12, color: "#e8a020", fontWeight: 600, marginTop: 4 }}>
            {DEMO_JOURNEY.chapter}
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, flexShrink: 0 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#e8a020", lineHeight: 1 }}>
              {DEMO_JOURNEY.stats.saved}
            </div>
            <div style={{ ...T.label, marginTop: 2 }}>Saved</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#22c55e", lineHeight: 1 }}>
              {DEMO_JOURNEY.stats.registered}
            </div>
            <div style={{ ...T.label, marginTop: 2 }}>Registered</div>
          </div>
        </div>
      </div>

      {/* Journey path */}
      <div style={{ ...T.label, marginBottom: 14 }}>
        The demo workspace includes
      </div>
      <JourneyPath />
    </div>
  );
}

// ── Step 4 — Enter the Demo ────────────────────────────────────────────────────
function Step4({ onDiscover }) {
  return (
    <div>
      <div style={{
        display: "inline-flex",
        alignItems: "center",
        background: "rgba(232,160,32,0.08)",
        border: "1px solid rgba(232,160,32,0.2)",
        borderRadius: 6,
        padding: "4px 12px",
        marginBottom: 20,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Sample Demo
        </span>
      </div>

      <h1 style={T.headline}>
        Step into Marcus Johnson's demo workspace.
      </h1>

      <p style={T.body}>
        This sample workspace shows how a family can use URecruitHQ to stay
        organized, plan camps, and follow recruiting progress over time.
      </p>

      <p style={{ ...T.body, marginBottom: 28 }}>
        Explore the tools, see how Marcus's family is using them, and get a
        clearer picture of how the platform can help your own family navigate
        the process with more confidence.
      </p>

      {/* Athlete card */}
      <div style={{ ...T.card, padding: "14px 18px", marginBottom: 8 }}>
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb", marginBottom: 3 }}>
              {DEMO_JOURNEY.athleteName}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {DEMO_JOURNEY.position} · Class of {DEMO_JOURNEY.gradYear} · {DEMO_JOURNEY.school} · {DEMO_JOURNEY.city}
            </div>
            <div style={{ fontSize: 12, color: "#e8a020", marginTop: 5, fontWeight: 600 }}>
              {DEMO_JOURNEY.chapter}
            </div>
          </div>
          <div style={{ display: "flex", gap: 18, flexShrink: 0 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#e8a020", lineHeight: 1 }}>
                {DEMO_JOURNEY.stats.saved}
              </div>
              <div style={{ ...T.label, marginTop: 2 }}>Saved</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: "#22c55e", lineHeight: 1 }}>
                {DEMO_JOURNEY.stats.registered}
              </div>
              <div style={{ ...T.label, marginTop: 2 }}>Registered</div>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onDiscover}
        style={{
          background: "none",
          border: "none",
          color: "#93c5fd",
          fontSize: 13,
          cursor: "pointer",
          padding: 0,
          textDecoration: "underline",
          textDecorationColor: "rgba(147,197,253,0.3)",
          marginTop: 6,
          fontFamily: "inherit",
        }}
      >
        Or start with Discover Camps →
      </button>
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

// ── Next button labels ─────────────────────────────────────────────────────────
const NEXT_LABELS = [
  "How URecruitHQ Helps",
  "Meet Marcus",
  "Enter the Demo",
  null,
];

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DemoStory() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);

  const isLastStep = step === TOTAL_STEPS - 1;

  function goTo(s) {
    setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, s)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function enterWorkspace() {
    nav("/Workspace?demo=user&src=demo_story");
  }

  function enterDiscover() {
    nav("/Discover?demo=user&src=demo_story");
  }

  function skip() {
    nav("/Workspace?demo=user&src=demo_story_skip");
  }

  const STEP_COMPONENTS = [Step1, Step2, Step3];
  const StepComponent = STEP_COMPONENTS[step];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070c18",
      color: "#f9fafb",
      fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');
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
          color: #1e3354;
          font-size: 18px;
          user-select: none;
        }
        @media (max-width: 520px) {
          .ds-pillars {
            grid-template-columns: 1fr;
          }
          .ds-pillar-arrow {
            display: none;
          }
          .ds-pillar:not(:last-child) {
            border-right: none;
            border-bottom: 1px solid #1e2d45;
          }
        }
      `}</style>

      {/* ── Top bar ── */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "rgba(7,12,24,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid #0f1a2b",
      }}>
        <div style={{
          maxWidth: 740,
          margin: "0 auto",
          padding: "11px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <img src={LOGO_URL} alt="URecruit HQ" style={{ height: 30, width: "auto", objectFit: "contain" }} />
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
      <div style={{
        flex: 1,
        maxWidth: 680,
        width: "100%",
        margin: "0 auto",
        padding: "32px 24px 24px",
        boxSizing: "border-box",
      }}>

        {/* Progress */}
        <div style={{ marginBottom: 28 }}>
          <ProgressDots step={step} />
        </div>

        {/* Step content */}
        <div key={step} style={{ marginBottom: 36 }}>
          {step < TOTAL_STEPS - 1
            ? <StepComponent />
            : <Step4 onDiscover={enterDiscover} />
          }
        </div>

        {/* ── Navigation ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 20,
          borderTop: "1px solid #0f1a2b",
          gap: 12,
        }}>
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
              onClick={enterWorkspace}
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
              Enter Demo Workspace
              <ArrowRight style={{ width: 15, height: 15 }} />
            </button>
          ) : (
            <button
              onClick={() => goTo(step + 1)}
              style={{
                background: step === 0 ? "#e8a020" : "#0d1828",
                color: step === 0 ? "#0a0e1a" : "#f9fafb",
                border: step === 0 ? "none" : "1px solid #1e2d45",
                borderRadius: 9,
                padding: "11px 22px",
                fontSize: 14,
                fontWeight: step === 0 ? 700 : 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
              }}
            >
              {NEXT_LABELS[step]}
              <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      </div>

      <div style={{ height: 32 }} />
    </div>
  );
}
