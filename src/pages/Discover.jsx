import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav";
import CampCard from "../components/camps/CampCard";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";
import { useDemoProfile } from "../components/hooks/useDemoProfile";

// ✅ Write-gating + demo-local favorites
import { useWriteGate } from "../components/hooks/useWriteGate";
import { toggleDemoFavorite, isDemoFavorite } from "../components/hooks/demoFavorites";

/**
 * Discover
 * - Demo mode: public CampDemo summaries + local DemoProfile filters + localStorage favorites
 * - Paid mode: client-joined camp summaries + CampIntent mutations
 *
 * OPTION A: Demo year resolves dynamically:
 * - Prefer (currentYear - 1)
 * - If no demo data exists, fallback to (currentYear - 2), (currentYear - 3), ...
 * - Never show a "blank white" screen: show an empty-state card if no results.
 *
 * IMPORTANT:
 * - The "probe" function below assumes you have a CampDemo entity with a season year field.
 * - If your schema differs, update ONLY `probeDemoYearHasData()`.
 */
export default function Discover() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { mode, loading: accessLoading, currentYear, demoYear, seasonYear } =
    useSeasonAccess();

  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError
  } = useAthleteIdentity();

  const { loaded: demoLoaded, demoProfile, demoProfileId } = useDemoProfile();

  // ✅ Gate for writes (single source of truth for paid vs demo behaviors)
  const gate = useWriteGate();

  // ✅ Demo favorites need a re-render trigger (localStorage writes don't re-render React)
  const [, setDemoFavTick] = useState(0);

  // Paid data identifiers
  const athleteId = athleteProfile?.id;
  const sportId = athleteProfile?.sport_id;

  // Paid query
  const paidSummariesQuery = useCampSummariesClient({
    athleteId,
    sportId,
    enabled: gate.mode === "paid" && !!athleteId
  });

  /* ------------------------------------------------------------
   * OPTION A: Resolve the demo year with fallback
   * ------------------------------------------------------------ */

  const demoEnabled = gate.mode !== "paid" && demoLoaded;

  const [resolvedDemoYear, setResolvedDemoYear] = useState(null);
  const [resolvingDemoYear, setResolvingDemoYear] = useState(false);

  // ✅ Update ONLY this function if your schema differs.
  // It should return true if there is at least 1 CampDemo row for that year.
  const probeDemoYearHasData = useCallback(async (year) => {
    // Assumption: CampDemo entity exists and has a season_year field.
    // If your field is named differently (e.g. "seasonYear"), change it here.
    const rows = await base44.entities.CampDemo.filter(
      { season_year: Number(year) },
      { limit: 1 }
    );
    return Array.isArray(rows) && rows.length > 0;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Only resolve for demo/unauth flows
      if (!demoEnabled) {
        setResolvedDemoYear(null);
        setResolvingDemoYear(false);
        return;
      }

      setResolvingDemoYear(true);

      const cy = Number(currentYear);
      const preferred = cy - 1;

      // Try up to 4 years back (adjust if needed)
      const candidates = [preferred, preferred - 1, preferred - 2, preferred - 3];

      for (const y of candidates) {
        try {
          const ok = await probeDemoYearHasData(y);
          if (cancelled) return;

          if (ok) {
            setResolvedDemoYear(y);
            setResolvingDemoYear(false);
            return;
          }
        } catch {
          // ignore and try next year
        }
      }

      // None found; keep preferred for honest UI + empty-state handling
      if (!cancelled) {
        setResolvedDemoYear(preferred);
        setResolvingDemoYear(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [demoEnabled, currentYear, probeDemoYearHasData]);

  // Demo query uses the resolved year (fallback-capable)
  const demoSummariesQuery = usePublicCampSummariesClient({
    seasonYear: resolvedDemoYear,
    sportId: demoProfile?.sport_id || null,
    state: demoProfile?.state || null,
    division: demoProfile?.division || null,
    positionIds: Array.isArray(demoProfile?.position_ids)
      ? demoProfile.position_ids
      : [],
    enabled: demoEnabled && !!resolvedDemoYear
  });

  /* ------------------------------------------------------------
   * Paid profile guard (unchanged)
   * ------------------------------------------------------------ */
  useEffect(() => {
    if (accessLoading || identityLoading) return;
    if (gate.mode === "paid" && !athleteProfile) {
      navigate(createPageUrl("Onboarding"));
    }
  }, [gate.mode, accessLoading, identityLoading, athleteProfile, navigate]);

  /* ------------------------------------------------------------
   * Loading / Error / Data selection
   * ------------------------------------------------------------ */

  const loading =
    accessLoading ||
    (gate.mode === "paid"
      ? paidSummariesQuery.isLoading || identityLoading
      : resolvingDemoYear || demoSummariesQuery.isLoading || !demoLoaded);

  const isError =
    gate.mode === "paid"
      ? paidSummariesQuery.isError || identityError
      : demoSummariesQuery.isError;

  const errorObj =
    gate.mode === "paid" ? paidSummariesQuery.error : demoSummariesQuery.error;

  const summaries = useMemo(() => {
    const data =
      gate.mode === "paid"
        ? paidSummariesQuery.data || []
        : demoSummariesQuery.data || [];
    return Array.isArray(data) ? data : [];
  }, [gate.mode, paidSummariesQuery.data, demoSummariesQuery.data]);

  // Paid mutations (favorites)
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

      // Don't allow toggling if registered/completed
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
          <Button
            className="w-full mt-4"
            onClick={() => navigate(createPageUrl("Home"))}
          >
            Back to Home
          </Button>
        </Card>
      </div>
    );
  }

  /* ------------------------------------------------------------
   * Header badge year (truthful)
   * ------------------------------------------------------------ */

  const demoBadgeYear = resolvedDemoYear || demoYear;

  const headerBadge =
    gate.mode === "paid" ? (
      <Badge className="bg-emerald-600 text-white">Current {currentYear}</Badge>
    ) : (
      <Badge className="bg-slate-900 text-white">Demo {demoBadgeYear}</Badge>
    );

  // Stable demo profile id for favorites
  const effectiveDemoProfileId = demoProfileId || demoProfile?.id || "default";

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
                {gate.mode === "paid"
                  ? "Browse and manage camps."
                  : `Browse prior-season camps (${demoBadgeYear}). Personalize the demo to filter.`}
              </div>
            </div>

            {gate.mode !== "paid" && (
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
        {/* ✅ Empty-state (prevents blank white screens) */}
        {summaries.length === 0 ? (
          <Card className="p-4 border-slate-200 bg-white">
            <div className="font-semibold text-deep-navy">No camps found</div>
            <div className="text-sm text-slate-600 mt-1">
              {gate.mode === "paid"
                ? "No camps matched your current filters."
                : `We didn’t find demo camps for your selected filters in ${demoBadgeYear}. Try adjusting filters or personalizing the demo.`}
            </div>

            {gate.mode !== "paid" && (
              <div className="mt-4 space-y-2">
                <Button
                  className="w-full"
                  onClick={() => navigate(createPageUrl("DemoSetup"))}
                >
                  Update Demo Filters
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.location.reload()}
                >
                  Refresh
                </Button>
              </div>
            )}

            {gate.mode === "paid" && (
              <div className="mt-4">
                <Button
                  className="w-full"
                  onClick={() => navigate(createPageUrl("Home"))}
                >
                  Back to Home
                </Button>
              </div>
            )}
          </Card>
        ) : (
          summaries.map((s) => {
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

            // ✅ isFavorite uses gate.mode (single source of truth)
            const isFav =
              gate.mode === "paid"
                ? s.intent_status === "favorite"
                : isDemoFavorite(effectiveDemoProfileId, s.camp_id);

            const isRegistered =
              gate.mode === "paid" &&
              (s.intent_status === "registered" || s.intent_status === "completed");

            return (
              <CampCard
                key={s.camp_id}
                camp={camp}
                school={school}
                sport={sport}
                positions={positions}
                isFavorite={isFav}
                isRegistered={isRegistered}
                onFavoriteToggle={() => {
                  gate.write({
                    demo: () => {
                      toggleDemoFavorite(effectiveDemoProfileId, s.camp_id);
                      setDemoFavTick((x) => x + 1); // force rerender
                    },
                    paid: () => toggleFavorite.mutate({ campId: s.camp_id }),
                    blocked: () => navigate(createPageUrl("Onboarding"))
                  });
                }}
                onClick={() =>
                  navigate(
                    createPageUrl(
                      gate.mode === "paid"
                        ? `CampDetail?id=${s.camp_id}`
                        : `CampDetailDemo?id=${s.camp_id}`
                    )
                  )
                }
              />
            );
          })
        )}
      </div>

      <BottomNav />
    </div>
  );
}
