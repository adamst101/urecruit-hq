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
import { X, ArrowRight, Sparkles } from "lucide-react";

// ── Tour sequence ──────────────────────────────────────────────────────────────
// Copy direction: outcome-led, one sentence per body, one short hint.
// ctaLabel overrides the generic "See: X" pattern with step-specific language.
const TOUR_STEPS = [
  {
    key: "profile",
    stepNum: 1,
    title: "Get organized first",
    message: "Put the basics in one place so every camp, coach interaction, and next step is easier to manage.",
    hint: "Scroll to see Marcus's profile.",
    nextKey: "playbook",
    nextLabel: "Recruiting Playbook",
    nextPath: "/KnowledgeBase",
    ctaLabel: "See the Playbook",
  },
  {
    key: "playbook",
    stepNum: 2,
    title: "Understand the process earlier",
    message: "This gives families a clearer picture of what matters, when it matters, and how to plan.",
    hint: "Glance at the timeline, then continue.",
    nextKey: "discover",
    nextLabel: "Discover Camps",
    nextPath: "/Discover",
    ctaLabel: "See Discover",
  },
  {
    key: "discover",
    stepNum: 3,
    title: "Turn searching into a real plan",
    message: "Instead of bouncing between camp sites, families can compare options and save the right ones in one place.",
    hint: "Browse camps and look for good-fit options.",
    nextKey: "mycamps",
    nextLabel: "My Camps",
    nextPath: "/MyCamps",
    ctaLabel: "See My Camps",
  },
  {
    key: "mycamps",
    stepNum: 4,
    title: "Keep your options in one place",
    message: "This is where saved and registered camps start to feel like a real camp plan, not scattered notes.",
    hint: "Review what Marcus saved and registered.",
    nextKey: "calendar",
    nextLabel: "My Calendar",
    nextPath: "/Calendar",
    ctaLabel: "See Calendar",
  },
  {
    key: "calendar",
    stepNum: 5,
    title: "Make camp season less chaotic",
    message: "This helps families spot conflicts, timing issues, and travel pressure before plans get messy.",
    hint: "Look at how camps line up across the calendar.",
    nextKey: "tracker",
    nextLabel: "Recruiting Tracker",
    nextPath: "/RecruitingJourney",
    ctaLabel: "See Tracker",
  },
  {
    key: "tracker",
    stepNum: 6,
    title: "Separate momentum from noise",
    message: "This is where families track real recruiting activity so they can see what is actually progressing.",
    hint: "Review Marcus's activity and how it builds over time.",
    nextKey: null,
    nextLabel: null,
    nextPath: "/Workspace",
    ctaLabel: "Finish Tour",
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
  const [showEndCard, setShowEndCard] = useState(false);

  const tourParam = new URLSearchParams(loc.search).get("tour");
  if (tourParam !== tourKey) return null;

  const step = TOUR_STEPS.find((s) => s.key === tourKey);
  if (!step) return null;

  function goNext() {
    if (step.nextKey) {
      nav(`${step.nextPath}?demo=user&tour=${step.nextKey}&src=demo_story`);
    } else {
      // Last step — show conversion card instead of silent Workspace drop
      setShowEndCard(true);
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

  // ── End-of-tour conversion card ──────────────────────────────────────────────
  if (showEndCard) {
    return (
      <>
        <style>{`
          @media (max-width: 520px) {
            .dt-end-card {
              top: auto !important;
              bottom: 0 !important;
              right: 0 !important;
              left: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
              border-radius: 20px 20px 0 0 !important;
              padding-bottom: env(safe-area-inset-bottom, 0px) !important;
            }
            .dt-end-signup-btn {
              width: 100% !important;
              justify-content: center !important;
              padding: 15px 18px !important;
              font-size: 15px !important;
            }
            .dt-end-explore-btn {
              width: 100% !important;
              text-align: center !important;
              padding: 10px 0 !important;
            }
          }
        `}</style>
        <div
          className="dt-end-card"
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
          {/* Header */}
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
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Sparkles style={{ width: 13, height: 13, color: C.pipActive }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: C.pipActive, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Tour Complete
              </span>
            </div>
            {/* Completed pip strip */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {TOUR_STEPS.map((s) => (
                <div
                  key={s.key}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: C.pipDone,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: "20px 18px 22px" }}>
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                color: C.title,
                marginBottom: 10,
                lineHeight: 1.25,
              }}
            >
              Ready to start your family's workspace?
            </div>
            <div
              style={{
                fontSize: 13,
                color: C.body,
                lineHeight: 1.6,
                marginBottom: 20,
              }}
            >
              Create your free account to begin tracking camps, interest, and recruiting activity.
            </div>

            {/* Primary CTA */}
            <button
              className="dt-end-signup-btn"
              onClick={() => nav("/Signup?src=demo_tour_end")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                width: "100%",
                background: "#e8a020",
                color: "#0a0e1a",
                border: "none",
                borderRadius: 9,
                padding: "13px 18px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 2px 14px rgba(232,160,32,0.4)",
                marginBottom: 10,
              }}
            >
              Start Your Free Account
              <ArrowRight style={{ width: 15, height: 15 }} />
            </button>

            {/* Secondary: keep exploring */}
            <button
              className="dt-end-explore-btn"
              onClick={() => nav("/Workspace?demo=user&src=demo_tour_end_explore")}
              style={{
                display: "block",
                width: "100%",
                background: "none",
                border: "none",
                color: C.skip,
                fontSize: 12,
                cursor: "pointer",
                padding: "4px 0",
                fontFamily: "inherit",
                textAlign: "center",
              }}
            >
              Keep Exploring Demo
            </button>
          </div>
        </div>
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
          /* Tighten body padding ~25% to reveal more product below the sheet */
          .dt-body   { padding: 10px 16px 10px !important; }
          .dt-title  { font-size: 14px !important; margin-bottom: 5px !important; }
          .dt-message{ margin-bottom: 6px !important; line-height: 1.5 !important; }
          .dt-hint   { margin-bottom: 6px !important; font-size: 11px !important; }
          /* Stack actions vertically: amber CTA full-width on top, skip text below */
          .dt-spacer  { display: none !important; }
          .dt-actions {
            flex-direction: column-reverse !important;
            gap: 6px !important;
          }
          .dt-next-btn {
            width: 100% !important;
            justify-content: center !important;
            padding: 12px 18px !important;
            font-size: 14px !important;
          }
          .dt-skip-btn {
            width: 100% !important;
            text-align: center !important;
            padding: 6px 0 !important;
            font-size: 13px !important;
          }
        }
      `}</style>

      {/* Subtle backdrop — reduces visual competition on dense pages (Calendar, Discover, Tracker).
          pointerEvents:none so the user can still interact with the page behind the overlay. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.22)",
          zIndex: 49999,
          pointerEvents: "none",
        }}
      />
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
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: C.label,
                letterSpacing: "0.01em",
              }}
            >
              Quick tour · {step.stepNum} of {TOTAL}
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
        <div className="dt-body" style={{ padding: "16px 18px 18px" }}>
          {/* Step title */}
          <div
            className="dt-title"
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
            className="dt-message"
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
              className="dt-hint"
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
            <div className="dt-spacer" style={{ flex: 1 }} />
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
              {step.ctaLabel}
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
