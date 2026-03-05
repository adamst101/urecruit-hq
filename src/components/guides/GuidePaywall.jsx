import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { Lock, ArrowRight } from "lucide-react";

export default function GuidePaywall({ isAuthenticated }) {
  const nav = useNavigate();

  return (
    <div style={{
      background: "#0a0e1a",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 16px",
      fontFamily: "'DM Sans', Inter, system-ui, sans-serif"
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <div style={{
        maxWidth: 480,
        width: "100%",
        background: "#111827",
        border: "2px solid #e8a020",
        borderRadius: 20,
        padding: "48px 32px",
        textAlign: "center"
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>

        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 40,
          color: "#f9fafb",
          margin: 0,
          letterSpacing: 2
        }}>
          MEMBERS ONLY
        </h1>

        <p style={{
          color: "#f9fafb",
          fontSize: 18,
          fontWeight: 700,
          marginTop: 16,
          lineHeight: 1.5
        }}>
          The Recruiting Guide &amp; Camp Playbook are included in your Season Pass.
        </p>

        <p style={{
          color: "#9ca3af",
          fontSize: 15,
          lineHeight: 1.7,
          marginTop: 16
        }}>
          {isAuthenticated
            ? "Your account doesn't have an active season pass. Get access below to unlock the full guide."
            : "Get the exact information coaches expect families to know — timelines, offer rules, DM templates, film strategy, and camp budgeting — all in one place.\n\nThis is the stuff that separates prepared families from everyone else."}
        </p>

        <div style={{
          height: 2,
          background: "#e8a020",
          margin: "28px auto",
          width: 80,
          borderRadius: 1
        }} />

        <div style={{ marginBottom: 8 }}>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 36,
            color: "#f9fafb"
          }}>$49</span>
          <span style={{ color: "#9ca3af", fontSize: 14, marginLeft: 8 }}>— Season Pass</span>
        </div>
        <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 24px" }}>
          Includes full guide access + 750+ camps + conflict detection + camp calendar
        </p>

        <button
          onClick={() => nav(createPageUrl("Subscribe"))}
          style={{
            width: "100%",
            background: "#e8a020",
            color: "#0a0e1a",
            border: "none",
            borderRadius: 10,
            padding: "16px 0",
            fontSize: 18,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8
          }}
        >
          Get Season Pass <ArrowRight style={{ width: 18, height: 18 }} />
        </button>

        {!isAuthenticated && (
          <button
            onClick={() => {
              const returnUrl = window.location.pathname;
              base44?.auth?.redirectToLogin?.(returnUrl) || nav("/Home");
            }}
            style={{
              background: "none",
              border: "none",
              color: "#6b7280",
              fontSize: 14,
              cursor: "pointer",
              marginTop: 16,
              textDecoration: "underline",
              textUnderlineOffset: 2
            }}
          >
            Already a member? Log in →
          </button>
        )}
      </div>
    </div>
  );
}