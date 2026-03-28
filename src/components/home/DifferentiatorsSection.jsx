// src/components/home/DifferentiatorsSection.jsx
import React from "react";

const CARD_BASE = {
  background: "#111827",
  borderRadius: 16,
  padding: 32,
  display: "flex",
  flexDirection: "column",
  gap: 0,
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
  cursor: "default",
};

function DiffCard({ borderColor, emoji, title, body, children }) {
  return (
    <div
      className="diff-card"
      style={{
        ...CARD_BASE,
        borderTop: `4px solid ${borderColor}`,
      }}
    >
      <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 20 }}>{emoji}</div>
      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 28,
          color: "#f9fafb",
          lineHeight: 1.1,
          letterSpacing: 1,
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontSize: 15,
          color: "#9ca3af",
          lineHeight: 1.7,
          margin: 0,
          flex: 1,
        }}
      >
        {body}
      </p>
      <div style={{ marginTop: 24 }}>{children}</div>
    </div>
  );
}

export default function DifferentiatorsSection({ campDisplay, schoolDisplay }) {
  return (
    <section className="diff-section" style={{ background: "#0a0e1a", padding: "80px 24px" }}>
      <style>{`
        .diff-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.4);
        }
        @media (max-width: 768px) {
          .diff-cards-grid {
            grid-template-columns: 1fr !important;
          }
          .diff-section {
            padding: 48px 20px !important;
          }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 16,
              letterSpacing: 3,
              color: "#e8a020",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            WHY URECRUIT HQ
          </div>
          <h2
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: "clamp(36px, 5vw, 48px)",
              color: "#f9fafb",
              lineHeight: 1.05,
              margin: 0,
              letterSpacing: 1,
            }}
          >
            Turn the goal of playing in college
            <br />
            into a smarter plan.
          </h2>
          <p style={{ fontSize: 18, color: "#9ca3af", maxWidth: 600, margin: "12px auto 0", lineHeight: 1.6 }}>
            URecruit HQ helps football families move from guesswork and scattered effort to more structure, better visibility, and clearer next steps.
          </p>
        </div>

        {/* Cards grid */}
        <div
          className="diff-cards-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 24,
          }}
        >
          {/* Card 1 */}
          <DiffCard
            borderColor="#e8a020"
            emoji="🏟️"
            title="FIND THE RIGHT COLLEGE FOOTBALL CAMPS"
            body="Search verified college football camps across divisions, updated weekly from official school sites."
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(232,160,32,0.15)",
                border: "1px solid rgba(232,160,32,0.4)",
                color: "#fcd34d",
                fontSize: 13,
                fontWeight: 700,
                padding: "6px 14px",
                borderRadius: 20,
              }}
            >
              ✓ Football available now
            </span>
          </DiffCard>

          {/* Card 2 */}
          <DiffCard
            borderColor="#3b82f6"
            emoji="📅"
            title="STAY ORGANIZED AS THE PROCESS GROWS"
            body="Keep dates, favorites, registrations, and schedule conflicts in one place instead of trying to manage everything through notes, tabs, and memory."
          >
            <div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(239,68,68,0.15)",
                  border: "1px solid rgba(239,68,68,0.4)",
                  color: "#fca5a5",
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "6px 14px",
                  borderRadius: 20,
                }}
              >
                ⚠️ Avoid overlap and missed dates
              </span>
            </div>
          </DiffCard>

          {/* Card 3 */}
          <DiffCard
            borderColor="#10b981"
            emoji="📚"
            title="SUPPORT YOUR ATHLETE WITH BETTER DECISIONS"
            body="Use practical recruiting guidance to understand timing, camp strategy, and what matters next — without guessing."
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(16,185,129,0.15)",
                border: "1px solid rgba(16,185,129,0.4)",
                color: "#6ee7b7",
                fontSize: 13,
                fontWeight: 700,
                padding: "6px 14px",
                borderRadius: 20,
              }}
            >
              ✓ Included with Season Pass
            </span>
          </DiffCard>
        </div>
      </div>
    </section>
  );
}
