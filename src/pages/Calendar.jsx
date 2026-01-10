// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Filter } from "lucide-react";

import { createPageUrl } from "../utils";

// ✅ IMPORTANT: all hooks/components in this app are .jsx
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useWriteGate } from "../components/hooks/useWriteGate.jsx";

// ✅ Canonical FilterSheet location
import FilterSheet from "../components/filters/FilterSheet.jsx";

// Camps
import CampCard from "../components/camps/CampCard.jsx";

// Data sources
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

export default function Calendar() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const { mode, seasonYear } = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();
  const athleteId = normId(athleteProfile);

  const { requirePaid } = useWriteGate();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: "",
  });

  // Optional incoming sport from URL (?sport=ID)
  const urlSport = sp.get("sport");
  const effectiveSportId = useMemo(() => {
    const fromFilters = filters.sport ? String(filters.sport) : "";
    if (fromFilters) return fromFilters;
    return urlSport ? String(urlSport) : "";
  }, [filters.sport, urlSport]);

  // Paid: athlete scoped camp summaries
  const paidQuery = useCampSummariesClient({
    athleteId: athleteId || null,
    sportId: effectiveSportId || null,
    enabled: mode === "paid" && !!athleteId,
    limit: 500,
  });

  // Demo/Public: season-based camp summaries with filters
  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: effectiveSportId || null,
    state: filters.state || null,
    division: asArray(filters.divisions)[0] || null, // calendar uses first selected division for now
    positionIds: asArray(filters.positions),
    enabled: mode !== "paid",
    limit: 500,
  });

  const rows = useMemo(() => {
    const data = mode === "paid" ? paidQuery.data : demoQuery.data;
    return Array.isArray(data) ? data : [];
  }, [mode, paidQuery.data, demoQuery.data]);

  const items = useMemo(() => {
    return rows
      .map((r) => ({
        camp_id: String(r.camp_id),
        camp: {
          camp_name: r.camp_name,
          start_date: r.start_date,
          end_date: r.end_date,
          price: r.price,
          link_url: r.link_url,
          notes: r.notes,
          city: r.city,
          state: r.state,
        },
        school: {
          id: r.school_id,
          school_name: r.school_name,
          division: r.school_division,
          logo_url: r.school_logo_url,
          city: r.school_city,
          state: r.school_state,
          conference: r.school_conference,
        },
        sport: { id: r.sport_id, name: r.sport_name, sport_name: r.sport_name },
        positions: (r.position_codes || []).map((code) => ({ position_code: code })),
        isRegistered: r.intent_status === "registered",
        isFavorite: r.intent_status === "favorite",
      }))
      .filter((x) => x.camp_id);
  }, [rows]);

  const loading = mode === "paid" ? paidQuery.isLoading : demoQuery.isLoading;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      <div className="max-w-md mx-auto px-4 pt-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-600" />
            <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {mode !== "paid" && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600">
            You’re viewing demo data. Upgrade to save favorites and registrations.
          </div>
        )}

        {loading ? (
          <div className="text-sm text-slate-600">Loading camps…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-600">
            No camps match your current filters.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => (
              <CampCard
                key={it.camp_id}
                camp={it.camp}
                school={it.school}
                sport={it.sport}
                positions={it.positions}
                isFavorite={it.isFavorite}
                isRegistered={it.isRegistered}
                mode={mode}
                disabledFavorite={mode !== "paid"}
                onClick={() => nav(createPageUrl("Discover"))}
                onFavoriteToggle={() => {
                  if (!requirePaid({ next: createPageUrl("Calendar"), source: "calendar_favorite" })) return;
                }}
              />
            ))}
          </div>
        )}
      </div>

      <FilterSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        sports={[]}
        positions={[]}
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
        }}
      />
    </div>
  );
}
