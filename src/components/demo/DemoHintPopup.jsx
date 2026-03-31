// src/components/demo/DemoHintPopup.jsx
//
// Shared demo-mode contextual popup for camp-card interactions.
// Used by SchoolGroupCard (Discover) and CampCard (My Camps, Calendar) to
// show the same anchored hint popup when a visitor clicks Favorite, Registered,
// or Register in demo mode.
//
// Usage:
//   const { demoHint, showDemoHint, clearDemoHint } = useDemoHint();
//   // In button onClick: if (isUserDemo) { showDemoHint(e, "favorite"); return; }
//   // In render: <DemoHintPopup demoHint={demoHint} onDismiss={clearDemoHint} />

import { useState } from "react";

export const DEMO_HINTS = {
  favorite:   "You can favorite camps for planning purposes.",
  registered: "You can mark camps you've registered for to keep track of them.",
  register:   "After registration, this will take you to the camp's actual registration page.",
};

const POPUP_W = 224;

/**
 * Hook that manages demo hint popup state and positioning.
 * Call showDemoHint(e, key) from a button onClick to show the popup.
 */
export function useDemoHint() {
  const [demoHint, setDemoHint] = useState(null);

  function showDemoHint(e, key) {
    const rect = e.currentTarget.getBoundingClientRect();
    const anchorX   = rect.left + rect.width / 2;
    const showAbove = rect.top > 110;
    const popupLeft = Math.max(8, Math.min(anchorX - POPUP_W / 2, window.innerWidth - POPUP_W - 8));
    setDemoHint({
      message:   DEMO_HINTS[key],
      popupLeft,
      showAbove,
      anchorY:   showAbove ? window.innerHeight - rect.top + 8 : rect.bottom + 8,
      caretLeft: Math.max(8, Math.min(anchorX - popupLeft - 5, POPUP_W - 18)),
    });
  }

  function clearDemoHint() {
    setDemoHint(null);
  }

  return { demoHint, showDemoHint, clearDemoHint };
}

/**
 * Renders the anchored popup + full-screen dismiss backdrop.
 * Place this at the top level of the component (outside scroll containers)
 * so fixed positioning works correctly.
 */
export function DemoHintPopup({ demoHint, onDismiss }) {
  if (!demoHint) return null;
  return (
    <>
      {/* Transparent full-screen backdrop — click anywhere to dismiss */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 49990 }}
        onClick={onDismiss}
      />
      {/* Anchored popup */}
      <div
        style={{
          position: "fixed",
          zIndex: 49991,
          left: demoHint.popupLeft,
          width: POPUP_W,
          ...(demoHint.showAbove
            ? { bottom: demoHint.anchorY }
            : { top: demoHint.anchorY }),
          background: "#0f172a",
          border: "1px solid #1e2d45",
          borderRadius: 8,
          padding: "10px 13px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.3)",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 12.5, color: "#c0cad8", lineHeight: 1.55 }}>
          {demoHint.message}
        </div>
        {/* Caret pointing toward the button */}
        <div
          style={{
            position: "absolute",
            left: demoHint.caretLeft,
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            ...(demoHint.showAbove
              ? { bottom: -5, borderTop: "5px solid #1e2d45" }
              : { top: -5, borderBottom: "5px solid #1e2d45" }),
          }}
        />
      </div>
    </>
  );
}
