// src/pages/DemoStory.jsx
// Guided 6-step narrative demo entry for ?demo=user family experience.
// Tells the Marcus Johnson story before handing off to the demo workspace.
// Production flows are not affected — only reached from Home.jsx demo CTA.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DEMO_JOURNEY } from "../lib/demoUserData.js";

const TOTAL_STEPS = 6;

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

// ── Shared tokens ──────────────────────────────────────────────────────────────
const headline = {
  fontSize: "clamp(22px, 4vw, 30px)",
  fontWeight: 700,
  color: "#f9fafb",
  lineHeight: 1.35,
  margin: "0 0 14px",
};
const body = {
  fontSize: 15,
  color: "#9ca3af",
  lineHeight: 1.75,
  margin: "0 0 14px",
};
const card = {
  background: "#0b1221",
  border: "1px solid #1e2d45",
  borderRadius: 12,
  padding: "16px 18px",
};

// ── Step 1 ─────────────────────────────────────────────────────────────────────
function Step1() {
  return (
    <div>
      <div style={{ fontSize: 52, marginBottom: 22, lineHeight: 1 }}>🏈</div>
      <h1 style={headline}>
        Marcus Johnson told his parents in 8th grade that he wanted to play football in college.
      </h1>
      <p style={body}>
        Like many families, they wanted to support that dream. They just didn't know what the path was supposed to look like, when to start, or what really mattered most.
      </p>
      <div style={{
        background: "rgba(232,160,32,0.06)", border: "1px solid rgba(232,160,32,0.15)",
        borderRadius: 8, padding: "11px 15px",
      }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          This is a sample family journey showing how the recruiting process can unfold over time.
        </span>
      </div>
    </div>
  );
}

// ── Step 2 ─────────────────────────────────────────────────────────────────────
function Step2() {
  return (
    <div>
      <h1 style={headline}>
        Everyone had advice. None of it gave them a clear plan.
      </h1>
      <p style={body}>
        Some said to post clips and tag college coaches on X. Some said to hit exposure camps. Some said it was too early to worry about any of it.
      </p>
      <p style={{ ...body, marginBottom: 18 }}>
        Families already in the process weren't much clearer:
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {[
          "We post on X, go to camps, and hope the right coaches see him.",
          "We're spending time and money, but we're not sure what is actually moving things forward.",
          "We want to help — we just don't know what to do next.",
        ].map((q, i) => (
          <div
            key={i}
            style={{
              borderLeft: "3px solid #1e2d45",
              paddingLeft: 14,
              paddingTop: 10,
              paddingBottom: 10,
              paddingRight: 12,
              background: "rgba(255,255,255,0.02)",
              borderRadius: "0 8px 8px 0",
            }}
          >
            <p style={{ fontSize: 14, color: "#d1d5db", fontStyle: "italic", margin: 0, lineHeight: 1.65 }}>
              "{q}"
            </p>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, color: "#4b5563" }}>
        Most families don't know what they don't know.
      </p>
    </div>
  );
}

// ── Step 3 ─────────────────────────────────────────────────────────────────────
function Step3() {
  return (
    <div>
      <h1 style={headline}>
        What starts as a dream gets complicated fast.
      </h1>
      <p style={body}>
        The goal is simple. The process isn't. College football recruiting becomes a mix of camp decisions, registrations, timelines, travel, costs, and uncertainty about what actually matters.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 8,
        marginBottom: 18,
      }}>
        {[
          ["📋", "Which camps?"],
          ["📅", "When to register?"],
          ["🎬", "How to get film?"],
          ["💬", "When to contact coaches?"],
          ["💰", "What does this cost?"],
          ["📈", "What actually moves the needle?"],
        ].map(([icon, label]) => (
          <div
            key={label}
            style={{
              ...card,
              padding: "10px 12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 16 }}>{icon}</span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>{label}</span>
          </div>
        ))}
      </div>

      <p style={body}>
        Without a system, families fall back on spreadsheets, screenshots, and scattered notes. Working hard — but without a structure.
      </p>
      <p style={{ fontSize: 13, color: "#4b5563" }}>
        That's where many families start to feel behind.
      </p>
    </div>
  );
}

// ── Step 4 ─────────────────────────────────────────────────────────────────────
function Step4() {
  return (
    <div>
      <h1 style={headline}>
        Then Marcus's parents found a better way to manage the process.
      </h1>
      <p style={body}>
        URecruitHQ was built by parents who went through this themselves. One place to plan camps, track recruiting progress, and understand the process earlier — so families can support the dream with more clarity and confidence.
      </p>
      <p style={{ ...body, marginBottom: 20 }}>
        They realized that for most athletes, the path to opportunity isn't passive. It takes focused effort, better timing, and a clear plan.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          "One place for planning and recruiting timelines",
          "One place for camp dates and registrations",
          "One place to track recruiting movement and coach contacts",
          "One place to stay organized from junior year to signing day",
        ].map((line) => (
          <div key={line} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ color: "#e8a020", fontWeight: 700, flexShrink: 0, marginTop: 1, fontSize: 15 }}>✓</span>
            <span style={{ fontSize: 14, color: "#d1d5db", lineHeight: 1.5 }}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 5 — Tool Preview Cards ────────────────────────────────────────────────
function PlaybookCard() {
  return (
    <div style={{ ...card, flex: "1 1 200px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>📖</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            The Playbook
          </div>
          <div style={{ fontSize: 11, color: "#4b5563" }}>Recruiting guides for parents</div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.55, marginBottom: 12 }}>
        8 guides covering the full recruiting process — from timelines and camp strategy to film and offers.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {["Recruiting Timeline", "Camp Strategy", "Film That Coaches Watch", "Understanding Offers"].map((t) => (
          <div key={t} style={{
            background: "#111d30", borderRadius: 6, padding: "5px 10px",
            fontSize: 12, color: "#9ca3af",
          }}>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrackerCard() {
  const entries = [
    { icon: "👤", type: "Social Follow", school: "Tennessee", badge: "Signal", green: false },
    { icon: "📨", type: "Personal Invite", school: "WKU", badge: "True Traction", green: true },
    { icon: "📞", type: "Phone Call", school: "WKU", badge: "True Traction", green: true },
  ];
  return (
    <div style={{ ...card, flex: "1 1 200px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>📋</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Recruiting Tracker
          </div>
          <div style={{ fontSize: 11, color: "#4b5563" }}>Log every coach interaction</div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.55, marginBottom: 12 }}>
        Track DMs, texts, camp invites, phone calls, visits, and offers — so you can see which programs are actually interested.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {entries.map((e, i) => (
          <div key={i} style={{
            background: "#111d30", borderRadius: 6, padding: "6px 10px",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 13, flexShrink: 0 }}>{e.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#d1d5db" }}>{e.type}</span>
              <span style={{ fontSize: 11, color: "#4b5563" }}> · {e.school}</span>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 20, flexShrink: 0,
              background: e.green ? "rgba(52,211,153,0.1)" : "rgba(96,165,250,0.1)",
              color: e.green ? "#34d399" : "#60a5fa",
            }}>
              {e.badge}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiscoverCard() {
  const camps = [
    { school: "Western Kentucky", date: "May 10", status: "Registered ✓", green: true },
    { school: "Tennessee",        date: "May 17", status: "Registered ✓", green: true },
    { school: "Auburn",           date: "Jun 7",  status: "Saved ⭐",    green: false },
    { school: "Georgia",          date: "Jun 14", status: "Saved ⭐",    green: false },
  ];
  return (
    <div style={{ ...card, flex: "1 1 200px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>🔍</span>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Discover Camps
          </div>
          <div style={{ fontSize: 11, color: "#4b5563" }}>Find, save & register</div>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.55, marginBottom: 12 }}>
        Browse college football camps, compare options, save targets, and track registrations in one place.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {camps.map((c) => (
          <div key={c.school} style={{
            background: "#111d30", borderRadius: 6, padding: "6px 10px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#d1d5db" }}>{c.school}</div>
              <div style={{ fontSize: 10, color: "#4b5563" }}>{c.date}, 2025</div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, color: c.green ? "#22c55e" : "#e8a020",
              whiteSpace: "nowrap",
            }}>
              {c.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Step5() {
  return (
    <div>
      <h1 style={headline}>
        Here's how they used URecruitHQ.
      </h1>
      <p style={{ ...body, marginBottom: 20 }}>
        Marcus's family used three main areas to get organized, understand the process, and stay ahead.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <PlaybookCard />
        <TrackerCard />
        <DiscoverCard />
      </div>
    </div>
  );
}

// ── Step 6 ─────────────────────────────────────────────────────────────────────
function Step6({ onDiscover }) {
  return (
    <div>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.2)",
        borderRadius: 6, padding: "4px 12px", marginBottom: 20,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#e8a020", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Sample Demo
        </span>
      </div>

      <h1 style={headline}>
        Now step into Marcus Johnson's sample family workspace.
      </h1>
      <p style={{ ...body, marginBottom: 20 }}>
        Explore Marcus's saved camps, recruiting tracker, and profile to see how URecruitHQ can help families stay organized and prepared throughout the process.
      </p>

      {/* Mini athlete card */}
      <div style={{ ...card, marginBottom: 8 }}>
        <div style={{
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", flexWrap: "wrap", gap: 12,
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
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#e8a020", lineHeight: 1 }}>
                {DEMO_JOURNEY.stats.saved}
              </div>
              <div style={{ fontSize: 10, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>
                Saved
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#22c55e", lineHeight: 1 }}>
                {DEMO_JOURNEY.stats.registered}
              </div>
              <div style={{ fontSize: 10, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>
                Registered
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary CTA */}
      <button
        onClick={onDiscover}
        style={{
          background: "none", border: "none", color: "#93c5fd",
          fontSize: 13, cursor: "pointer", padding: 0,
          textDecoration: "underline", textDecorationColor: "rgba(147,197,253,0.3)",
          marginTop: 4,
        }}
      >
        Or start with Demo Camps →
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
            width: i === step ? 20 : 7,
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

  const STEPS = [Step1, Step2, Step3, Step4, Step5];
  const StepComponent = STEPS[step];

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

      {/* ── Fixed top bar ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(7,12,24,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid #0f1a2b",
      }}>
        <div style={{
          maxWidth: 740,
          margin: "0 auto",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          {/* Logo */}
          <img
            src={LOGO_URL}
            alt="URecruit HQ"
            style={{ height: 32, width: "auto", objectFit: "contain" }}
          />

          {/* Skip */}
          <button
            onClick={skip}
            style={{
              background: "none", border: "none",
              color: "#4b5563", fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: "inherit",
            }}
          >
            Skip to workspace
            <ArrowRight style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{
        flex: 1,
        maxWidth: 680,
        width: "100%",
        margin: "0 auto",
        padding: "36px 24px 24px",
        boxSizing: "border-box",
      }}>

        {/* Progress */}
        <div style={{ marginBottom: 32 }}>
          <ProgressDots step={step} />
        </div>

        {/* Step content */}
        <div key={step} style={{ marginBottom: 40 }}>
          {step < TOTAL_STEPS - 1
            ? <StepComponent />
            : <Step6 onDiscover={enterDiscover} />
          }
        </div>

        {/* ── Navigation ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 24,
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
                background: step === 0 ? "#e8a020" : "#111d30",
                color: step === 0 ? "#0a0e1a" : "#f9fafb",
                border: step === 0 ? "none" : "1px solid #1e2d45",
                borderRadius: 9, padding: "12px 24px",
                fontSize: 14, fontWeight: step === 0 ? 700 : 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                fontFamily: "inherit",
              }}
            >
              Next
              <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
      </div>

      {/* Bottom padding for mobile safe area */}
      <div style={{ height: 32 }} />
    </div>
  );
}
