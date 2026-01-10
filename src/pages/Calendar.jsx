// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Filter } from "lucide-react";
import { format } from "date-fns";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

// ---------- helpers ----------
function safeDay(d) {
  try {
    if (!d) return null;
    return format(new Date(d), "yyyy-MM-dd");
  } catch {
    return null;
  }
}

function safeLabel(d) {
  try {
    if (!d) return "TBD";
    return format(new Date(d), "EEE, MMM d");
  } catch {
    return "TBD";
  }
}

function readUrlMode(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const m = sp.get("mode");
    return m ? String(m).toLowerCase() : null;
  } catch {
    return null;
  }
}

export default function Calendar() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  // URL override: ?mode=demo always forces demo behavior
  const urlMode = useMemo(() => readUrlMode(loc?.search || ""), [loc?.search]);
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, season.mode]);

  const isPaid = effectiveMode === "paid";
  const athleteId = isPaid ? (athleteProfile?.id ? String(athleteProfile.id) : null) : null;

  // Filters (shared contract with FilterSheet)
  const [filters, setFilters] = useState({
    sport: "",
    divisions: [],
    positions: [],
    state: "",
    startDate: "",
    endDate: ""
  });

  const [filterOpen, setFilterOpen] = useState(false);

  // Load sports/positions for FilterSheet options
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // Sports
      try {
        const rows = await base44.entities.Sport.list?.();
        if (!mounted) return;
        setSports(Array.isArray(rows) ? rows : []);
      } catch {
        try {
          const rows2 = await base44.entities.Sport.filter?.({});
          if (!mounted) return;
          setSports(Array.isArray(rows2) ? rows2 : []);
        } catch {
          if (mounted) setSports([]);
        }
      }

      // Positions
      try {
        const prow = await base44.entities.Position.list?.();
        if (!mounted) return;
        setPositions(Array.isArray(prow) ? prow : []);
      } catch {
        try {
          const prow2 = await base44.entities.Position.filter?.({});
          if (!mounted) return;
          setPositions(Array.isArray(prow2) ? prow2 : []);
        } catch {
          if (mounted) setPositions([]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Data source:
  // - Paid: athlete-scoped summaries
  // - Demo: public summaries by seasonYear (demoYear/current per useSeasonAccess)
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || null,
    enabled: isPaid && !!athleteId
  });

  const publicQuery = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: (filters.divisions && filters.divisions[0]) ? filters.divisions[0] : null,
    positionIds: filters.positions || [],
    enabled: !isPaid
  });

  const rows = useMemo(() => {
    const src = isPaid ? paidQuery.data : publicQuery.data;
    return Array.isArray(src) ? src : [];
  }, [isPaid, paidQuery.data, publicQuery.data]);

  // Client-side date range filter (applies to both modes)
  const filteredRows = useMemo(() => {
    const start = filters.startDate ? String(filters.startDate) : "";
    const end = filters.endDate ? String(filters.endDate) : "";

    if (!start && !end) return rows;

    return rows.filter((r) => {
      const d = safeDay(r?.start_date);
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [rows, filters.startDate, filters.endDate]);

  // Group by day for a simple calendar-like list
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of filteredRows) {
      const k = safeDay(r?.start_date) || "tbd";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }

    // sort keys ascending, but keep TBD last
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "tbd") return 1;
      if (b === "tbd") return -1;
      return a.localeCompare(b);
    });

    return keys.map((k) => ({ dayKey: k, items: map.get(k) || [] }));
  }, [filteredRows]);

  const loading = season.isLoading || (isPaid ? paidQuery.isLoading : publicQuery.isLoading);
  const hasError = isPaid ? paidQuery.isError : publicQuery.isError;

  const onClear = () => {
    setFilters({
      sport: "",
      divisions: [],
      positions: [],
      state: "",
      startDate: "",
      endDate: ""
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      <div className="max-w-md mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-slate-500" />
              <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
            </div>
            <div className="text-sm text-slate-600 mt-1">
              {isPaid ? (
                <span>
                  Your season schedule
                  {urlMode === "demo" ? <span className="ml-2"><Badge variant="outline">Demo</Badge></span> : null}
                </span>
              ) : (
                <span>
                  Demo schedule <Badge variant="outline" className="ml-2">Demo</Badge>
                </span>
              )}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Body */}
        <div className="mt-4 space-y-3">
          {loading ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-600">Loading…</div>
            </Card>
          ) : hasError ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-rose-700">Couldn’t load camps.</div>
            </Card>
          ) : grouped.length === 0 ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-600">No camps match your filters.</div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" onClick={onClear}>Clear filters</Button>
                <Button onClick={() => nav(createPageUrl("Discover"))}>Go to Discover</Button>
              </div>
            </Card>
          ) : (
            grouped.map((g) => (
              <div key={g.dayKey} className="space-y-2">
                <div className="text-sm font-semibold text-slate-700">
                  {g.dayKey === "tbd" ? "TBD" : safeLabel(g.dayKey)}
                </div>

                <div className="space-y-2">
                  {g.items.map((r) => {
                    const campId = r?.camp_id || r?.id;
                    const schoolName = r?.school_name || "Unknown School";
                    const campName = r?.camp_name || "Camp";
                    const division = r?.school_division || null;
                    const sportName = r?.sport_name || null;

                    return (
                      <Card
                        key={String(campId)}
                        className="p-4 border-slate-200 bg-white cursor-pointer hover:shadow-sm transition"
                        onClick={() => {
                          // CampDetail exists in your app; keep this path consistent
                          nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(campId))}` + (urlMode === "demo" ? "&mode=demo" : ""));
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {division ? (
                                <Badge className="bg-slate-900 text-white text-xs">{division}</Badge>
                              ) : null}
                              {sportName ? (
                                <span className="text-xs text-slate-500 font-medium">{sportName}</span>
                              ) : null}
                              {!isPaid ? (
                                <Badge variant="outline" className="text-xs">Demo</Badge>
                              ) : null}
                            </div>

                            <div className="mt-1 text-lg font-semibold text-deep-navy truncate">
                              {schoolName}
                            </div>
                            <div className="text-sm text-slate-600 truncate">{campName}</div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Filters */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        positions={positions}
        sports={sports}
        onApply={() => setFilterOpen(false)}
        onClear={onClear}
      />
    </div>
  );
}
