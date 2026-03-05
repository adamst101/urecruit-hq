// src/components/auth/NoAccessWarning.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { base44 } from "../../api/base44Client";
import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";
import { setDemoMode, getDemoDefaults, clearDemoMode } from "../hooks/demoMode.jsx";

const SESSION_KEY = "accessWarningShown";

export default function NoAccessWarning() {
  const nav = useNavigate();
  const { isLoading, isAuthenticated, hasAccess, mode, demoYear } = useSeasonAccess();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    const alreadyShown = sessionStorage.getItem(SESSION_KEY);
    if (isAuthenticated && !hasAccess && mode !== "demo" && !alreadyShown) {
      setShow(true);
      sessionStorage.setItem(SESSION_KEY, "true");
    }
  }, [isLoading, isAuthenticated, hasAccess, mode]);

  if (!show) return null;

  function handleGetPass() {
    setShow(false);
    nav(createPageUrl("Subscribe") + "?source=no_access_popup");
  }

  async function handleTryDemo() {
    setShow(false);
    clearDemoMode();
    try {
      if (base44?.auth?.logout) {
        const { demoSeasonYear } = getDemoDefaults();
        const yr = demoYear || demoSeasonYear;
        if (yr) setDemoMode(yr);
        await base44.auth.logout("/Workspace?mode=demo&src=no_access_popup");
        return;
      }
    } catch {}
    window.location.assign("/Workspace?mode=demo&src=no_access_popup");
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setShow(false); }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <div style={{
        background: "#111827", borderRadius: 16, maxWidth: 480, width: "100%",
        overflow: "hidden", position: "relative",
        fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
      }}>
        {/* Amber top border */}
        <div style={{ height: 4, background: "#e8a020" }} />

        {/* Close X */}
        <button
          onClick={() => setShow(false)}
          style={{
            position: "absolute", top: 16, right: 16,
            background: "none", border: "none", cursor: "pointer",
            color: "#6b7280", padding: 4,
          }}
        >
          <X style={{ width: 20, height: 20 }} />
        </button>

        <div style={{ padding: 32 }}>
          {/* Emoji */}
          <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>🏈</div>

          {/* Headline */}
          <h2 style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 32,
            color: "#f9fafb", textAlign: "center", margin: 0, lineHeight: 1,
          }}>
            Almost There!
          </h2>

          {/* Subhead */}
          <p style={{
            fontSize: 18, fontWeight: 700, color: "#f9fafb",
            textAlign: "center", marginTop: 12, lineHeight: 1.4,
          }}>
            Your account is set up — now let's get you access to camp season.
          </p>

          {/* Body */}
          <div style={{ fontSize: 15, color: "#9ca3af", lineHeight: 1.6, marginTop: 16 }}>
            <p style={{ margin: "0 0 12px" }}>
              You're just one step away. An account alone doesn't include access to URecruit HQ's full camp database.
            </p>
            <p style={{ margin: "0 0 8px" }}>
              Once you complete your Season Pass purchase, you'll have full access to:
            </p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>750+ college football camps</li>
              <li>Scheduling and conflict tools</li>
              <li>Your personalized camp calendar</li>
            </ul>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "#e8a020", margin: "24px 0", opacity: 0.4 }} />

          {/* Price callout */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, color: "#e8a020", lineHeight: 1 }}>$49</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              One-time payment · Full season access · No subscription
            </div>
          </div>

          {/* Primary CTA */}
          <button
            onClick={handleGetPass}
            style={{
              width: "100%", background: "#e8a020", color: "#0a0e1a",
              border: "none", borderRadius: 12, padding: "16px 0",
              fontSize: 18, fontWeight: 700, cursor: "pointer",
              marginTop: 24,
            }}
          >
            Get My Season Pass →
          </button>

          {/* Secondary link */}
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button
              onClick={handleTryDemo}
              style={{
                background: "none", border: "none",
                color: "#6b7280", fontSize: 14, cursor: "pointer",
                textDecoration: "underline", textUnderlineOffset: 2,
              }}
            >
              Just browsing? Try the free demo instead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}