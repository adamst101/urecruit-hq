// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Filter } from "lucide-react";

import { base44 } from "../api/base44Client";

import BottomNav from "../components/navigation/BottomNav";
import FilterSheet from "../components/filters/FilterSheet";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

function safeDateStr(d) {
  if (!d) return "";
  const s = String(d);
  // Expect YYYY-MM-DD (Base44 date strings)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

function inRange(d, start, end) {
  const ds = safeDateStr(d);
  if (!ds) return false;
  if (start && ds < start) return false;
  if (end && ds > end) return false;
  return true;
}

export default function Calendar() {
  const { isLoading: accessLoading, mode, seasonYear } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // Load reference lists for filter UI (best effort)
  const sportsQuery = useQuery({
    queryKey: ["sports_list"],
    retry: false,
    staleTime: 5 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const rows = await base44.entities.Position.list();
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  const isPaid = mode === "paid";
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // Paid: use athlete-scoped composed summaries
  const paidSummaries = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || null,
    enabled: isPaid && !!athleteId
  });

  // Demo/Public: use year-scoped public summaries
  const publicSummaries = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    // hook supports single division; we handle multi-divisions client-side below
    division: "",
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    enabled: !isPaid && !!seasonYear
  });

  const loading =
    accessLoading ||
    (isPaid && identityLoading) ||
    (isPaid ? paidSummaries.isLoading : publicSummaries.isLoading);

  const summaries = (isPaid ? paidSummaries.data : publicSummaries.data) || [];

  // Apply the remaining filters client-side (multi-division + date range)
  const filtered = useMemo(() => {
    const divs = Array.isArray(filters.divisions) ? filters.divisions : [];
    const start = filters.startDate || "";
    const end = filters.endDate || "";

    return (summaries || []).filter((c) => {
      // divisions (multi-select)
      if (divs.length) {
        const d = c?.school_division || null;
        if (!d || !divs.includes(d)) return false;
      }

      // date range
      if (start || end) {
        const ok = inRange(c?.start_date, start, end);
        if (!ok) return false;
      }

      return true;
    });
  }, [summaries, filters.divisions, filters.startDate, filters.endDate]);

  // Group by start date (simple “calendar-ish” view)
  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of filtered) {
      const key = safeDateStr(c?.start_date) || "TBD";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    const keys = Array.from(map.keys()).sort((a, b) => String(a).localeCompare(String(b)));
    return keys.map((k) => ({ date: k, items: map.get(k) || [] }));
  }, [filtered]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      <div className="max-w-md mx-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-600" />
            <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
          </div>

          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        <Card className="p-3 border-slate-200 mb-4">
          <div className="text-xs text-slate-600 flex items-center justify-between">
            <span>
              Mode: <span className="font-semibold">{isPaid ? "Paid" : "Demo"}</span>
            </span>
            <span>
              Season: <span className="font-semibold">{seasonYear}</span>
            </span>
          </div>
        </Card>

        {grouped.length === 0 ? (
          <div className="text-sm text-slate-600">
            No camps match your filters.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.date}>
                <div className="text-xs font-semibold text-slate-500 mb-2">
                  {g.date === "TBD" ? "TBD" : g.date}
                </div>

                <div className="space-y-2">
                  {g.items.map((c) => (
                    <Card key={c.camp_id} className="p-3 border-slate-200 bg-white">
                      <div className="text-sm font-semibold text-deep-navy truncate">
                        {c.school_name || "Unknown School"}
                      </div>
                      <div className="text-sm text-slate-600 truncate">
                        {c.camp_name || "Camp"}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {safeDateStr(c.start_date)}
                        {c.state ? ` • ${c.state}` : ""}
                        {c.school_division ? ` • ${c.school_division}` : ""}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <FilterSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        sports={sportsQuery.data || []}
        positions={positionsQuery.data || []}
        onClear={() => {
          setFilters({
            sport: "",
            state: "",
            divisions: [],
            positions: [],
            startDate: "",
            endDate: ""
          });
          setFiltersOpen(false);
        }}
        onApply={() => setFiltersOpen(false)}
      />

      <BottomNav />
    </div>
  );
}
