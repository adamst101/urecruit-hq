// Pages/MyCamps.jsx — FULL REPLACEMENT (copy/paste)
// ✅ No backend functions used
// ✅ Uses useAthleteIdentity() (single source of truth)
// ✅ Client-side "summaries adapter" (same pattern as Discover)
// ✅ Tabs: Registered + Favorites (filtered locally by intent_status)
// ✅ Register/Unregister actions write CampIntent and refresh list

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";

import BottomNav from "../components/navigation/BottomNav";
import CampCard from "../components/camps/CampCard";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

export default function MyCamps() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState("registered"); // "registered" | "favorites"

  // -----------------------------
  // Identity (single source of truth)
  // -----------------------------
  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError,
    error: identityErrorObj
  } = useAthleteIdentity();

  if (identityLoading) return null;

  if (identityError) {
    return (
      <div className="p-6 text-rose-700">
        Failed to load athlete profile: {String(identityErrorObj?.message || identityErrorObj)}
      </div>
    );
  }

  if (!athleteProfile) return null;

  // -----------------------------
  // Helpers
  // -----------------------------
  const clean = (v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "string" && v.trim() === "") return undefined;
    return v;
  };

  // -----------------------------
  // Client-side summaries adapter
  // -----------------------------
  const {
    data: campSummaries = [],
    isLoading: campsLoading,
    isError: campsError,
    error: campsErrorObj
  } = useQuery({
    queryKey: ["myCampsSummaries_client", athleteProfile?.id, athleteProfile?.sport_id],
    queryFn: async () => {
      const payload = {
        athlete_id: clean(athleteProfile?.id),
        sport_id: clean(athleteProfile?.sport_id),
        limit: 500
      };

      // Camps (optionally by sport)
      const campQuery = {};
      if (payload.sport_id) campQuery.sport_id = payload.sport_id;

      let camps = await base44.entities.Camp.filter(campQuery, "-start_date", payload.limit || 500);

      // Batch join: School / Sport / Position
      const schoolIds = [...new Set(camps.map((c) => c.school_id).filter(Boolean))];
      const sportIds = [...new Set(camps.map((c) => c.sport_id).filter(Boolean))];

      const [schools, sports, positions] = await Promise.all([
        schoolIds.length ? base44.entities.School.filter({ id: { $in: schoolIds } }) : Promise.resolve([]),
        sportIds.length ? base44.entities.Sport.filter({ id: { $in: sportIds } }) : Promise.resolve([]),
        base44.entities.Position.list()
      ]);

      const schoolMap = Object.fromEntries(schools.map((s) => [s.id, s]));
      const sportMap = Object.fromEntries(sports.map((s) => [s.id, s]));
      const positionMap = Object.fromEntries(positions.map((p) => [p.id, p]));

      // Athlete-specific: CampIntent + TargetSchool
      const [intents, targets] = await Promise.all([
        base44.entities.CampIntent.filter({ athlete_id: payload.athlete_id }),
        base44.entities.TargetSchool.filter({ athlete_id: payload.athlete_id })
      ]);

      const intentMap = Object.fromEntries(intents.map((i) => [i.camp_id, i]));
      const targetSchoolIds = new Set(targets.map((t) => t.school_id));

      // Summaries
      return camps.map((camp) => {
        const school = schoolMap[camp.school_id];
        const sport = sportMap[camp.sport_id];
        const intent = intentMap[camp.id] || null;
        const campPositions = (camp.position_ids || []).map((pid) => positionMap[pid]).filter(Boolean);

        return {
          camp_id: camp.id,
          camp_name: camp.camp_name,
          start_date: camp.start_date,
          end_date: camp.end_date,
          price: camp.price,
          link_url: camp.link_url,
          notes: camp.notes,
          city: camp.city,
          state: camp.state,
          position_ids: camp.position_ids || [],
          position_codes: campPositions.map((p) => p.position_code),

          school_id: school?.id,
          school_name: school?.school_name,
          school_division: school?.division,
          school_logo_url: school?.logo_url,
          school_city: school?.city,
          school_state: school?.state,
          school_conference: school?.conference,

          sport_id: sport?.id,
          sport_name: sport?.sport_name,

          intent_status: intent?.status || null,
          intent_priority: intent?.priority || null,
          is_target_school: targetSchoolIds.has(camp.school_id)
        };
      });
    },
    enabled: !!athleteProfile?.id,
    retry: false
  });

  const sortedSummaries = useMemo(() => {
    const list = Array.isArray(campSummaries) ? [...campSummaries] : [];
    list.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return list;
  }, [campSummaries]);

  // -----------------------------
  // Step 4: filter locally by intent_status
  // -----------------------------
  const registeredCamps = useMemo(() => {
    return sortedSummaries.filter(
      (c) => c.intent_status === "registered" || c.intent_status === "completed"
    );
  }, [sortedSummaries]);

  const favoriteCamps = useMemo(() => {
    return sortedSummaries.filter((c) => c.intent_status === "favorite");
  }, [sortedSummaries]);

  const listToRender = tab === "registered" ? registeredCamps : favoriteCamps;

  // -----------------------------
  // Mutations (CampIntent is ground truth)
  // -----------------------------
  const registerMutation = useMutation({
    mutationFn: async (campId) => {
      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteProfile.id,
        camp_id: campId
      });

      const intent = existing?.[0] || null;

      // If none, create as registered
      if (!intent) {
        await base44.entities.CampIntent.create({
          athlete_id: athleteProfile.id,
          camp_id: campId,
          status: "registered",
          priority: "medium",
          registration_confirmed: true
        });
        return;
      }

      // Toggle registered <-> removed (conservative)
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
      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteProfile.id,
        camp_id: campId
      });

      const intent = existing?.[0] || null;

      // Don't override registered/completed from a favorite toggle
      if (intent?.status === "registered" || intent?.status === "completed") return;

      if (!intent) {
        await base44.entities.CampIntent.create({
          athlete_id: athleteProfile.id,
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
  // Render
  // -----------------------------
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

            <TabsContent value="registered" className="mt-4">
              {campsLoading ? (
                <div className="p-6 text-slate-500">Loading…</div>
              ) : registeredCamps.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  No registered camps yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {registeredCamps.map((s) => (
                    <div key={s.camp_id} className="relative">
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
                        positions={(s.position_codes || []).map((code) => ({ position_code: code }))}
                        isFavorite={s.intent_status === "favorite"}
                        isRegistered={s.intent_status === "registered" || s.intent_status === "completed"}
                        onFavoriteToggle={() => favoriteToggleMutation.mutate(s.camp_id)}
                        onClick={() => navigate(createPageUrl(`CampDetail?id=${s.camp_id}`))}
                      />

                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="outline"
                          className={cn("flex-1")}
                          onClick={() => registerMutation.mutate(s.camp_id)}
                          disabled={registerMutation.isPending}
                        >
                          {s.intent_status === "registered" ? "Unregister" : "Register"}
                        </Button>
                        <Button
                          className="flex-1"
                          onClick={() => navigate(createPageUrl(`CampDetail?id=${s.camp_id}`))}
                        >
                          Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="favorites" className="mt-4">
              {campsLoading ? (
                <div className="p-6 text-slate-500">Loading…</div>
              ) : favoriteCamps.length === 0 ? (
                <div className="p-6 text-center text-slate-500">
                  No favorite camps yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {favoriteCamps.map((s) => (
                    <div key={s.camp_id} className="relative">
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
                        positions={(s.position_codes || []).map((code) => ({ position_code: code }))}
                        isFavorite
                        isRegistered={false}
                        onFavoriteToggle={() => favoriteToggleMutation.mutate(s.camp_id)}
                        onClick={() => navigate(createPageUrl(`CampDetail?id=${s.camp_id}`))}
                      />

                      <div className="mt-2 flex gap-2">
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
