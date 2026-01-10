// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Filter } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

// ---------- helpers ----------
function safeStr(x) {
  if (x == null) return "";
  return String(x);
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function isoDateOnly(v) {
  // expects "YYYY-MM-DD" or full ISO; returns "YYYY-MM-DD" or ""
  const s = safeStr(v).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // try to slice ISO
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

function inDateRange(cStart, startDate, endDate) {
  const d = isoDateOnly(cStart);
  if (!d) return false;
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

function groupByDate(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const d = isoDateOnly(r?.start_date);
    if (!d) continue;
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(r);
  }
  // sort within day by school then camp
  for (const [k, list] of map.entries()) {
    list.sort((a, b) => {
      const sa = safeStr(a?.school_name).toLowerCase();
      const sb = safeStr(b?.school_name).toLowerCase();
      if (sa !== sb) return sa.localeCompare(sb);
      return safeStr(a?.camp_name).toLowerCase().localeCompare(safeStr(b?.camp_name).toLowerCase());
    });
    map.set(k, list);
  }
  // return sorted keys asc
  const keys = Array.from(map.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { map, keys };
}

export default function Calendar() {
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const isPaid = season.mode === "paid";
  const athleteId = isPaid ? (athleteProfile?.id ? String(athleteProfile.id) : null) : null;

  // Filters (shared by demo + paid)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "", // sport id
    divisions: [], // array of division labels
    positions: [], // array of position ids (string)
    state: "", // "TX"
    startDate: "",
    endDate: ""
  });

  // Load sports/positions lists for the filter UI
  const sportsQuery = useQuery({
    queryKey: ["sports_list"],
    retry: false,
    staleTime: 60 * 1000,
    queryFn: async () => {
      try {
        const rows = await base44.entities.Sport.list();
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  const positionsQuery = useQuery({
    queryKey: ["positions_list"],
    retry: false,
    staleTime: 60 * 1000,
    queryFn: async () => {
      try {
        const rows = await base44.entities.Position.list();
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  // Paid: camp summaries with intent fields (athlete-scoped)
  const paidSummaries = useCampSummariesClient({
    athleteId,
    sportId: filters.sport ? String(filters.sport) : undefined,
    enabled: isPaid && !!athleteId
  });

  // Demo/Public: camp summaries filtered by seasonYear (no athlete scope)
  const publicSummaries = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: filters.sport ? String(filters.sport) : null,
    state: filters.state ? String(filters.state) : null,
    // division/positions/date range applied client-side below
    division: null,
    positionIds: [],
    limit: 500,
    enabled: !isPaid
  });

  const loading =
    season.isLoading ||
    sportsQuery.isLoading ||
    positionsQuery.isLoading ||
    (isPaid ? paidSummaries.isLoading : publicSummaries.isLoading);

  const rawRows = useMemo(() => {
    const rows = isPaid ? (paidSummaries.data || []) : (publicSummaries.data || []);
    return Array.isArray(rows) ? rows : [];
  }, [isPaid, paidSummaries.data, publicSummaries.data]);

  // Client-side filter application (consistent across modes)
  const filteredRows = useMemo(() => {
    const selectedDivisions = Array.isArray(filters.divisions) ? filters.divisions : [];
    const selectedPositions = Array.isArray(filters.positions) ? filters.positions.map(String) : [];
    const state = filters.state ? String(filters.state) : "";
    const startDate = filters.startDate ? String(filters.startDate) : "";
    const endDate = filters.endDate ? String(filters.endDate) : "";

    return (rawRows || []).filter((r) => {
      // State
      if (state) {
        const rs = safeStr(r?.state);
        if (rs !== state) return false;
      }

      // Division (row shape varies by source)
      if (selectedDivisions.length) {
        const div = r?.school_division || r?.division || null;
        if (!div || !selectedDivisions.includes(String(div))) return false;
      }

      // Positions (row may have position_ids)
      if (selectedPositions.length) {
        const posIds = Array.isArray(r?.position_ids) ? r.position_ids.map(String) : [];
        if (!posIds.length) return false;
        if (!selectedPositions.some((p) => posIds.includes(p))) return false;
      }

      // Date range
      if (startDate || endDate) {
        if (!inDateRange(r?.start_date, startDate, endDate)) return false;
      }

      return true;
    });
  }, [rawRows, filters]);

  const { map: byDateMap, keys: dateKeys } = useMemo(() => groupByDate(filteredRows), [filteredRows]);

  const hasFilters = useMemo(() => {
    return !!(
      (filters.sport && String(filters.sport).trim()) ||
      (filters.state && String(filters.state).trim()) ||
      (Array.isArray(filters.divisions) && filters.divisions.length) ||
      (Array.isArray(filters.positions) && filters.positions.length) ||
      (filters.startDate && String(filters.startDate).trim()) ||
      (filters.endDate && String(filters.endDate).trim())
    );
  }, [filters]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      <div className="max-w-md mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-slate-600" />
              <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              {isPaid ? "Your season workspace view" : "Demo season view"} • Season {season.seasonYear}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {/* Content */}
        <div className="mt-5">
          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-deep-navy">No camps match your filters.</div>
              <div className="text-sm text-slate-600 mt-1">
                {hasFilters ? "Try clearing filters." : "No camps available for this season."}
              </div>

              {hasFilters && (
                <button
                  type="button"
                  onClick={() =>
                    setFilters({
                      sport: "",
                      divisions: [],
                      positions: [],
                      state: "",
                      startDate: "",
                      endDate: ""
                    })
                  }
                  className="mt-3 text-sm font-medium text-electric-blue hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {dateKeys.map((d) => {
                const list = byDateMap.get(d) || [];
                return (
                  <div key={d} className="rounded-lg border border-slate-200 bg-white">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="text-sm font-semibold text-deep-navy">{d}</div>
                      <div className="text-xs text-slate-500">{list.length} camp{list.length === 1 ? "" : "s"}</div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {list.map((r) => {
                        const campId = r?.camp_id || r?.id || null;
                        const schoolName = r?.school_name || "Unknown School";
                        const campName = r?.camp_name || "Camp";
                        const loc = [r?.city, r?.state].filter(Boolean).join(", ");

                        return (
                          <button
                            key={String(campId || `${schoolName}-${campName}-${d}`)}
                            type="button"
                            className="w-full text-left px-4 py-3 hover:bg-slate-50"
                            onClick={() => {
                              // Best-effort: route to CampDetail if your app uses it; otherwise no-op.
                              // If CampDetail page exists, it usually takes an id param.
                              try {
                                if (campId) window.location.assign(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(campId))}`);
                              } catch {}
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-deep-navy truncate">{schoolName}</div>
                                <div className="text-sm text-slate-600 truncate">{campName}</div>
                                {loc ? <div className="text-xs text-slate-500 mt-1">{loc}</div> : null}
                              </div>

                              {r?.intent_status ? (
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                                  {String(r.intent_status)}
                                </span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Filter Sheet */}
      <FilterSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        positions={positionsQuery.data || []}
        sports={sportsQuery.data || []}
        onApply={() => setFiltersOpen(false)}
        onClear={() => {
          setFilters({
            sport: "",
            divisions: [],
            positions: [],
            state: "",
            startDate: "",
            endDate: ""
          });
          setFiltersOpen(false);
        }}
      />

      <BottomNav />
    </div>
  );
}
