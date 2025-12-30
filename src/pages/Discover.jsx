import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

import CampCard from "../components/camps/CampCard";
import FilterSheet from "../components/camps/FilterSheet";
import BottomNav from "../components/navigation/BottomNav";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";

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

  const athleteId = clean(athleteProfile?.id);
  const athleteSportId = clean(athleteProfile?.sport_id);

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
  // Shared read model (single source of truth)
  // NOTE: Discover applies extra filtering LOCALLY only.
  // -----------------------------
  const {
    data: campSummaries = [],
    isLoading: campsLoading,
    isError: campsError,
    error: campsErrorObj
  } = useCampSummariesClient({
    athleteId,
    sportId: filters?.sport || athleteSportId,
    enabled: !!athleteId && !identityLoading && !identityError
  });

  // -----------------------------
  // Local filtering (Discover-specific)
  // -----------------------------
  const filteredSummaries = useMemo(() => {
    let list = Array.isArray(campSummaries) ? [...campSummaries] : [];

    // Search
    const q = clean(searchQuery);
    if (q) {
      const qq = String(q).toLowerCase();
      list = list.filter((s) =>
        (s.camp_name || "").toLowerCase().includes(qq) ||
        (s.school_name || "").toLowerCase().includes(qq)
      );
    }

    // Divisions
    const divisions = Array.isArray(filters?.divisions)
      ? filters.divisions
      : (filters?.divisions ? String(filters.divisions).split(",") : []);
    const divs = divisions.map((d) => String(d).trim()).filter(Boolean);
    if (divs.length) {
      const divSet = new Set(divs);
      list = list.filter((s) => divSet.has(s.school_division));
    }

    // State(s)
    const states = clean(filters?.state || filters?.states);
    if (states) {
      const arr = Array.isArray(states) ? states : String(states).split(",");
      const st = arr.map((s) => String(s).trim()).filter(Boolean);
      if (st.length) {
        const set = new Set(st);
        list = list.filter((s) => set.has(s.state));
      }
    }

    // Positions
    const pos = Array.isArray(filters?.positions)
      ? filters.positions
      : (filters?.positions ? String(filters.positions).split(",") : []);
    const posIds = pos.map((p) => String(p).trim()).filter(Boolean);
    if (posIds.length) {
      const posSet = new Set(posIds);
      list = list.filter((s) =>
        (s.position_ids || []).some((pid) => posSet.has(String(pid)))
      );
    }

    // Date range (best-effort)
    if (filters?.startDate) {
      const d0 = String(filters.startDate).slice(0, 10);
      list = list.filter((s) => String(s.start_date).slice(0, 10) >= d0);
    }
    if (filters?.endDate) {
      const d1 = String(filters.endDate).slice(0, 10);
      list = list.filter((s) => String(s.start_date).slice(0, 10) <= d1);
    }

    list.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return list;
  }, [campSummaries, filters, searchQuery]);

  // -----------------------------
  // Favorite toggle (CampIntent) — same contract as MyCamps
  // -----------------------------
  const toggleFavoriteMutation = useMutation({
    mutationFn: async (campId) => {
      if (!athleteId) return;

      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteId,
        camp_id: campId
      });

      const intent = existing?.[0] || null;

      // Don't touch registrations from favorite toggle
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
      // Unified invalidation
      queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });
    }
  });

  // -----------------------------
  // UI helpers
  // -----------------------------
  const handleClearFilters = () => {
    setFilters({ sport: athleteSportId });
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

          {campsError && (
            <div className="bg-white border border-rose-200 text-rose-700 rounded-xl p-3 mt-4">
              <div className="font-semibold">Failed to load camps</div>
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
        ) : filteredSummaries.length === 0 ? (
          <div className="text-center py-20">
            <Search className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-deep-navy">No camps found</h3>
            <p className="text-gray-dark">Try adjusting your filters</p>

            <div className="text-xs text-slate-400 mt-4 break-words">
              <div>Account: {account?.id}</div>
              <div>Athlete: {athleteProfile?.id}</div>
              <div>Sport: {filters?.sport || athleteSportId || "none"}</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSummaries.map((s) => (
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
                isRegistered={
                  s.intent_status === "registered" || s.intent_status === "completed"
                }
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

