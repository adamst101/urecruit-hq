// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";

// ✅ Remove explicit extensions (Base44 resolves these more reliably)
import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

import FilterSheet from "../components/filters/FilterSheet";
import CampCard from "../components/camps/CampCard";
import BottomNav from "../components/navigation/BottomNav";

import { Button } from "../components/ui/button";

function safeDateKey(d) {
  try {
    if (!d) return "TBD";
    return String(d).slice(0, 10);
  } catch {
    return "TBD";
  }
}

export default function Calendar() {
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: "",
  });

  const isPaid = season.mode === "paid";
  const athleteId = isPaid ? athleteProfile?.id || null : null;

  // Paid data
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || null,
    enabled: isPaid && !!athleteId,
    limit: 500,
  });

  // Demo/Public data
  const demoQuery = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: (filters.divisions || [])[0] || null,
    positionIds: filters.positions || [],
    enabled: !isPaid,
    limit: 500,
  });

  const rows = useMemo(() => {
    const arr = isPaid ? (paidQuery.data || []) : (demoQuery.data || []);
    return (arr || []).map((r) => ({
      camp_id: r.camp_id,
      camp_name: r.camp_name,
      start_date: r.start_date,
      end_date: r.end_date,
      city: r.city,
      state: r.state,
      price: r.price,

      school_id: r.school_id,
      school_name: r.school_name,
      school_division: r.school_division,

      sport_id: r.sport_id,
      sport_name: r.sport_name,

      intent_status: r.intent_status || null,
    }));
  }, [isPaid, paidQuery.data, demoQuery.data]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = safeDateKey(r.start_date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "TBD") return 1;
      if (b === "TBD") return -1;
      return a < b ? 1 : -1;
    });
    return keys.map((k) => ({ dateKey: k, items: map.get(k) || [] }));
  }, [rows]);

  const loading = isPaid ? paidQuery.isLoading : demoQuery.isLoading;

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="max-w-md mx-auto p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-bold text-deep-navy">Calendar</div>
            <div className="text-sm text-slate-600">
              {isPaid ? "Paid workspace" : `Demo season (${season.seasonYear})`}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            Filters
          </Button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-slate-600">Loading…</div>
        ) : grouped.length === 0 ? (
          <div className="py-10 text-center text-slate-600">No camps found.</div>
        ) : (
          <div className="mt-4 space-y-6">
            {grouped.map((g) => (
              <div key={g.dateKey}>
                <div className="text-sm font-semibold text-slate-700 mb-2">
                  {g.dateKey === "TBD" ? "TBD" : g.dateKey}
                </div>

                <div className="space-y-3">
                  {g.items.map((r) => (
                    <CampCard
                      key={r.camp_id}
                      mode={isPaid ? "paid" : "demo"}
                      camp={{
                        camp_name: r.camp_name,
                        start_date: r.start_date,
                        end_date: r.end_date,
                        city: r.city,
                        state: r.state,
                        price: r.price,
                      }}
                      school={{
                        school_name: r.school_name,
                        school_division: r.school_division,
                      }}
                      sport={{ sport_name: r.sport_name }}
                      positions={[]}
                      isFavorite={false}
                      isRegistered={r.intent_status === "registered"}
                      disabledFavorite={!isPaid}
                      onFavoriteToggle={() => {}}
                      onClick={() => {}}
                    />
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
        positions={[]}
        sports={[]}
        onApply={() => setFiltersOpen(false)}
        onClear={() => {
          setFilters({
            sport: "",
            state: "",
            divisions: [],
            positions: [],
            startDate: "",
            endDate: "",
          });
          setFiltersOpen(false);
        }}
      />

      <BottomNav />
    </div>
  );
}
