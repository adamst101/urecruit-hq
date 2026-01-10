// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { CalendarDays, Filter } from "lucide-react";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.js";
import { useAthleteIdentity } from "../components/useAthleteIdentity.js";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.js";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.js";

import CampCard from "../components/camps/CampCard.jsx";

function safeDateKey(d) {
  try {
    if (!d) return "TBD";
    return String(d).slice(0, 10);
  } catch {
    return "TBD";
  }
}

function groupByStartDate(rows) {
  const map = new Map();
  (rows || []).forEach((r) => {
    const k = safeDateKey(r?.start_date);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });

  const keys = Array.from(map.keys());
  keys.sort((a, b) => (a > b ? 1 : -1));

  return keys.map((k) => ({ date: k, items: map.get(k) || [] }));
}

export default function Calendar() {
  const { mode, seasonYear } = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  // shared UI filters (used mainly for demo/public query)
  const [filters, setFilters] = useState({
    sport: "",
    divisions: [],
    positions: [],
    state: "",
    startDate: "",
    endDate: "",
  });

  const [sheetOpen, setSheetOpen] = useState(false);

  // Paid data path (only if we truly have an athleteProfile)
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || undefined,
    enabled: mode === "paid" && !!athleteId,
    limit: 1000,
  });

  // Demo/public data path (works for anyone)
  const publicQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: (filters.divisions && filters.divisions[0]) || null, // public hook expects single division
    positionIds: filters.positions || [],
    enabled: mode !== "paid" || !athleteId,
    limit: 1000,
  });

  const active = mode === "paid" && athleteId ? paidQuery : publicQuery;

  // Normalize both sources to a common "summary" object for rendering.
  const rows = useMemo(() => {
    const arr = Array.isArray(active.data) ? active.data : [];
    return arr.map((x) => {
      // paid hook returns many fields; public hook returns similar
      return {
        camp_id: x.camp_id,
        camp_name: x.camp_name,
        start_date: x.start_date,
        end_date: x.end_date,
        city: x.city,
        state: x.state,
        price: x.price,
        link_url: x.link_url,
        notes: x.notes,
        position_ids: x.position_ids || [],

        school_id: x.school_id,
        school_name: x.school_name,
        school_division: x.school_division,
        school_logo_url: x.school_logo_url,

        sport_id: x.sport_id,
        sport_name: x.sport_name,

        intent_status: x.intent_status || null,
        intent_priority: x.intent_priority || null,
      };
    });
  }, [active.data]);

  // Client-side date filtering (works for both)
  const filteredRows = useMemo(() => {
    const start = filters.startDate ? String(filters.startDate) : "";
    const end = filters.endDate ? String(filters.endDate) : "";

    if (!start && !end) return rows;

    return rows.filter((r) => {
      const d = safeDateKey(r?.start_date);
      if (start && d !== "TBD" && d < start) return false;
      if (end && d !== "TBD" && d > end) return false;
      return true;
    });
  }, [rows, filters.startDate, filters.endDate]);

  const groups = useMemo(() => groupByStartDate(filteredRows), [filteredRows]);

  const loading = !!active.isLoading;
  const error = !!active.isError;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-md mx-auto px-4 pt-6 pb-24">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-slate-700" />
              <h1 className="text-2xl font-bold text-deep-navy">Calendar</h1>
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {mode === "paid" ? (
                <span>
                  Paid season workspace <Badge variant="secondary" className="ml-2">Paid</Badge>
                </span>
              ) : (
                <span>
                  Demo season view <Badge variant="outline" className="ml-2">Demo</Badge>
                </span>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => setSheetOpen(true)}
            className="shrink-0"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        <div className="mt-4">
          {loading && (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-600">Loading camps…</div>
            </Card>
          )}

          {error && (
            <Card className="p-4 border-rose-200 bg-rose-50">
              <div className="text-sm text-rose-700">
                Couldn’t load camps. Check your Base44 entities/permissions and try again.
              </div>
            </Card>
          )}

          {!loading && !error && groups.length === 0 && (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-600">No camps found for the selected filters.</div>
            </Card>
          )}

          {!loading && !error && groups.length > 0 && (
            <div className="mt-3 space-y-5">
              {groups.map((g) => (
                <div key={g.date}>
                  <div className="text-xs font-semibold text-slate-600 mb-2">
                    {g.date === "TBD" ? "TBD" : g.date}
                  </div>

                  <div className="space-y-3">
                    {g.items.map((s) => (
                      <CampCard
                        key={String(s.camp_id)}
                        camp={{
                          id: s.camp_id,
                          camp_name: s.camp_name,
                          start_date: s.start_date,
                          end_date: s.end_date,
                          price: s.price,
                          link_url: s.link_url,
                          notes: s.notes,
                          city: s.city,
                          state: s.state,
                          position_ids: s.position_ids,
                        }}
                        school={{
                          id: s.school_id,
                          school_name: s.school_name,
                          division: s.school_division,
                          logo_url: s.school_logo_url,
                        }}
                        sport={{
                          id: s.sport_id,
                          sport_name: s.sport_name,
                        }}
                        positions={[]}
                        isFavorite={false}
                        isRegistered={s.intent_status === "registered"}
                        onFavoriteToggle={() => {}}
                        onClick={() => {
                          // Optional: you can navigate to CampDetail here later
                          // keeping it inert for now to avoid new missing-import errors
                        }}
                        mode={mode}
                        disabledFavorite={mode !== "paid"} // demo: no backend writes from this page
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <FilterSheet
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          filters={filters}
          onFilterChange={setFilters}
          positions={[]}
          sports={[]}
          onApply={() => setSheetOpen(false)}
          onClear={() => {
            setFilters({
              sport: "",
              divisions: [],
              positions: [],
              state: "",
              startDate: "",
              endDate: "",
            });
          }}
        />
      </div>
    </div>
  );
}
