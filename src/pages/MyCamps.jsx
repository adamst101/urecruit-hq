import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav";
import CampCard from "../components/camps/CampCard";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";

export default function MyCamps() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("registered"); // "registered" | "favorites"

  // -----------------------------
  // Identity (hook must ALWAYS run)
  // -----------------------------
  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError,
    error: identityErrorObj
  } = useAthleteIdentity();

  const clean = (v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "string" && v.trim() === "") return undefined;
    return v;
  };

  const athleteId = clean(athleteProfile?.id);
  const athleteSportId = clean(athleteProfile?.sport_id);

  // -----------------------------
  // Shared read model (single source of truth)
  // -----------------------------
  const {
    data: campSummaries = [],
    isLoading: campsLoading,
    isError: campsError,
    error: campsErrorObj
  } = useCampSummariesClient({
    athleteId,
    sportId: athleteSportId,
    enabled: !!athleteId && !identityLoading && !identityError
  });

  // -----------------------------
  // Derived lists (hooks must ALWAYS run)
  // -----------------------------
  const sortedSummaries = useMemo(() => {
    const list = Array.isArray(campSummaries) ? [...campSummaries] : [];
    list.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return list;
  }, [campSummaries]);

  const registeredCamps = useMemo(
    () =>
      sortedSummaries.filter(
        (c) => c.intent_status === "registered" || c.intent_status === "completed"
      ),
    [sortedSummaries]
  );

  const favoriteCamps = useMemo(
    () => sortedSummaries.filter((c) => c.intent_status === "favorite"),
    [sortedSummaries]
  );

  const listToRender = tab === "registered" ? registeredCamps : favoriteCamps;

  // -----------------------------
  // Mutations (unchanged behavior)
  // -----------------------------
  const registerMutation = useMutation({
    mutationFn: async (campId) => {
      if (!athleteId) return;

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
          priority: "medium",
          registration_confirmed: true
        });
        return;
      }

      if (intent.status === "registered") {
        await base44.entities.CampIntent.update(intent.id, { status: "removed" });
      } else {
        await base44.entities.CampIntent.update(intent.id, {
          status: "registered",
          registration_confirmed: true
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });
    }
  });

  const favoriteToggleMutation = useMutation({
    mutationFn: async (campId) => {
      if (!athleteId) return;

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });
    }
  });

  // -----------------------------
  // Render guards
  // -----------------------------
  if (identityLoading) return null;

  if (identityError) {
    return (
      <div className="p-6 text-rose-700">
        Failed to load athlete profile: {String(identityErrorObj?.message || identityErrorObj)}
      </div>
    );
  }

  if (!athleteProfile) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <h1 className="text-2xl font-bold text-deep-navy">My Camps</h1>

          {campsError && (
            <div className="mt-3 bg-white border border-rose-200 text-rose-700 rounded-xl p-3">
              <div className="font-semibold">Failed to load camps</div>
              <div className="text-xs break-words mt-1">
                {String(campsErrorObj?.message || campsErrorObj)}
              </div>
            </div>
          )}

          <Tabs value={tab} onValueChange={setTab} className="mt-4">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="registered" className="gap-2">
                Registered
                <Badge variant="secondary" className="text-xs">
                  {registeredCamps.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="favorites" className="gap-2">
                Favorites
                <Badge variant="secondary" className="text-xs">
                  {favoriteCamps.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value={tab} className="mt-4">
              {campsLoading ? (
                <div className="p-6 text-slate-500">Loading…</div>
              ) : listToRender.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  {tab === "registered"
                    ? "No registered camps yet."
                    : "No favorite camps yet."}
                </div>
              ) : (
                <div className="space-y-4">
                  {listToRender.map((s) => (
                    <div key={s.camp_id}>
                      <CampCard
                        camp={{
                          id: s.camp_id,
                          camp_name: s.camp_name,
                          start_date: s.start_date,
                          end_date: s.end_date,
                          city: s.city,
                          state: s.state,
                          price: s.price,
                          link_url: s.link_url,
                          notes: s.notes,
                          position_ids: s.position_ids
                        }}
                        school={{
                          id: s.school_id,
                          school_name: s.school_name,
                          division: s.school_division,
                          logo_url: s.school_logo_url,
                          city: s.school_city,
                          state: s.school_state,
                          conference: s.school_conference
                        }}
                        sport={{ id: s.sport_id, sport_name: s.sport_name }}
                        positions={(s.position_codes || []).map((code) => ({
                          position_code: code
                        }))}
                        isFavorite={s.intent_status === "favorite"}
                        isRegistered={
                          s.intent_status === "registered" ||
                          s.intent_status === "completed"
                        }
                        onFavoriteToggle={() => favoriteToggleMutation.mutate(s.camp_id)}
                        onClick={() => navigate(createPageUrl(`CampDetail?id=${s.camp_id}`))}
                      />

                      <div className="mt-2 flex gap-2">
                        {tab === "registered" ? (
                          <>
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => registerMutation.mutate(s.camp_id)}
                              disabled={registerMutation.isPending}
                            >
                              Unregister
                            </Button>
                            <Button
                              className="flex-1"
                              onClick={() => navigate(createPageUrl(`CampDetail?id=${s.camp_id}`))}
                            >
                              Details
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => favoriteToggleMutation.mutate(s.camp_id)}
                              disabled={favoriteToggleMutation.isPending}
                            >
                              Remove Favorite
                            </Button>
                            <Button
                              className="flex-1"
                              onClick={() => registerMutation.mutate(s.camp_id)}
                              disabled={registerMutation.isPending}
                            >
                              Register
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

