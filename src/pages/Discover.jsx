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
import CampCard from "../components/camps/CampCard"; // ✅ FIXED PATH

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";
import { useDemoProfile } from "../components/hooks/useDemoProfile";

/**
 * Discover
 * - Demo mode: public CampDemo summaries + local DemoProfile filters
 * - Paid mode: client-joined camp summaries + CampIntent mutations
 */
export default function Discover() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { mode, loading: accessLoading, currentYear, demoYear, seasonYear } = useSeasonAccess();

  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError
  } = useAthleteIdentity();

  const { loaded: demoLoaded, demoProfile } = useDemoProfile();

  // Paid data
  const athleteId = athleteProfile?.id;
  const sportId = athleteProfile?.sport_id;

  const paidSummariesQuery = useCampSummariesClient({
    athleteId,
    sportId,
    enabled: mode === "paid" && !!athleteId
  });

  // Demo data
  const demoSummariesQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: demoProfile?.sport_id || null,
    state: demoProfile?.state || null,
    division: demoProfile?.division || null,
    positionIds: Array.isArray(demoProfile?.position_ids)
      ? demoProfile.position_ids
      : [],
    enabled: mode !== "paid" && demoLoaded
  });

  // Guard: paid users must have profile
  useEffect(() => {
    if (accessLoading || identityLoading) return;
    if (mode === "paid" && !athleteProfile) {
      navigate(createPageUrl("Onboarding"));
    }
  }, [mode, accessLoading, identityLoading, athleteProfile, navigate]);

  const loading =
    accessLoading ||
    (mode === "paid"
      ? paidSummariesQuery.isLoading || identityLoading
      : demoSummariesQuery.isLoading || !demoLoaded);

  const isError =
    mode === "paid"
      ? paidSummariesQuery.isError || identityError
      : demoSummariesQuery.isError;

  const errorObj =
    mode === "paid" ? paidSummariesQuery.error : demoSummariesQuery.error;

  const summaries = useMemo(() => {
    const data =
      mode === "paid"
        ? paidSummariesQuery.data || []
        : demoSummariesQuery.data || [];
    return Array.isArray(data) ? data : [];
  }, [mode, paidSummariesQuery.data, demoSummariesQuery.data]);

  // Paid mutations
  const invalidatePaidSummaries = () => {
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
        <Card className="max-w-md mx-auto p-4 border-rose-200 bg-rose-50 text-rose-700">
          <div className="font-semibold">Failed to load Discover</div>
          <div className="text-xs mt-2 break-words">
            {String(errorObj?.message || errorObj)}
          </div>
          <Button className="w-full mt-4" onClick={() => navigate(createPageUrl("Home"))}>
            Back to Home
          </Button>
        </Card>
      </div>
    );
  }

  const headerBadge =
    mode === "paid" ? (
      <Badge className="bg-emerald-600 text-white">Current {currentYear}</Badge>
    ) : (
      <Badge className="bg-slate-900 text-white">Demo {demoYear}</Badge>
    );

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-deep-navy">Discover</h1>
                {headerBadge}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                {mode === "paid"
                  ? "Browse and manage camps."
                  : "Browse last year’s camps. Personalize the demo to filter."}
              </div>
            </div>

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
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-3">
        {summaries.map((s) => {
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
            division: s.school_division
          };

          const sport = s.sport_id
            ? { id: s.sport_id, sport_name: s.sport_name }
            : null;

          const positions = Array.isArray(s.position_codes)
            ? s.position_codes.map((code) => ({ position_code: code }))
            : [];

          return (
            <CampCard
              key={s.camp_id}
              camp={camp}
              school={school}
              sport={sport}
              positions={positions}
              isFavorite={mode === "paid" && s.intent_status === "favorite"}
              isRegistered={
                mode === "paid" &&
                (s.intent_status === "registered" || s.intent_status === "completed")
              }
              onFavoriteToggle={() => {
                if (mode !== "paid") {
                  navigate(createPageUrl("Onboarding"));
                  return;
                }
                toggleFavorite.mutate({ campId: s.camp_id });
              }}
              onClick={() =>
                navigate(
                  createPageUrl(
                    mode === "paid"
                      ? `CampDetail?id=${s.camp_id}`
                      : `CampDetailDemo?id=${s.camp_id}`
                  )
                )
              }
            />
          );
        })}
      </div>

      <BottomNav />
    </div>
  );
}
