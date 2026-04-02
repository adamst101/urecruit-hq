// src/pages/DemoStory.jsx
// 3-card cinematic story funnel: Problem → Clarity → Control → DemoPreview
// Mobile-first, sports-editorial feel, emotionally progressive.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

const TOTAL = 3;

// ── Card 1 — The Problem ───────────────────────────────────────────────────────
function Card1() {
  return (
    <div>
      <p style={{
        fontSize: 10, fontWeight: 700, color: "#e8a020",
        textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 16px",
      }}>
        The moment it gets real
      </p>
      <h1 style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: "clamp(32px, 8vw, 52px)",
        color: "#f1f5f9",
        lineHeight: 1.05,
        letterSpacing: 1,
        margin: "0 0 20px",
      }}>
        Your athlete says,<br />
        <span style={{ color: "#e8a020" }}>"I want to play<br />in college."</span>
      </h1>
      <p style={{
        fontSize: 16, color: "#94a3b8", lineHeight: 1.65,
        margin: "0 0 32px", maxWidth: 480,
      }}>
        Most families suddenly need to figure out camps, timelines,
        coach communication, and what actually matters — with no clear playbook.
      </p>

      {/* Visual: scattered problem indicators */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "0 0 8px" }}>
        {[
          { icon: "🗺️", text: "What do we do first?" },
          { icon: "🧩", text: "Which camps actually matter?" },
          { icon: "🔀", text: "How do we know if anything is real?" },
        ].map((item) => (
          <div key={item.text} style={{
            display: "flex", alignItems: "center", gap: 14,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid #1a2535",
            borderRadius: 10, padding: "13px 16px",
          }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
            <span style={{ fontSize: 14, color: "#c0cad8", lineHeight: 1.4 }}>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Card 2 — The Clarity ───────────────────────────────────────────────────────
function Card2() {
  return (
    <div>
      <p style={{
        fontSize: 10, fontWeight: 700, color: "#e8a020",
        textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 16px",
      }}>
        The shift
      </p>
      <h1 style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: "clamp(30px, 7.5vw, 48px)",
        color: "#f1f5f9",
        lineHeight: 1.05,
        letterSpacing: 1,
        margin: "0 0 18px",
      }}>
        What feels scattered<br />
        <span style={{ color: "#e8a020" }}>starts to become clear.</span>
      </h1>
      <p style={{
        fontSize: 15, color: "#94a3b8", lineHeight: 1.65,
        margin: "0 0 28px", maxWidth: 480,
      }}>
        Instead of piecing together notes, camp sites, and coach messages,
        families can see everything in one system.
      </p>

      {/* 3-pillar layout */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          {
            num: "01",
            title: "Understand the process",
            detail: "A clear picture of what matters, when it matters, and how to plan your season.",
          },
          {
            num: "02",
            title: "Organize camps",
            detail: "Save, register, and compare camps in one place — no more bouncing between sites.",
          },
          {
            num: "03",
            title: "Track real progress",
            detail: "Log coach interactions so you can see when schools are showing real interest.",
          },
        ].map((p) => (
          <div key={p.num} style={{
            display: "flex", gap: 16, alignItems: "flex-start",
            background: "rgba(14,22,40,0.7)",
            border: "1px solid #1a2740",
            borderRadius: 12, padding: "16px 18px",
          }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 22, color: "#e8a020",
              lineHeight: 1, flexShrink: 0, width: 28,
            }}>
              {p.num}
            </div>
            <div>
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: "#e8edf3", lineHeight: 1.3, marginBottom: 4,
              }}>
                {p.title}
              </div>
              <div style={{ fontSize: 12.5, color: "#5d6f84", lineHeight: 1.55 }}>
                {p.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Card 3 — The Control ───────────────────────────────────────────────────────
function Card3() {
  return (
    <div>
      <p style={{
        fontSize: 10, fontWeight: 700, color: "#e8a020",
        textTransform: "uppercase", letterSpacing: "0.14em", margin: "0 0 16px",
      }}>
        THIS IS WHAT CONTROL LOOKS LIKE.
      </p>
      <h1 style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: "clamp(30px, 7.5vw, 48px)",
        color: "#f1f5f9",
        lineHeight: 1.05,
        letterSpacing: 1,
        margin: "0 0 18px",
      }}>
        This is what<br />
        <span style={{ color: "#e8a020" }}>control looks like.</span>
      </h1>
      <p style={{
        fontSize: 15, color: "#94a3b8", lineHeight: 1.65,
        margin: "0 0 24px", maxWidth: 480,
      }}>
        Marcus's family used URecruit HQ to organize camps, avoid conflicts,
        and track what was actually happening with college coaches.
      </p>

      {/* Proof summary card */}
      <div style={{
        background: "linear-gradient(135deg, #0d1a2e 0%, #0f1f38 100%)",
        border: "1px solid rgba(232,160,32,0.3)",
        borderLeft: "4px solid #e8a020",
        borderRadius: 14,
        padding: "20px 20px 18px",
        marginBottom: 16,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: "#e8a020",
          textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10,
        }}>
          Marcus Johnson · WR · Class of 2026
        </div>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 22, color: "#f9fafb", letterSpacing: 1, marginBottom: 14,
        }}>
          3 Camps locked in. Building momentum.
        </div>

        {/* Metrics row */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10,
          marginBottom: 16,
        }}>
          {[
            { value: "3", label: "Camps saved" },
            { value: "3", label: "Camps registered" },
            { value: "6", label: "Recruiting signals" },
            { value: "3", label: "Schools w/ traction" },
          ].map((m) => (
            <div key={m.label} style={{
              background: "rgba(0,0,0,0.25)",
              border: "1px solid #1e2d45",
              borderRadius: 8, padding: "10px 12px",
            }}>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 26, color: "#e8a020", lineHeight: 1,
              }}>
                {m.value}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>

        {/* Next step */}
        <div style={{
          background: "rgba(232,160,32,0.06)",
          border: "1px solid rgba(232,160,32,0.15)",
          borderRadius: 8, padding: "10px 14px",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: "#e8a020",
            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4,
          }}>
            Next step
          </div>
          <div style={{ fontSize: 13, color: "#c0cad8", lineHeight: 1.5 }}>
            WKU, Tennessee, and Auburn confirmed. Compare schools and keep tracking coach activity.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Progress dots ──────────────────────────────────────────────────────────────
function ProgressDots({ step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {Array.from({ length: TOTAL }).map((_, i) => (
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
      <span style={{
        fontSize: 12, color: "#64748b", marginLeft: 6, fontWeight: 500,
      }}>
        {step + 1} of {TOTAL}
      </span>
    </div>
  );
}

// ── CTA labels per step ────────────────────────────────────────────────────────
const CTA_LABELS = [
  "Show me the plan",
  "Show me how",
  "Open Marcus's HQ",
];

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DemoStory() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);

  function goTo(s) {
    setStep(Math.max(0, Math.min(TOTAL - 1, s)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function advance() {
    if (step < TOTAL - 1) {
      goTo(step + 1);
    } else {
      nav("/DemoPreview?src=demo_story");
    }
  }

  function skip() {
    nav("/DemoPreview?src=demo_story");
  }

  const CARDS = [Card1, Card2, Card3];
  const StepCard = CARDS[step];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070c18",
      color: "#f1f5f9",
      fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
      display: "flex",
      flexDirection: "column",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');
        @media (max-width: 600px) {
          .ds-cta-btn { width: 100% !important; justify-content: center !important; }
          .ds-nav     { flex-direction: column-reverse !important; gap: 8px !important; }
          .ds-back    { width: 100% !important; justify-content: center !important; }
          .ds-card-area { padding: 28px 20px 24px !important; }
        }
      `}</style>

      {/* ── Top bar ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(7,12,24,0.94)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid #0f1a2b",
      }}>
        <div style={{
          maxWidth: 740, margin: "0 auto",
          padding: "11px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
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
              borderRadius: 8, padding: "7px 14px",
              color: "#94a3b8", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            Skip
            <ArrowRight style={{ width: 11, height: 11 }} />
          </button>
        </div>
      </div>

      {/* ── Card content ── */}
      <div
        className="ds-card-area"
        style={{
          flex: 1,
          maxWidth: 680, width: "100%",
          margin: "0 auto",
          padding: "36px 24px 24px",
          boxSizing: "border-box",
        }}
      >
        {/* Progress */}
        <div style={{ marginBottom: 32 }}>
          <ProgressDots step={step} />
        </div>

        {/* Step card */}
        <div key={step} style={{ marginBottom: 40 }}>
          <StepCard />
        </div>

        {/* Navigation */}
        <div
          className="ds-nav"
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
              className="ds-back"
              onClick={() => goTo(step - 1)}
              style={{
                background: "none",
                border: "1px solid #1e2d45",
                borderRadius: 9, padding: "12px 18px",
                color: "#6b7280", fontSize: 14,
                cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "inherit", minHeight: 44,
              }}
            >
              ← Back
            </button>
          ) : (
            <div />
          )}

          <button
            className="ds-cta-btn"
            onClick={advance}
            style={{
              background: "#e8a020",
              color: "#0a0e1a",
              border: "none", borderRadius: 9,
              padding: "14px 28px",
              fontSize: 15, fontWeight: 700,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 7,
              fontFamily: "inherit", minHeight: 44,
              boxShadow: "0 2px 16px rgba(232,160,32,0.3)",
            }}
          >
            {CTA_LABELS[step]}
            <ArrowRight style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </div>

      <div style={{ height: 32 }} />
    </div>
  );
}
