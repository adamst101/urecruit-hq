// TODO: Replace with real testimonials
import React from "react";

const QUOTES = [
  {
    text: "We were double-booked for two camps the same weekend before we found URecruit HQ. Now we plan the whole summer in one place.",
    attr: "— Parent of a 2026 QB prospect, Texas",
  },
  {
    text: "Finally a site with ONLY college camps. No wading through club showcases and trainer camps to find the real recruiting events.",
    attr: "— Parent of a 2027 WR prospect, Ohio",
  },
  {
    text: "The travel warning saved us from booking a camp in Florida the day after one in Oregon. Worth every penny.",
    attr: "— Parent of a 2026 OL prospect, Georgia",
  },
];

export default function TestimonialsSection() {
  return (
    <section style={{ background: "#0d1117", padding: "80px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 48,
            textAlign: "center",
            marginBottom: 48,
            color: "#f9fafb",
            letterSpacing: 1,
          }}
        >
          WHAT FAMILIES ARE SAYING
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 24,
          }}
        >
          {QUOTES.map((q, i) => (
            <div
              key={i}
              style={{
                background: "#111827",
                borderRadius: 16,
                borderTop: "3px solid #e8a020",
                padding: 28,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 64,
                  color: "#e8a020",
                  lineHeight: 0.6,
                  opacity: 0.6,
                }}
              >
                "
              </div>
              <p
                style={{
                  fontSize: 17,
                  fontStyle: "italic",
                  color: "#f9fafb",
                  lineHeight: 1.65,
                  margin: 0,
                  flex: 1,
                }}
              >
                "{q.text}"
              </p>
              <p
                style={{
                  fontSize: 14,
                  color: "#9ca3af",
                  margin: 0,
                }}
              >
                {q.attr}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}