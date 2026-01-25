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

  // Core gate:
  // 1) If not authenticated -> send to Base44 built-in /login, returning here after login
  // 2) If authenticated + entitled -> go to next (paid workspace)
  // 3) If authenticated + NOT entitled -> FORCE LOGOUT (no entitlement = no session) -> go to Subscribe
  useEffect(() => {
    if (season?.isLoading) return;

    const accountId = season?.accountId || null;
    const mode = season?.mode || "demo"; // "paid" | "demo"
    const next = nextRef.current || createPageUrl("Discover");

    trackEvent({
      event_name: "auth_redirect_eval",
      source: "AuthRedirect",
      auth_state: accountId ? "authed" : "anon",
      mode
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
    if (mode === "paid") {
      trackEvent({
        event_name: "auth_redirect_success_paid",
        source: "AuthRedirect",
        next
      });
      nav(next, { replace: true });
      return;
    }

    // 3) Authed but NOT entitled -> force logout + send to Subscribe
    (async () => {
      trackEvent({
        event_name: "auth_redirect_block_no_entitlement",
        source: "AuthRedirect",
        next
      });

      // Enforce your desired UX: if they are not entitled, they cannot remain logged-in.
      try {
        if (base44?.auth?.logout) {
          await base44.auth.logout();
          trackEvent({
            event_name: "auth_redirect_forced_logout",
            source: "AuthRedirect",
            reason: "no_entitlement"
          });
        }
      } catch (e) {
        trackEvent({
          event_name: "auth_redirect_forced_logout_failed",
          source: "AuthRedirect",
          reason: "no_entitlement",
          error: String(e?.message || e)
        });
      }

      const subscribeUrl =
        createPageUrl("Subscribe") +
        `?source=auth_gate_no_entitlement&next=${encodeURIComponent(next)}`;

      nav(subscribeUrl, { replace: true });
    })();
  }, [season?.isLoading, season?.accountId, season?.mode, nav]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-6 rounded-2xl shadow-sm border border-default bg-white">
        <div className="text-lg font-bold text-deep-navy">Checking access…</div>
        <div className="mt-2 text-sm text-slate-600">
          Verifying your Season Pass and routing you to the correct workspace.
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
              nav(createPageUrl("Subscribe") + `?source=auth_redirect_cta`, {
                replace: false
              })
            }
          >
            View pricing
          </Button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          If you don’t have a Season Pass, you’ll be signed out and sent to pricing.
        </div>
      </Card>
    </div>
  );
}
