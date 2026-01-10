// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Filter, X, Search } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card.jsx";
import { Button } from "../components/ui/button.jsx";
import { Input } from "../components/ui/input.jsx";
import { Badge } from "../components/ui/badge.jsx";

import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

import CampCard from "../components/camps/CampCard.jsx";

// ---------- helpers ----------
function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function toISODateOnly(d) {
  // returns "YYYY-MM-DD" or ""
  if (!d) return "";
  const s = String(d);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}

function safeLower(x) {
  return String(x || "").toLowerCase();
}

function parseQueryMode(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const m = sp.get("mode");
    return m ? String(m).toLowerCase() : null;
  } catch {
    return null;
  }
}

function applyClientFilters(rows, filters, q) {
  const list = asArray(rows);

  const divisions = asArray(filters?.divisions).filter(Boolean);
  const positions = asArray(filters?.positions).map(String).filter(Boolean);
  const state = filters?.state ? String(filters.state) : "";
  const sport = filters?.sport ? String(filters.sport) : "";

  const startDate = filters?.startDate ? String(filters.startDate) : "";
  const endDate = filters?.endDate ? String(filters.endDate) : "";

  const needle = safeLower(q).trim();

  return list.filter((r) => {
    // sport (if your upstream query already did sport, this is harmless)
    if (sport && String(r?.sport_id || "") !== sport) return false;

    // state
    if (state && String(r?.state || "") !== state) return false;

    // divisions (allow multi-select)
    if (divisions.length) {
      const div = String(r?.school_division || r?.division || "");
      if (!divisions.includes(div)) return false;
    }

    // positions (match any)
    if (positions.length) {
      const rpos = asArray(r?.position_ids).map(String);
      const hit = positions.some((p) => rpos.includes(p));
      if (!hit) return false;
    }

    // date range (compare by YYYY-MM-DD strings)
    const d = toISODateOnly(r?.start_date);
    if (startDate && d && d < startDate) return false;
    if (endDate && d && d > endDate) return false;

    // search across school/camp/city/state
    if (needle) {
      const hay = [
        r?.school_name,
        r?.camp_name,
        r?.city,
        r?.state,
        r?.sport_name,
        r?.school_division,
      ]
        .map((x) => safeLower(x))
        .join(" ");
      if (!hay.includes(needle)) return false;
    }

    return true;
  });
}

function groupByStartDate(rows) {
  const list = asArray(rows)
    .slice()
    .sort((a, b) => String(a?.start_date || "").localeCompare(String(b?.start_date || "")));

  const groups = new Map();
  for (const r of list) {
    const key = toISODateOnly(r?.start_date) || "TBD";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  return Array.from(groups.entries());
}

// ---------- page ----------
export default function Calendar() {
  const loc = useLocation();
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  // Demo override: ?mode=demo always wins for *read behavior*
  const urlMode = useMemo(() => parseQueryMode(loc?.search || ""), [loc?.search]);
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, season.mode]);

  const isPaid = effectiveMode === "paid";
  const seasonYear = season.seasonYear;

  const athleteId = normId(athleteProfile);

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    divisions: [],
    positions: [],
    state: "",
    startDate: "",
    endDate: "",
  });
  const [pendingFilters, setPendingFilters] = useState(filters);
  const [q, setQ] = useState("");

  // Load sports + positions for FilterSheet (best effort)
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
    },
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
    },
  });

  // Data: Paid uses athlete-composed summaries; Demo uses public summaries
  const paidData = useCampSummariesClient({
    athleteId: athleteId || null,
    sportId: pendingFilters.sport || null,
    limit: 1000,
    enabled: isPaid && !!athleteId,
  });

  // Public hook supports single division; we’ll do multi-division client-side
  const publicData = usePublicCampSummariesClient({
    seasonYear,
    sportId: pendingFilters.sport || null,
    state: pendingFilters.state || null,
    division: "", // client-side for multi-select
    positionIds: asArray(pendingFilters.positions).map(String),
    limit: 1000,
    enabled: !isPaid,
  });

  const rawRows = isPaid ? paidData.data : publicData.data;
  const loading = season.isLoading || (isPaid ? paidData.isLoading : publicData.isLoading);

  // Apply filters client-side consistently
  const filteredRows = useMemo(() => {
    return applyClientFilters(rawRows, pendingFilters, q);
  }, [rawRows, pendingFilters, q]);

  const grouped = useMemo(() => groupByStartDate(filteredRows), [filteredRows]);

  const openFilters = () => {
    setFilters(filters);
    setPendingFilters(filters);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setFilters(pendingFilters);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    const reset = {
      sport: "",
      divisions: [],
      positions: [],
      state: "",
      startDate: "",
      endDate: "",
    };
    setFilters(reset);
    setPendingFilters(reset);
    setFiltersOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-deep-navy">Calendar</h1>
              <Badge variant="outline" className="text-xs">
                {isPaid ? "Paid" : "Demo"} • {seasonYear}
              </Badge>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Camps grouped by start date. Use filters to narrow results.
            </p>
          </div>

          <Button variant="outline" onClick={openFilters} className="shrink-0">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Search */}
        <Card className="p-3 border-slate-200 bg-white">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search school, camp, city, state…"
            />
            {q ? (
              <Button variant="ghost" size="icon" onClick={() => setQ("")} aria-label="Clear search">
                <X className="w-4 h-4" />
              </Button>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              {loading ? "Loading…" : `${filteredRows.length} camp${filteredRows.length === 1 ? "" : "s"}`}
            </span>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              <span>Grouped view</span>
            </div>
          </div>
        </Card>

        {/* Content */}
        {loading ? (
          <Card className="p-6 border-slate-200 bg-white text-center text-slate-600">
            Loading calendar…
          </Card>
        ) : grouped.length === 0 ? (
          <Card className="p-6 border-slate-200 bg-white text-center space-y-3">
            <div className="text-deep-navy font-semibold">No camps match your filters.</div>
            <div className="text-sm text-slate-600">Try clearing filters or widening the date range.</div>
            <Button variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {grouped.map(([dateKey, items]) => (
              <div key={dateKey} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-700">
                    {dateKey === "TBD" ? "TBD" : dateKey}
                  </div>
                  <div className="text-xs text-slate-500">{items.length} camp{items.length === 1 ? "" : "s"}</div>
                </div>

                <div className="space-y-3">
                  {items.map((r) => {
                    const camp = {
                      camp_name: r?.camp_name,
                      start_date: r?.start_date,
                      end_date: r?.end_date,
                      price: r?.price,
                      city: r?.city,
                      state: r?.state,
                      link_url: r?.link_url,
                      notes: r?.notes,
                    };

                    const school = {
                      school_name: r?.school_name,
                      division: r?.school_division,
                      school_division: r?.school_division,
                    };

                    const sport = {
                      name: r?.sport_name,
                      sport_name: r?.sport_name,
                    };

                    // We keep Calendar read-only to avoid write-gate churn here.
                    // Favorites/registrations should be handled in Discover/MyCamps with write gating.
                    return (
                      <CampCard
                        key={String(r?.camp_id || `${r?.school_name}-${r?.camp_name}-${r?.start_date}`)}
                        camp={camp}
                        school={school}
                        sport={sport}
                        positions={[]}
                        isFavorite={false}
                        isRegistered={false}
                        disabledFavorite={true}
                        mode={isPaid ? "paid" : "demo"}
                        onClick={() => {
                          // Intentionally no navigation assumed here (keeps Calendar isolated).
                          // If you have CampDetail, this is where you’d navigate.
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter Sheet */}
      <FilterSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={pendingFilters}
        onFilterChange={setPendingFilters}
        sports={sportsQuery.data || []}
        positions={positionsQuery.data || []}
        onApply={applyFilters}
        onClear={clearFilters}
      />
    </div>
  );
}
