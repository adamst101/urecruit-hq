// src/pages/Checkout.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, CreditCard, ArrowLeft } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({
      ...payload,
      ts: new Date().toISOString()
    });
  } catch {}
}

export default function Checkout() {
  const navigate = useNavigate();
  const { loading, mode, accountId, currentYear } = useSeasonAccess();

  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");

  const signedIn = !!accountId;

  const backTarget = useMemo(() => createPageUrl("Subscribe"), []);
  const homeTarget = useMemo(() => createPageUrl("Home"), []);
  const discoverTarget = useMemo(() => createPageUrl("Discover"), []);
  const profileTarget = useMemo(() => createPageUrl("Profile"), []);

  /* -------------------------------------------------------
     Guardrail: paid users should NEVER see Checkout
  ------------------------------------------------------- */
  useEffect(() => {
    if (loading) return;
    if (mode === "paid") {
      navigate(discoverTarget, { replace: true });
    }
  }, [loading, mode, discoverTarget, navigate]);

  /* -------------------------------------------------------
     Track checkout_viewed (demo users only, deduped)
  ------------------------------------------------------- */
  useEffect(() => {
    if (loading) return;
    if (mode === "paid") return;

    const key = `evt_checkout_viewed_${currentYear}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "checkout_viewed",
      mode: "demo",
      season_year: currentYear,
      source: "checkout_page",
      account_id: accountId || null
    });
  }, [loading, mode, currentYear, accountId]);

  /* -------------------------------------------------------
     Purchase handler (test-mode entitlement)
  ------------------------------------------------------- */
  const handleCompletePurchase = async () => {
    if (!signedIn) {
      navigate(homeTarget);
      return;
    }

    setErr("");
    setWorking(true);

    try {
      // 1) Check existing entitlement
      let existing = [];
      try {
        existing = await base44.entities.Entitlement.filter({
          account_id: accountId,
          season_year: currentYear,
          status: "active"
        });
      } catch {
        existing = [];
      }

      // 2) Create entitlement if missing (test-mode)
      if (!Array.isArray(existing) || existing.length === 0) {
        await base44.entities.Entitlement.create({
          account_id: accountId,
          season_year: currentYear,
          status: "active",
          plan: "season",
          source: "checkout_test"
        });
      }

      // 3) Analytics — purchase completed
      trackEvent({
        event_name: "purchase_completed",
        mode: "paid",
        season_year: currentYear,
        source: "checkout_page",
        account_id: accountId
      });

      // 4) Activate → Profile (athlete creation / selection)
      navigate(profileTarget, {
        state: { postPurchase: true, season_year: currentYear }
      });
    } catch (e) {
      setErr(String(e?.message || e));

      trackEvent({
        event_name: "purchase_failed",
        mode: "demo",
        season_year: currentYear,
        source: "checkout_page",
        account_id: accountId || null
      });
    } finally {
      setWorking(false);
    }
  };

  // While redirecting paid users or loading, render nothing (prevents flicker)
  if (loading) return null;
  if (mode === "paid") return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <button
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
          onClick={() => {
            trackEvent({
              event_name: "checkout_back_clicked",
              mode: "demo",
              season_year: currentYear,
              source: "checkout_page",
              account_id: accountId || null
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
            Unlock the current season ({currentYear}). You’ll add athletes after purchase.
          </p>
        </div>

        {!signedIn && (
          <Card className="p-4 border-rose-200 bg-rose-50 text-rose-700">
            <div className="font-semibold">Sign in required</div>
            <div className="text-sm mt-1">
              Please sign in to subscribe and unlock the current season.
            </div>

            <Button
              className="w-full mt-4"
              onClick={() => {
                trackEvent({
                  event_name: "checkout_signin_required_clicked",
                  mode: "demo",
                  season_year: currentYear,
                  source: "checkout_page"
                });
                navigate(homeTarget);
              }}
            >
              Go to Home
            </Button>
          </Card>
        )}

        {signedIn && (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <CreditCard className="w-6 h-6 text-slate-700 mt-0.5" />
              <div className="flex-1">
                <div className="text-lg font-bold text-deep-navy">Season Pass</div>
                <div className="text-sm text-slate-600 mt-1">
                  Current-year camps + planning tools.
                </div>

                <div className="mt-4 space-y-2">
                  <Button
                    className="w-full"
                    onClick={handleCompletePurchase}
                    disabled={working}
                  >
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

                  {/* No demo escape hatch from checkout */}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      trackEvent({
                        event_name: "checkout_back_to_pricing_clicked",
                        mode: "demo",
                        season_year: currentYear,
                        source: "checkout_page",
                        account_id: accountId || null
                      });
                      navigate(backTarget);
                    }}
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
        )}
      </div>
    </div>
  );
}
