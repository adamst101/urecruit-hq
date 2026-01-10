// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Filter } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";

// ✅ MUST match your actual file locations
import FilterSheet from "../components/filters/FilterSheet.jsx";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.js";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function asDateStr(d) {
  try {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function inRange(dateStr, startStr, endStr) {
  // All are "YYYY-MM-DD" (lexicographic safe)
  if (!dateStr) return true;
  const d = String(dateStr);
  if (startStr && d < startStr) return false;
  if (endStr && d > endStr) return false;
  return true;
}

export default function Calendar() {
  const season = useSeasonAccess();
  const seasonYear = season?.seasonYear;

  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filters compatible with FilterSheet
  const [filters, setFilters] = useState({
    sport: "",
    divisions: [],
    positions: [],
    state: "",
    startDate: "",
    endDate: ""
  });

  // Lists for FilterSheet
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  // Load sports + positions (best-effort; page still works if these fail)
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const s = await base44.entities.Sport?.list?.();
        if (mounted) setSports(Array.isArray(s) ? s : []);
      } catch {
        if (mounted) setSports([]);
      }
    })();

    (async () => {
      try {
        const p = await base44.entities.Position?.list?.();
        if (mounted) setPositions(Array.isArray(p) ? p : []);
      } catch {
        if (mounted) setPositions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedDivision =
    Array.isArray(filters.divisions) && filters.divisions.length === 1
      ? filters.divisions[0]
      : ""; // FilterSheet supports multi; public hook supports single division
  const selectedPositions = Array.isArray(filters.positions) ? filters.positions : [];

  const publicQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: selectedDivision || null,
    positionIds: selectedPositions,
    limit: 800,
    enabled: !!seasonYear
  });

  const summaries = Array.isArray(publicQuery.data) ? publicQuery.data : [];

  // Apply date range client-side (hook filters by year; this tightens within year)
  const filtered = useMemo(() => {
    const start = filters.startDate ? String(filters.startDate) : "";
    const end = filters.endDate ? String(filters.endDate) : "";

    return summaries
      .filter((c) => {
        const d = asDateStr(c?.start_date);
        return inRange(d, start, end);
      })
      .sort((a, b) => String(b?.start_date || "").localeCompare(String(a?.start_date || "")));
  }, [summaries, filters.startDate, filters.endDate]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of filtered) {
      const key = asDateStr(c?.start_date) || "TBD";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return Array.from(map.entries()).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  }, [filtered]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.sport) n += 1;
    if (filters.state) n += 1;
    if (Array.isArray(filters.divisions) && filters.divisions.length) n += 1;
    if (Array.isArray(filters.positions) && filters.positions.length) n += 1;
    if (filters.startDate) n += 1;
    if (filters.endDate) n += 1;
    return n;
  }, [filters]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-20">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-700" />
            <h1 className="text-xl font-semibold text-deep-navy">Calendar</h1>
          </div>

          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <Badge className="ml-2 bg-slate-900 text-white">{activeFilterCount}</Badge>
            )}
          </Button>
        </div>

        {/* Mode banner */}
        <Card className="p-3 border-slate-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-700">
              Season: <span className="font-semibold">{seasonYear || "—"}</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {season?.mode === "paid" ? "Paid" : "Demo"}
            </Badge>
          </div>
        </Card>

        {/* Content */}
        {publicQuery.isLoading ? (
          <Card className="p-6 border-slate-200 bg-white text-sm text-slate-600">
            Loading camps…
          </Card>
        ) : grouped.length === 0 ? (
          <Card className="p-6 border-slate-200 bg-white">
            <div className="text-sm text-slate-700 font-medium">No camps found.</div>
            <div className="text-sm text-slate-500 mt-1">
              Try clearing filters or choosing a different sport/state/date range.
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {grouped.map(([dateKey, items]) => (
              <Card key={dateKey} className="p-4 border-slate-200 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-deep-navy">
                    {dateKey === "TBD" ? "Date TBD" : dateKey}
                  </div>
                  <div className="text-xs text-slate-500">{items.length} camp(s)</div>
                </div>

                <div className="space-y-3">
                  {items.map((c) => {
                    const id = String(c?.camp_id || normId(c) || Math.random());
                    return (
                      <div key={id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">
                              {c?.school_name || "Unknown School"}
                            </div>
                            <div className="text-sm text-slate-600 truncate">
                              {c?.camp_name || "Camp"}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {c?.school_division && (
                                <Badge className="bg-slate-900 text-white text-xs">
                                  {c.school_division}
                                </Badge>
                              )}
                              {c?.sport_name && (
                                <Badge variant="secondary" className="text-xs">
                                  {c.sport_name}
                                </Badge>
                              )}
                              {c?.state && (
                                <Badge variant="outline" className="text-xs">
                                  {c.state}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Filter sheet */}
      <FilterSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onFilterChange={(next) => setFilters(next || {})}
        positions={positions}
        sports={sports}
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
