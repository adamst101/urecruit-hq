import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
      ts: new Date().toISOString(),
    });
  } catch {}
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * Season model: "Season YYYY" runs Feb 1 YYYY -> Feb 1 YYYY+1.
 * We store ends_at as Feb 1 next year (UTC) so hooks can treat it as exclusive end boundary.
 */
function seasonEndsAtUtc(seasonYear) {
  try {
    const y = Number(seasonYear);
    if (!Number.isFinite(y)) return null;
    const d = new Date(Date.UTC(y + 1, 1, 1, 0, 0, 0)); // Feb(1) 1st, 00:00:00 UTC
    return d.toISOString();
  } catch {
    return null;
  }
}

export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Your hook (currentYear is still useful as a fallback)
  const { isLoading, mode, accountId, currentYear } = useSeasonAccess();

  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");

  const signedIn = !!accountId;

  const backTarget = useMemo(() => createPageUrl("Subscribe"), []);
  const homeTarget = useMemo(() => createPageUrl("Home"), []);
  const discoverTarget = useMemo(() => createPageUrl("Discover"), []);
  const profileTarget = useMemo(() => createPageUrl("Profile"), []);

  // --- Read URL params: season + next + source ---
  const params = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const next = params.get("next");
  const source = params.get("source") || "checkout_page";

  // This is the key change: we sell *requested* season, not currentYear.
  const soldYear = useMemo(() => {
    const fromUrl = safeNumber(params.get("season"));
    return fromUrl || currentYear;
  }, [params, currentYear]);

  const nextTarget = useMemo(() => {
    // Always send them back somewhere sensible after purchase
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
     Track checkout_viewed (demo users only, deduped)
  ------------------------------------------------------- */
  useEffect(() => {
    if (isLoading) return;
    if (mode === "paid") return;

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
  }, [isLoading, mode, soldYear, source, accountId, next]);

  /* -------------------------------------------------------
     Purchase handler (test-mode entitlement)
     ✅ Create Entitlement for soldYear from URL (?season=YYYY)
  ------------------------------------------------------- */
  const handleCompletePurchase = async () => {
    if (!signedIn) {
      navigate(homeTarget);
      return;
    }

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

      // 2) Create entitlement if missing (test-mode)
      // Align payload to your Entitlement schema (account_id, season_year, status, starts_at, ends_at, product)
      if (!Array.isArray(existing) || existing.length === 0) {
        await base44.entities.Entitlement.create({
          account_id: accountId,
          season_year: soldYear,
          status: "active",
          starts_at: new Date().toISOString(),
          ends_at: seasonEndsAtUtc(soldYear), // optional but recommended
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
      // NOTE: after entitlement create, useSeasonAccess will flip to paid.
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

  // While redirecting paid users or loading, render nothing (prevents flicker)
  if (isLoading) return null;
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

        {!signedIn && (
          <Card className="p-4 border-rose-200 bg-rose-50 text-rose-700">
            <div className="font-semibold">Sign in required</div>
            <div className="text-sm mt-1">Please sign in to subscribe and unlock this season.</div>

            <Button
              className="w-full mt-4"
              onClick={() => {
                trackEvent({
                  event_name: "checkout_signin_required_clicked",
                  mode: "demo",
                  season_year: soldYear,
                  source,
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
                  Full access to season {soldYear}: camps + planning tools.
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
        )}
      </div>
    </div>
  );
}
