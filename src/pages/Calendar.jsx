// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { CalendarDays, Filter as FilterIcon } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import {
  usePublicCampSummariesClient,
  publicCampYearHasData,
} from "../components/hooks/usePublicCampSummariesClient.jsx";

// ---------------- helpers ----------------
function safeStr(x) {
  if (x === undefined || x === null) return "";
  return String(x);
}

function parseISODate(s) {
  if (!s || typeof s !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function ymd(d) {
  if (!(d instanceof Date)) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function inferYearFromStartDate(s) {
  const str = safeStr(s);
  const y = Number(str.slice(0, 4));
  return Number.isFinite(y) && y >= 2000 && y <= 2100 ? y : null;
}

const FILTER_KEY = "rm_calendar_filters_v1";

function readFilters() {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function writeFilters(next) {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(next || {}));
  } catch {}
}

function defaultFilters() {
  return {
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: "",
  };
}

// ---------------- page ----------------
export default function Calendar() {
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const isDemo = season.mode !== "paid";
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // Filters (persisted)
  const [filters, setFilters] = useState(() => readFilters() || defaultFilters());
  const [filterOpen, setFilterOpen] = useState(false);

  const onFilterChange = useCallback((next) => {
    setFilters(next || {});
    writeFilters(next || {});
  }, []);

  const clearFilters = useCallback(() => {
    const next = defaultFilters();
    setFilters(next);
    writeFilters(next);
  }, []);

  // Load Sports + Positions for FilterSheet (best-effort)
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const rows = await base44.entities.Sport?.list?.();
        if (!mounted) return;
        setSports(Array.isArray(rows) ? rows : []);
      } catch {
        if (mounted) setSports([]);
      }
    })();

    (async () => {
      try {
        const rows = await base44.entities.Position?.list?.();
        if (!mounted) return;
        setPositions(Array.isArray(rows) ? rows : []);
      } catch {
        if (mounted) setPositions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ---------- Demo Year Resolver (robust) ----------
  const [resolvedYear, setResolvedYear] = useState(season.seasonYear);
  const [resolvingYear, setResolvingYear] = useState(false);
  const [yearProbeError, setYearProbeError] = useState(null);
  const [probeTick, setProbeTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function resolveDemoYear() {
      setYearProbeError(null);

      // Paid mode: always show the paid seasonYear
      if (!isDemo) {
        setResolvedYear(season.seasonYear);
        return;
      }

      const baseYear = Number(season.seasonYear);
      const currentUTC = Number(season.currentYear);

      const candidates = uniq([
        baseYear,
        currentUTC,
        currentUTC - 1,
        baseYear + 1,
        baseYear - 1,
        baseYear + 2,
        baseYear - 2,
        baseYear + 3,
        baseYear - 3,
      ]).filter((y) => Number.isFinite(Number(y)));

      setResolvingYear(true);

      // 1) Try your existing year-has-data check across multiple nearby years
      for (const y of candidates) {
        try {
          const ok = await publicCampYearHasData(y);
          if (cancelled) return;
          if (ok) {
            setResolvedYear(Number(y));
            setResolvingYear(false);
            return;
          }
        } catch (e) {
          // keep trying, but remember last error
          setYearProbeError(e ? String(e) : "year_probe_failed");
        }
      }

      // 2) If year probes all failed OR returned false, infer from the newest camp in the database
      try {
        const rows = await base44.entities.Camp.filter({}, "-start_date", 1);
        const latest = Array.isArray(rows) && rows[0] ? rows[0] : null;
        const inferred = inferYearFromStartDate(latest?.start_date);
        if (!cancelled && inferred) {
          setResolvedYear(inferred);
          setResolvingYear(false);
          return;
        }
      } catch (e) {
        if (!cancelled) setYearProbeError(e ? String(e) : "latest_camp_probe_failed");
      }

      // 3) Fallback: keep configured demo year
      if (!cancelled) {
        setResolvedYear(season.seasonYear);
        setResolvingYear(false);
      }
    }

    resolveDemoYear();

    return () => {
      cancelled = true;
    };
  }, [isDemo, season.seasonYear, season.currentYear, probeTick]);

  // Normalize filter inputs for queries
  const qSportId = useMemo(() => {
    const v = safeStr(filters?.sport).trim();
    return v ? v : null;
  }, [filters?.sport]);

  const qState = useMemo(() => {
    const v = safeStr(filters?.state).trim();
    return v ? v : null;
  }, [filters?.state]);

  const qDivisions = useMemo(() => {
    const arr = Array.isArray(filters?.divisions) ? filters.divisions : [];
    return arr.filter(Boolean);
  }, [filters?.divisions]);

  const qPositionIds = useMemo(() => {
    const arr = Array.isArray(filters?.positions) ? filters.positions : [];
    return arr.map(normId).filter(Boolean);
  }, [filters?.positions]);

  const startDate = useMemo(() => safeStr(filters?.startDate).trim(), [filters?.startDate]);
  const endDate = useMemo(() => safeStr(filters?.endDate).trim(), [filters?.endDate]);

  // ---------- Data ----------
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: qSportId || undefined,
    enabled: !!athleteId && season.mode === "paid",
  });

  const publicQuery = usePublicCampSummariesClient({
    seasonYear: resolvedYear,
    sportId: qSportId || null,
    state: qState || null,
    division: null,     // multi-select handled client-side
    positionIds: [],    // multi-select handled client-side
    enabled: true,
    limit: 2000,
  });

  const loading =
    season.isLoading ||
    resolvingYear ||
    (season.mode === "paid" ? paidQuery.isLoading : publicQuery.isLoading);

  const rawRows = useMemo(() => {
    const rows =
      season.mode === "paid"
        ? (paidQuery.data || [])
        : (publicQuery.data || []);
    return Array.isArray(rows) ? rows : [];
  }, [season.mode, paidQuery.data, publicQuery.data]);

  // ---------- Client-side filtering ----------
  const filteredRows = useMemo(() => {
    let rows = rawRows.slice();

    if (qDivisions.length) {
      rows = rows.filter((r) => qDivisions.includes(r?.school_division || r?.division || null));
    }

    if (qPositionIds.length) {
      rows = rows.filter((r) => {
        const ids = Array.isArray(r?.position_ids) ? r.position_ids.map(normId).filter(Boolean) : [];
        return qPositionIds.some((p) => ids.includes(p));
      });
    }

    if (startDate) {
      rows = rows.filter((r) => {
        const d = parseISODate(r?.start_date);
        return d ? ymd(d) >= startDate : false;
      });
    }

    if (endDate) {
      rows = rows.filter((r) => {
        const d = parseISODate(r?.start_date);
        return d ? ymd(d) <= endDate : false;
      });
    }

    return rows;
  }, [rawRows, qDivisions, qPositionIds, startDate, endDate]);

  // Group by start_date for a calendar-style list
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of filteredRows) {
      const key = safeStr(r?.start_date) || "TBD";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    const keys = Array.from(map.keys()).sort();
    return keys.map((k) => ({ date: k, items: map.get(k) || [] }));
  }, [filteredRows]);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-md mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-700" />
            <h1 className="text-xl font-semibold text-deep-navy">Calendar</h1>
            {isDemo && <Badge variant="outline">Demo</Badge>}
          </div>

          <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>
            <FilterIcon className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Subheader */}
        <div className="mt-2 text-xs text-slate-500">
          {isDemo ? (
            <span>
              Showing season <span className="font-medium">{resolvedYear}</span>
              {resolvingYear ? " (resolving…)" : ""}
            </span>
          ) : (
            <span>Showing your personalized camp calendar</span>
          )}
        </div>

        {/* Content */}
        <div className="mt-5">
          {loading ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-600">Loading camps…</div>
            </Card>
          ) : grouped.length === 0 ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-700 font-medium">
                No camps match your current filters.
              </div>
              <div className="text-sm text-slate-500 mt-1">
                Try clearing filters or switching sport/state/date range.
              </div>

              {!!yearProbeError && (
                <div className="mt-3 text-xs text-slate-400">
                  Season detection note: {safeStr(yearProbeError)}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>

                {isDemo && (
                  <Button
                    variant="outline"
                    onClick={() => setProbeTick((t) => t + 1)}
                  >
                    Re-check season
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {grouped.map((g) => (
                <div key={g.date}>
                  <div className="text-xs font-semibold text-slate-500 mb-2">
                    {g.date}
                  </div>

                  <div className="space-y-2">
                    {g.items.map((r) => (
                      <Card
                        key={safeStr(r?.camp_id || r?.id) + ":" + safeStr(r?.school_id)}
                        className="p-3 border-slate-200 bg-white"
                      >
                        <div className="text-sm font-semibold text-deep-navy">
                          {r?.school_name || "Unknown School"}
                        </div>
                        <div className="text-sm text-slate-600">
                          {r?.camp_name || "Camp"}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                          {(r?.school_division || null) && (
                            <Badge className="bg-slate-900 text-white">
                              {r.school_division}
                            </Badge>
                          )}
                          {(r?.sport_name || null) && (
                            <span className="font-medium">{r.sport_name}</span>
                          )}
                          {(r?.city || r?.state) && (
                            <span>
                              {[r?.city, r?.state].filter(Boolean).join(", ")}
                            </span>
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
      </div>

      {/* FilterSheet */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onFilterChange={onFilterChange}
        sports={sports}
        positions={positions}
        onApply={() => setFilterOpen(false)}
        onClear={() => {
          clearFilters();
          setFilterOpen(false);
        }}
      />
    </div>
  );
}
