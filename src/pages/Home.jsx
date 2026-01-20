// src/pages/Home.jsx
// Home page with deterministic "Log in" flow to Base44:
//   /login?from_url=<ENCODED_ABSOLUTE_URL>
// No dependency on ../utils/trackEvent

import React, { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";

// Adjust this import path to whatever you actually use.
// If you already have createPageUrl elsewhere, point it there.
import { createPageUrl } from "../utils";

export default function Home() {
  const nav = useNavigate();
  const location = useLocation();

  // Demo mode detection (matches your doc patterns using ?mode=demo)
  const isDemo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("mode") === "demo";
  }, [location.search]);

  // Lightweight local tracker. Works if base44.entities.Event.create exists.
  // Safe for async: catches promise rejections.
  function trackEventSafe(payload) {
    try {
      const base44 = window?.base44;
      if (base44?.entities?.Event?.create) {
        // Fire-and-forget with rejection handling
        Promise.resolve(base44.entities.Event.create(payload)).catch(() => {});
      }
    } catch {
      // no-op
    }
  }

  function handleLogin() {
    trackEventSafe({ event_name: "cta_login_click", source: "home", via: "hero_login" });

    // App destination after user completes auth flow
    const nextPath = createPageUrl("Discover"); // typically "/Discover"

    // Where Base44 should send the user after login
    // You referenced this pattern explicitly:
    //   /Subscribe?source=auth_gate&next=/Discover
    const fromUrl =
      `${window.location.origin}${createPageUrl("Subscribe")}` +
      `?source=auth_gate&next=${encodeURIComponent(nextPath)}`;

    // Base44 login contract:
    const loginUrl =
      `${window.location.origin}/login?from_url=${encodeURIComponent(fromUrl)}`;

    window.location.assign(loginUrl);
  }

  function handleSubscribe() {
    trackEventSafe({ event_name: "cta_subscribe_click", source: "home", via: "hero_subscribe" });

    const nextPath = createPageUrl("Discover");
    nav(
      `${createPageUrl("Subscribe")}?source=home_cta&next=${encodeURIComponent(nextPath)}`,
      { replace: false }
    );
  }

  function handleExplore() {
    trackEventSafe({ event_name: "cta_explore_click", source: "home", via: "hero_explore" });
    nav(createPageUrl("Discover"), { replace: false });
  }

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: "32px" }}>Camp Connect</h1>
          <p style={{ margin: "8px 0 0 0", opacity: 0.75 }}>
            Find camps. Track favorites. Plan your season.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {!isDemo && (
            <button onClick={handleLogin} style={buttonStyle("ghost")} type="button">
              Log in
            </button>
          )}
          <button onClick={handleSubscribe} style={buttonStyle("primary")} type="button">
            Subscribe
          </button>
        </div>
      </header>

      <section
        style={{
          marginTop: 24,
          padding: 20,
          borderRadius: 14,
          border: "1px solid rgba(0,0,0,0.10)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: 22 }}>Get decision-grade visibility into camps</h2>
        <p style={{ margin: "10px 0 0 0", opacity: 0.8 }}>
          Search, filter, compare, and keep your short-list organized across the season.
        </p>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={handleExplore} style={buttonStyle("secondary")} type="button">
            Explore camps
          </button>

          {!isDemo && (
            <button onClick={handleLogin} style={buttonStyle("ghost")} type="button">
              Log in
            </button>
          )}

          <button onClick={handleSubscribe} style={buttonStyle("primary")} type="button">
            Upgrade / Subscribe
          </button>
        </div>

        {isDemo && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 10,
              background: "rgba(0,0,0,0.04)",
              fontSize: 14,
              opacity: 0.9,
            }}
          >
            Demo mode is enabled. Some paid features may be limited.
          </div>
        )}
      </section>

      <section
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        <FeatureCard title="Discover" body="Filter camps by division, position, and dates." />
        <FeatureCard title="Favorites" body="Keep your short list organized by season." />
        <FeatureCard title="Calendar" body="Plan attendance and avoid schedule conflicts." />
      </section>

      <footer style={{ marginTop: 24, opacity: 0.7, fontSize: 13 }}>
        © {new Date().getFullYear()} Camp Connect
      </footer>
    </div>
  );
}

function FeatureCard({ title, body }) {
  return (
    <div style={{ padding: 16, borderRadius: 14, border: "1px solid rgba(0,0,0,0.10)" }}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 6, opacity: 0.8 }}>{body}</div>
    </div>
  );
}

function buttonStyle(variant) {
  const base = {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.12)",
    cursor: "pointer",
    fontWeight: 650,
    fontSize: 14,
  };

  if (variant === "primary") {
    return { ...base, border: "1px solid rgba(0,0,0,0.20)" };
  }
  if (variant === "secondary") {
    return { ...base, background: "rgba(0,0,0,0.04)" };
  }
  return { ...base, background: "transparent" };
}
