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
    <section style={{ background: "#0a0e1a", padding: "80px 24px" }}>
      <style>{`
        .diff-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.4);
        }
        @media (max-width: 768px) {
          .diff-cards-grid {
            grid-template-columns: 1fr !important;
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
            EVERYTHING IN ONE PLACE.
            <br />
            NOTHING LEFT OUT.
          </h2>
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
          {/* Card 1 — Data */}
          <DiffCard
            borderColor="#e8a020"
            emoji="🏟️"
            title="750+ CAMPS. EVERY DIVISION."
            body="Every college football camp from FBS to JUCO — in one searchable list. Updated every Monday. No club camps. No noise."
          >
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 32,
                color: "#e8a020",
                lineHeight: 1.1,
              }}
            >
              {campDisplay} camps · {schoolDisplay} programs
            </div>
          </DiffCard>

          {/* Card 2 — Conflicts */}
          <DiffCard
            borderColor="#3b82f6"
            emoji="📅"
            title="NEVER DOUBLE-BOOK AGAIN."
            body="URecruit HQ flags scheduling conflicts automatically and warns you when back-to-back camps require overnight travel — before you register for the wrong ones."
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
                ⚠️ Conflict — Jun 14 &amp; Jun 15
              </span>
              <p
                style={{
                  fontSize: 13,
                  color: "#6b7280",
                  marginTop: 8,
                  marginBottom: 0,
                  lineHeight: 1.5,
                }}
              >
                TCU Horned Frogs overlaps with SMU Mustangs
              </p>
            </div>
          </DiffCard>

          {/* Card 3 — Playbook */}
          <DiffCard
            borderColor="#10b981"
            emoji="📚"
            title="THE RECRUITING PLAYBOOK."
            body="Included with your Season Pass: NCAA rules, permissible dates, offer breakdowns, DM templates, and film strategy — everything coaches expect families to know."
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
              ✓ Included in Season Pass
            </span>
          </DiffCard>
        </div>
      </div>
    </section>
  );
}