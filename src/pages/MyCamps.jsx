import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";

import { createPageUrl } from "../utils";
import { cn } from "../lib/utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

import BottomNav from "../components/navigation/BottomNav";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";

/**
 * MyCamps
 * Paid-only page.
 *
 * Guard rules:
 * - If demo/unpaid → redirect to Onboarding
 * - If paid but identity still loading → show loader
 * - If paid + no profile → redirect to Onboarding
 */
export default function MyCamps() {
  const navigate = useNavigate();

  const { mode, loading: accessLoading } = useSeasonAccess();
  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError
  } = useAthleteIdentity();

  /**
   * 🚫 DEMO / UNPAID GUARD
   * This is a hard stop. Demo users do not belong here.
   */
  useEffect(() => {
    if (accessLoading || identityLoading) return;

    if (mode !== "paid") {
      navigate(createPageUrl("Onboarding"));
    }
  }, [mode, accessLoading, identityLoading, navigate]);

  /**
   * 🧭 PROFILE GUARD
   * Paid users must have a profile to use MyCamps.
   */
  useEffect(() => {
    if (accessLoading || identityLoading) return;

    if (mode === "paid" && !athleteProfile) {
      navigate(createPageUrl("Onboarding"));
    }
  }, [mode, athleteProfile, accessLoading, identityLoading, navigate]);

  // Loading states
  if (accessLoading || identityLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // Identity error fallback
  if (identityError) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <Card className="max-w-md mx-auto p-4 border-rose-200 bg-rose-50 text-rose-700">
          <div className="font-semibold">Failed to load athlete profile</div>
          <div className="text-sm mt-2">
            Please try again or return to onboarding.
          </div>
          <div className="mt-4">
            <Button className="w-full" onClick={() => navigate(createPageUrl("Onboarding"))}>
              Go to Onboarding
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // If we somehow got here unpaid, render nothing (navigation effect will fire)
  if (mode !== "paid" || !athleteProfile) {
    return null;
  }

  // ✅ SAFE: Paid + Profile exists
  return <MyCampsPaid athleteProfile={athleteProfile} />;
}

/* ------------------------------------------------------------------ */
/* PAID IMPLEMENTATION                                                 */
/* ------------------------------------------------------------------ */

function MyCampsPaid({ athleteProfile }) {
  const athleteId = athleteProfile.id;
  const sportId = athleteProfile.sport_id;

  const {
    data: campSummaries = [],
    isLoading,
    isError,
    error
  } = useCampSummariesClient({
    athleteId,
    sportId,
    enabled: !!athleteId
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <Card className="max-w-md mx-auto p-4 border-rose-200 bg-rose-50 text-rose-700">
          <div className="font-semibold">Failed to load camps</div>
          <div className="text-xs mt-2 break-words">
            {String(error?.message || error)}
          </div>
        </Card>
      </div>
    );
  }

  const registered = campSummaries.filter(
    (c) => c.intent_status === "registered" || c.intent_status === "completed"
  );
  const favorites = campSummaries.filter((c) => c.intent_status === "favorite");

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <h1 className="text-2xl font-bold text-deep-navy">My Camps</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        {registered.length === 0 && favorites.length === 0 && (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-slate-600 mt-0.5" />
              <div>
                <div className="font-semibold text-deep-navy">No camps yet</div>
                <div className="text-sm text-slate-600 mt-1">
                  Favorite or register for camps in Discover to see them here.
                </div>
              </div>
            </div>
          </Card>
        )}

        {registered.length > 0 && (
          <Section title="Registered">
            {registered.map((c) => (
              <CampRow key={c.camp_id} camp={c} />
            ))}
          </Section>
        )}

        {favorites.length > 0 && (
          <Section title="Favorites">
            {favorites.map((c) => (
              <CampRow key={c.camp_id} camp={c} />
            ))}
          </Section>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SUPPORT COMPONENTS                                                  */
/* ------------------------------------------------------------------ */

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-600 mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CampRow({ camp }) {
  return (
    <Card className="p-3">
      <div className="font-semibold text-deep-navy">{camp.school_name}</div>
      <div className="text-sm text-slate-600">{camp.camp_name}</div>
    </Card>
  );
}
