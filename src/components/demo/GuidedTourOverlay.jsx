// src/components/demo/GuidedTourOverlay.jsx
// Lightweight guided tour overlay rendered on demo pages when ?tour=<key> is present.
//
// Desktop: fixed top-right beneath the app header, clear of the Support button.
// Mobile:  full-width bottom sheet (bottom: 0).
// z-index: 50000 — guaranteed above Support button (z-9999) and BottomNav.

import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";

// ── Tour sequence ──────────────────────────────────────────────────────────────
const TOUR_STEPS = [
  {
    key: "profile",
    stepNum: 1,
    title: "Athlete Profile",
    message:
      "This was Marcus's family's first step. Before exploring camps or tracking outreach, they built a foundation here — position, grad year, and the basics that everything else would build on.",
    nextKey: "playbook",
    nextLabel: "The Playbook",
    nextPath: "/KnowledgeBase",
  },
  {
    key: "playbook",
    stepNum: 2,
    title: "The Playbook",
    message:
      "Once Marcus's profile was set, his family came here to understand how recruiting actually works. The Playbook helped them figure out what to do, when to do it, and why it matters.",
    nextKey: "discover",
    nextLabel: "Discover Camps",
    nextPath: "/Discover",
  },
  {
    key: "discover",
    stepNum: 3,
    title: "Discover Camps",
    message:
      "With a better sense of the process, they used this page to find and compare camp options. This is where the camp plan started to take shape — which schools, which dates, which divisions.",
    nextKey: "mycamps",
    nextLabel: "My Camps",
    nextPath: "/MyCamps",
  },
  {
    key: "mycamps",
    stepNum: 4,
    title: "My Camps",
    message:
      "As they saved and registered for camps, this became their running list. Everything in one place — what was locked in, what was still being considered, and what had already happened.",
    nextKey: "calendar",
    nextLabel: "My Calendar",
    nextPath: "/Calendar",
  },
  {
    key: "calendar",
    stepNum: 5,
    title: "My Calendar",
    message:
      "A clearer picture of timing. They checked this page to see how the camp season was stacking up, review specific dates, and make sure nothing conflicted.",
    nextKey: "tracker",
    nextLabel: "Recruiting Tracker",
    nextPath: "/RecruitingJourney",
  },
  {
    key: "tracker",
    stepNum: 6,
    title: "Recruiting Tracker",
    message:
      "As recruiting activity started to happen, this is where they tracked what it meant. From early follows and DMs to phone calls and personal invites — everything logged and visible over time.",
    nextKey: null,
    nextLabel: "Explore Freely",
    nextPath: "/Workspace",
  },
];

const TOTAL = TOUR_STEPS.length;

// Layout header is ~60px tall; top offset clears it with a small gap.
const TOP_OFFSET = 68;

export default function GuidedTourOverlay({ tourKey }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [dismissed, setDismissed] = useState(false);

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

  // ── Dismissed: small amber pill in the same top-right position ───────────────
  if (dismissed) {
    return (
      <>
        <style>{`
          @media (max-width: 520px) {
            .dt-pill {
              top: auto !important;
              bottom: 80px !important;
              right: 16px !important;
            }
          }
        `}</style>
        <button
          className="dt-pill"
          onClick={() => setDismissed(false)}
          style={{
            position: "fixed",
            top: TOP_OFFSET,
            right: 20,
            zIndex: 50000,
            background: "#e8a020",
            color: "#0a0e1a",
            border: "none",
            borderRadius: 24,
            padding: "8px 15px 8px 13px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          Resume Tour: {step.stepNum} of {TOTAL}
          <ArrowRight style={{ width: 12, height: 12 }} />
        </button>
      </>
    );
  }

  // ── Full overlay card ────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @media (max-width: 520px) {
          .dt-card {
            top: auto !important;
            bottom: 0 !important;
            right: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            border-radius: 18px 18px 0 0 !important;
          }
        }
      `}</style>
      <div
        className="dt-card"
        style={{
          position: "fixed",
          top: TOP_OFFSET,
          right: 20,
          zIndex: 50000,
          width: 340,
          maxWidth: "calc(100vw - 40px)",
          background: "#0c1729",
          border: "1px solid rgba(232,160,32,0.32)",
          borderRadius: 16,
          boxShadow:
            "0 12px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(232,160,32,0.07)",
          fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px 11px",
            borderBottom: "1px solid #1a2d47",
            background: "rgba(232,160,32,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#e8a020",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Marcus's Journey
            </span>
            {/* Step progress pip strip */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {TOUR_STEPS.map((s) => (
                <div
                  key={s.key}
                  style={{
                    width: s.key === tourKey ? 16 : 6,
                    height: 6,
                    borderRadius: 3,
                    background:
                      s.key === tourKey
                        ? "#e8a020"
                        : s.stepNum < step.stepNum
                        ? "#2e3f55"
                        : "#151f30",
                    transition: "all 0.2s ease",
                  }}
                />
              ))}
            </div>
            <span
              style={{
                fontSize: 10,
                color: "#4b6080",
                fontWeight: 500,
              }}
            >
              {step.stepNum} of {TOTAL}
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: "none",
              border: "none",
              color: "#4b6080",
              cursor: "pointer",
              padding: "2px 0 2px 6px",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Dismiss guided tour"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "15px 18px 17px" }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#f1f5f9",
              marginBottom: 8,
              lineHeight: 1.3,
            }}
          >
            {step.title}
          </div>
          <div
            style={{
              fontSize: 13.5,
              color: "#8fa3be",
              lineHeight: 1.68,
              marginBottom: 16,
            }}
          >
            {step.message}
          </div>

          {/* ── Actions ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={skipTour}
              style={{
                background: "none",
                border: "none",
                color: "#4b6080",
                fontSize: 12,
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
                borderRadius: 9,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              {step.nextKey ? `Next: ${step.nextLabel}` : "Explore Freely"}
              <ArrowRight style={{ width: 13, height: 13 }} />
            </button>
          </div>
        </div>

        {/* ── Bottom progress bar ── */}
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
