// src/pages/AuthRedirect.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

const FORCE_DEMO_SESSION_KEY = "force_demo_session_v1";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

function safeDecode(x) {
  try {
    return decodeURIComponent(String(x || ""));
  } catch {
    return String(x || "");
  }
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function getParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const next = sp.get("next");
    const mode = sp.get("mode"); // allow ?mode=demo for explicit demo routing
    const season = sp.get("season"); // optional requested season year
    return {
      next: next ? safeDecode(next) : null,
      mode: mode ? String(mode).toLowerCase() : null,
      seasonYear: safeNumber(season),
      source: sp.get("source") || "auth_redirect",
    };
  } catch {
    return { next: null, mode: null, seasonYear: null, source: "auth_redirect" };
  }
}

function forceDemoSessionOn() {
  try {
    return sessionStorage.getItem(FORCE_DEMO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export default function AuthRedirect() {
  const nav = useNavigate();
  const loc = useLocation();
  const season = useSeasonAccess();

  const p = useMemo(() => getParams(loc.search), [loc.search]);

  // Default next is Discover
  const nextPath = useMemo(() => {
    return p.next || createPageUrl("Discover");
  }, [p.next]);

  // Keep next stable during redirects
  const nextRef = useRef(nextPath);
  useEffect(() => {
    nextRef.current = nextPath;
  }, [nextPath]);

  // Demo override: URL OR session flag
  const forceDemo = useMemo(() => {
    const urlDemo = p.mode === "demo";
    const sessionDemo = forceDemoSessionOn();
    return urlDemo || sessionDemo;
  }, [p.mode]);

  // Which season are we selling/gating (if we need to send to Subscribe)
  const requestedSeasonYear = useMemo(() => {
    return p.seasonYear || season?.currentYear || null;
  }, [p.seasonYear, season?.currentYear]);

  useEffect(() => {
    if (season?.isLoading) return;

    const accountId = season?.accountId || null;
    const hasAccess = !!season?.hasAccess;
    const mode = season?.mode || "demo"; // "paid" | "demo"
    const next = nextRef.current || createPageUrl("Discover");

    trackEvent({
      event_name: "auth_redirect_eval",
      source: "AuthRedirect",
      auth_state: accountId ? "authed" : "anon",
      hook_mode: mode,
      has_access: hasAccess ? 1 : 0,
      force_demo: forceDemo ? 1 : 0,
      requested_season: requestedSeasonYear,
      next,
      entry_source: p.source,
    });

    // 0) Demo forced -> go straight to Discover demo (no subscribe gate)
    if (forceDemo) {
      const demoSeasonYear =
        p.seasonYear || season?.demoYear || season?.seasonYear || season?.currentYear || null;

      const to =
        createPageUrl("Discover") +
        `?mode=demo` +
        (demoSeasonYear ? `&season=${encodeURIComponent(demoSeasonYear)}` : "") +
        `&src=auth_redirect`;

      trackEvent({
        event_name: "auth_redirect_force_demo",
        source: "AuthRedirect",
        demo_season: demoSeasonYear,
        next,
      });

      nav(to, { replace: true });
      return;
    }

    // 1) Not authenticated -> send to Base44 /login and return to this exact URL after login
    // This does NOT "auto-login"; it prompts for login.
    if (!accountId) {
      try {
        const returnTo = window.location.pathname + window.location.search; // preserve next/season params
        const fromUrl = `${window.location.origin}${returnTo}`;
        const loginUrl = `${window.location.origin}/login?from_url=${encodeURIComponent(fromUrl)}`;

        trackEvent({
          event_name: "auth_redirect_to_login",
          source: "AuthRedirect",
          next,
          requested_season: requestedSeasonYear,
        });

        window.location.assign(loginUrl);
      } catch {
        nav(createPageUrl("Home"), { replace: true });
      }
      return;
    }

    // 2) Authenticated + entitled -> go to next
    if (mode === "paid" && hasAccess) {
      trackEvent({
        event_name: "auth_redirect_success_paid",
        source: "AuthRedirect",
        next,
        season_year: season?.seasonYear || null,
      });
      nav(next, { replace: true });
      return;
    }

    // 3) Authenticated but NOT entitled -> go to Subscribe (season-aware)
    trackEvent({
      event_name: "auth_redirect_block_no_entitlement",
      source: "AuthRedirect",
      next,
      requested_season: requestedSeasonYear,
    });

    const subscribeUrl =
      createPageUrl("Subscribe") +
      `?source=auth_gate` +
      (requestedSeasonYear ? `&season=${encodeURIComponent(requestedSeasonYear)}` : "") +
      `&next=${encodeURIComponent(next)}`;

    nav(subscribeUrl, { replace: true });
  }, [
    season?.isLoading,
    season?.accountId,
    season?.mode,
    season?.hasAccess,
    season?.seasonYear,
    season?.demoYear,
    season?.currentYear,
    forceDemo,
    requestedSeasonYear,
    p.seasonYear,
    p.source,
    nav,
  ]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-6 rounded-2xl shadow-sm border border-default bg-white">
        <div className="text-lg font-bold text-deep-navy">Checking access…</div>
        <div className="mt-2 text-sm text-slate-600">
          Verifying your login and season access, then routing you to the right workspace.
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={() => nav(createPageUrl("Home"), { replace: true })}>
            Back to Home
          </Button>
          <Button
            onClick={() =>
              nav(
                createPageUrl("Subscribe") +
                  `?source=auth_redirect_cta` +
                  (requestedSeasonYear ? `&season=${encodeURIComponent(requestedSeasonYear)}` : ""),
                { replace: false }
              )
            }
          >
            View pricing
          </Button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          If you’re not subscribed for the requested season, you’ll be sent to pricing.
        </div>
      </Card>
    </div>
  );
}
