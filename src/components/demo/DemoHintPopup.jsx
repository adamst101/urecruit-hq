// src/components/demo/DemoHintPopup.jsx
//
// Shared demo-mode contextual popup for camp-card interactions and Quick Add
// guidance on the Recruiting Journey page.
//
// Usage — camp card hints (key lookup):
//   const { demoHint, showDemoHint, clearDemoHint } = useDemoHint();
//   // In button onClick: if (isUserDemo) { showDemoHint(e, "favorite"); return; }
//
// Usage — custom title + body (Quick Add and similar):
//   const { demoHint, showDemoHintCustom, clearDemoHint } = useDemoHint();
//   // showDemoHintCustom(e, { title: "Quick Add", message: "Use this to..." });
//
// Render: <DemoHintPopup demoHint={demoHint} onDismiss={clearDemoHint} />

import { useState } from "react";

export const DEMO_HINTS = {
  favorite:   "You can favorite camps for planning purposes.",
  registered: "You can mark camps you've registered for to keep track of them.",
  register:   "After registration, this will take you to the camp's actual registration page.",
};

const POPUP_W = 224;
const POPUP_W_WIDE = 268; // wider variant for Quick Add hints with longer copy

/**
 * Hook that manages demo hint popup state and positioning.
 *
 * showDemoHint(e, key)          — looks up copy from DEMO_HINTS[key]
 * showDemoHintCustom(e, {title, message}) — accepts arbitrary copy directly
 * clearDemoHint()               — dismisses the popup
 */
export function useDemoHint() {
  const [demoHint, setDemoHint] = useState(null);

  function _buildHint(e, { title, message, width = POPUP_W }) {
    const rect = e.currentTarget.getBoundingClientRect();
    const anchorX   = rect.left + rect.width / 2;
    const showAbove = rect.top > 110;
    const popupLeft = Math.max(8, Math.min(anchorX - width / 2, window.innerWidth - width - 8));
    return {
      title,
      message,
      popupWidth: width,
      popupLeft,
      showAbove,
      anchorY:   showAbove ? window.innerHeight - rect.top + 8 : rect.bottom + 8,
      caretLeft: Math.max(8, Math.min(anchorX - popupLeft - 5, width - 18)),
    };
  }

  function showDemoHint(e, key) {
    setDemoHint(_buildHint(e, { message: DEMO_HINTS[key] }));
  }

  function showDemoHintCustom(e, { title, message }) {
    setDemoHint(_buildHint(e, { title, message, width: POPUP_W_WIDE }));
  }

  function clearDemoHint() {
    setDemoHint(null);
  }

  return { demoHint, showDemoHint, showDemoHintCustom, clearDemoHint };
}

/**
 * Renders the anchored popup + full-screen dismiss backdrop.
 * Supports an optional title rendered above the message body.
 * Place this at the top level of the component (outside scroll containers)
 * so fixed positioning works correctly.
 */
export function DemoHintPopup({ demoHint, onDismiss }) {
  if (!demoHint) return null;
  const w = demoHint.popupWidth || POPUP_W;
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
          width: w,
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
        {demoHint.title && (
          <div style={{
            fontSize: 10, fontWeight: 700, color: "#e8a020",
            letterSpacing: "0.08em", textTransform: "uppercase",
            marginBottom: 5,
          }}>
            {demoHint.title}
          </div>
        )}
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
