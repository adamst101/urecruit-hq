import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";
import { useIdentity } from "../components/auth/useIdentity";

export default function Home() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next");

  const id = useIdentity();

  const primaryCta = useMemo(() => {
    if (!id.isAuthed) return { label: "Log in", action: "login" };
    if (!id.isSubscribed) return { label: "Upgrade", action: "upgrade" };
    if (id.isSubscribed && !id.hasChild) return { label: "Create athlete profile", action: "profile" };
    return { label: "Go to My Camps", action: "mycamps" };
  }, [id.isAuthed, id.isSubscribed, id.hasChild]);

  async function handleLogin() {
    // Replace with your real auth flow
    await base44.auth.signIn?.();
    // after sign-in, route to next or Profile/MyCamps based on state (will resolve after identity reload)
    nav(next ? next : createPageUrl("Profile"), { replace: true });
  }

  function handlePrimary() {
    if (primaryCta.action === "login") return handleLogin();
    if (primaryCta.action === "upgrade") return nav(createPageUrl("Upgrade"));
    if (primaryCta.action === "profile") return nav(createPageUrl("Profile"));
    return nav(createPageUrl("MyCamps"));
  }

  return (
    <div style={{ padding: 28, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>RecruitMe</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Plan and prioritize college football camps across your target schools.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => nav(createPageUrl("Discover") + "?mode=demo")}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
          >
            View demo
          </button>
          <button
            onClick={() => nav(createPageUrl("Upgrade"))}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff" }}
          >
            Subscribe
          </button>
        </div>
      </div>

      <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 18 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>What you get</div>
          <ul style={{ marginTop: 10, lineHeight: 1.7 }}>
            <li>Target schools by division, state, and travel radius</li>
            <li>Discover camps tied to your targets (not generic lists)</li>
            <li>Calendar overlays to spot conflicts early</li>
            <li>Manage multiple athletes under one account</li>
          </ul>
          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button
              onClick={handlePrimary}
              style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", fontWeight: 700 }}
            >
              {primaryCta.label}
            </button>
            <button
              onClick={() => nav(createPageUrl("Upgrade"))}
              style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
            >
              See pricing
            </button>
          </div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Already subscribed?</div>
          <div style={{ marginTop: 8, opacity: 0.8 }}>
            Log in and pick your athlete profile.
          </div>
          <button
            onClick={handleLogin}
            style={{ marginTop: 12, width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
          >
            Log in
          </button>

          {id.isAuthed && (
            <button
              onClick={() => nav(createPageUrl("Account"))}
              style={{ marginTop: 10, width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
            >
              Account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}