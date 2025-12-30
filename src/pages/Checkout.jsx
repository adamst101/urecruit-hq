import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, CheckCircle2, Loader2, UserCircle2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

/**
 * Checkout (TEST UNLOCK + PROFILE GATE)
 * Base44 convention route: /Checkout
 *
 * Behavior:
 * - Requires an athlete profile before allowing unlock/purchase.
 * - In test mode, creates an Entitlement record for current season.
 * - Later replace handleTestUnlock() with real payment -> entitlement issuance.
 */
export default function Checkout() {
  const navigate = useNavigate();
  const { mode, currentYear } = useSeasonAccess();

  // Single source of truth for identity/profile
  const { athleteProfile, isLoading: identityLoading, isError: identityError, error: identityErrorObj } =
    useAthleteIdentity();

  const [isWorking, setIsWorking] = useState(false);
  const [err, setErr] = useState(null);

  const priceLabel = useMemo(() => "$49 / year", []);

  // If already paid, don't linger here
  useEffect(() => {
    if (mode === "paid") {
      navigate(createPageUrl("Discover"));
    }
  }, [mode, navigate]);

  // Force profile first (do NOT allow entitlement creation without profile)
  useEffect(() => {
    if (identityLoading) return;
    if (identityError) return;
    if (!athleteProfile) {
      navigate(createPageUrl("Onboarding"));
    }
  }, [identityLoading, identityError, athleteProfile, navigate]);

  const startOfYearISO = (year) => new Date(year, 0, 1, 0, 0, 0).toISOString();
  const endOfYearISO = (year) => new Date(year, 11, 31, 23, 59, 59).toISOString();

  const handleTestUnlock = async () => {
    // Hard guard
    if (!athleteProfile) {
      navigate(createPageUrl("Profile"));
      return;
    }

    setErr(null);
    setIsWorking(true);

    try {
      const me = await base44.auth.me();
      const accountId = me?.id;
      if (!accountId) throw new Error("Not authenticated. Please sign in to unlock.");

      // If an active entitlement already exists, proceed.
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

      // Move user into paid experience and hard refresh to re-evaluate access hooks
      navigate(createPageUrl("Discover"));
      window.location.reload();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setIsWorking(false);
    }
  };

  // Loading / identity error states
  if (identityLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (identityError) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-md mx-auto">
          <Card className="p-4 border-rose-200 bg-rose-50 text-rose-700">
            <div className="font-semibold">Failed to load identity</div>
            <div className="text-sm mt-1 break-words">
              {String(identityErrorObj?.message || identityErrorObj)}
            </div>
            <div className="mt-4">
              <Button variant="outline" className="w-full" onClick={() => navigate(createPageUrl("Onboarding"))}>
                Back
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const profileMissing = !athleteProfile;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <button
          onClick={() => navigate(createPageUrl("Onboarding"))}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
          disabled={isWorking}
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        {/* Profile gate message */}
        {profileMissing && (
          <Card className="p-4 border-slate-200 bg-white">
            <div className="flex items-start gap-3">
              <UserCircle2 className="w-6 h-6 text-slate-700 mt-0.5" />
              <div className="flex-1">
                <div className="text-lg font-bold text-deep-navy">Complete your athlete profile first</div>
                <div className="text-sm text-slate-600 mt-1">
                  We need your athlete profile to personalize camps and enable favorites/registrations. Once that’s done,
                  you can unlock the current season.
                </div>
                <div className="mt-4">
                  <Button className="w-full" onClick={() => navigate(createPageUrl("Profile"))}>
                    Go to Profile Setup
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-6 h-6 text-slate-700 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <h1 className="text-xl font-bold text-deep-navy">Unlock Current Season ({currentYear})</h1>
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
                <Button
                  className="w-full"
                  onClick={handleTestUnlock}
                  disabled={isWorking || identityLoading || profileMissing}
                >
                  {isWorking ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Unlocking…
                    </>
                  ) : profileMissing ? (
                    "Complete Profile to Continue"
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
