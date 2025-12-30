// Pages/Discover.jsx — FULL REPLACEMENT (copy/paste)
// - Uses ONE identity source: useAthleteIdentity()
// - Calls getCampSummaries with a cleaned payload (no empty strings)
// - Adds robust loading/error handling so the page doesn't blank
// - Favorite toggle writes CampIntent (not Favorite/Registration/UserCamp)

import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

import CampCard from "../Components/camps/CampCard";
import FilterSheet from "../Components/camps/FilterSheet";
import BottomNav from "../Components/navigation/BottomNav";
import { useAthleteIdentity } from "../Components/useAthleteIdentity";


export default function Discover() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);

  // -----------------------------
  // Identity (single source of truth)
  // -----------------------------
  const {
    account,
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError,
    error: identityErrorObj
  } = useAthleteIdentity();

  // Redirect to onboarding if no athlete profile
  useEffect(() => {
    if (identityLoading || identityError) return;
    if (!athleteProfile) {
      navigate(createPageUrl("Onboarding"));
    }
  }, [identityLoading, identityError, athleteProfile, navigate]);

  // -----------------------------
  // Helpers
  // -----------------------------
  const clean = (v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "string" && v.trim() === "") return undefined;
    return v;
  };

  // Default sport filter to athlete's sport once
  useEffect(() => {
    if (athleteProfile?.sport_id && !filters.sport) {
      setFilters((prev) => ({ ...prev, sport: athleteProfile.sport_id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteProfile?.sport_id]);

  // -----------------------------
  // Reference data for FilterSheet
  // -----------------------------
  const { data: sports = [] } = useQuery({
    queryKey: ["sports"],
    queryFn: () => base44.entities.Sport.list(),
    retry: false
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["positions"],
    queryFn: () => base44.entities.Position.list(),
    retry: false
  });

  const availablePositions = useMemo(() => {
    const sportId = filters.sport || athleteProfile?.sport_id;
    if (!sportId) return [];
    return positions.filter((p) => p.sport_id === sportId);
  }, [positions, filters.sport, athleteProfile?.sport_id]);

  // -----------------------------
  // Camp Summaries (read model)
  // -----------------------------
  const {
    data: campSummaries = [],
    isLoading: campsLoading,
    isError: campsError,
    error: campsErrorObj
  } = useQuery({
    queryKey: ["campSummaries", athleteProfile?.id, filters, searchQuery],
    queryFn: async () => {
      const payload = {
        athlete_id: clean(athleteProfile?.id),
        sport_id: clean(filters?.sport || athleteProfile?.sport_id),
        divisions: clean(Array.isArray(filters?.divisions) ? filters.divisions.join(",") : filters?.divisions),
        states: clean(filters?.state || filters?.states),
        position_ids: clean(Array.isArray(filters?.positions) ? filters.positions.join(",") : filters?.positions),
        start_date_gte: clean(filters?.startDate),
        end_date_lte: clean(filters?.endDate),
        search: clean(searchQuery),
        limit: 200
      };

      console.log("getCampSummaries payload", payload);
      return base44.functions.getCampSummaries(payload);
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
  // Favorite toggle (CampIntent)
  // -----------------------------
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (campId) => {
      if (!athleteProfile?.id) return;

      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteProfile.id,
        camp_id: campId
      });

      const intent = existing?.[0] || null;

      // Don't mess with registrations from favorite toggle
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
      queryClient.invalidateQueries({ queryKey: ["campSummaries"] });
    }
  });

  // -----------------------------
  // UI helpers
  // -----------------------------
  const handleClearFilters = () => {
    setFilters({ sport: athleteProfile?.sport_id });
  };

  // -----------------------------
  // Render guards
  // -----------------------------
  if (identityLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (identityError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-rose-200 text-rose-700 rounded-xl p-4">
          <div className="font-semibold mb-1">Identity load failed</div>
          <div className="text-sm break-words">
            {String(identityErrorObj?.message || identityErrorObj)}
          </div>
        </div>
      </div>
    );
  }

  // If no athleteProfile, useEffect will redirect; render a spinner briefly
  if (!athleteProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // -----------------------------
  // Main UI
  // -----------------------------
  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <h1 className="text-2xl font-bold text-deep-navy mb-4">Discover Camps</h1>

          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Search camps or schools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowFilters(true)}
              className="shrink-0"
            >
              <SlidersHorizontal className="w-5 h-5" />
            </Button>
          </div>

          {/* CampSummaries error banner */}
          {campsError && (
            <div className="bg-white border border-rose-200 text-rose-700 rounded-xl p-3 mt-4">
              <div className="font-semibold">CampSummaries failed</div>
              <div className="text-xs break-words mt-1">
                {String(campsErrorObj?.message || campsErrorObj)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Camp List */}
      <div className="max-w-md mx-auto p-4">
        {campsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : sortedSummaries.length === 0 ? (
          <div className="text-center py-20">
            <Search className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-deep-navy">No camps found</h3>
            <p className="text-gray-dark">Try adjusting your filters</p>

            {/* Helpful debug */}
            <div className="text-xs text-slate-400 mt-4 break-words">
              <div>Account: {account?.id}</div>
              <div>Athlete: {athleteProfile?.id}</div>
              <div>Sport: {filters?.sport || athleteProfile?.sport_id || "none"}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedSummaries.map((s) => (
              <CampCard
                key={s.camp_id}
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
                sport={{
                  id: s.sport_id,
                  sport_name: s.sport_name
                }}
                positions={(s.position_codes || []).map((code) => ({ position_code: code }))}
                isFavorite={s.intent_status === "favorite"}
                isRegistered={s.intent_status === "registered" || s.intent_status === "completed"}
                onFavoriteToggle={() => toggleFavoriteMutation.mutate(s.camp_id)}
                onClick={() => navigate(createPageUrl(`CampDetail?id=${s.camp_id}`))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Filter Sheet */}
      <FilterSheet
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        onFilterChange={setFilters}
        positions={availablePositions}
        sports={sports}
        onApply={() => setShowFilters(false)}
        onClear={handleClearFilters}
      />

      <BottomNav />
    </div>
  );
}

