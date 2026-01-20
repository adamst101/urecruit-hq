// Pages/Home.jsx
// Fully updated Home page with a deterministic "Log in" flow that goes to Base44's
// /login?from_url=... URL (instead of routing through AuthRedirect → Subscribe).
//
// Notes:
// - Keep your existing component structure if you already have sections/cards—this is a clean,
//   production-safe baseline with the key routing fixes.
// - Adjust import paths to match your project (Base44 scaffolds can vary slightly).

import React, { useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";

// Adjust these imports to match your project structure:
import { createPageUrl } from "../utils"; // or "../utils/createPageUrl"
import { trackEvent } from "../utils/trackEvent"; // optional; match your actual path
// If you have your own access hook, you can plug it in.
// import { useAccess } from "../hooks/useAccess";

export default function Home() {
  const nav = useNavigate();
  const location = useLocation();

  // If you already have a demo-mode hook, replace this with it.
  // This is a safe lightweight interpretation that matches your document patterns.
  const isDemo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("mode") === "demo";
  }, [location.search]);

  /**
   * Build Base44 login URL:
   *   /login?from_url=<ENCODED_ABSOLUTE_URL>
   *
   * We keep your current "auth_gate" Subscribe pattern, but ONLY after the user explicitly logs in.
   * That means:
   *   Home "Log in" -> Base44 /login -> return to /Subscribe?source=auth_gate&next=/Discover
   */
  function handleLogin() {
    try {
      trackEvent?.({ event_name: "cta_login_click", source: "home", via: "hero_login" });
    } catch {
      // ignore telemetry failures
    }

    // Where user should ultimately end up after authentication completes:
    const nextPath = createPageUrl("Discover"); // typically "/Discover"

    // Where Base44 should send the user after login:
    // You explicitly referenced this pattern in your URLs:
    //   /Subscribe?source=auth_gate&next=%2FDiscover
    const fromUrl =
      `${window.location.origin}${createPageUrl("Subscribe")}` +
      `?source=auth_gate&next=${encodeURIComponent(nextPath)}`;

    // Base44 login contract:
    const loginUrl =
      `${window.location.origin}/login?from_url=${encodeURIComponent(fromUrl)}`;

    // Hard redirect is most reliable across auth boundaries
    window.location.assign(loginUrl);
  }

  /**
   * Subscribe CTA stays as-is (conversion path).
   * This is NOT the same as "Log in".
   */
  function handleSubscribe() {
    try {
      trackEvent?.({ event_name: "cta_subscribe_click", source: "home", via: "hero_subscribe" });
    } catch {
      // ignore telemetry failures
    }

    const nextPath = createPageUrl("Discover");
    nav(
      `${createPageUrl("Subscribe")}?source=home_cta&next=${encodeURIComponent(nextPath)}`,
      { replace: false }
    );
  }

  /**
   * Optional: If you have a "Continue in demo" CTA.
   * Keeps users inside the app without identity.
   */
  function handleDemoContinue() {
    try {
      trackEvent?.({ event_name: "cta_demo_continue_click", source: "home", via: "hero_demo" });
    } catch {
      // ignore telemetry failures
    }

    nav(createPageUrl("Discover"), { replace: false });
  }

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: "32px" }}>Camp Connect</h1>
          <p style={{ margin: "8px 0 0 0", opacity: 0.75 }}>
            Find camps. Track favorites. Plan your season.
          </p>
        </div>

        {/* Top-right actions */}
        <div style={{ display: "flex", gap: 10 }}>
          {!isDemo && (
            <button
              onClick={handleLogin}
              style={buttonStyle("ghost")}
              type="button"
            >
              Log in
            </button>
          )}
          <button
            onClick={handleSubscribe}
            style={buttonStyle("primary")}
            type="button"
          >
            Subscribe
          </button>
        </div>
      </header>

      {/* Hero */}
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
          <button
            onClick={() => nav(createPageUrl("Discover"), { replace: false })}
            style={buttonStyle("secondary")}
            type="button"
          >
            Explore camps
          </button>

          {!isDemo && (
            <button
              onClick={handleLogin}
              style={buttonStyle("ghost")}
              type="button"
            >
              Log in
            </button>
          )}

          <button
            onClick={handleSubscribe}
            style={buttonStyle("primary")}
            type="button"
          >
            Upgrade / Subscribe
          </button>

          {isDemo && (
            <button
              onClick={handleDemoContinue}
              style={buttonStyle("ghost")}
              type="button"
            >
              Continue in demo
            </button>
          )}
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

      {/* Simple feature grid */}
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

      {/* Footer */}
      <footer style={{ marginTop: 24, opacity: 0.7, fontSize: 13 }}>
        © {new Date().getFullYear()} Camp Connect
      </footer>
    </div>
  );
}

function FeatureCard({ title, body }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.10)",
      }}
    >
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
    return {
      ...base,
      border: "1px solid rgba(0,0,0,0.20)",
    };
  }

  if (variant === "secondary") {
    return {
      ...base,
      background: "rgba(0,0,0,0.04)",
    };
  }

  // ghost
  return {
    ...base,
    background: "transparent",
  };
}
