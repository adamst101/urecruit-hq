// src/pages/Subscribe.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, ArrowRight, Lock } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({
      ...payload,
      ts: new Date().toISOString(),
    });
  } catch {}
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function SubscribePage() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Standard contract
  const { isLoading, mode, hasAccess, seasonYear, currentYear, demoYear, accountId } =
    useSeasonAccess();

  const params = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const force = params.get("force") === "1";
  const next = params.get("next"); // presence implies intentional navigation
  const source = params.get("source") || "subscribe_page";

  // ✅ NEW: allow passing season in URL (?season=YYYY)
  // This ensures Discover?season=2026 -> sign-in -> Subscribe sells 2026 (not whatever default)
  const soldYear = useMemo(() => {
    const fromUrl = safeNumber(params.get("season"));
    return fromUrl || currentYear; // fallback to footballCurrentSeasonYear()
  }, [params, currentYear]);

  // ✅ Guardrail: paid users generally shouldn't see Subscribe (unless forced/intentional)
  useEffect(() => {
    if (isLoading) return;
    if (mode === "paid" && !force && !next) {
      navigate(createPageUrl("Discover"), { replace: true });
    }
  }, [isLoading, mode, force, next, navigate]);

  // ✅ Subscribe viewed (dedupe) — only for demo users
  useEffect(() => {
    if (isLoading) return;
    if (mode === "paid") return;

    const key = `evt_subscribe_viewed_${soldYear || "na"}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "subscribe_viewed",
      mode: mode || "demo",
      season_year: soldYear || null, // ✅ use soldYear (not currentYear)
      source,
      account_id: accountId || null,
      force: force ? 1 : 0,
      next: next || null,
      has_access: !!hasAccess,
    });
  }, [isLoading, mode, soldYear, source, accountId, force, next, hasAccess]);

  // While redirecting paid users, render nothing (prevents flicker)
  if (isLoading) return null;
  if (mode === "paid" && !force && !next) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="pt-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-deep-navy">Subscribe</h1>

            {mode === "demo" ? (
              <Badge className="bg-slate-900 text-white">Demo {demoYear || ""}</Badge>
            ) : (
              <Badge className="bg-emerald-700 text-white">Paid {soldYear || ""}</Badge>
            )}
          </div>

          <p className="text-slate-600 mt-1">
            Unlock the current season ({soldYear}) and planning tools.
          </p>
        </div>

        <Card className="p-4 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-700 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900">Season Pass</div>
              <div className="text-sm text-amber-900/80 mt-1">
                Current-year camp data + full planning experience for families.
              </div>

              <div className="mt-3 space-y-2 text-sm text-amber-900/90">
                <Feature>Current-year camps & updates</Feature>
                <Feature>Unlimited favorites + registrations tracking</Feature>
                <Feature>Calendar planning overlays & conflict detection</Feature>
                <Feature>Multi-athlete support (one email, multiple kids)</Feature>
              </div>

              <div className="mt-4 bg-white/70 border border-amber-200 rounded-xl p-3">
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold text-amber-900">Season Pass</div>
                  <div className="text-2xl font-bold text-amber-900">$49</div>
                </div>
                <div className="text-xs text-amber-900/70 mt-1">
                  Per season. Add multiple athletes under one email.
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Button
                  className="w-full"
                  onClick={() => {
                    trackEvent({
                      event_name: "checkout_cta_clicked",
                      mode: mode || "demo",
                      season_year: soldYear || null, // ✅ use soldYear
                      source,
                      account_id: accountId || null,
                      force: force ? 1 : 0,
                      next: next || null,
                      has_access: !!hasAccess,
                    });

                    // ✅ Always send them back somewhere sensible after Checkout
                    const targetNext = next || createPageUrl("Profile");

                    // ✅ NEW: pass season into checkout so it creates entitlement for the right year
                    const checkoutUrl =
                      createPageUrl("Checkout") +
                      `?season=${encodeURIComponent(soldYear)}` +
                      `&source=${encodeURIComponent(source)}` +
                      `&next=${encodeURIComponent(targetNext)}`;

                    navigate(checkoutUrl);
                  }}
                >
                  Continue to Checkout
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    trackEvent({
                      event_name: "subscribe_keep_demo_clicked",
                      mode: mode || "demo",
                      season_year: soldYear || null,
                      source,
                      account_id: accountId || null,
                      force: force ? 1 : 0,
                      next: next || null,
                      has_access: !!hasAccess,
                    });

                    // If a "next" exists, honor it; otherwise go discover
                    if (next) navigate(next);
                    else navigate(createPageUrl("Discover"));
                  }}
                >
                  Keep Browsing Demo
                </Button>

                {next ? (
                  <Button variant="ghost" className="w-full" onClick={() => navigate(next)}>
                    Back
                  </Button>
                ) : null}
              </div>

              <div className="mt-3 text-xs text-amber-900/70">
                No athlete profile required before purchase. You’ll add athletes after checkout.
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="font-semibold text-deep-navy">FAQ</div>
          <div className="mt-2 text-sm text-slate-600 space-y-2">
            <div>
              <span className="font-medium text-slate-700">Can I add multiple kids?</span>{" "}
              Yes — one email can manage multiple athletes.
            </div>
            <div>
              <span className="font-medium text-slate-700">Do I need to create a profile first?</span>{" "}
              No — you create athletes after purchase.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Feature({ children }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="w-4 h-4 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

export default function Subscribe() {
  return <SubscribePage />;
}
