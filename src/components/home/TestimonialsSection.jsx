import React from "react";

const SCENARIOS = [
  {
    icon: "📅",
    heading: "Double-booked two camps the same weekend.",
    body: "Two different schools, same Saturday. One registration fee wasted, one relationship with a coaching staff awkward. URecruit HQ flags overlaps before you commit.",
  },
  {
    icon: "🔍",
    heading: "Spent hours searching school websites for camp dates.",
    body: "Every program posts on a different page, in a different format, on a different schedule. Some don't post at all until two weeks out. We pull it all into one list, updated every Monday.",
  },
  {
    icon: "✈️",
    heading: "Almost booked a camp in Florida the day after one in Oregon.",
    body: "The travel math didn't hit until the credit card was out. URecruit HQ warns you when back-to-back camps require a flight — before you register for the wrong ones.",
  },
];

export default function TestimonialsSection() {
  return (
    <section style={{ background: "#f9fafb", padding: "80px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            display: "inline-block",
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 15, letterSpacing: 3,
            color: "#e8a020", textTransform: "uppercase", marginBottom: 12,
          }}>
            FOR RECRUITING FAMILIES
          </div>
          <h2 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "clamp(36px, 5vw, 48px)",
            color: "#0a0e1a",
            margin: 0,
            letterSpacing: 1,
            lineHeight: 1.05,
          }}>
            SOUND FAMILIAR?
          </h2>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 24,
        }}>
          {SCENARIOS.map((s, i) => (
            <div
              key={i}
              style={{
                background: "#ffffff",
                borderRadius: 16,
                borderTop: "3px solid #e8a020",
                padding: 28,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
              }}
            >
              <div style={{ fontSize: 32, lineHeight: 1 }}>{s.icon}</div>
              <p style={{
                fontSize: 17,
                fontWeight: 700,
                color: "#111827",
                lineHeight: 1.4,
                margin: 0,
              }}>
                {s.heading}
              </p>
              <p style={{
                fontSize: 15,
                color: "#6b7280",
                lineHeight: 1.65,
                margin: 0,
                flex: 1,
              }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
