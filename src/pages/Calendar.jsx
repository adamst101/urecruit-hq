// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Filter } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

function toISODateOnly(v) {
  // Accepts "YYYY-MM-DD" or Date-ish; returns "YYYY-MM-DD" or ""
  if (!v) return "";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  } catch {
    return "";
  }
}

function inDateRange(iso, start, end) {
  // iso/start/end are "YYYY-MM-DD" strings
  if (!iso) return false;
  if (start && iso < start) return false;
  if (end && iso > end) return false;
  return true;
}

function groupByStartDate(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const key = toISODateOnly(r?.start_date) || "TBD";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  // sort keys ascending, keep "TBD" last
  const keys = Array.from(map.keys()).sort((a, b) => {
    if (a === "TBD") return 1;
    if (b === "TBD") return -1;
    return a.localeCompare(b);
  });
  return keys.map((k) => ({ date: k, items: map.get(k) || [] }));
}

export default function Calendar() {
  const loc = useLocation();
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  // URL override for demo
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc.search]);

  const mode = forceDemo ? "demo" : season.mode; // "demo" | "paid"
  const isPaid = mode === "paid";

  const [filterOpen, setFilterOpen] = useState(false);

  // Single filter state contract used by FilterSheet
  const [filters, setFilters] = useState(() => ({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  }));

  const resolvedSportId = filters.sport ? String(filters.sport) : null;
  const resolvedState = filters.state ? String(filters.state) : "";
  const resolvedDivision = Array.isArray(filters.divisions) && filters.divisions[0] ? String(filters.divisions[0]) : "";
  const resolvedPositionIds = Array.isArray(filters.positions) ? filters.positions.map(String) : [];

  const startDate = toISODateOnly(filters.startDate);
  const endDate = toISODateOnly(filters.endDate);

  // Supporting lists for FilterSheet (sports/positions)
  const sportsQuery = useQuery({
    queryKey: ["sports_list"],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const rows = await base44.entities.Sport.list?.();
        return Array.isArray(rows) ? rows : [];
      } catch {
        // fallback: some Base44 projects prefer filter({})
        try {
          const rows2 = await base44.entities.Sport.filter?.({});
          return Array.isArray(rows2) ? rows2 : [];
        } catch {
          return [];
        }
      }
    }
  });

  const positionsQuery = useQuery({
    queryKey: ["positions_list"],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const rows = await base44.entities.Position.list?.();
        return Array.isArray(rows) ? rows : [];
      } catch {
        try {
          const rows2 = await base44.entities.Position.filter?.({});
          return Array.isArray(rows2) ? rows2 : [];
        } catch {
          return [];
        }
      }
    }
  });

  // Paid data: athlete-scoped summaries
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  const paidSummaries = useCampSummariesClient({
    athleteId,
    sportId: resolvedSportId,
    enabled: isPaid && !!athleteId
  });

  // Demo/public data: seasonYear-scoped summaries
  const publicSummaries = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: resolvedSportId,
    state: resolvedState || null,
    division: resolvedDivision || null,
    positionIds: resolvedPositionIds,
    enabled: !isPaid && !!season.seasonYear
  });

  const loading =
    season.isLoading ||
    (isPaid ? paidSummaries.isLoading : publicSummaries.isLoading) ||
    sportsQuery.isLoading ||
    positionsQuery.isLoading;

  const rawRows = useMemo(() => {
    const rows = isPaid ? paidSummaries.data : publicSummaries.data;
    return Array.isArray(rows) ? rows : [];
  }, [isPaid, paidSummaries.data, publicSummaries.data]);

  // Apply shared client-side filters (date range + division/positions for paid too)
  const filteredRows = useMemo(() => {
    let rows = rawRows;

    // Date range
    if (startDate || endDate) {
      rows = rows.filter((r) => inDateRange(toISODateOnly(r?.start_date), startDate, endDate));
    }

    // Paid-mode extras (public hook already applied these filters server/client-side)
    if (isPaid) {
      if (resolvedState) rows = rows.filter((r) => String(r?.state || "") === String(resolvedState));
      if (resolvedDivision) rows = rows.filter((r) => String(r?.school_division || "") === String(resolvedDivision));

      if (resolvedPositionIds.length) {
        rows = rows.filter((r) => {
          const ids = Array.isArray(r?.position_ids) ? r.position_ids.map(String) : [];
          return resolvedPositionIds.some((pid) => ids.includes(String(pid)));
        });
      }
    }

    return rows;
  }, [rawRows, startDate, endDate, isPaid, resolvedState, resolvedDivision, resolvedPositionIds]);

  const grouped = useMemo(() => groupByStartDate(filteredRows), [filteredRows]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-slate-500">Loading calendar…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-deep-navy">Calendar</h1>
              <Badge variant="outline" className="text-xs">
                {isPaid ? "Paid" : "Demo"}
              </Badge>
            </div>
            <div className="text-sm text-slate-600">
              Season {season.seasonYear}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Content */}
        {filteredRows.length === 0 ? (
          <Card className="p-6 border-slate-200">
            <div className="text-sm text-slate-600">
              No camps match your current filters.
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setFilters({
                    sport: "",
                    state: "",
                    divisions: [],
                    positions: [],
                    startDate: "",
                    endDate: ""
                  })
                }
              >
                Clear filters
              </Button>
              <Button onClick={() => (window.location.href = createPageUrl("Discover"))}>
                Go to Discover
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.date} className="space-y-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {g.date === "TBD" ? "Date TBD" : g.date}
                </div>

                <div className="space-y-2">
                  {g.items.map((r) => (
                    <Card
                      key={String(r?.camp_id || r?.id || `${r?.school_name}-${r?.camp_name}-${r?.start_date}`)}
                      className="p-4 border-slate-200 bg-white"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        // If you have CampDetail, route there; otherwise noop.
                        try {
                          const cid = r?.camp_id || r?.id;
                          if (cid) window.location.href = createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(cid))}`;
                        } catch {}
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          try {
                            const cid = r?.camp_id || r?.id;
                            if (cid) window.location.href = createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(cid))}`;
                          } catch {}
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-deep-navy truncate">
                            {r?.school_name || "Unknown School"}
                          </div>
                          <div className="text-sm text-slate-600 truncate">
                            {r?.camp_name || "Camp"}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {r?.school_division && (
                              <Badge className="bg-slate-900 text-white text-xs">
                                {r.school_division}
                              </Badge>
                            )}
                            {r?.sport_name && (
                              <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-700">
                                {r.sport_name}
                              </Badge>
                            )}
                            {(r?.city || r?.state) && (
                              <Badge variant="outline" className="text-xs">
                                {[r.city, r.state].filter(Boolean).join(", ")}
                              </Badge>
                            )}
                            {typeof r?.price === "number" && (
                              <Badge variant="outline" className="text-xs">
                                {r.price > 0 ? `$${r.price}` : "Free"}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Status badge if present (paid summaries may include intent_status) */}
                        {r?.intent_status && (
                          <Badge className="bg-emerald-600 text-white text-xs">
                            {String(r.intent_status)}
                          </Badge>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter sheet */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        sports={sportsQuery.data || []}
        positions={positionsQuery.data || []}
        onClear={() =>
          setFilters({
            sport: "",
            state: "",
            divisions: [],
            positions: [],
            startDate: "",
            endDate: ""
          })
        }
        onApply={() => setFilterOpen(false)}
      />

      <BottomNav />
    </div>
  );
}
