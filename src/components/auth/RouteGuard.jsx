// src/pages/Home.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({
      ...payload,
      ts: new Date().toISOString(),
    });
  } catch {}
}

async function safeSignIn() {
  try {
    if (typeof base44.auth?.signIn === "function") {
      await base44.auth.signIn();
      return true;
    }
  } catch {}
  return false;
}

export default function Home() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next");

  const { loading, mode, accountId, currentYear, demoYear } = useSeasonAccess();

  // Optional: check if user has at least one athlete (for CTA text only)
  const [hasAthlete, setHasAthlete] = useState(false);
  const [hasAthleteChecked, setHasAthleteChecked] = useState(false);

  useEffect(() => {
    let alive = true;

    async function run() {
      setHasAthleteChecked(false);

      if (!accountId) {
        if (!alive) return;
        setHasAthlete(false);
        setHasAthleteChecked(true);
        return;
      }

      try {
        const rows = await base44.entities.Athlete.filter({ account_id: accountId });
        if (!alive) return;
        setHasAthlete(Array.isArray(rows) && rows.length > 0);
      } catch {
        if (!alive) return;
        setHasAthlete(false);
      } finally {
        if (!alive) return;
        setHasAthleteChecked(true);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [accountId]);

  // Home viewed (dedupe per session)
  useEffect(() => {
    if (loading) return;

    const key = `evt_home_viewed_${mode}_${currentYear}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "home_viewed",
      mode: mode,
      season_year: mode === "paid" ? currentYear : demoYear,
      source: "home",
      account_id: accountId || null,
      next: next || null,
    });
  }, [loading, mode, currentYear, demoYear, accountId, next]);

  // ✅ CRITICAL CHANGE:
  // No auto-redirects from Home.
  // Home is the intentional landing page: Login / Demo / Subscribe.

  const rightRailCta = useMemo(() => {
    if (loading) return { label: "Loading…", action: "noop" };

    if (!accountId) return { label: "Log in", action: "login" };

    if (mode !== "paid") return { label: "Subscribe", action: "subscribe" };

    // Paid:
    // If athlete check hasn't completed yet, keep label stable.
    if (!hasAthleteChecked) return { label: "Go to app", action: "discover" };

    // If paid but no athlete, nudge Profile first.
    if (!hasAthlete) return { label: "Set up athlete profile", action: "profile" };

    return { label: "Go to app", action: "discover" };
  }, [loading, accountId, mode, hasAthlete, hasAthleteChecked]);

  async function handleLogin() {
    trackEvent({
      event_name: "home_login_clicked",
      mode: mode,
      season_year: mode === "paid" ? currentYear : demoYear,
      source: "home",
      next: next || null,
    });

    const ok = await safeSignIn();

    // After sign-in, route to next if provided; else go to Profile (activation funnel).
    if (ok) {
      nav(next ? next : createPageUrl("Profile"), { replace: true });
      return;
    }

    nav(createPageUrl("Home"), { replace: true });
  }

  function handleSubscribe() {
    trackEvent({
      event_name: "home_subscribe_clicked",
      mode: mode === "paid" ? "paid" : "demo",
      season_year: currentYear, // year being sold
      source: "home",
      account_id: accountId || null,
      next: next || null,
    });

    // Carry next forward if it exists
    const url =
      createPageUrl("Subscribe") + (next ? `?next=${encodeURIComponent(next)}` : "");
    nav(url);
  }

  function handleDemo() {
    trackEvent({
      event_name: "home_demo_clicked",
      mode: "demo",
      season_year: demoYear,
      source: "home",
      next: next || null,
    });
    nav(createPageUrl("Discover"));
  }

  function handleRightRailPrimary() {
    if (rightRailCta.action === "noop") return;

    if (rightRailCta.action === "login") return handleLogin();
    if (rightRailCta.action === "subscribe") return handleSubscribe();

    if (rightRailCta.action === "profile") {
      trackEvent({
        event_name: "home_profile_clicked",
        mode: "paid",
        season_year: currentYear,
        source: "home",
        account_id: accountId || null,
      });
      return nav(createPageUrl("Profile"));
    }

    if (rightRailCta.action === "discover") {
      trackEvent({
        event_name: "home_go_to_discover_clicked",
        mode: mode === "paid" ? "paid" : "demo",
        season_year: mode === "paid" ? currentYear : demoYear,
        source: "home",
        account_id: accountId || null,
      });
      return nav(createPageUrl("Discover"));
    }
  }

  return (
    <div style={{ padding: 28, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>RecruitMe</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Plan and prioritize college sports camps across your target schools.
          </div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            {mode === "paid"
              ? `Unlocked: Current Season (${currentYear})`
              : `Demo: Prior Season (${demoYear}) • Unlock Current Season (${currentYear})`}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleDemo}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
            type="button"
          >
            View demo
          </button>

          <button
            onClick={handleSubscribe}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
            }}
            type="button"
          >
            Subscribe
          </button>

          <button
            onClick={handleLogin}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
            }}
            type="button"
          >
            Log in
          </button>
        </div>
      </div>

      <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 18 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>What you get</div>
          <ul style={{ marginTop: 10, lineHeight: 1.7 }}>
            <li>Discover camps tied to target schools (not generic lists)</li>
            <li>Calendar overlays to spot conflicts early</li>
            <li>Favorites + registration tracking</li>
            <li>Multiple athletes under one account</li>
          </ul>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={handleRightRailPrimary}
              disabled={rightRailCta.action === "noop"}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontWeight: 700,
                opacity: rightRailCta.action === "noop" ? 0.7 : 1,
              }}
              type="button"
            >
              {rightRailCta.label}
            </button>

            <button
              onClick={handleSubscribe}
              style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
              type="button"
            >
              See pricing
            </button>
          </div>
        </div>

        <div style={{ border: "1px solid #eee", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Already subscribed?</div>
          <div style={{ marginTop: 8, opacity: 0.8 }}>Log in and manage your athletes.</div>

          <button
            onClick={handleLogin}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
            }}
            type="button"
          >
            Log in
          </button>

          {accountId && (
            <button
              onClick={() => nav(createPageUrl("Profile"))}
              style={{
                marginTop: 10,
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
              }}
              type="button"
            >
              Manage athletes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
