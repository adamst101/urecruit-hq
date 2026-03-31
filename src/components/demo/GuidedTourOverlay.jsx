// src/components/demo/GuidedTourOverlay.jsx
// Guided tour overlay rendered on Marcus demo pages when ?tour=<key> is present.
//
// Desktop: fixed top-right (top: 68px) beneath the app header.
// Mobile:  full-width bottom sheet.
// z-index: 50000 — sits above Support button (z-9999) and BottomNav (z-40).

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
      "This was Marcus's family's first step. Before exploring camps or tracking outreach, they built a foundation here — position, grad year, and the basics the rest of the journey would build on.",
    nextKey: "playbook",
    nextLabel: "The Playbook",
    nextPath: "/KnowledgeBase",
  },
  {
    key: "playbook",
    stepNum: 2,
    title: "The Playbook",
    message:
      "With a profile in place, his family came here to understand how recruiting actually works. The Playbook helped them figure out what to do, when to do it, and why it matters.",
    nextKey: "discover",
    nextLabel: "Discover Camps",
    nextPath: "/Discover",
  },
  {
    key: "discover",
    stepNum: 3,
    title: "Discover Camps",
    message:
      "Once they understood the process, they used this page to find and compare camp options. This is where the camp plan started to take shape — which schools, which dates, which divisions.",
    nextKey: "mycamps",
    nextLabel: "My Camps",
    nextPath: "/MyCamps",
  },
  {
    key: "mycamps",
    stepNum: 4,
    title: "My Camps",
    message:
      "As they saved and registered for camps, this became their running list. Everything in one place — what was locked in, what was still under consideration, and what had already happened.",
    nextKey: "calendar",
    nextLabel: "My Calendar",
    nextPath: "/Calendar",
  },
  {
    key: "calendar",
    stepNum: 5,
    title: "My Calendar",
    message:
      "A clearer picture of timing. They checked this page to see how the camp season was laid out, review specific dates, and make sure nothing overlapped.",
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

// Clears the app header (~60px) with a comfortable visual gap.
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

  // ── Dismissed: small amber pill in same top-right position ───────────────────
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
            fontSize: 12.5,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 4px 24px rgba(232,160,32,0.35), 0 2px 10px rgba(0,0,0,0.4)",
            fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          Resume Tour: {step.stepNum} of {TOTAL}
          <ArrowRight style={{ width: 13, height: 13 }} />
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
            border-radius: 20px 20px 0 0 !important;
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
          width: 348,
          maxWidth: "calc(100vw - 40px)",
          // Noticeably lighter than dark page backgrounds (#070c18, #0f172a)
          background: "#0f2035",
          border: "1px solid rgba(232,160,32,0.5)",
          borderRadius: 16,
          boxShadow: [
            "0 16px 48px rgba(0,0,0,0.7)",
            "0 0 0 1px rgba(232,160,32,0.12)",
            "0 0 40px rgba(232,160,32,0.1)",
          ].join(", "),
          fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
          overflow: "hidden",
        }}
      >
        {/* ── Top amber accent strip ── */}
        <div
          style={{
            height: 4,
            background: "linear-gradient(90deg, #e8a020 0%, #f5b830 100%)",
          }}
        />

        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "11px 16px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(232,160,32,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#e8a020",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}
            >
              Marcus's Journey
            </span>
            {/* Step pip strip */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {TOUR_STEPS.map((s) => (
                <div
                  key={s.key}
                  style={{
                    width: s.key === tourKey ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    background:
                      s.key === tourKey
                        ? "#e8a020"
                        : s.stepNum < step.stepNum
                        ? "#2e4060"
                        : "#16243a",
                    transition: "all 0.2s ease",
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 10, color: "#4e6685", fontWeight: 500 }}>
              {step.stepNum} of {TOTAL}
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: "none",
              border: "none",
              color: "#4e6685",
              cursor: "pointer",
              padding: "2px 0 2px 8px",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Dismiss guided tour"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "16px 18px 18px" }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#ffffff",
              marginBottom: 9,
              lineHeight: 1.28,
            }}
          >
            {step.title}
          </div>
          <div
            style={{
              fontSize: 13.5,
              color: "#8faabe",
              lineHeight: 1.7,
              marginBottom: 18,
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
                color: "#3e5470",
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
                padding: "10px 18px",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 12px rgba(232,160,32,0.4)",
              }}
            >
              {step.nextKey ? `Next: ${step.nextLabel}` : "Explore Freely"}
              <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {/* ── Bottom progress bar ── */}
        <div style={{ height: 3, background: "#081018" }}>
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
