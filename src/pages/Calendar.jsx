// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Filter } from "lucide-react";
import { format } from "date-fns";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav";
import FilterSheet from "../components/filters/FilterSheet";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

// ---------- helpers ----------
function safeDate(d) {
  try {
    return d ? new Date(d) : null;
  } catch {
    return null;
  }
}

function inRange(d, start, end) {
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

export default function Calendar() {
  const nav = useNavigate();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const isPaid = season.mode === "paid";
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  const effectiveSportId = filters.sport ? String(filters.sport) : null;
  const effectiveState = filters.state ? String(filters.state) : null;

  // Data: paid uses athlete-composed summaries; demo uses public summaries by seasonYear
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: effectiveSportId || null,
    enabled: isPaid && !!athleteId
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: effectiveSportId || null,
    state: effectiveState || null,
    division: null, // division filtering applied client-side below (because divisions is multi-select)
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    enabled: !isPaid
  });

  const rows = useMemo(() => {
    const src = isPaid ? (paidQuery.data || []) : (demoQuery.data || []);
    return Array.isArray(src) ? src : [];
  }, [isPaid, paidQuery.data, demoQuery.data]);

  // Pull sports / positions for the filter UI
  const [sports, positions] = useMemo(() => {
    // We want stable, best-effort lists.
    // - Sports: from Sport entity if available; fallback to those present in rows.
    // - Positions: from Position entity if available; fallback to none.
    return [null, null];
  }, []);

  const [sportsState, setSportsState] = useState([]);
  const [positionsState, setPositionsState] = useState([]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      // Sports
      try {
        const s = await base44.entities.Sport.list?.();
        if (mounted) setSportsState(Array.isArray(s) ? s : []);
      } catch {
        if (mounted) {
          // fallback from rows
          const fromRows = uniq(
            rows.map((r) => (r?.sport_id ? String(r.sport_id) : null)).filter(Boolean)
          ).map((id) => ({ id, name: rows.find((r) => String(r?.sport_id) === id)?.sport_name || "Sport" }));
          setSportsState(fromRows);
        }
      }

      // Positions
      try {
        const p = await base44.entities.Position.list?.();
        if (mounted) setPositionsState(Array.isArray(p) ? p : []);
      } catch {
        if (mounted) setPositionsState([]);
      }
    })();
    return () => {
      mounted = false;
    };
    // rows is used only for fallback naming; ok to include so it updates if rows change
  }, [rows]);

  const filtered = useMemo(() => {
    const divisions = Array.isArray(filters.divisions) ? filters.divisions : [];
    const posIds = Array.isArray(filters.positions) ? filters.positions.map(String) : [];
    const start = filters.startDate ? safeDate(filters.startDate) : null;
    const end = filters.endDate ? safeDate(filters.endDate) : null;

    return rows.filter((r) => {
      // State (paid summaries may not have state; if missing, don't exclude)
      if (effectiveState && r?.state && String(r.state) !== effectiveState) return false;

      // Division multi-select (paid summaries use school_division)
      if (divisions.length) {
        const div = r?.school_division || null;
        if (!divisions.includes(div)) return false;
      }

      // Positions filter (any match)
      if (posIds.length) {
        const rp = Array.isArray(r?.position_ids)
          ? r.position_ids.map((x) => String(normId(x) || x)).filter(Boolean)
          : [];
        const hasAny = posIds.some((p) => rp.includes(p));
        if (!hasAny) return false;
      }

      // Date range (uses start_date)
      const d = safeDate(r?.start_date);
      if (!inRange(d, start, end)) return false;

      return true;
    });
  }, [rows, filters, effectiveState]);

  // Group by day (start_date)
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const d = safeDate(r?.start_date);
      const key = d ? format(d, "yyyy-MM-dd") : "TBD";
      const arr = map.get(key) || [];
      arr.push(r);
      map.set(key, arr);
    }
    // sort keys
    const keys = Array.from(map.keys()).sort((a, b) => String(a).localeCompare(String(b)));
    return keys.map((k) => ({ day: k, items: map.get(k) || [] }));
  }, [filtered]);

  const title = isPaid ? "Calendar" : "Calendar (Demo)";

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-20">
      <div className="max-w-md mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-600" />
            <h1 className="text-xl font-bold text-deep-navy">{title}</h1>
          </div>

          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Mode badge */}
        <div className="mb-4">
          {isPaid ? (
            <Badge className="bg-emerald-600 text-white">Paid Season</Badge>
          ) : (
            <Badge variant="outline">Demo Season {season.seasonYear}</Badge>
          )}
        </div>

        {/* Loading / Empty */}
        {(isPaid ? paidQuery.isLoading : demoQuery.isLoading) ? (
          <Card className="p-6 border-slate-200">
            <div className="text-sm text-slate-600">Loading camps…</div>
          </Card>
        ) : grouped.length === 0 ? (
          <Card className="p-6 border-slate-200">
            <div className="text-sm text-slate-600">
              No camps match your filters.
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
                Clear Filters
              </Button>
              <Button onClick={() => nav(createPageUrl("Discover"))}>
                Go to Discover
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {grouped.map(({ day, items }) => (
              <Card key={day} className="p-4 border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-slate-800">
                    {day === "TBD" ? "Date TBD" : format(new Date(day), "EEE, MMM d")}
                  </div>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    {items.length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {items.map((r) => {
                    const campId = r?.camp_id ? String(r.camp_id) : null;
                    const schoolName = r?.school_name || "Unknown School";
                    const campName = r?.camp_name || "Camp";
                    const loc = [r?.city, r?.state].filter(Boolean).join(", ");

                    return (
                      <button
                        key={campId || `${schoolName}-${campName}-${Math.random()}`}
                        type="button"
                        className="w-full text-left rounded-lg border border-slate-200 bg-white p-3 hover:shadow-sm transition"
                        onClick={() => {
                          // If you have CampDetail, route there; else go Discover.
                          try {
                            nav(createPageUrl("CampDetail") + (campId ? `?id=${encodeURIComponent(campId)}` : ""));
                          } catch {
                            nav(createPageUrl("Discover"));
                          }
                        }}
                      >
                        <div className="text-sm font-semibold text-deep-navy truncate">
                          {schoolName}
                        </div>
                        <div className="text-sm text-slate-600 truncate">{campName}</div>
                        {loc ? <div className="text-xs text-slate-500 mt-1">{loc}</div> : null}
                      </button>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <FilterSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        sports={sportsState}
        positions={positionsState}
        onApply={() => setFiltersOpen(false)}
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
      />

      <BottomNav />
    </div>
  );
}
