// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Filter, Loader2 } from "lucide-react";

import { createPageUrl } from "../utils";
import { base44 } from "../api/base44Client";

import BottomNav from "../components/navigation/BottomNav";
import CampCard from "../components/camps/CampCard";

// ✅ FIX: no @ alias; explicit relative path + extension
import FilterSheet from "../components/filters/FilterSheet.jsx";

import RouteGuard from "../components/auth/RouteGuard";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";

// ---------- helpers ----------
function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function sanitizeDateStr(v) {
  if (!v) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function inDateRange(start, startDate, endDate) {
  if (!start) return true;
  const d = String(start).slice(0, 10);
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

function matchesDivisions(summary, divisions) {
  const divs = asArray(divisions);
  if (!divs.length) return true;
  const d = summary?.school_division || summary?.division || null;
  return d ? divs.includes(d) : false;
}

function matchesPositions(summary, positions) {
  const want = asArray(positions).map(String).filter(Boolean);
  if (!want.length) return true;

  const have = asArray(summary?.position_ids).map(String).filter(Boolean);
  return want.some((p) => have.includes(p));
}

function matchesSport(summary, sportId) {
  if (!sportId) return true;
  return String(summary?.sport_id || "") === String(sportId);
}

function matchesState(summary, state) {
  if (!state) return true;
  return String(summary?.state || "") === String(state);
}

function groupByDay(summaries) {
  const map = new Map();
  for (const s of summaries) {
    const key = (s?.start_date ? String(s.start_date).slice(0, 10) : "TBD") || "TBD";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  const keys = Array.from(map.keys()).sort((a, b) => {
    if (a === "TBD") return 1;
    if (b === "TBD") return -1;
    return a.localeCompare(b);
  });
  return keys.map((k) => ({ day: k, items: map.get(k) || [] }));
}

export default function Calendar() {
  const nav = useNavigate();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: "",
  });

  // Reference lists for FilterSheet (best-effort)
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useMemo(() => {
    (async () => {
      try {
        const rows = await base44.entities.Sport.list();
        setSports(Array.isArray(rows) ? rows : []);
      } catch {
        setSports([]);
      }
    })();
    (async () => {
      try {
        const rows = await base44.entities.Position.list();
        setPositions(Array.isArray(rows) ? rows : []);
      } catch {
        setPositions([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDate = sanitizeDateStr(filters.startDate);
  const endDate = sanitizeDateStr(filters.endDate);

  const isPaid = season.mode === "paid";
  const athleteId = athleteProfile?.id || null;

  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || undefined,
    enabled: isPaid && !!athleteId && !identityLoading,
    limit: 1000,
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: "", // keep division client-side
    positionIds: [], // keep positions client-side
    enabled: !isPaid,
    limit: 1000,
  });

  const loading = season.loading || (isPaid ? paidQuery.isLoading : demoQuery.isLoading);
  const error = isPaid ? paidQuery.error : demoQuery.error;

  const raw = isPaid ? (paidQuery.data || []) : (demoQuery.data || []);

  const filtered = useMemo(() => {
    let arr = Array.isArray(raw) ? raw : [];

    arr = arr.filter((s) => matchesSport(s, filters.sport));
    arr = arr.filter((s) => matchesState(s, filters.state));
    arr = arr.filter((s) => matchesDivisions(s, filters.divisions));
    arr = arr.filter((s) => matchesPositions(s, filters.positions));
    arr = arr.filter((s) => inDateRange(s?.start_date, startDate, endDate));

    arr.sort((a, b) =>
      String(a?.start_date || "9999-12-31").localeCompare(String(b?.start_date || "9999-12-31"))
    );
    return arr;
  }, [raw, filters.sport, filters.state, filters.divisions, filters.positions, startDate, endDate]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <RouteGuard requireAuth={false} requirePaid={false} requireProfile={false}>
      <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
        <div className="max-w-md mx-auto p-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <div className="text-lg font-semibold text-deep-navy">Calendar</div>
                <div className="text-xs text-slate-500">
                  {season.mode === "paid" ? "Paid season workspace" : `Demo season: ${season.seasonYear}`}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium">Filters</span>
            </button>
          </div>

          {/* Body */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-700">
              <div className="font-semibold mb-1">Calendar couldn’t load</div>
              <div className="text-slate-600">
                Try refreshing. If it persists, the Base44 entity filters may be rejecting the query.
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
              <div className="text-sm text-slate-600">No camps match your filters.</div>
              <button
                type="button"
                className="mt-3 text-sm font-medium text-deep-navy underline"
                onClick={() =>
                  setFilters({
                    sport: "",
                    state: "",
                    divisions: [],
                    positions: [],
                    startDate: "",
                    endDate: "",
                  })
                }
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((group) => (
                <div key={group.day}>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    {group.day === "TBD" ? "TBD" : group.day}
                  </div>

                  <div className="space-y-3">
                    {group.items.map((s) => (
                      <CampCard
                        key={String(s.camp_id)}
                        camp={{
                          camp_name: s.camp_name,
                          start_date: s.start_date,
                          end_date: s.end_date,
                          price: s.price,
                          link_url: s.link_url,
                          notes: s.notes,
                          city: s.city,
                          state: s.state,
                        }}
                        school={{
                          school_name: s.school_name,
                          name: s.school_name,
                          division: s.school_division,
                          school_division: s.school_division,
                        }}
                        sport={{
                          sport_name: s.sport_name,
                          name: s.sport_name,
                        }}
                        positions={(s.position_ids || []).map((id) => ({
                          id,
                          position_code: (s.position_codes || [])[0] || null,
                        }))}
                        isFavorite={false}
                        isRegistered={s.intent_status === "registered"}
                        mode={season.mode}
                        disabledFavorite={season.mode !== "paid"}
                        onFavoriteToggle={() => {}}
                        onClick={() => {
                          try {
                            nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(s.camp_id))}`);
                          } catch {
                            nav(createPageUrl("Discover"));
                          }
                        }}
                      />
                    ))}
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
          filters={filters}
          onFilterChange={(next) => setFilters(next)}
          sports={sports}
          positions={positions}
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
    </RouteGuard>
  );
}
