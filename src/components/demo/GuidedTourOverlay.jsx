// src/components/demo/GuidedTourOverlay.jsx
// Guided tour overlay rendered on Marcus demo pages when ?tour=<key> is present.
//
// Visual style: matches the Home page WhyPanel (light card on dark pages).
//   Background: #f1f5f9  |  Border: 1.5px #e2e8f0  |  Shadow: deep neutral
//   Typography: #0f172a title / #475569 body / #94a3b8 labels
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
    title: "Marcus's Athlete Profile",
    message:
      "This is Marcus Johnson — WR, Class of 2026, from Suwanee, GA. His family started right here. Before camps, before coaches, they locked in the basics: position, grad year, size, hometown. Everything that follows builds on this.",
    hint: "Scroll down to see the full profile. In your account, this is where you'd enter your athlete's real information.",
    nextKey: "playbook",
    nextLabel: "Recruiting Playbook",
    nextPath: "/KnowledgeBase",
  },
  {
    key: "playbook",
    stepNum: 2,
    title: "The Playbook",
    message:
      "Before diving into camps, Marcus's parents spent time here. The Playbook broke down how recruiting actually works — what happens when, and what families can control.",
    hint: "Take a minute to read the Recruiting Timeline and Building Your Camp Strategy.",
    nextKey: "discover",
    nextLabel: "Discover Camps",
    nextPath: "/Discover",
  },
  {
    key: "discover",
    stepNum: 3,
    title: "Discover Camps",
    message:
      "Armed with a plan, they came here to find camps. Filter by division, state, or sport — then save the ones worth a closer look.",
    hint: "You can browse and favorite camps. Registration is available to Season Pass members.",
    nextKey: "mycamps",
    nextLabel: "My Camps",
    nextPath: "/MyCamps",
  },
  {
    key: "mycamps",
    stepNum: 4,
    title: "My Camps",
    message:
      "The camps Marcus's family saved and registered for all landed here. One running list — what's locked in, what's under consideration, what's already happened.",
    hint: "This page shows Marcus's saved and registered camps. Yours will reflect your athlete's real camp activity.",
    nextKey: "calendar",
    nextLabel: "My Calendar",
    nextPath: "/Calendar",
  },
  {
    key: "calendar",
    stepNum: 5,
    title: "My Calendar",
    message:
      "With multiple camps on the list, the calendar became essential. They used this to check timing, avoid conflicts, and see the season at a glance.",
    hint: "Tap any date to see what's scheduled. Color coding shows camp status at a glance.",
    nextKey: "tracker",
    nextLabel: "Recruiting Tracker",
    nextPath: "/RecruitingJourney",
  },
  {
    key: "tracker",
    stepNum: 6,
    title: "Recruiting Tracker",
    message:
      "When coaches started to notice Marcus, his family logged it here. Follows, DMs, phone calls, camp invites — all captured so nothing slipped through the cracks.",
    hint: "Scroll through Marcus's logged activity. Your tracker starts empty and grows as real recruiting contact begins.",
    nextKey: null,
    nextLabel: "Explore Freely",
    nextPath: "/Workspace",
  },
];

const TOTAL = TOUR_STEPS.length;

// Clears the app header (~60px) with a comfortable visual gap.
const TOP_OFFSET = 68;

// ── WhyPanel-matched design tokens ────────────────────────────────────────────
const C = {
  bg:           "#f1f5f9",
  border:       "#e2e8f0",
  shadow:       "0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.15)",
  headerBg:     "rgba(0,0,0,0.03)",
  headerBorder: "#e2e8f0",
  label:        "#94a3b8",   // muted uppercase label
  title:        "#0f172a",   // strong headline
  body:         "#475569",   // readable body
  hint:         "#64748b",   // hint text
  navLock:      "#94a3b8",   // de-emphasised italic note
  skip:         "#94a3b8",   // ghost skip link
  pipActive:    "#e8a020",
  pipDone:      "#cbd5e1",
  pipFuture:    "#e2e8f0",
  progressTrack:"#e2e8f0",
  progressFill: "#e8a020",
};

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

  // ── Dismissed: amber pill in same top-right position ─────────────────────────
  if (dismissed) {
    return (
      <>
        <style>{`
          @media (max-width: 520px) {
            .dt-pill {
              top: auto !important;
              /* 64px BottomNav + 8px gap + safe-area */
              bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important;
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
            /* Push content above the iPhone home indicator */
            padding-bottom: env(safe-area-inset-bottom, 0px) !important;
          }
          /* Stack actions vertically: amber CTA full-width on top, skip text below */
          .dt-actions {
            flex-direction: column-reverse !important;
            gap: 6px !important;
          }
          .dt-next-btn {
            width: 100% !important;
            justify-content: center !important;
            padding: 13px 18px !important;
            font-size: 15px !important;
          }
          .dt-skip-btn {
            width: 100% !important;
            text-align: center !important;
            padding: 6px 0 !important;
            font-size: 13px !important;
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
          background: C.bg,
          border: `1.5px solid ${C.border}`,
          borderRadius: 16,
          boxShadow: C.shadow,
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
            padding: "11px 16px 10px",
            borderBottom: `1px solid ${C.headerBorder}`,
            background: C.headerBg,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.label,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
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
                        ? C.pipActive
                        : s.stepNum < step.stepNum
                        ? C.pipDone
                        : C.pipFuture,
                    transition: "all 0.2s ease",
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 10, color: C.label, fontWeight: 500 }}>
              {step.stepNum} of {TOTAL}
            </span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: "none",
              border: "none",
              color: C.label,
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
          {/* Step title */}
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: C.title,
              marginBottom: 9,
              lineHeight: 1.28,
            }}
          >
            {step.title}
          </div>

          {/* Narrative message */}
          <div
            style={{
              fontSize: 13,
              color: C.body,
              lineHeight: 1.6,
              marginBottom: step.hint ? 12 : 18,
            }}
          >
            {step.message}
          </div>

          {/* Hint */}
          {step.hint && (
            <div
              style={{
                fontSize: 12,
                color: C.hint,
                lineHeight: 1.6,
                marginBottom: 14,
                paddingLeft: 10,
                borderLeft: "2px solid rgba(232,160,32,0.45)",
              }}
            >
              {step.hint}
            </div>
          )}

          {/* Nav lock note — phrased as an invitation, not a warning */}
          <div
            style={{
              fontSize: 11,
              color: C.navLock,
              marginBottom: 14,
              fontStyle: "italic",
            }}
          >
            Explore the page — tap next when ready.
          </div>

          {/* Actions */}
          <div className="dt-actions" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="dt-skip-btn"
              onClick={skipTour}
              style={{
                background: "none",
                border: "none",
                color: C.skip,
                fontSize: 12,
                cursor: "pointer",
                padding: 0,
                fontFamily: "inherit",
                flexShrink: 0,
              }}
            >
              Skip to free explore
            </button>
            <div style={{ flex: 1 }} />
            <button
              className="dt-next-btn"
              onClick={goNext}
              style={{
                background: "#e8a020",
                color: "#0a0e1a",
                border: "none",
                borderRadius: 8,
                padding: "9px 18px",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                boxShadow: "0 2px 10px rgba(232,160,32,0.35)",
              }}
            >
              {step.nextKey ? `See: ${step.nextLabel}` : "Explore Freely"}
              <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {/* ── Bottom progress bar ── */}
        <div style={{ height: 3, background: C.progressTrack }}>
          <div
            style={{
              height: "100%",
              width: `${(step.stepNum / TOTAL) * 100}%`,
              background: C.progressFill,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>
    </>
  );
}
