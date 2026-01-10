// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { CalendarDays, Filter } from "lucide-react";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";

// ✅ Your repo is .jsx (and Base44/Vite is strict)
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

// ✅ Data hooks (.jsx)
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

// ✅ IMPORTANT: you confirmed actual location/casing:
//    src/Components/Camps/FilterSheet.jsx
import FilterSheet from "../Components/Camps/FilterSheet.jsx";

/**
 * Calendar
 * - Demo: shows public camp summaries for seasonYear with client-side filters
 * - Paid: shows athlete-scoped summaries (intent/target flags available in the summary shape)
 *
 * Best-practice: Calendar is viewable in demo and paid, but write actions (favorite/register)
 * should be gated elsewhere (useWriteGate) if/when added here.
 */
export default function Calendar() {
  const { mode, seasonYear } = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const isPaid = mode === "paid";
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // UI filters (shared)
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // Query inputs
  const sportId = filters.sport ? String(filters.sport) : null;
  const state = filters.state ? String(filters.state) : null;
  const division = Array.isArray(filters.divisions) && filters.divisions.length === 1
    ? String(filters.divisions[0])
    : null;
  const positionIds = Array.isArray(filters.positions) ? filters.positions : [];

  // Demo (public) summaries
  const publicQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId,
    state,
    division,
    positionIds,
    limit: 800,
    enabled: !isPaid // only when demo
  });

  // Paid (athlete) summaries
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId,
    limit: 800,
    enabled: isPaid && !!athleteId
  });

  const rows = useMemo(() => {
    const source = isPaid ? (paidQuery.data || []) : (publicQuery.data || []);
    const arr = Array.isArray(source) ? source : [];

    // Apply date range (client-side) consistently across both modes
    const start = filters.startDate ? String(filters.startDate) : "";
    const end = filters.endDate ? String(filters.endDate) : "";

    const inRange = (d) => {
      if (!d) return true;
      const s = String(d);
      if (start && s < start) return false;
      if (end && s > end) return false;
      return true;
    };

    const filtered = arr.filter((r) => inRange(r.start_date));

    // Sort ascending by start_date
    filtered.sort((a, b) => String(a.start_date || "").localeCompare(String(b.start_date || "")));

    return filtered;
  }, [isPaid, paidQuery.data, publicQuery.data, filters.startDate, filters.endDate]);

  const loading = isPaid ? paidQuery.isLoading : publicQuery.isLoading;
  const error = isPaid ? paidQuery.isError : publicQuery.isError;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-600" />
            <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {isPaid ? "Paid" : "Demo"} • {seasonYear}
            </Badge>

            <Button variant="outline" onClick={() => setFilterOpen(true)}>
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-slate-600">Loading camps…</div>
          </Card>
        ) : error ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-rose-600">
              Couldn’t load camps. Check Base44 entity access and filters.
            </div>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-slate-600">No camps match your filters.</div>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <Card key={String(r.camp_id)} className="p-4 border-slate-200 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {r.school_division && (
                        <Badge className="bg-slate-900 text-white text-xs">
                          {r.school_division}
                        </Badge>
                      )}
                      {r.sport_name && (
                        <span className="text-xs text-slate-500 font-medium">{r.sport_name}</span>
                      )}
                      {!isPaid && (
                        <Badge variant="outline" className="text-xs">Demo</Badge>
                      )}
                      {isPaid && r.intent_status && (
                        <Badge className="bg-emerald-600 text-white text-xs">
                          {String(r.intent_status).toUpperCase()}
                        </Badge>
                      )}
                    </div>

                    <div className="text-base font-semibold text-deep-navy truncate">
                      {r.school_name || "Unknown School"}
                    </div>
                    <div className="text-sm text-slate-600 truncate">
                      {r.camp_name || "Camp"}
                    </div>

                    <div className="mt-2 text-xs text-slate-500">
                      {r.start_date || "TBD"}
                      {r.end_date && r.end_date !== r.start_date ? ` – ${r.end_date}` : ""}
                      {r.city || r.state ? ` • ${[r.city, r.state].filter(Boolean).join(", ")}` : ""}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        positions={[]}
        sports={[]}
        onApply={() => setFilterOpen(false)}
        onClear={() => {
          setFilters({
            sport: "",
            state: "",
            divisions: [],
            positions: [],
            startDate: "",
            endDate: ""
          });
          setFilterOpen(false);
        }}
      />

      <BottomNav />
    </div>
  );
}
