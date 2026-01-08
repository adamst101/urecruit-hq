// src/pages/MyCamps.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";

import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import BottomNav from "../components/navigation/BottomNav";
import RouteGuard from "../components/auth/RouteGuard";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";

/**
 * MyCamps
 * Paid-only page.
 *
 * Policy:
 * - Demo users should never land here (BottomNav hides it; RouteGuard enforces it)
 * - Paid users must have athlete profile (RouteGuard enforces it)
 */
function MyCampsPage() {
  const navigate = useNavigate();
  const { currentYear } = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const athleteId = athleteProfile?.id;
  const sportId = athleteProfile?.sport_id;

  const { data, isLoading, isError, error } = useCampSummariesClient({
    athleteId,
    sportId,
    enabled: !!athleteId
  });

  const campSummaries = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const registered = useMemo(
    () => campSummaries.filter((c) => c.intent_status === "registered" || c.intent_status === "completed"),
    [campSummaries]
  );

  const favorites = useMemo(
    () => campSummaries.filter((c) => c.intent_status === "favorite"),
    [campSummaries]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 pb-20">
        <Card className="max-w-md mx-auto p-4 border-rose-200 bg-rose-50 text-rose-700">
          <div className="font-semibold">Failed to load My Camps</div>
          <div className="text-xs mt-2 break-words">{String(error?.message || error)}</div>
          <Button className="w-full mt-4" variant="outline" onClick={() => navigate(createPageUrl("Discover"))}>
            Back to Discover
          </Button>
        </Card>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <h1 className="text-2xl font-bold text-deep-navy">My Camps</h1>
          <div className="text-sm text-slate-600 mt-1">Current season ({currentYear}).</div>
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
                <Button className="w-full mt-4" onClick={() => navigate(createPageUrl("Discover"))}>
                  Go to Discover
                </Button>
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

export default function MyCamps() {
  return (
    <RouteGuard requireAuth={true} requirePaid={true} requireProfile={true}>
      <MyCampsPage />
    </RouteGuard>
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
      <div className="font-semibold text-deep-navy">{camp.school_name || "Unknown School"}</div>
      <div className="text-sm text-slate-600">{camp.camp_name || "Camp"}</div>
    </Card>
  );
}