import React from "react";
import { ArrowRight } from "lucide-react";

export default function FooterCTA({ onTryDemo, onSubscribe }) {
  return (
    <section style={{ background: "#0a0e1a", padding: "80px 24px", textAlign: "center" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <h2
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: "clamp(36px, 5vw, 48px)",
            color: "#f9fafb",
            lineHeight: 1,
            marginBottom: 32,
            letterSpacing: 1,
          }}
        >
          READY TO BUILD THE
          <br />
          PERFECT CAMP SEQUENCE?
        </h2>

        <div
          style={{
            display: "flex",
            gap: 14,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={onTryDemo}
            style={{
              background: "#e8a020",
              color: "#0a0e1a",
              border: "none",
              borderRadius: 10,
              padding: "16px 32px",
              fontSize: 18,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            Start Free Demo <ArrowRight style={{ width: 18, height: 18, marginLeft: 6 }} />
          </button>
          <button
            onClick={onSubscribe}
            style={{
              background: "transparent",
              color: "#f9fafb",
              border: "2px solid #ffffff",
              borderRadius: 10,
              padding: "16px 32px",
              fontSize: 18,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "#0a0e1a"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#f9fafb"; }}
          >
            Subscribe — $49
          </button>
        </div>

        <p style={{ fontSize: 14, color: "#9ca3af", marginTop: 20 }}>
          No credit card required for demo
        </p>
      </div>
    </section>
  );
}