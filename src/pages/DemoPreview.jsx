// src/pages/DemoPreview.jsx
// Command center reveal — first true app impression after DemoStory.
// Structured as: identity chip → headline → payoff → primary CTA → dominant card → explore section.
// Feels like arrival, not a tutorial.

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

// Curated demo screens available after this page
const EXPLORE_SCREENS = [
  {
    key: "discover",
    icon: "🔍",
    label: "Discover Camps",
    payoff: "Turn searching into a plan",
    route: "/Discover?demo=user&src=demo_preview",
  },
  {
    key: "calendar",
    icon: "📅",
    label: "Camp Calendar",
    payoff: "Make camp season less chaotic",
    route: "/Calendar?demo=user&src=demo_preview",
  },
  {
    key: "tracker",
    icon: "📊",
    label: "Recruiting Tracker",
    payoff: "Separate momentum from noise",
    route: "/RecruitingJourney?demo=user&src=demo_preview",
  },
];

export default function DemoPreview() {
  const nav = useNavigate();
  const [exploreOpen, setExploreOpen] = useState(false);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070c18",
      color: "#f1f5f9",
      fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');
        @media (max-width: 600px) {
          .dp-primary-cta { width: 100% !important; justify-content: center !important; }
          .dp-secondary-cta { width: 100% !important; justify-content: center !important; }
          .dp-cta-row { flex-direction: column !important; gap: 10px !important; }
          .dp-proof-row { grid-template-columns: repeat(2, 1fr) !important; }
          .dp-content { padding: 28px 20px 40px !important; }
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
            onClick={() => nav("/Signup?src=demo_preview")}
            style={{
              background: "#e8a020",
              color: "#0a0e1a",
              border: "none", borderRadius: 8,
              padding: "7px 16px",
              fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Start Free
          </button>
        </div>
      </div>

      <div
        className="dp-content"
        style={{
          maxWidth: 680, width: "100%",
          margin: "0 auto",
          padding: "36px 24px 48px",
          boxSizing: "border-box",
        }}
      >
        {/* ── Identity chip ── */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(232,160,32,0.07)",
          border: "1px solid rgba(232,160,32,0.2)",
          borderRadius: 6, padding: "4px 12px",
          marginBottom: 20,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#e8a020",
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            Sample Demo
          </span>
          <span style={{ color: "#374151", fontSize: 11 }}>·</span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            Marcus Johnson · WR · 2026 · Suwanee, GA
          </span>
        </div>

        {/* ── Headline ── */}
        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: "clamp(38px, 9vw, 60px)",
          color: "#f1f5f9",
          lineHeight: 1,
          letterSpacing: 1,
          margin: "0 0 12px",
        }}>
          Your Recruiting HQ
        </h1>

        {/* ── Payoff line ── */}
        <p style={{
          fontSize: 16, color: "#94a3b8", lineHeight: 1.6,
          margin: "0 0 28px", maxWidth: 480,
        }}>
          See camps, plans, and recruiting activity in one place.
        </p>

        {/* ── CTA row ── */}
        <div
          className="dp-cta-row"
          style={{
            display: "flex", gap: 12,
            marginBottom: 32, flexWrap: "wrap",
          }}
        >
          <button
            className="dp-primary-cta"
            onClick={() => nav("/Signup?src=demo_preview")}
            style={{
              background: "#e8a020",
              color: "#0a0e1a",
              border: "none", borderRadius: 9,
              padding: "14px 28px",
              fontSize: 15, fontWeight: 700,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 7,
              fontFamily: "inherit",
              boxShadow: "0 2px 18px rgba(232,160,32,0.35)",
            }}
          >
            Start Your Family's Workspace
            <ArrowRight style={{ width: 16, height: 16 }} />
          </button>
          <button
            className="dp-secondary-cta"
            onClick={() => setExploreOpen((v) => !v)}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid #1e2d45",
              borderRadius: 9, padding: "14px 22px",
              fontSize: 14, fontWeight: 600,
              color: "#94a3b8",
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "inherit",
            }}
          >
            Explore Marcus's Demo
            <ChevronDown
              style={{
                width: 14, height: 14,
                transform: exploreOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>
        </div>

        {/* ── Dominant payoff card — Marcus's Next Step ── */}
        <div style={{
          background: "linear-gradient(135deg, #0f1a2e 0%, #111827 100%)",
          border: "1px solid #e8a020",
          borderLeft: "5px solid #e8a020",
          borderRadius: 14,
          padding: "22px 22px 20px",
          marginBottom: 16,
          boxShadow: "0 4px 28px rgba(232,160,32,0.12)",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: "#e8a020",
            letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8,
          }}>
            Marcus's Next Step
          </div>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "clamp(22px, 5vw, 28px)",
            color: "#f9fafb", letterSpacing: 1, marginBottom: 10,
          }}>
            3 camps locked in
          </div>
          <p style={{
            fontSize: 14, color: "#9ca3af",
            margin: "0 0 16px", lineHeight: 1.65,
          }}>
            WKU, Tennessee, and Auburn are confirmed.
          </p>
          <div style={{
            background: "rgba(232,160,32,0.06)",
            border: "1px solid rgba(232,160,32,0.15)",
            borderRadius: 8, padding: "10px 14px",
            marginBottom: 18,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#6b7280",
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4,
            }}>
              Next
            </div>
            <div style={{ fontSize: 13, color: "#c0cad8", lineHeight: 1.5 }}>
              Compare schools and track coach activity.
            </div>
          </div>

          {/* Proof chips */}
          <div
            className="dp-proof-row"
            style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}
          >
            {[
              { value: "3", label: "Registered" },
              { value: "6", label: "Recruiting Signals" },
            ].map((chip) => (
              <div key={chip.label} style={{
                background: "rgba(0,0,0,0.3)",
                border: "1px solid #1e2d45",
                borderRadius: 8, padding: "10px 14px",
              }}>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 28, color: "#e8a020", lineHeight: 1,
                }}>
                  {chip.value}
                </div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                  {chip.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Explore section — revealed on demand ── */}
        {exploreOpen && (
          <div style={{ marginTop: 8 }}>
            <p style={{
              fontSize: 12, color: "#4b5563",
              textTransform: "uppercase", letterSpacing: "0.08em",
              fontWeight: 700, margin: "0 0 12px",
            }}>
              Explore Marcus's workspace
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {EXPLORE_SCREENS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => nav(s.route)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 14,
                    background: "rgba(14,22,40,0.7)",
                    border: "1px solid #1a2740",
                    borderRadius: 12, padding: "16px 18px",
                    cursor: "pointer", textAlign: "left",
                    fontFamily: "inherit", width: "100%",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontSize: 22 }}>{s.icon}</span>
                    <div>
                      <div style={{
                        fontSize: 14, fontWeight: 700, color: "#e8edf3",
                        marginBottom: 3,
                      }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize: 12, color: "#5d6f84" }}>
                        {s.payoff}
                      </div>
                    </div>
                  </div>
                  <ArrowRight style={{ width: 14, height: 14, color: "#4b5563", flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Below-fold: small print ── */}
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid #0f1a2b" }}>
          <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.6, margin: 0 }}>
            This is a pre-populated demo using a fictional athlete — Marcus Johnson, WR,
            Class of 2026. Real platform, synthetic data.{" "}
            <span style={{ color: "#4b5563" }}>No account needed to explore.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
