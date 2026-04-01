// src/components/demo/CoachGuidedTourOverlay.jsx
// Guided coach tour overlay rendered on CoachDashboard when
// ?demo=coach&tour=<key> is present in the URL.
//
// Visual style: matches GuidedTourOverlay (light card on dark page).
//   Background: #f1f5f9  |  Border: 1.5px #e2e8f0  |  Shadow: deep neutral
//   Typography: #0f172a title / #475569 body / #94a3b8 labels
//
// Desktop: fixed top-right (top: 68px) beneath the app header.
// Mobile:  full-width bottom sheet.
// z-index: 50000 — sits above Support button and BottomNav.
//
// Navigation: Next, Back, Skip to Coach HQ.
// On step change, scrolls the page to the relevant section via element ID.

import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { X, ArrowLeft, ArrowRight } from "lucide-react";

// ── Tour step definitions ──────────────────────────────────────────────────────
// scrollTo: DOM element id added to the relevant section in CoachDashboard.
// prevKey/nextKey: null at boundaries.
const COACH_TOUR_STEPS = [
  {
    key: "summary",
    stepNum: 1,
    title: "Program Recruiting Summary",
    message:
      "This section gives you a high-level read on what is happening across the entire program. It surfaces where momentum is concentrated, which athletes are showing the strongest traction, and how broadly college programs are engaging your roster.",
    hint: "Look at the commitment and visit counts, the named athletes, and the colleges connected to your program. This section updates as athletes and families log activity.",
    scrollTo: "coach-tour-summary",
    prevKey: null,
    nextKey: "update",
    nextLabel: "Coach Update",
  },
  {
    key: "update",
    stepNum: 2,
    title: "Coach Update",
    message:
      "This is your period-based recruiting narrative. It surfaces what has changed recently across the roster and where activity has picked up. Use the time period toggles to adjust the window you are looking at.",
    hint: "The Coach Update helps you stay current without chasing individual athlete updates. Try 'Since Last Visit' to see only what is new since you were last here.",
    scrollTo: "coach-tour-update",
    prevKey: "summary",
    nextKey: "metrics",
    nextLabel: "Headline Metrics",
  },
  {
    key: "metrics",
    stepNum: 3,
    title: "Headline Program Metrics",
    message:
      "These tiles are the fastest read on overall program momentum. Any Interest shows how many athletes have logged at least one signal from a college. True Traction shows verified, consistent contact. Visits and Offers shows confirmed recruiting outcomes.",
    hint: "True Traction is the most meaningful signal. It reflects consistent two-way engagement, not just a follow or a one-time camp invite.",
    scrollTo: "coach-tour-metrics",
    prevKey: "update",
    nextKey: "heating",
    nextLabel: "Players Heating Up",
  },
  {
    key: "heating",
    stepNum: 4,
    title: "Players Heating Up",
    message:
      "This tile surfaces athletes whose activity curve is trending upward right now. These are not necessarily the most recruited players on the roster. They are the ones showing the most noticeable recent momentum shift.",
    hint: "Use this as your early awareness signal. A player heating up today may need your follow-up or encouragement before the window shifts.",
    scrollTo: "coach-tour-metrics",
    prevKey: "metrics",
    nextKey: "traction",
    nextLabel: "True Traction Board",
  },
  {
    key: "traction",
    stepNum: 5,
    title: "True Traction Board",
    message:
      "Where Players Heating Up signals momentum, True Traction signals substance. These are athletes with documented, consistent contact from one or more college programs. This is the board coaches want to see grow.",
    hint: "Click the True Traction tile to see the full board with athlete detail. Each entry here represents real, logged two-way recruiting contact.",
    scrollTo: "coach-tour-metrics",
    prevKey: "heating",
    nextKey: "colleges",
    nextLabel: "Colleges Engaging",
  },
  {
    key: "colleges",
    stepNum: 6,
    title: "Colleges Engaging the Program",
    message:
      "This view shows which college programs are actively engaging your roster and how many of your athletes each school is connected to. It helps you understand the breadth of college engagement across the program, not just for individual athletes.",
    hint: "A college appearing here means at least one athlete on your roster has logged contact with that program. Click to see which athletes are connected to each school.",
    scrollTo: "coach-tour-drilldown",
    prevKey: "traction",
    nextKey: "activity",
    nextLabel: "Recent Activity",
  },
  {
    key: "activity",
    stepNum: 7,
    title: "Recent Recruiting Activity",
    message:
      "This is the supporting evidence layer behind your program story. Every event athletes and families log across the roster appears here, giving you a running view of what is happening and where the activity is coming from.",
    hint: "This log is built from what families submit directly. It drives the metrics and summaries above it. The more families are using the platform, the richer this view becomes.",
    scrollTo: "coach-tour-drilldown",
    prevKey: "colleges",
    nextKey: "tools",
    nextLabel: "Coach Tools",
  },
  {
    key: "tools",
    stepNum: 8,
    title: "Invite Families and Manage Your Account",
    message:
      "These controls help you bring families into the platform, manage your account, and support communication across the roster. Inviting families is the most important action a coach can take to get real data flowing into Coach HQ.",
    hint: "Use Invite Parents to generate your program link. Families who subscribe through that link are automatically connected to your program in Coach HQ.",
    scrollTo: "coach-tour-header",
    prevKey: "activity",
    nextKey: "giveback",
    nextLabel: "Program Giveback",
  },
  {
    key: "giveback",
    stepNum: 9,
    title: "A Giveback Opportunity for Your Program",
    message:
      "URecruitHQ gives coaches a simple way to support families with a better recruiting resource while creating a built-in giveback opportunity for the program. As families subscribe through your team, your program becomes eligible for quarterly donations based on subscription activity. Giveback levels are tiered to reward stronger participation and broader family engagement across the program.",
    hint: "This is an added benefit of bringing families into the platform, not the reason it exists. The core value is better visibility into recruiting progress for your athletes.",
    scrollTo: null,
    prevKey: "tools",
    nextKey: null,
    nextLabel: "Explore Coach HQ",
  },
];

const TOTAL = COACH_TOUR_STEPS.length;
const TOP_OFFSET = 68;

// ── Design tokens — matches GuidedTourOverlay ──────────────────────────────────
const C = {
  bg:            "#f1f5f9",
  border:        "#e2e8f0",
  shadow:        "0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.15)",
  headerBg:      "rgba(0,0,0,0.03)",
  headerBorder:  "#e2e8f0",
  label:         "#94a3b8",
  title:         "#0f172a",
  body:          "#475569",
  hint:          "#64748b",
  navLock:       "#94a3b8",
  skip:          "#94a3b8",
  back:          "#94a3b8",
  pipActive:     "#e8a020",
  pipDone:       "#cbd5e1",
  pipFuture:     "#e2e8f0",
  progressTrack: "#e2e8f0",
  progressFill:  "#e8a020",
};

export default function CoachGuidedTourOverlay() {
  const nav = useNavigate();
  const loc = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const params = new URLSearchParams(loc.search);
  const isDemoCoach = params.get("demo") === "coach";
  const tourParam = params.get("tour");

  const step = COACH_TOUR_STEPS.find((s) => s.key === tourParam) ?? null;

  // Scroll to section when step changes
  useEffect(() => {
    if (!step?.scrollTo) return;
    // Small delay to let any layout shift settle before scrolling
    const timer = setTimeout(() => {
      const el = document.getElementById(step.scrollTo);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [step?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-show overlay if URL regains a tour param (e.g. user hits Back)
  useEffect(() => {
    if (tourParam) setDismissed(false);
  }, [tourParam]);

  if (!isDemoCoach || !step) return null;

  function goNext() {
    if (step.nextKey) {
      nav(`/CoachDashboard?demo=coach&tour=${step.nextKey}&src=coach_demo_story`);
    } else {
      // Last step — release into free exploration
      nav("/CoachDashboard?demo=coach");
    }
  }

  function goBack() {
    if (step.prevKey) {
      nav(`/CoachDashboard?demo=coach&tour=${step.prevKey}&src=coach_demo_story`);
    }
  }

  function skipTour() {
    nav("/CoachDashboard?demo=coach");
  }

  // ── Dismissed: amber pill in same top-right position ─────────────────────────
  if (dismissed) {
    return (
      <>
        <style>{`
          @media (max-width: 520px) {
            .cdt-pill {
              top: auto !important;
              bottom: 80px !important;
              right: 16px !important;
            }
          }
        `}</style>
        <button
          className="cdt-pill"
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

  // ── Full overlay card ─────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @media (max-width: 520px) {
          .cdt-card {
            top: auto !important;
            bottom: 0 !important;
            right: 0 !important;
            left: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            border-radius: 20px 20px 0 0 !important;
          }
        }
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
      `}</style>
      <div
        className="cdt-card"
        style={{
          position: "fixed",
          top: TOP_OFFSET,
          right: 20,
          zIndex: 50000,
          width: 360,
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
              Coach HQ Tour
            </span>
            {/* Step pip strip */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {COACH_TOUR_STEPS.map((s) => (
                <div
                  key={s.key}
                  style={{
                    width: s.key === tourParam ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    background:
                      s.key === tourParam
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
            aria-label="Minimise guided tour"
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "16px 18px 18px" }}>
          {/* Step title */}
          <div
            style={{
              fontSize: 15,
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

          {/* Context note */}
          <div
            style={{
              fontSize: 11,
              color: C.navLock,
              marginBottom: 14,
              fontStyle: "italic",
            }}
          >
            Sample program data. No real coaches or athletes.
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Skip */}
            <button
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
              Skip tour
            </button>

            <div style={{ flex: 1 }} />

            {/* Back */}
            {step.prevKey && (
              <button
                onClick={goBack}
                style={{
                  background: "none",
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: C.back,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                <ArrowLeft style={{ width: 12, height: 12 }} />
                Back
              </button>
            )}

            {/* Next / Explore */}
            <button
              onClick={goNext}
              style={{
                background: "#e8a020",
                color: "#0a0e1a",
                border: "none",
                borderRadius: 8,
                padding: "9px 16px",
                fontSize: 13,
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
              {step.nextKey ? `Next: ${step.nextLabel}` : "Explore Freely"}
              <ArrowRight style={{ width: 13, height: 13 }} />
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
