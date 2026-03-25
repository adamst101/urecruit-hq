// src/pages/CoachInviteLanding.jsx
// Handles /CoachInviteLanding?coach=CODE
// Shows coach info and a CTA to subscribe. Stores invite code in localStorage.
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

export default function CoachInviteLanding() {
  const nav = useNavigate();
  const loc = useLocation();
  const [coach, setCoach] = useState(null);
  const [state, setState] = useState("loading"); // loading | found | invalid

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const code = new URLSearchParams(loc.search).get("coach") || "";
      if (!code) {
        setState("invalid");
        return;
      }

      try {
        const res = await base44.functions.invoke("getCoachByInviteCode", { code });
        const data = res?.data;
        if (!cancelled && data?.ok && data.coach) {
          try { localStorage.setItem("coachInviteCode", code); } catch {}
          setCoach(data.coach);
          setState("found");
        } else {
          if (!cancelled) setState("invalid");
        }
      } catch {
        if (!cancelled) setState("invalid");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGetAccess = () => {
    nav(createPageUrl("Checkout"));
  };

  const root = {
    minHeight: "100vh",
    background: "#0a0e1a",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    color: "#f9fafb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 24px",
  };

  if (state === "loading") {
    return (
      <div style={root}>
        <style>{FONTS}</style>
        <div style={{ width: 32, height: 32, border: "2px solid #e8a020", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div style={root}>
        <style>{FONTS}</style>
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, margin: "0 0 12px", letterSpacing: 1 }}>Link Not Found</h1>
          <p style={{ fontSize: 15, color: "#9ca3af", lineHeight: 1.6, marginBottom: 28 }}>
            This invite link is invalid or has expired. Ask your coach for their updated link.
          </p>
          <button
            onClick={() => nav(createPageUrl("Home"))}
            style={{ background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8, padding: "12px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
          >
            Go to URecruit HQ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={root}>
      <style>{FONTS}</style>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>

        {/* Logo / brand */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#e8a020", marginBottom: 32 }}>
          URecruit HQ
        </div>

        {/* Coach card */}
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "36px 32px", marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, background: "#1f2937", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 20px" }}>
            🎽
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            You've been invited by
          </div>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, margin: "0 0 4px", letterSpacing: 1 }}>
            Coach {coach.last_name}
          </h1>
          <p style={{ fontSize: 15, color: "#9ca3af", margin: "0 0 24px" }}>
            {coach.school_or_org}{coach.sport ? ` · ${coach.sport}` : ""}
          </p>

          <div style={{ background: "#0a0e1a", border: "1px solid #374151", borderRadius: 10, padding: "16px 20px", marginBottom: 24, textAlign: "left" }}>
            <p style={{ fontSize: 14, color: "#d1d5db", lineHeight: 1.7, margin: 0 }}>
              Get a URecruit HQ Season Pass to join Coach {coach.last_name}'s roster and receive
              recruiting messages, camp info, and updates directly to your dashboard.
            </p>
          </div>

          <button
            onClick={handleGetAccess}
            style={{ width: "100%", background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 10, padding: "16px 0", fontSize: 16, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em" }}
          >
            Get Your Season Pass →
          </button>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 12, marginBottom: 0 }}>
            Already have a pass? <button onClick={() => nav(createPageUrl("Home"))} style={{ background: "none", border: "none", color: "#e8a020", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>Sign in here</button>
          </p>
        </div>

        <p style={{ fontSize: 12, color: "#4b5563", margin: 0 }}>
          URecruit HQ · College Football Recruiting
        </p>
      </div>
    </div>
  );
}
