import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Star, Lock, SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";
import { cn } from "../lib/utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav";
import CampCard from "../components/CampCard";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";
import { useDemoProfile } from "../components/hooks/useDemoProfile";

/**
 * Discover
 * - Demo mode: public CampDemo summaries + local DemoProfile filters
 * - Paid mode: client-joined camp summaries + CampIntent mutations
 *
 * No base44.functions.* calls.
 * Frontend is the system of composition.
 */
export default function Discover() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { mode, loading: accessLoading, currentYear, demoYear, seasonYear } = useSeasonAccess();

  // Paid identity (only required in paid mode)
  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError
  } = useAthleteIdentity();

  // Demo profile (local only)
  const { loaded: demoLoaded, demoProfile } = useDemoProfile();

  // -----------------------------
  // Paid data: single source of truth summaries
  // -----------------------------
  const athleteId = athleteProfile?.id;
  const sportId = athleteProfile?.sport_id;

  const paidSummariesQuery = useCampSummariesClient({
    athleteId,
    sportId,
    enabled: mode === "paid" && !!athleteId
  });

  // -----------------------------
  // Demo data: public demo summaries (filtered by demoProfile)
  // -----------------------------
  const demoSummariesQuery = usePublicCampSummariesClient({
    seasonYear, // demoYear (via useSeasonAccess)
    sportId: demoProfile?.sport_id || null,
    state: demoProfile?.state || null,
    division: demoProfile?.division || null,
    positionIds: Array.isArray(demoProfile?.position_ids) ? demoProfile.position_ids : [],
    enabled: mode !== "paid" && demoLoaded
  });

  // -----------------------------
  // Guards
  // -----------------------------
  useEffect(() => {
    // If paid but no profile, route to Onboarding hub (profile gate)
    if (accessLoading || identityLoading) return;
    if (mode === "paid" && !athleteProfile) {
      navigate(createPageUrl("Onboarding"));
    }
  }, [mode, accessLoading, identityLoading, athleteProfile, navigate]);

  // -----------------------------
  // Local UI state
  // -----------------------------
  const [showDemoHint, setShowDemoHint] = useState(true);

  const loading =
    accessLoading ||
    (mode === "paid" ? paidSummariesQuery.isLoading || identityLoading : demoSummariesQuery.isLoading || !demoLoaded);

  const isError =
    mode === "paid" ? paidSummariesQuery.isError || identityError : demoSummariesQuery.isError;

  const errorObj =
    mode === "paid" ? paidSummariesQuery.error : demoSummariesQuery.error;

  const summaries = useMemo(() => {
    const data =
      mode === "paid"
        ? (paidSummariesQuery.data || [])
        : (demoSummariesQuery.data || []);

    // Basic sanity: ensure array
    return Array.isArray(data) ? data : [];
  }, [mode, paidSummariesQuery.data, demoSummariesQuery.data]);

  // -----------------------------
  // Paid mutations (CampIntent)
  // -----------------------------
  const invalidatePaidSummaries = () => {
    // keep key stable across the app
    queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });
  };

  const toggleFavorite = useMutation({
    mutationFn: async ({ campId }) => {
      if (!athleteId) throw new Error("Missing athlete profile");

      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteId,
        camp_id: campId
      });

      const intent = existing?.[0] || null;

      // Do not toggle favorite if already registered/completed
      if (intent?.status === "registered" || intent?.status === "completed") return;

      if (!intent) {
        await base44.entities.CampIntent.create({
          athlete_id: athleteId,
          camp_id: campId,
          status: "favorite",
          priority: "medium"
        });
        return;
      }

      if (intent.status === "favorite") {
        await base44.entities.CampIntent.update(intent.id, { status: "removed" });
      } else {
        await base44.entities.CampIntent.update(intent.id, { status: "favorite" });
      }
    },
    onSuccess: invalidatePaidSummaries
  });

  const markRegistered = useMutation({
    mutationFn: async ({ campId }) => {
      if (!athleteId) throw new Error("Missing athlete profile");

      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteId,
        camp_id: campId
      });

      const intent = existing?.[0] || null;

      if (!intent) {
        await base44.entities.CampIntent.create({
          athlete_id: athleteId,
          camp_id: campId,
          status: "registered",
          priority: "high"
        });
        return;
      }

      if (intent.status === "registered" || intent.status === "completed") return;

      await base44.entities.CampIntent.update(intent.id, { status: "registered" });
    },
    onSuccess: invalidatePaidSummaries
  });

  // -----------------------------
  // Render states
  // -----------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-md mx-auto">
          <Card className="p-4 border-rose-200 bg-rose-50 text-rose-700">
            <div className="font-semibold">Failed to load Discover</div>
            <div className="text-xs mt-2 break-words">{String(errorObj?.message || errorObj)}</div>
            <div className="mt-4">
              <Button className="w-full" onClick={() => navigate(createPageUrl("Home"))}>
                Back to Home
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Demo banner / paid badge
  const headerBadge = mode === "paid"
    ? <Badge className="bg-emerald-600 text-white">Current Season {currentYear}</Badge>
    : <Badge className="bg-slate-900 text-white">Demo {demoYear}</Badge>;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-deep-navy">Discover</h1>
                {headerBadge}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                {mode === "paid"
                  ? "Browse and manage camps for your athlete."
                  : "Browse last year’s camps. Personalize the demo to filter by sport, state, division, positions."}
              </div>
            </div>

            {/* ✅ Demo CTA entry point */}
            {mode !== "paid" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(createPageUrl("DemoSetup"))}
              >
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Personalize
              </Button>
            )}
          </div>

          {/* Demo upgrade hint */}
          {mode !== "paid" && showDemoHint && (
            <div className="mt-3">
              <Card className="p-3 border-amber-200 bg-amber-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Lock className="w-4 h-4 text-amber-700 mt-0.5" />
                    <div>
                      <div className="text-sm font-semibold text-amber-900">
                        Want current-year camps?
                      </div>
                      <div className="text-xs text-amber-900/80 mt-0.5">
                        Upgrade to unlock the current season and save favorites/registrations.
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => navigate(createPageUrl("Onboarding"))}
                    >
                      Upgrade
                    </Button>
                    <button
                      className="text-xs text-amber-900/70 underline"
                      onClick={() => setShowDemoHint(false)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="max-w-md mx-auto p-4">
        {summaries.length === 0 ? (
          <Card className="p-4">
            <div className="font-semibold text-deep-navy">No camps found</div>
            <div className="text-sm text-slate-600 mt-1">
              {mode === "paid"
                ? "Try adjusting your targeting or check back later."
                : "Try Personalize Demo to broaden filters, or reset demo settings."}
            </div>
            {mode !== "paid" && (
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => navigate(createPageUrl("DemoSetup"))}>
                  Personalize Demo
                </Button>
                <Button className="flex-1" onClick={() => navigate(createPageUrl("Onboarding"))}>
                  Upgrade
                </Button>
              </div>
            )}
          </Card>
        ) : (
          <div className="space-y-3">
            {summaries.map((s) => {
              // Adapt summary into CampCard props (CampCard expects separate objects)
              const camp = {
                id: s.camp_id,
                camp_name: s.camp_name,
                start_date: s.start_date,
                end_date: s.end_date,
                city: s.city,
                state: s.state,
                price: s.price,
                link_url: s.link_url,
                notes: s.notes,
                position_ids: s.position_ids || []
              };

              const school = {
                id: s.school_id,
                school_name: s.school_name,
                division: s.school_division,
                logo_url: s.school_logo_url,
                city: s.school_city,
                state: s.school_state,
                conference: s.school_conference
              };

              const sport = s.sport_id
                ? { id: s.sport_id, sport_name: s.sport_name }
                : null;

              const positions = Array.isArray(s.position_codes)
                ? s.position_codes.map((code) => ({ position_code: code }))
                : [];

              const isFavorite = s.intent_status === "favorite";
              const isRegistered = s.intent_status === "registered" || s.intent_status === "completed";

              return (
                <CampCard
                  key={s.camp_id}
                  camp={camp}
                  school={school}
                  sport={sport}
                  positions={positions}
                  isFavorite={mode === "paid" ? isFavorite : false}
                  isRegistered={mode === "paid" ? isRegistered : false}
                  onFavoriteToggle={() => {
                    if (mode !== "paid") {
                      navigate(createPageUrl("Onboarding"));
                      return;
                    }
                    toggleFavorite.mutate({ campId: s.camp_id });
                  }}
                  onClick={() => {
                    if (mode === "paid") {
                      navigate(createPageUrl(`CampDetail?id=${s.camp_id}`));
                    } else {
                      navigate(createPageUrl(`CampDetailDemo?id=${s.camp_id}`));
                    }
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
