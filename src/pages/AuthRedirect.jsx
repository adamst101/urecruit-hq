// src/pages/AuthRedirect.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

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

function getNext(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const next = sp.get("next");
    return next ? safeDecode(next) : createPageUrl("Discover");
  } catch {
    return createPageUrl("Discover");
  }
}

export default function AuthRedirect() {
  const nav = useNavigate();
  const loc = useLocation();
  const season = useSeasonAccess();

  const nextPath = useMemo(() => getNext(loc.search), [loc.search]);

  // Keep the original "next" stable during redirects
  const nextRef = useRef(nextPath);
  useEffect(() => {
    nextRef.current = nextPath;
  }, [nextPath]);

  /**
   * Core gate:
   * 1) If not authenticated -> send to Base44 built-in /login, returning here after login
   * 2) If authenticated + entitled -> go to next (paid workspace)
   * 3) If authenticated + NOT entitled ->
   *      ✅ HARD redirect to Subscribe (full reload) so we DO NOT keep any demo session or stale state
   */
  useEffect(() => {
    if (season?.isLoading) return;

    const accountId = season?.accountId || null;
    const mode = season?.mode || "demo"; // "paid" | "demo"
    const hasAccess = !!season?.hasAccess;
    const next = nextRef.current || createPageUrl("Discover");

    trackEvent({
      event_name: "auth_redirect_eval",
      source: "AuthRedirect",
      auth_state: accountId ? "authed" : "anon",
      mode,
      has_access: hasAccess ? 1 : 0,
      next
    });

    // 1) Not authed -> go to built-in /login and come back to this exact URL
    if (!accountId) {
      try {
        const returnTo = window.location.pathname + window.location.search;
        const url = `/login?next=${encodeURIComponent(returnTo)}`;
        window.location.assign(url);
      } catch {
        nav(createPageUrl("Home"), { replace: true });
      }
      return;
    }

    // 2) Authed + entitled -> paid
    if (mode === "paid" && hasAccess) {
      trackEvent({
        event_name: "auth_redirect_success_paid",
        source: "AuthRedirect",
        next
      });
      nav(next, { replace: true });
      return;
    }

    // 3) Authed but NOT entitled -> HARD redirect to Subscribe (full reload)
    // IMPORTANT: We do NOT want this to feel like "login == subscribe",
    // but we DO want "member login" to only complete into paid.
    // If not entitled, we hard-land them at Subscribe and the session should not continue.
    trackEvent({
      event_name: "auth_redirect_block_no_entitlement",
      source: "AuthRedirect",
      next
    });

    try {
      // Build the same Subscribe URL your app expects
      const subscribeUrl =
        `${window.location.origin}${createPageUrl("Subscribe")}` +
        `?source=auth_gate&next=${encodeURIComponent(next)}`;

      // ✅ Hard redirect (full reload)
      window.location.assign(subscribeUrl);
    } catch {
      // Fallback to SPA nav (should be rare)
      nav(
        createPageUrl("Subscribe") + `?source=auth_gate&next=${encodeURIComponent(next)}`,
        { replace: true }
      );
    }
  }, [season?.isLoading, season?.accountId, season?.mode, season?.hasAccess, nav]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-6 rounded-2xl shadow-sm border border-default bg-white">
        <div className="text-lg font-bold text-deep-navy">Checking access…</div>
        <div className="mt-2 text-sm text-slate-600">
          Verifying your subscription and routing you to the correct workspace.
        </div>

        <div className="mt-5 flex gap-2">
          <Button
            variant="outline"
            onClick={() => nav(createPageUrl("Home"), { replace: true })}
          >
            Back to Home
          </Button>

          <Button
            onClick={() =>
              nav(createPageUrl("Subscribe") + `?source=auth_redirect_cta`, { replace: false })
            }
          >
            View pricing
          </Button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          If you’re not subscribed, you’ll be sent to pricing.
        </div>
      </Card>
    </div>
  );
}
