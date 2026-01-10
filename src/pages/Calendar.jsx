// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, Loader2 } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx"; // ✅ FORCE .jsx
import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

function safeDateKey(d) {
  if (!d) return "TBD";
  const s = String(d);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

function prettyDate(d) {
  const key = safeDateKey(d);
  if (key === "TBD") return "TBD";
  try {
    const [y, m, day] = key.split("-").map((x) => Number(x));
    const dt = new Date(Date.UTC(y, (m || 1) - 1, day || 1));
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return key;
  }
}

function applyClientFilters(rows, filters) {
  const f = filters || {};
  const state = (f.state || "").trim();
  const divisions = Array.isArray(f.divisions) ? f.divisions : [];
  const startDate = f.startDate ? String(f.startDate) : "";
  const endDate = f.endDate ? String(f.endDate) : "";

  return (rows || []).filter((r) => {
    if (state && String(r?.state || "") !== state) return false;

    if (divisions.length) {
      const div = r?.school_division || r?.division || null;
      if (!div || !divisions.includes(String(div))) return false;
    }

    const sd = safeDateKey(r?.start_date);
    if (startDate && sd !== "TBD" && sd < startDate) return false;
    if (endDate && sd !== "TBD" && sd > endDate) return false;

    return true;
  });
}

export default function Calendar() {
  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const [filtersOpen, setFiltersOpen] = useState(false);

  const [filters, setFilters] = useState({
    sport: "",
    divisions: [],
    positions: [],
    state: "",
    startDate: "",
    endDate: "",
  });

  const sportId = filters.sport ? String(filters.sport) : null;

  const sportsQuery = useQuery({
    queryKey: ["sports_list"],
    retry: false,
    queryFn: async () => {
      try {
        const rows = await (base44.entities.Sport.list
          ? base44.entities.Sport.list()
          : base44.entities.Sport.filter({}));
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    },
  });

  const positionsQuery = useQuery({
    queryKey: ["positions_list"],
    retry: false,
    queryFn: async () => {
      try {
        const rows = await (base44.entities.Position.list
          ? base44.entities.Position.list()
          : base44.entities.Position.filter({}));
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    },
  });

  const isPaid = season.mode === "paid";
  const paidReady = isPaid && !!athleteProfile?.id;

  const paidSummaries = useCampSummariesClient({
    athleteId: athleteProfile?.id || null,
    sportId: sportId || null,
    enabled: paidReady,
    limit: 2000,
  });

  const publicSummaries = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: sportId || null,
    state: "",
    division: "",
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    enabled: !paidReady,
    limit: 2000,
  });

  const loading =
    season.isLoading ||
    (isPaid && identityLoading) ||
    (paidReady ? paidSummaries.isLoading : publicSummaries.isLoading);

  const rawRows = paidReady ? paidSummaries.data || [] : publicSummaries.data || [];

  const rows = useMemo(() => {
    const normalized = (rawRows || []).map((r) => ({
      camp_id: r?.camp_id || r?.id || null,
      camp_name: r?.camp_name || "Camp",
      start_date: r?.start_date || null,
      end_date: r?.end_date || null,
      city: r?.city || null,
      state: r?.state || null,
      price: typeof r?.price === "number" ? r.price : null,

      school_name: r?.school_name || r?.school || r?.name || "Unknown School",
      school_division: r?.school_division || r?.division || null,
      sport_name: r?.sport_name || null,

      is_target_school: !!r?.is_target_school,
      intent_status: r?.intent_status || null,
    }));

    const filtered = applyClientFilters(normalized, filters);

    filtered.sort((a, b) => {
      const ad = safeDateKey(a.start_date);
      const bd = safeDateKey(b.start_date);
      if (ad === "TBD" && bd === "TBD") return 0;
      if (ad === "TBD") return 1;
      if (bd === "TBD") return -1;
      return ad.localeCompare(bd);
    });

    return filtered;
  }, [rawRows, filters]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const k = safeDateKey(r.start_date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-deep-navy">Calendar</h1>
            <div className="text-sm text-slate-600">
              {paidReady ? (
                <span>
                  <Badge className="bg-emerald-600 text-white">Paid</Badge>{" "}
                  <span className="ml-1">Your season workspace</span>
                </span>
              ) : (
                <span>
                  <Badge variant="outline">Demo</Badge>{" "}
                  <span className="ml-1">Preview season {season.seasonYear}</span>
                </span>
              )}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : grouped.length === 0 ? (
          <Card className="p-6 border-slate-200">
            <div className="text-center space-y-2">
              <div className="text-base font-semibold text-deep-navy">No camps found</div>
              <div className="text-sm text-slate-600">
                Try adjusting filters or changing the sport.
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {grouped.map(([dateKey, items]) => (
              <div key={dateKey} className="space-y-2">
                <div className="text-sm font-semibold text-slate-700">
                  {dateKey === "TBD" ? "Date TBD" : prettyDate(dateKey)}
                  <span className="ml-2 text-xs text-slate-500">({items.length})</span>
                </div>

                <div className="space-y-2">
                  {items.map((c) => (
                    <Card
                      key={String(c.camp_id || Math.random())}
                      className="p-4 border-slate-200"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {c.school_division && (
                              <Badge className="bg-slate-900 text-white text-xs">
                                {c.school_division}
                              </Badge>
                            )}
                            {c.sport_name && (
                              <span className="text-xs text-slate-500 font-medium">
                                {c.sport_name}
                              </span>
                            )}
                            {c.intent_status && (
                              <Badge variant="secondary" className="text-xs">
                                {String(c.intent_status)}
                              </Badge>
                            )}
                            {c.is_target_school && (
                              <Badge variant="outline" className="text-xs">
                                Target
                              </Badge>
                            )}
                          </div>

                          <div className="text-base font-semibold text-deep-navy truncate">
                            {c.school_name}
                          </div>
                          <div className="text-sm text-slate-600 truncate">{c.camp_name}</div>

                          {(c.city || c.state) && (
                            <div className="text-xs text-slate-500 mt-1">
                              {[c.city, c.state].filter(Boolean).join(", ")}
                            </div>
                          )}
                        </div>

                        {typeof c.price === "number" && (
                          <div className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                            {c.price > 0 ? `$${c.price}` : "Free"}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

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
              divisions: [],
              positions: [],
              state: "",
              startDate: "",
              endDate: "",
            });
            setFiltersOpen(false);
          }}
          onApply={() => setFiltersOpen(false)}
        />
      </div>
    </div>
  );
}
