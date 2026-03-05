// src/pages/Checkout.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, CreditCard, ArrowLeft } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { getCurrentSoldSeason, getCurrentActiveSeason, isEarlyBirdPeriod } from "../components/utils/seasonUtils.js";

function trackEvent(payload) {
  try {
    const EventEntity = base44?.entities?.Event || base44?.entities?.Events;
    if (!EventEntity?.create) return;

    const now = new Date();
    const iso = now.toISOString();
    const day = iso.slice(0, 10);
    const eventName =
      payload?.event_name || payload?.event_type || payload?.title || payload?.name || "event";
    const sourcePlatform = payload?.source_platform || payload?.source || "web";
    const title = payload?.title || String(eventName);
    const sourceKey =
      payload?.source_key || payload?.sourceKey || `${String(sourcePlatform)}:${String(eventName)}`;
    const startDate = payload?.start_date || day;

    EventEntity.create({
      source_platform: String(sourcePlatform),
      event_type: String(eventName),
      title: String(title),
      source_key: String(sourceKey),
      start_date: String(startDate),
      payload_json: JSON.stringify(payload || {}),
      ts: iso,
    });
  } catch {}
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Season model: "Season YYYY" runs Feb 1 YYYY -> Feb 1 YYYY+1.
 * Store ends_at as Feb 1 next year (UTC) so hooks can treat it as exclusive end boundary.
 */
function seasonEndsAtUtc(seasonYear) {
  try {
    const y = Number(seasonYear);
    if (!Number.isFinite(y)) return null;
    const d = new Date(Date.UTC(y + 1, 1, 1, 0, 0, 0)); // Feb 1 next year 00:00:00 UTC
    return d.toISOString();
  } catch {
    return null;
  }
}

export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Your hook
  const { isLoading, mode, accountId, currentYear } = useSeasonAccess();

  const soldSeason = useMemo(() => getCurrentSoldSeason(), []);
  const activeSeason = useMemo(() => getCurrentActiveSeason(), []);
  const earlyBird = useMemo(() => isEarlyBirdPeriod(), []);

  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");

  const signedIn = !!accountId;

  const backTarget = useMemo(() => createPageUrl("Subscribe"), []);
  const discoverTarget = useMemo(() => createPageUrl("Discover"), []);

  // --- Read URL params: season + next + source ---
  const params = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const next = params.get("next");
  const source = params.get("source") || "checkout_page";

  // Always use the dynamically computed soldSeason
  const soldYear = soldSeason;

  const nextTarget = useMemo(() => {
    return next || createPageUrl("Profile");
  }, [next]);

  /* -------------------------------------------------------
     Guardrail: paid users should NEVER see Checkout
  ------------------------------------------------------- */
  useEffect(() => {
    if (isLoading) return;
    if (mode === "paid") {
      navigate(discoverTarget, { replace: true });
    }
  }, [isLoading, mode, discoverTarget, navigate]);

  /* -------------------------------------------------------
     NEW: Checkout is the place login happens for new buyers
     If not signed in, send to Base44 /login and return to this Checkout URL.
  ------------------------------------------------------- */
  useEffect(() => {
    if (isLoading) return;
    if (mode === "paid") return;

    if (!signedIn) {
      trackEvent({
        event_name: "checkout_requires_login",
        source,
        season_year: soldYear || null,
        next: next || null
      });

      try {
        // Preserve exact checkout URL + params
        const returnTo = `${window.location.origin}${createPageUrl("Checkout")}${location.search || ""}`;
        const loginUrl = `${window.location.origin}/login?from_url=${encodeURIComponent(returnTo)}`;
        window.location.assign(loginUrl);
      } catch (e) {
        // Fallback: send to Home with next
        const currentPath = `${createPageUrl("Checkout")}${location.search || ""}`;
        navigate(createPageUrl("Home") + `?signin=1&next=${encodeURIComponent(currentPath)}`, { replace: true });
      }
    }
  }, [isLoading, mode, signedIn, source, soldYear, next, location.search, navigate]);

  /* -------------------------------------------------------
     Track checkout_viewed (only if signed in; otherwise we redirect to login)
  ------------------------------------------------------- */
  useEffect(() => {
    if (isLoading) return;
    if (mode === "paid") return;
    if (!signedIn) return;

    const key = `evt_checkout_viewed_${soldYear}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "checkout_viewed",
      mode: "demo",
      season_year: soldYear,
      source,
      account_id: accountId || null,
      next: next || null,
    });
  }, [isLoading, mode, signedIn, soldYear, source, accountId, next]);

  /* -------------------------------------------------------
     Purchase handler (test-mode entitlement)
     Creates Entitlement for soldYear
  ------------------------------------------------------- */
  const handleCompletePurchase = async () => {
    if (!signedIn) return; // should not happen due to redirect

    setErr("");
    setWorking(true);

    try {
      // 1) Check existing entitlement for THIS season
      let existing = [];
      try {
        existing = await base44.entities.Entitlement.filter({
          account_id: accountId,
          season_year: soldYear,
          status: "active",
        });
      } catch {
        existing = [];
      }

      // 2) Create entitlement if missing
      if (!Array.isArray(existing) || existing.length === 0) {
        await base44.entities.Entitlement.create({
          account_id: accountId,
          season_year: soldYear,
          status: "active",
          starts_at: new Date().toISOString(),
          ends_at: seasonEndsAtUtc(soldYear),
          product: "RecruitMeSeasonAccess",
        });
      }

      // 3) Analytics — purchase completed
      trackEvent({
        event_name: "purchase_completed",
        mode: "paid",
        season_year: soldYear,
        source,
        account_id: accountId,
        next: next || null,
      });

      // 4) Activate → nextTarget (default Profile)
      navigate(nextTarget, {
        state: { postPurchase: true, season_year: soldYear },
        replace: true,
      });
    } catch (e) {
      const msg = String(e?.message || e);
      setErr(msg);

      trackEvent({
        event_name: "purchase_failed",
        mode: "demo",
        season_year: soldYear,
        source,
        account_id: accountId || null,
        next: next || null,
        error: msg,
      });
    } finally {
      setWorking(false);
    }
  };

  // While redirecting paid users or loading, render nothing
  if (isLoading) return null;
  if (mode === "paid") return null;

  // If not signed in, we immediately redirect to login; render nothing to avoid flicker
  if (!signedIn) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <button
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
          onClick={() => {
            trackEvent({
              event_name: "checkout_back_clicked",
              mode: "demo",
              season_year: soldYear,
              source,
              account_id: accountId || null,
              next: next || null,
            });
            navigate(backTarget);
          }}
          type="button"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div>
          <h1 className="text-2xl font-bold text-deep-navy">Checkout</h1>
          <p className="text-slate-600 mt-1">
            Unlock season ({soldYear}). You’ll add athletes after purchase.
          </p>
        </div>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <CreditCard className="w-6 h-6 text-slate-700 mt-0.5" />
            <div className="flex-1">
              <div className="text-lg font-bold text-deep-navy">Season Pass {soldYear}</div>
              <div className="text-sm text-slate-600 mt-1">
                {earlyBird
                  ? `Full access to ${soldYear} camp season (March — August ${soldYear}) + immediate access to ${activeSeason} camp data.`
                  : `Full access to ${soldYear} camp season: camps + planning tools.`}
              </div>

              <div className="mt-4 space-y-2">
                <Button className="w-full" onClick={handleCompletePurchase} disabled={working}>
                  {working ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Processing…
                    </>
                  ) : (
                    <>
                      Complete Purchase (Test)
                      <CheckCircle2 className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    trackEvent({
                      event_name: "checkout_back_to_pricing_clicked",
                      mode: "demo",
                      season_year: soldYear,
                      source,
                      account_id: accountId || null,
                      next: next || null,
                    });
                    navigate(backTarget);
                  }}
                  disabled={working}
                >
                  Back to Pricing
                </Button>

                {err && (
                  <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                    {err}
                  </div>
                )}
              </div>

              <div className="mt-3 text-xs text-slate-500">
                Replace test purchase with Stripe later. The flow remains the same.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}