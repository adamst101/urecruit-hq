import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, CheckCircle2, Loader2 } from "lucide-react";

import { createPageUrl } from "../utils";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";

/**
 * Checkout (placeholder)
 * Base44 convention route: /Checkout
 *
 * Today:
 * - UX placeholder so your paywall CTA works.
 * Next:
 * - Stripe checkout (or Base44 payments) + Entitlement creation.
 */
export default function Checkout() {
  const navigate = useNavigate();
  const { mode, currentYear } = useSeasonAccess();

  // If user is already paid, don't let them linger here
  if (mode === "paid") {
    navigate(createPageUrl("Discover"));
    return null;
  }

  const [isWorking, setIsWorking] = useState(false);

  const priceLabel = useMemo(() => {
    // You can change this later
    return "$49 / year";
  }, []);

  const handleContinue = async () => {
    // Placeholder: this is where you will call Stripe/Base44 payment flow
    setIsWorking(true);

    // Fake delay so user sees feedback (remove when real checkout exists)
    await new Promise((r) => setTimeout(r, 600));

    setIsWorking(false);
    alert("Next step: integrate payments + create Entitlement record. For now this is a placeholder.");
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <button
          onClick={() => navigate(createPageUrl("Onboarding"))}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-6 h-6 text-slate-700 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <h1 className="text-xl font-bold text-deep-navy">
                  Unlock Current Season ({currentYear})
                </h1>
                <Badge className="bg-slate-900 text-white">{priceLabel}</Badge>
              </div>

              <p className="text-sm text-slate-600 mt-2">
                Upgrade to access current-year camps, favorites, registrations, and calendar planning.
                Access renews yearly and expires at season end.
              </p>

              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Current-year camp database
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Favorites + registrations sync everywhere
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Calendar overlays and conflict visibility
                </div>
              </div>

              <div className="mt-6 space-y-2">
                <Button className="w-full" onClick={handleContinue} disabled={isWorking}>
                  {isWorking ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Redirecting…
                    </>
                  ) : (
                    "Continue to Payment"
                  )}
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(createPageUrl("Discover"))}
                  disabled={isWorking}
                >
                  Back to Demo
                </Button>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                Payments aren't wired yet — this page exists so the paywall flow works end-to-end.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}