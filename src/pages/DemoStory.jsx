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

// ── Step 1 — The Parent Problem ────────────────────────────────────────────────
function Step1() {
  const challenges = [
    "Figuring out how recruiting actually works",
    "Knowing which opportunities are real and which are not",
    "Choosing the right camps and schools to target",
    "Managing cost, logistics, and timing",
    "Supporting the athlete without wasting time or money",
  ];

  return (
    <div>
      <h1 style={T.headline}>
        When an athlete says they want to play in college, most parents suddenly face a process they were not prepared for.
      </h1>

      <p style={T.body}>
        The challenge becomes figuring out how recruiting works and how to support their athlete without wasting time, money, or effort.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {challenges.map((c) => (
          <div
            key={c}
            style={{
              ...T.card,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ color: "#374151", fontSize: 16, flexShrink: 0 }}>—</span>
            <span style={{ fontSize: 14, color: "#d1d5db" }}>{c}</span>
          </div>
        ))}
      </div>

      <p style={{ ...T.body, color: "#6b7280", fontSize: 14 }}>
        What starts as a dream quickly becomes a complicated, multi-year process that requires strategy, organization, and informed decision-making.
      </p>
    </div>
  );
}

// ── Step 2 — How URecruitHQ Helps ─────────────────────────────────────────────
function Step2() {
  const pillars = [
    {
      num: "1",
      icon: "📖",
      title: "A clear recruiting playbook",
      desc: "So parents can understand how the process works, what matters at each stage, and what to do next — without having to piece it together on their own.",
    },
    {
      num: "2",
      icon: "📋",
      title: "A way to track recruiting activity",
      desc: "So families can tell the difference between real momentum and noise — and see which programs are actually showing interest over time.",
    },
    {
      num: "3",
      icon: "🔍",
      title: "One place to explore college camps",
      desc: "So parents can find the right camps, compare options, and plan the camp season with more confidence and less guesswork.",
    },
  ];

  return (
    <div>
      <h1 style={T.headline}>
        URecruitHQ helps parents in three key ways.
      </h1>

      <p style={{ ...T.body, marginBottom: 22 }}>
        It gives families a better system for understanding the process, staying organized, and making smarter decisions over time.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
        {pillars.map((p) => (
          <div key={p.num} style={{ ...T.card, padding: "18px 20px", display: "flex", gap: 16 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8, flexShrink: 0,
              background: "rgba(232,160,32,0.1)", border: "1px solid rgba(232,160,32,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>
              {p.icon}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f9fafb", marginBottom: 5 }}>
                {p.title}
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
                {p.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>
        Instead of piecing everything together on their own, URecruitHQ helps families learn the process, stay organized, and make smarter decisions throughout the journey.
      </p>
    </div>
  );
}

// ── Step 3 — Meet Marcus and the Demo ─────────────────────────────────────────
function Step3() {
  const pages = [
    {
      icon: "👤",
      name: "Athlete Profile",
      desc: "Where Marcus's family keeps his core athlete information organized.",
    },
    {
      icon: "📖",
      name: "The Playbook",
      desc: "Where they learn how recruiting works, what matters, and what to do next.",
    },
    {
      icon: "🔍",
      name: "Discover Camps",
      desc: "Where they explore college camp options and compare opportunities.",
    },
    {
      icon: "⭐",
      name: "My Camps",
      desc: "Where they track saved and registered camps in one place.",
    },
    {
      icon: "📅",
      name: "My Calendar",
      desc: "Where they view dates, timing, and scheduling across the camp season.",
    },
    {
      icon: "📋",
      name: "Recruiting Tracker",
      desc: "Where they follow activity over time — from early signals to more meaningful recruiting movement.",
    },
  ];

  return (
    <div>
      <h1 style={T.headline}>
        Next, you will step into a sample family journey already in progress.
      </h1>

      <p style={T.body}>
        You are about to view the demo workspace for Marcus Johnson — a sample athlete whose family has been using URecruitHQ to navigate the recruiting process over time.
      </p>

      {/* Marcus context card */}
      <div style={{
        ...T.card,
        padding: "14px 18px",
        marginBottom: 22,
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

      {/* What you will see */}
      <div style={{ ...T.label, marginBottom: 12 }}>What you will find in the demo</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8 }}>
        {pages.map((p) => (
          <div key={p.name} style={{
            ...T.card,
            padding: "11px 14px",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{p.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e8a020", marginBottom: 3 }}>
                {p.name}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
                {p.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 4 — Enter the Demo ────────────────────────────────────────────────────
function Step4({ onDiscover }) {
  return (
    <div>
      <div style={{
        display: "inline-flex", alignItems: "center",
        background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.2)",
        borderRadius: 6, padding: "4px 12px", marginBottom: 20,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Sample Demo
        </span>
      </div>

      <h1 style={T.headline}>
        Step into Marcus Johnson's demo workspace.
      </h1>

      <p style={T.body}>
        This sample workspace shows how a family can use URecruitHQ to stay organized, plan camps, and follow recruiting progress over time.
      </p>

      <p style={{ ...T.body, marginBottom: 28 }}>
        Explore the tools, see how Marcus's family is using them, and get a clearer picture of how the platform can help your own family navigate the process with more confidence.
      </p>

      {/* Athlete card */}
      <div style={{ ...T.card, padding: "14px 18px", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
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
          background: "none", border: "none", color: "#93c5fd",
          fontSize: 13, cursor: "pointer", padding: 0,
          textDecoration: "underline", textDecorationColor: "rgba(147,197,253,0.3)",
          marginTop: 6,
        }}
      >
        Or start with Discover Camps →
      </button>
    </div>
  );
}

// ── Progress dots ──────────────────────────────────────────────────────────────
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
  null, // step 4 handled separately
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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      {/* ── Top bar ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(7,12,24,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid #0f1a2b",
      }}>
        <div style={{
          maxWidth: 740, margin: "0 auto",
          padding: "11px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <img src={LOGO_URL} alt="URecruit HQ" style={{ height: 30, width: "auto", objectFit: "contain" }} />
          <button
            onClick={skip}
            style={{
              background: "none", border: "none", color: "#4b5563",
              fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            Skip to workspace
            <ArrowRight style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{
        flex: 1, maxWidth: 680, width: "100%",
        margin: "0 auto", padding: "32px 24px 24px",
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
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 20,
          borderTop: "1px solid #0f1a2b",
          gap: 12,
        }}>
          {/* Back */}
          {step > 0 ? (
            <button
              onClick={() => goTo(step - 1)}
              style={{
                background: "none", border: "1px solid #1e2d45", borderRadius: 9,
                padding: "10px 18px", color: "#6b7280", fontSize: 14,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                fontFamily: "inherit",
              }}
            >
              <ArrowLeft style={{ width: 14, height: 14 }} />
              Back
            </button>
          ) : (
            <div />
          )}

          {/* Next / Enter */}
          {isLastStep ? (
            <button
              onClick={enterWorkspace}
              style={{
                background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 9,
                padding: "12px 28px", fontSize: 15, fontWeight: 700,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
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
                borderRadius: 9, padding: "11px 22px",
                fontSize: 14, fontWeight: step === 0 ? 700 : 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
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
