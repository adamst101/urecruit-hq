import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, CreditCard, ArrowLeft } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

/**
 * ✅ Checkout (rewritten success flow)
 *
 * PURPOSE:
 * - Allow purchase WITHOUT requiring athlete profile first
 * - On success: create entitlement, then route to Profile setup (required)
 *
 * DO NOT:
 * - Redirect back to Onboarding because profile is missing
 *   (that is what makes Upgrade look broken)
 */
export default function Checkout() {
  const navigate = useNavigate();

  const { accountId, mode, currentYear } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");

  const signedIn = !!accountId;
  const hasProfile = !!athleteProfile;

  const backTarget = useMemo(() => createPageUrl("Onboarding"), []);

  /**
   * Minimal analytics helper (optional)
   * If you created Event entity already, this will write an event row.
   */
  const trackEvent = (payload) => {
    try {
      base44.entities.Event.create({
        ...payload,
        ts: new Date().toISOString()
      });
    } catch {
      // never block checkout
    }
  };

  /**
   * ✅ Success handler: unlock season + route to Profile (required)
   */
  const handleCompletePurchase = async () => {
    if (!signedIn) {
      // Must be signed in to purchase / unlock
      navigate(createPageUrl("Home"));
      return;
    }

    setErr("");
    setWorking(true);

    try {
      // ------------------------------------------------------------
      // 1) Create entitlement (your current test-mode approach)
      //    If you already have a real checkout provider later,
      //    replace this with provider confirmation then entitlement write.
      // ------------------------------------------------------------
      // Deduplicate: if entitlement exists for this account + year, don't create again
      let existing = [];
      try {
        existing = await base44.entities.Entitlement.filter({
          account_id: accountId,
          season_year: currentYear
        });
      } catch {
        existing = [];
      }

      if (!Array.isArray(existing) || existing.length === 0) {
        await base44.entities.Entitlement.create({
          account_id: accountId,
          season_year: currentYear,
          status: "active",
          plan: "season",
          source: "checkout_test"
        });
      }

      // ------------------------------------------------------------
      // 2) (Optional) analytics
      // ------------------------------------------------------------
      trackEvent({
        event_name: "purchase_completed",
        mode: "paid",
        season_year: currentYear
      });

      // ------------------------------------------------------------
      // 3) Route to Profile setup as activation step
      //    - If profile already exists, go straight to Discover
      // ------------------------------------------------------------
      if (hasProfile) {
        navigate(createPageUrl("Discover"));
      } else {
        navigate(createPageUrl("Profile"), {
          state: { postPurchase: true, season_year: currentYear }
        });
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <button
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
          onClick={() => navigate(backTarget)}
          type="button"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div>
          <h1 className="text-2xl font-bold text-deep-navy">Checkout</h1>
          <p className="text-slate-600 mt-1">
            Unlock the current season ({currentYear}). You’ll set up your athlete profile right after purchase.
          </p>
        </div>

        {!signedIn && (
          <Card className="p-4 border-rose-200 bg-rose-50 text-rose-700">
            <div className="font-semibold">Sign in required</div>
            <div className="text-sm mt-1">
              Please sign in to subscribe and unlock the current season.
            </div>
            <Button className="w-full mt-4" onClick={() => navigate(createPageUrl("Home"))}>
              Go to Sign In
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
                  Access current season camps, favorites, and planning tools.
                </div>

                <div className="mt-4 space-y-2">
                  <Button className="w-full" onClick={handleCompletePurchase} disabled={working || identityLoading}>
                    {working ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Processing…
                      </>
                    ) : (
                      <>
                        Complete Purchase
                        <CheckCircle2 className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>

                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => navigate(createPageUrl("Discover"))}
                    disabled={working}
                  >
                    Keep Browsing Demo
                  </Button>

                  {identityLoading && (
                    <div className="text-xs text-slate-500">
                      Loading account status…
                    </div>
                  )}

                  {err && (
                    <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                      {err}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
