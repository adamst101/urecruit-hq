// src/components/demo/GuidedTourOverlay.jsx
// Lightweight guided tour overlay rendered on demo pages when ?tour=<key> is present.
// Renders as a fixed bottom-right card on desktop and a bottom sheet on mobile.
// Self-contained: reads URL params and handles all tour navigation internally.

import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";

// ── Tour sequence definition ───────────────────────────────────────────────────
// Each entry maps a tour key (in ?tour=xxx) to its page, copy, and next step.
const TOUR_STEPS = [
  {
    key: "profile",
    stepNum: 1,
    title: "Athlete Profile",
    message:
      "This was Marcus's family's first step. They used Athlete Profile to organize his core information and create a foundation for the journey.",
    nextKey: "playbook",
    nextLabel: "The Playbook",
    nextPath: "/KnowledgeBase",
  },
  {
    key: "playbook",
    stepNum: 2,
    title: "The Playbook",
    message:
      "This is where Marcus and his family learned how recruiting works, what matters, and what to do next.",
    nextKey: "discover",
    nextLabel: "Discover Camps",
    nextPath: "/Discover",
  },
  {
    key: "discover",
    stepNum: 3,
    title: "Discover Camps",
    message:
      "This is where they explored camp options, compared schools, and built a more intentional camp plan.",
    nextKey: "mycamps",
    nextLabel: "My Camps",
    nextPath: "/MyCamps",
  },
  {
    key: "mycamps",
    stepNum: 4,
    title: "My Camps",
    message:
      "This is where they tracked saved camps and registrations in one place.",
    nextKey: "calendar",
    nextLabel: "My Calendar",
    nextPath: "/Calendar",
  },
  {
    key: "calendar",
    stepNum: 5,
    title: "My Calendar",
    message:
      "This is where they reviewed dates, timing, and scheduling across the season.",
    nextKey: "tracker",
    nextLabel: "Recruiting Tracker",
    nextPath: "/RecruitingJourney",
  },
  {
    key: "tracker",
    stepNum: 6,
    title: "Recruiting Tracker",
    message:
      "This is where they tracked activity over time, from likes and DMs to camp conversations, texts, phone calls, and more meaningful recruiting movement.",
    nextKey: null,
    nextLabel: "Explore Freely",
    nextPath: "/Workspace",
  },
];

const TOTAL = TOUR_STEPS.length;

export default function GuidedTourOverlay({ tourKey }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [dismissed, setDismissed] = useState(false);

  // Only activate when the URL's tour param matches this page's key
  const tourParam = new URLSearchParams(loc.search).get("tour");
  if (tourParam !== tourKey) return null;

  const step = TOUR_STEPS.find((s) => s.key === tourKey);
  if (!step) return null;

  function goNext() {
    if (step.nextKey) {
      nav(`${step.nextPath}?demo=user&tour=${step.nextKey}&src=demo_story`);
    } else {
      nav("/Workspace?demo=user&src=demo_story");
    }
  }

  function skipTour() {
    nav("/Workspace?demo=user&src=demo_story_skip");
  }

  // Dismissed state: show a small amber pill so the user can resume
  if (dismissed) {
    return (
      <>
        <style>{`
          @media (max-width: 520px) {
            .dt-pill { bottom: 76px !important; right: 16px !important; }
          }
        `}</style>
        <button
          className="dt-pill"
          onClick={() => setDismissed(false)}
          style={{
            position: "fixed",
            bottom: 88,
            right: 20,
            zIndex: 9999,
            background: "#e8a020",
            color: "#0a0e1a",
            border: "none",
            borderRadius: 24,
            padding: "8px 14px 8px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            boxShadow: "0 4px 20px rgba(0,0,0,0.45)",
            fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          Tour: {step.stepNum} of {TOTAL}
          <ArrowRight style={{ width: 12, height: 12 }} />
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`
        @media (max-width: 520px) {
          .dt-card {
            bottom: 0 !important;
            right: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            border-radius: 16px 16px 0 0 !important;
          }
        }
      `}</style>
      <div
        className="dt-card"
        style={{
          position: "fixed",
          bottom: 24,
          right: 20,
          zIndex: 9999,
          width: 292,
          maxWidth: "calc(100vw - 40px)",
          background: "#0b1628",
          border: "1px solid rgba(232,160,32,0.3)",
          borderRadius: 14,
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(232,160,32,0.06)",
          fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px 9px",
            borderBottom: "1px solid #1e2d45",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: "#e8a020",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Marcus's Journey
            </span>
            {/* Step progress dots */}
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              {TOUR_STEPS.map((s) => (
                <div
                  key={s.key}
                  style={{
                    width: s.key === tourKey ? 14 : 5,
                    height: 5,
                    borderRadius: 3,
                    background:
                      s.key === tourKey
                        ? "#e8a020"
                        : s.stepNum < step.stepNum
                        ? "#374151"
                        : "#1a2535",
                    transition: "all 0.2s ease",
                  }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: "none",
              border: "none",
              color: "#4b5563",
              cursor: "pointer",
              padding: 2,
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Dismiss guided tour"
          >
            <X style={{ width: 13, height: 13 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "13px 14px 14px" }}>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: "#f9fafb",
              marginBottom: 6,
            }}
          >
            {step.title}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "#9ca3af",
              lineHeight: 1.62,
              marginBottom: 14,
            }}
          >
            {step.message}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={skipTour}
              style={{
                background: "none",
                border: "none",
                color: "#4b5563",
                fontSize: 11.5,
                cursor: "pointer",
                padding: 0,
                fontFamily: "inherit",
                flexShrink: 0,
              }}
            >
              Skip tour
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={goNext}
              style={{
                background: "#e8a020",
                color: "#0a0e1a",
                border: "none",
                borderRadius: 8,
                padding: "8px 13px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              {step.nextKey ? `Next: ${step.nextLabel}` : "Explore Freely"}
              <ArrowRight style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>

        {/* Bottom progress bar */}
        <div style={{ height: 3, background: "#070c18" }}>
          <div
            style={{
              height: "100%",
              width: `${(step.stepNum / TOTAL) * 100}%`,
              background: "#e8a020",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>
    </>
  );
}
