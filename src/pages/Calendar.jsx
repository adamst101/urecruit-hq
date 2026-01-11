// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { CalendarDays, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function safeUpper2(x) {
  const s = String(x || "").trim().toUpperCase();
  return s.length === 2 ? s : s;
}

function parseSeasonOverride(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const mode = sp.get("mode");
    const season = sp.get("season");
    const seasonYear = season && Number.isFinite(Number(season)) ? Number(season) : null;
    return { mode: mode ? String(mode).toLowerCase() : null, seasonYear };
  } catch {
    return { mode: null, seasonYear: null };
  }
}

function sanitizeDateStr(v) {
  if (!v) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function withinDateRange(startDate, endDate, campStart) {
  if (!startDate && !endDate) return true;
  const d = String(campStart || "").slice(0, 10);
  if (!d) return false;
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

export default function Calendar() {
  const loc = useLocation();
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const { mode: urlMode, seasonYear: urlSeasonYear } = useMemo(
    () => parseSeasonOverride(loc.search),
    [loc.search]
  );

  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, season.mode]);

  const isDemo = effectiveMode === "demo";

  const seasonYear = useMemo(() => {
    return urlSeasonYear || season.seasonYear;
  }, [urlSeasonYear, season.seasonYear]);

  // Filters (draft vs applied)
  const emptyFilters = useMemo(
    () => ({
      sport: "",
      state: "",
      divisions: [],
      positions: [],
      startDate: "",
      endDate: ""
    }),
    []
  );

  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);

  // Lists for FilterSheet
  const sportsQuery = useQuery({
    queryKey: ["sports_list"],
    retry: false,
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
    queryFn: async () => {
      try {
        const rows = await base44.entities.Position.list();
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  // Division: hook supports one division; we apply multi-select client-side
  const divisionSingle = useMemo(() => {
    const arr = Array.isArray(filters.divisions) ? filters.divisions : [];
    return arr.length === 1 ? arr[0] : "";
  }, [filters.divisions]);

  // IMPORTANT: State filter must match dataset. We normalize to uppercase.
  const stateForQuery = useMemo(() => {
    return filters.state ? safeUpper2(filters.state) : null;
  }, [filters.state]);

  // Pull public summaries (works for demo + paid calendar browsing)
  const campsQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: stateForQuery,
    division: divisionSingle || null,
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    limit: 1200,
    enabled: true
  });

  // Client-side enforcement for:
  // - multi-division (when >1 selected)
  // - date range (start/end)
  const rows = useMemo(() => {
    const data = Array.isArray(campsQuery.data) ? campsQuery.data : [];
    const divs = Array.isArray(filters.divisions) ? filters.divisions : [];
    const startDate = sanitizeDateStr(filters.startDate);
    const endDate = sanitizeDateStr(filters.endDate);

    return data
      .filter((r) => {
        if (divs.length > 1 && r?.school_division && !divs.includes(r.school_division)) return false;
        if (!withinDateRange(startDate, endDate, r?.start_date)) return false;
        return true;
      })
      .sort((a, b) => String(a?.start_date || "").localeCompare(String(b?.start_date || "")));
  }, [campsQuery.data, filters.divisions, filters.startDate, filters.endDate]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.sport) n += 1;
    if (filters.state) n += 1;
    if ((filters.divisions || []).length) n += 1;
    if ((filters.positions || []).length) n += 1;
    if (filters.startDate) n += 1;
    if (filters.endDate) n += 1;
    return n;
  }, [filters]);

  const loading =
    season.isLoading || campsQuery.isLoading || sportsQuery.isLoading || positionsQuery.isLoading;

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-5xl mx-auto px-4 pt-5 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-brand flex items-center gap-2">
                <CalendarDays className="w-5 h-5" />
                Calendar
              </h1>
              {isDemo && (
                <Badge variant="outline" className="bg-white">
                  Demo · {seasonYear}
                </Badge>
              )}
              {!isDemo && season.mode === "paid" && (
                <Badge className="bg-emerald-600 text-white">Paid</Badge>
              )}
            </div>
            <div className="text-sm text-muted mt-1">
              This is a simple list view for now. Next step is a true calendar grid.
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              setDraftFilters(filters);
              setFilterOpen(true);
            }}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-slate-900 text-white text-xs px-2 py-0.5">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="text-sm text-slate-500">Loading camps…</div>
        ) : rows.length === 0 ? (
          <Card className="p-5 border-slate-200 bg-white">
            <div className="text-sm text-slate-700 font-semibold">No camps found.</div>
            <div className="text-sm text-slate-500 mt-1">
              If you filtered by state, try clearing state once to confirm the dataset uses 2-letter codes.
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setFilters(emptyFilters);
                  setDraftFilters(emptyFilters);
                }}
              >
                Clear all
              </Button>
              <Button
                className="bg-electric-blue text-white hover:bg-deep-navy"
                onClick={() => setFilterOpen(true)}
              >
                Adjust filters
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const key = String(r?.camp_id || normId(r) || Math.random());
              return (
                <Card key={key} className="p-4 border-slate-200 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {r?.school_division && (
                          <Badge className="bg-slate-900 text-white text-xs">{r.school_division}</Badge>
                        )}
                        {r?.sport_name && <span className="text-xs text-slate-500 font-medium">{r.sport_name}</span>}
                      </div>
                      <div className="text-lg font-semibold text-deep-navy truncate">
                        {r?.school_name || "Unknown School"}
                      </div>
                      <div className="text-sm text-slate-600 truncate">{r?.camp_name || "Camp"}</div>
                    </div>

                    <div className="text-right text-sm text-slate-600">
                      <div className="font-semibold">{String(r?.start_date || "").slice(0, 10) || "TBD"}</div>
                      {(r?.city || r?.state) && (
                        <div className="text-xs text-slate-500">
                          {[r?.city, r?.state].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter sheet */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={draftFilters}
        onFilterChange={setDraftFilters}
        sports={sportsQuery.data || []}
        positions={positionsQuery.data || []}
        onClear={() => {
          setDraftFilters(emptyFilters);
          setFilters(emptyFilters);
          setFilterOpen(false);
        }}
        onApply={() => {
          setFilters(draftFilters);
          setFilterOpen(false);
        }}
      />

      {/* Bottom nav */}
      <BottomNav />
    </div>
  );
}
