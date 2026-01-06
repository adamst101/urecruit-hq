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

  // ✅ Standard hook usage
  const { isLoading, mode, seasonYear, currentYear, demoYear, accountId } = useSeasonAccess();

  // Optional: check if user has at least one athlete (for CTA text only)
  const [hasAthlete, setHasAthlete] = useState(false);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!accountId) {
        if (alive) setHasAthlete(false);
        return;
      }
      try {
        // Adjust entity name/field if your app uses a different model.
        // This is non-blocking UX; CTA still works even if this fails.
        const rows = await base44.entities.Athlete.filter({ account_id: accountId });
        if (!alive) return;
        setHasAthlete(Array.isArray(rows) && rows.length > 0);
      } catch {
        if (!alive) return;
        setHasAthlete(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [accountId]);

  // Home viewed (dedupe per session)
  useEffect(() => {
    if (isLoading) return;

    const key = `evt_home_viewed_${mode}_${seasonYear}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "home_viewed",
      mode: mode,
      season_year: seasonYear, // ✅ single source of truth
      source: "home",
      account_id: accountId || null,
    });
  }, [isLoading, mode, seasonYear, accountId]);

  // Guardrail: paid users should not hang out on marketing entry once known
  useEffect(() => {
    if (isLoading) return;
    if (mode !== "paid") return;

    // If they explicitly came with a next param, respect it.
    if (next) return;

    // Paid users go straight to Discover/MyCamps experience
    nav(createPageUrl("Discover"), { replace: true });
  }, [isLoading, mode, next, nav]);

  const primaryCta = useMemo(() => {
    // If we haven't resolved access yet, keep label stable
    if (isLoading) return { label: "Loading…", action: "noop" };

    // Not signed in: prompt login
    if (!accountId) return { label: "Log in", action: "login" };

    // Signed in but not paid: go to Subscribe
    if (mode !== "paid") return { label: "Subscribe", action: "subscribe" };

    // Paid: if no athlete yet, prompt profile creation; else go to Discover
    if (!hasAthlete) return { label: "Create athlete profile", action: "profile" };

    return { label: "Go to Discover", action: "discover" };
  }, [isLoading, accountId, mode, hasAthlete]);

  async function handleLogin() {
    trackEvent({
      event_name: "home_login_clicked",
      mode: mode,
      season_year: seasonYear,
      source: "home",
      account_id: accountId || null,
    });

    const ok = await safeSignIn();

    // After sign-in, route to next if provided; otherwise go to Profile (activation)
    if (ok) {
      nav(next ? next : createPageUrl("Profile"), { replace: true });
      return;
    }

    // If platform signIn isn't available, fallback to Home (no crash)
    nav(createPageUrl("Home"), { replace: true });
  }

  function handlePrimary() {
    if (primaryCta.action === "noop") return;

    if (primaryCta.action === "login") return handleLogin();

    if (primaryCta.action === "subscribe") {
      trackEvent({
        event_name: "home_subscribe_clicked",
        mode: "demo",
        season_year: currentYear, // ✅ year being sold
        source: "home",
        account_id: accountId || null,
      });
      return nav(createPageUrl("Subscribe"));
    }

    if (primaryCta.action === "profile") {
      trackEvent({
        event_name: "home_profile_clicked",
        mode: "paid",
        season_year: currentYear,
        source: "home",
        account_id: accountId || null,
      });
      return nav(createPageUrl("Profile"));
    }

    if (primaryCta.action === "discover") {
      trackEvent({
        event_name: "home_go_to_discover_clicked",
        mode: "paid",
        season_year: currentYear,
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
            Plan and prioritize college football camps across your target schools.
          </div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            {mode === "paid"
              ? `Unlocked: Current Season (${currentYear})`
              : `Demo: Prior Season (${demoYear}) • Unlock Current Season (${currentYear})`}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => {
              trackEvent({
                event_name: "home_demo_clicked",
                mode: "demo",
                season_year: demoYear,
                source: "home",
              });
              nav(createPageUrl("Discover"));
            }}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
          >
            View demo
          </button>

          <button
            onClick={() => {
              trackEvent({
                event_name: "home_subscribe_clicked",
                mode: mode === "paid" ? "paid" : "demo",
                season_year: currentYear,
                source: "home",
                account_id: accountId || null,
              });
              nav(createPageUrl("Subscribe"));
            }}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
            }}
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
              disabled={primaryCta.action === "noop"}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontWeight: 700,
                opacity: primaryCta.action === "noop" ? 0.7 : 1,
              }}
            >
              {primaryCta.label}
            </button>

            <button
              onClick={() => {
                trackEvent({
                  event_name: "home_pricing_clicked",
                  mode: mode === "paid" ? "paid" : "demo",
                  season_year: currentYear, // pricing for current season
                  source: "home",
                  account_id: accountId || null,
                });
                nav(createPageUrl("Subscribe"));
              }}
              style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
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
            >
              Manage athletes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
