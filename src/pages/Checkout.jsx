import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, CheckCircle2, Loader2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";

/**
 * Checkout (TEST UNLOCK)
 * Base44 convention route: /Checkout
 *
 * This creates an Entitlement record for the current season.
 * Later you replace this with real payments -> entitlement creation.
 */
export default function Checkout() {
  const navigate = useNavigate();
  const { mode, currentYear } = useSeasonAccess();

  const [isWorking, setIsWorking] = useState(false);
  const [err, setErr] = useState(null);

  const priceLabel = useMemo(() => "$49 / year", []);

  // If already paid, don’t linger here
  if (mode === "paid") {
    navigate(createPageUrl("Discover"));
    return null;
  }

  const endOfYearISO = (year) => {
    // Local time. Good enough for gating. You can move to UTC later if you want.
    const d = new Date(year, 11, 31, 23, 59, 59);
    return d.toISOString();
    };
  const startOfYearISO = (year) => {
    const d = new Date(year, 0, 1, 0, 0, 0);
    return d.toISOString();
  };

  const handleTestUnlock = async () => {
    setErr(null);
    setIsWorking(true);

    try {
      const me = await base44.auth.me();
      const accountId = me?.id;
      if (!accountId) throw new Error("Not authenticated. Please sign in to unlock.");

      // If an active entitlement already exists, just proceed.
      const existing = await base44.entities.Entitlement.filter({
        account_id: accountId,
        season_year: currentYear,
        status: "active"
      });

      if (!existing || existing.length === 0) {
        await base44.entities.Entitlement.create({
          account_id: accountId,
          season_year: currentYear,
          status: "active",
          product: "RecruitMeSeasonAccess",
          starts_at: startOfYearISO(currentYear),
          ends_at: endOfYearISO(currentYear)
        });
      }

      // Force hooks/pages that depend on access to refresh
      // (Base44 apps often rely on react-query underneath; this simple reload is the safest.)
      navigate(createPageUrl("Discover"));
      window.location.reload();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setIsWorking(false);
    }
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
                This is a <b>test unlock</b>. It creates an Entitlement record for the current season.
                Later you’ll replace this with real checkout.
              </p>

              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Current-year camps & updates
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Favorites + registrations sync everywhere
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Calendar overlays and planning
                </div>
              </div>

              {err && (
                <div className="mt-4 p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm">
                  {err}
                </div>
              )}

              <div className="mt-6 space-y-2">
                <Button className="w-full" onClick={handleTestUnlock} disabled={isWorking}>
                  {isWorking ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Unlocking…
                    </>
                  ) : (
                    "Test Unlock (Create Entitlement)"
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
                Next: replace this button with payments → entitlement issuance.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
