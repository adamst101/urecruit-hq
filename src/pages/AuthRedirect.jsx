import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Lock, LogOut } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { clearDemoMode, getDemoDefaults, setDemoMode } from "../components/hooks/demoMode.jsx";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

function getNext(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const next = sp.get("next");
    // next can be a full path like "/discover" (preferred)
    return next && String(next).trim() ? String(next) : null;
  } catch {
    return null;
  }
}

export default function AuthRedirect() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess(); // { isLoading, mode, accountId, currentYear, demoYear, ... }

  const next = useMemo(() => getNext(loc.search), [loc.search]);
  const nextUrl = next || createPageUrl("Discover");

  const { demoSeasonYear } = getDemoDefaults();

  // Core resolver: wait for season to load, then route.
  useEffect(() => {
    if (season?.isLoading) return;

    // Not authed -> send to Base44 login and return here
    if (!season?.accountId) {
      const back = encodeURIComponent(
        createPageUrl("AuthRedirect") + `?next=${encodeURIComponent(nextUrl)}`
      );
      trackEvent({ event_name: "auth_redirect_to_login", source: "auth_redirect", next: nextUrl });
      nav(`${createPageUrl("Login")}?next=${back}`, { replace: true });
      return;
    }

    // Authed + paid -> clear demo state and go to paid destination
    if (season?.mode === "paid") {
      try {
        clearDemoMode();
      } catch {}

      trackEvent({
        event_name: "auth_redirect_paid_success",
        source: "auth_redirect",
        next: nextUrl
      });

      nav(nextUrl, { replace: true });
      return;
    }

    // Authed but NOT paid -> stay here and show the Upgrade / Demo choices (Option B)
    trackEvent({
      event_name: "auth_redirect_not_entitled_view",
      source: "auth_redirect",
      next: nextUrl
    });
  }, [season?.isLoading, season?.accountId, season?.mode, nav, nextUrl]);

  if (season?.isLoading) return null;

  // If user is paid or not authed, the effect above will redirect.
  // Render only when authed but not entitled.
  const showNotEntitled = !!season?.accountId && season?.mode !== "paid";
  if (!showNotEntitled) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-slate-50 p-4">
      <Card className="max-w-md w-full p-8 border-slate-200">
        <div className="text-center space-y-6">
          <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-amber-100">
            <Lock className="w-8 h-8 text-amber-700" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-deep-navy">Subscription required</h1>
            <p className="text-slate-600 mt-2">
              You're logged in, but your account doesn't have an active subscription for this season.
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600 text-left">
            <p className="font-medium text-slate-700 mb-2">Choose an option:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Upgrade to unlock your paid workspace</li>
              <li>Or continue in demo mode (prior-season data)</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => {
                trackEvent({
                  event_name: "auth_redirect_upgrade_clicked",
                  source: "auth_redirect",
                  next: nextUrl
                });

                nav(
                  createPageUrl("Subscribe") +
                    `?source=auth_redirect&reason=no_entitlement&next=${encodeURIComponent(nextUrl)}`,
                  { replace: false }
                );
              }}
            >
              Upgrade to Paid
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                trackEvent({
                  event_name: "auth_redirect_continue_demo_clicked",
                  source: "auth_redirect",
                  demo_season: demoSeasonYear
                });

                // Force demo explicitly (so user isn't confused why they see demo)
                setDemoMode(demoSeasonYear);

                nav(
                  `${createPageUrl("Discover")}?mode=demo&season=${encodeURIComponent(
                    String(demoSeasonYear)
                  )}`,
                  { replace: true }
                );
              }}
            >
              Continue Demo
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              onClick={async () => {
                trackEvent({ event_name: "auth_redirect_logout_clicked", source: "auth_redirect" });
                try {
                  await base44.auth?.signOut?.();
                } catch {}
                try {
                  clearDemoMode();
                } catch {}
                nav(createPageUrl("Home"), { replace: true });
              }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </Button>
          </div>

          <div className="text-xs text-slate-500">
            If you believe you should have access, contact support to enable your subscription.
          </div>
        </div>
      </Card>
    </div>
  );
}