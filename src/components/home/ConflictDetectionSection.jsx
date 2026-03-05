import React from "react";

const WARNING_ROWS = [
  {
    borderColor: "#ef4444",
    icon: "🔴",
    title: "SAME-DAY CONFLICTS",
    badge: "CONFLICT",
    badgeBg: "#ef4444",
    desc: "Instant alert when two favorited camps fall on the same date.",
    // mock card row
    mockTitle: "Date Conflict",
    mockLine1: "Ohio State Elite Camp and Alabama Prospect Day are both on June 14th.",
    mockLine2: "You can only attend one.",
  },
  {
    borderColor: "#e8a020",
    icon: "✈️",
    title: "BACK-TO-BACK TRAVEL",
    badge: "TRAVEL ALERT",
    badgeBg: "#e8a020",
    desc: "Warns you when camps are too close together and too far apart — flagging trips that need a flight and hotel.",
    mockTitle: "Flight + Hotel Likely",
    mockLine1: "Penn State Camp (July 5, PA) is 1 day after Alabama Camp (July 4, AL).",
    mockLine2: "~870 miles apart — plan for travel.",
  },
  {
    borderColor: "#3b82f6",
    icon: "🏠",
    title: "TOO FAR FROM HOME",
    badge: "PLAN AHEAD",
    badgeBg: "#3b82f6",
    desc: "Flags overnight trips based on your home location so you can plan and budget ahead.",
    mockTitle: "Overnight Stay",
    mockLine1: "USC Camp is ~1,450 miles from your home location.",
    mockLine2: "Consider booking a hotel in advance.",
  },
];

export default function ConflictDetectionSection() {
  return (
    <section style={{ position: "relative", background: "#0a0e1a", padding: "0 0 80px", overflow: "hidden" }}>
      {/* Diagonal top divider */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 60,
          overflow: "hidden",
          background: "#0a0e1a",
        }}
      >
        <svg
          viewBox="0 0 1440 60"
          preserveAspectRatio="none"
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        >
          <polygon points="0,0 1440,0 1440,20 0,60" fill="#0a0e1a" />
          <line x1="0" y1="60" x2="1440" y2="20" stroke="#1f2937" strokeWidth="1" />
        </svg>
      </div>

      <style>{`
        @keyframes pulse-border-cd {
          0%, 100% { box-shadow: 0 0 0 0 rgba(232,160,32,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(232,160,32,0); }
        }
        @keyframes slide-in-cd {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cd-mock-card { animation: pulse-border-cd 2s ease-in-out infinite; }
        .cd-row-0 { animation: slide-in-cd 0.5s ease-out 0.1s both; }
        .cd-row-1 { animation: slide-in-cd 0.5s ease-out 0.2s both; }
        .cd-row-2 { animation: slide-in-cd 0.5s ease-out 0.3s both; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 56,
            alignItems: "start",
          }}
          className="cd-grid"
        >
          {/* ── LEFT COLUMN ── */}
          <div>
            {/* Eyebrow */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 3, height: 22, background: "#e8a020", borderRadius: 2 }} />
              <span
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 16,
                  letterSpacing: 3,
                  color: "#e8a020",
                  textTransform: "uppercase",
                }}
              >
                Smart Conflict Detection
              </span>
            </div>

            {/* Headline */}
            <h2
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: "clamp(40px, 6vw, 56px)",
                lineHeight: 1,
                margin: 0,
                color: "#f9fafb",
                letterSpacing: 1,
              }}
            >
              NEVER DOUBLE-BOOK
              <br />
              A CAMP AGAIN.
            </h2>

            {/* Subhead */}
            <p style={{ fontSize: 16, color: "#9ca3af", lineHeight: 1.65, marginTop: 16, maxWidth: 480 }}>
              URecruit HQ automatically warns you before you make a scheduling mistake — so you can
              build the perfect recruiting sequence without the guesswork.
            </p>

            {/* Feature bullets */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 32 }}>
              {WARNING_ROWS.map((w) => (
                <div key={w.title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "rgba(232,160,32,0.12)",
                      border: "1px solid rgba(232,160,32,0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    {w.icon}
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        fontSize: 16,
                        letterSpacing: 2,
                        color: "#e8a020",
                        textTransform: "uppercase",
                      }}
                    >
                      {w.title}
                    </div>
                    <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.55, marginTop: 4 }}>
                      {w.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pull quote */}
            <div
              style={{
                marginTop: 36,
                paddingLeft: 20,
                borderLeft: "4px solid #e8a020",
              }}
            >
              <p
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: "clamp(24px, 3vw, 32px)",
                  color: "#f9fafb",
                  lineHeight: 1.15,
                  margin: 0,
                  letterSpacing: 0.5,
                }}
              >
                "OTHER TOOLS SHOW YOU CAMPS.
                <br />
                WE SHOW YOU WHICH ONES YOU CAN ACTUALLY DO."
              </p>
            </div>
          </div>

          {/* ── RIGHT COLUMN — Mock warning card ── */}
          <div className="cd-right-col" style={{ paddingTop: 8 }}>
            <div
              className="cd-mock-card"
              style={{
                background: "#111827",
                border: "1px solid rgba(232,160,32,0.5)",
                borderRadius: 16,
                padding: "28px 24px",
                position: "relative",
                minWidth: 380,
              }}
            >
              {/* Card header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 20,
                  paddingBottom: 16,
                  borderBottom: "1px solid #1f2937",
                }}
              >
                <span style={{ fontSize: 20 }}>⚠️</span>
                <span
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 20,
                    letterSpacing: 1,
                    color: "#f9fafb",
                  }}
                >
                  Scheduling Conflicts Detected
                </span>
              </div>

              {/* Warning rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {WARNING_ROWS.map((w, i) => (
                  <div
                    key={w.badge}
                    className={`cd-row-${i}`}
                    style={{
                      borderLeft: `3px solid ${w.borderColor}`,
                      paddingLeft: 16,
                      paddingTop: 6,
                      paddingBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{w.icon}</span>
                        <span
                          style={{ fontWeight: 700, fontSize: 15, color: "#f9fafb" }}
                        >
                          {w.mockTitle}
                        </span>
                      </div>
                      <span
                        style={{
                          background: w.badgeBg,
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 20,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {w.badge}
                      </span>
                    </div>
                    <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.5, marginTop: 6, marginBottom: 0 }}>
                      {w.mockLine1}
                    </p>
                    <p
                      style={{
                        fontSize: 13,
                        color: "#6b7280",
                        lineHeight: 1.4,
                        marginTop: 3,
                        marginBottom: 0,
                        fontStyle: "italic",
                      }}
                    >
                      {w.mockLine2}
                    </p>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: "1px solid #1f2937",
                }}
              >
                <button
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "1px solid #374151",
                    color: "#f9fafb",
                    borderRadius: 8,
                    padding: "10px 16px",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "default",
                  }}
                >
                  Remove Conflict
                </button>
                <button
                  style={{
                    flex: 1,
                    background: "#e8a020",
                    border: "none",
                    color: "#0a0e1a",
                    borderRadius: 8,
                    padding: "10px 16px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "default",
                  }}
                >
                  Keep Both
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Responsive: stack on mobile */}
      <style>{`
        @media (max-width: 768px) {
          .cd-grid {
            grid-template-columns: 1fr !important;
            gap: 36px !important;
          }
        }
      `}</style>
    </section>
  );
}