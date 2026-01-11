// src/pages/Discover.jsx
import React, { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { createPageUrl } from "../utils";
import { Button } from "../components/ui/button";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

import CampCard from "../components/camps/CampCard.jsx";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

export default function Discover() {
  const season = useSeasonAccess();
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Demo profile powers demo filters (and can be used for logged-out demo UX)
  const { loaded: demoLoaded, demoProfile, setDemoProfile } = useDemoProfile();

  // Effective mode: URL ?mode=demo should win; fallback to season.mode
  const effectiveMode = useMemo(() => {
    try {
      const sp = new URLSearchParams(window.location.search || "");
      if (sp.get("mode") === "demo") return "demo";
    } catch {}
    return season.mode === "paid" ? "paid" : "demo";
  }, [season.mode]);

  const seasonYear = useMemo(() => {
    // allow URL override for demo season
    try {
      const sp = new URLSearchParams(window.location.search || "");
      const s = sp.get("season");
      if (s && Number.isFinite(Number(s))) return Number(s);
    } catch {}
    return season.seasonYear;
  }, [season.seasonYear]);

  // Filters state (shared shape with FilterSheet)
  const [filters, setFilters] = useState(() => ({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  }));

  // If demo profile has filter defaults, optionally preload them once
  // (Keep it simple: only apply when demo + demoProfile exists)
  const mergedFilters = useMemo(() => {
    if (effectiveMode !== "demo") return filters;
    if (!demoLoaded || !demoProfile) return filters;

    return {
      ...filters,
      sport: demoProfile?.sport_id ? String(normId(demoProfile.sport_id)) : filters.sport,
      state: demoProfile?.state || filters.state,
      divisions: demoProfile?.division ? [demoProfile.division] : filters.divisions,
      positions: Array.isArray(demoProfile?.position_ids)
        ? demoProfile.position_ids.map((x) => String(normId(x))).filter(Boolean)
        : filters.positions
    };
  }, [effectiveMode, filters, demoLoaded, demoProfile]);

  // Data source: public summaries (works for both demo and paid “discover” browse)
  const { data: camps = [], isLoading } = usePublicCampSummariesClient({
    seasonYear,
    sportId: mergedFilters.sport || null,
    state: mergedFilters.state || null,
    division: Array.isArray(mergedFilters.divisions) && mergedFilters.divisions.length === 1
      ? mergedFilters.divisions[0]
      : null,
    positionIds: mergedFilters.positions || [],
    limit: 500,
    enabled: true
  });

  // Client-side date filtering (since backend date ops vary)
  const filteredCamps = useMemo(() => {
    const start = mergedFilters.startDate || "";
    const end = mergedFilters.endDate || "";
    if (!start && !end) return camps;

    return (camps || []).filter((c) => {
      const d = String(c?.start_date || "");
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [camps, mergedFilters.startDate, mergedFilters.endDate]);

  const pageTitle = effectiveMode === "demo" ? `Discover (Demo ${seasonYear})` : "Discover";

  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="max-w-md mx-auto px-4 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-extrabold text-deep-navy">{pageTitle}</div>
            <div className="text-sm text-slate-500">
              Filter by sport, division, position, state, and dates.
            </div>
          </div>

          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            <div className="text-sm text-slate-500">Loading camps…</div>
          ) : filteredCamps.length === 0 ? (
            <div className="text-sm text-slate-500">No camps found.</div>
          ) : (
            filteredCamps.map((c) => (
              <CampCard
                key={String(c.camp_id)}
                mode={effectiveMode}
                camp={{
                  camp_name: c.camp_name,
                  start_date: c.start_date,
                  end_date: c.end_date,
                  price: c.price,
                  city: c.city,
                  state: c.state
                }}
                school={{
                  school_name: c.school_name,
                  division: c.school_division
                }}
                sport={{
                  name: c.sport_name
                }}
                positions={(c.position_ids || []).map((id) => ({ id, position_code: id }))}
                isFavorite={false}
                isRegistered={false}
                disabledFavorite={effectiveMode === "demo"}
                onFavoriteToggle={() => {}}
                onClick={() => {
                  // optional: route to CampDetail later
                  // window.location.href = createPageUrl("CampDetail") + `?id=${encodeURIComponent(c.camp_id)}`
                }}
              />
            ))
          )}
        </div>
      </div>

      <FilterSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        // these arrays are optional; pass empty unless you have dedicated lists
        sports={[]}
        positions={[]}
        onApply={() => {
          // Persist demo profile choices if in demo (best-effort)
          if (effectiveMode === "demo" && demoLoaded) {
            try {
              setDemoProfile({
                sport_id: mergedFilters.sport || null,
                state: mergedFilters.state || null,
                division:
                  Array.isArray(mergedFilters.divisions) && mergedFilters.divisions.length === 1
                    ? mergedFilters.divisions[0]
                    : null,
                position_ids: mergedFilters.positions || []
              });
            } catch {}
          }

          setFiltersOpen(false);
        }}
        onClear={() => {
          setFilters({
            sport: "",
            state: "",
            divisions: [],
            positions: [],
            startDate: "",
            endDate: ""
          });
        }}
      />

      <BottomNav />
    </div>
  );
}

