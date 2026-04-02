// src/components/demo/DemoPreviewStrip.jsx
// Lightweight top strip shown on curated demo screens when arriving from DemoPreview.
// Replaces the full GuidedTourOverlay in the demo_preview funnel.
// Very low visual mass — lets the product carry the value.

import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function DemoPreviewStrip({ payoff, nextRoute, nextLabel }) {
  const nav = useNavigate();

  return (
    <>
      <style>{`
        @media (max-width: 600px) {
          .dp-strip-inner {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 10px !important;
            padding: 12px 16px !important;
          }
          .dp-strip-cta {
            width: 100% !important;
            justify-content: center !important;
          }
        }
      `}</style>
      <div style={{
        background: "rgba(14,20,36,0.97)",
        borderBottom: "1px solid rgba(232,160,32,0.2)",
        position: "sticky",
        top: 0,
        zIndex: 40,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}>
        <div
          className="dp-strip-inner"
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "11px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, color: "#e8a020",
              textTransform: "uppercase", letterSpacing: "0.12em",
              flexShrink: 0,
            }}>
              Marcus's Demo
            </span>
            <span style={{ color: "#1e2d45", fontSize: 12 }}>·</span>
            <span style={{ fontSize: 13, color: "#64748b", lineHeight: 1.4 }}>
              {payoff}
            </span>
          </div>
          <button
            className="dp-strip-cta"
            onClick={() => nav(nextRoute)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "#e8a020",
              color: "#0a0e1a",
              border: "none", borderRadius: 7,
              padding: "8px 16px",
              fontSize: 12.5, fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {nextLabel}
            <ArrowRight style={{ width: 12, height: 12 }} />
          </button>
        </div>
      </div>
    </>
  );
}
