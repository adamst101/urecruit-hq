// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Filter, Lock, ChevronRight } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function safeDateStr(d) {
  if (!d) return "";
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function cmpDate(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export default function Calendar() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  // URL demo override: ?mode=demo forces demo view even for paid users
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc.search]);

  const effectiveMode = useMemo(() => {
    if (forceDemo) return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [forceDemo, season.mode]);

  const isPaidMode = effectiveMode === "paid";

  // Calendar season year:
  // - paid => currentYear
  // - demo => demoYear
  const seasonYear = useMemo(() => {
    return isPaidMode ? season.currentYear : season.demoYear;
  }, [isPaidMode, season.currentYear, season.demoYear]);

  // ---- Filter state (shared with FilterSheet)
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });
  const [filterOpen, setFilterOpen] = useState(false);

  // ---- Load Sports + Positions for FilterSheet (best effort)
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const rows = await base44.entities.Sport.list?.();
        if (!mounted) return;
        setSports(Array.isArray(rows) ? rows : []);
      } catch {
        if (mounted) setSports([]);
      }
    })();

    (async () => {
      try {
        const rows = await base44.entities.Position.list?.();
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

  // ---- Data source
  // Paid: athlete-scoped intent overlays
  const athleteId = normId(athleteProfile) || athleteProfile?.id || null;

  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport ? String(filters.sport) : undefined,
    limit: 1000,
    enabled: isPaidMode && !!athleteId
  });

  // Demo/Public: year-scoped camp list
  const publicQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport ? String(filters.sport) : null,
    state: filters.state ? String(filters.state) : null,
    division:
      Array.isArray(filters.divisions) && filters.divisions.length === 1
        ? String(filters.divisions[0])
        : null,
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    limit: 1000,
    enabled: !isPaidMode
  });

  const rawItems = useMemo(() => {
    if (isPaidMode) return Array.isArray(paidQuery.data) ? paidQuery.data : [];
    return Array.isArray(publicQuery.data) ? publicQuery.data : [];
  }, [isPaidMode, paidQuery.data, publicQuery.data]);

  // ---- Apply remaining filters client-side for safety/consistency
  const filteredItems = useMemo(() => {
    const sport = filters.sport ? String(filters.sport) : "";
    const state = filters.state ? String(filters.state) : "";
    const divs = Array.isArray(filters.divisions) ? filters.divisions : [];
    const pos = Array.isArray(filters.positions) ? filters.positions.map(String) : [];

    const start = safeDateStr(filters.startDate);
    const end = safeDateStr(filters.endDate);

    return rawItems
      .filter((it) => {
        if (sport && String(it?.sport_id || "") !== sport) return false;
        if (state && String(it?.state || "") !== state) return false;

        if (divs.length > 0) {
          const d = String(it?.school_division || "");
          if (!divs.includes(d)) return false;
        }

        if (pos.length > 0) {
          const itemPos = Array.isArray(it?.position_ids) ? it.position_ids.map(String) : [];
          const intersects = pos.some((p) => itemPos.includes(p));
          if (!intersects) return false;
        }

        const sd = safeDateStr(it?.start_date);
        if (start && sd && sd < start) return false;
        if (end && sd && sd > end) return false;

        return true;
      })
      .sort((a, b) => cmpDate(safeDateStr(a?.start_date), safeDateStr(b?.start_date)));
  }, [rawItems, filters]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const it of filteredItems) {
      const k = safeDateStr(it?.start_date) || "TBD";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    }
    return Array.from(map.entries()).sort((a, b) => cmpDate(a[0], b[0]));
  }, [filteredItems]);

  const loading = season.isLoading || (isPaidMode ? (identityLoading || paidQuery.isLoading) : publicQuery.isLoading);

  const showProfileBlocker =
    isPaidMode && !loading && season.accountId && !athleteId;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 max-w-md mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-700" />
            <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
          </div>

          <div className="flex items-center gap-2">
            {effectiveMode === "demo" ? (
              <Badge variant="outline">Demo</Badge>
            ) : (
              <Badge className="bg-emerald-600 text-white">Paid</Badge>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterOpen(true)}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>

        <div className="mt-2 text-sm text-slate-600">
          {effectiveMode === "demo"
            ? `Showing sample season (${seasonYear}).`
            : `Showing your season (${seasonYear}) with your selections.`}
        </div>
      </div>

      {/* Paid-mode profile requirement blocker (best practice UX) */}
      {showProfileBlocker && (
        <div className="px-4 max-w-md mx-auto">
          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Lock className="w-5 h-5 text-amber-700" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-900">Finish your athlete profile</div>
                <div className="text-sm text-slate-700 mt-1">
                  Calendar overlays require an athlete profile in paid mode.
                </div>
                <Button
                  className="mt-3"
                  onClick={() => {
                    const next = encodeURIComponent(createPageUrl("Calendar"));
                    nav(createPageUrl("Profile") + `?next=${next}`);
                  }}
                >
                  Go to Profile
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Content */}
      <div className="px-4 py-4 max-w-md mx-auto space-y-3">
        {loading ? (
          <div className="text-sm text-slate-600">Loading camps…</div>
        ) : grouped.length === 0 ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-slate-700 font-medium">No camps match your filters.</div>
            <div className="text-sm text-slate-500 mt-1">
              Try clearing filters or widening date range.
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
                Clear filters
              </Button>
              <Button onClick={() => setFilterOpen(true)}>Edit filters</Button>
            </div>
          </Card>
        ) : (
          grouped.map(([day, items]) => (
            <div key={day} className="space-y-2">
              <div className="text-xs font-semibold text-slate-500">
                {day === "TBD" ? "TBD" : day}
              </div>

              {items.map((it) => {
                const school = it?.school_name || "Unknown School";
                const camp = it?.camp_name || "Camp";
                const division = it?.school_division || null;
                const sportName = it?.sport_name || null;

                const isRegistered = String(it?.intent_status || "").toLowerCase() === "registered";
                const isFavorite = String(it?.intent_status || "").toLowerCase() === "favorite";

                return (
                  <Card
                    key={String(it?.camp_id || Math.random())}
                    className="p-4 border-slate-200 bg-white cursor-pointer hover:shadow-sm transition"
                    onClick={() => {
                      // Keep this generic: route to CampDetail if you have it,
                      // otherwise route to Discover as safe fallback.
                      try {
                        nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(it?.camp_id || ""))}`);
                      } catch {
                        nav(createPageUrl("Discover"));
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {division && (
                            <Badge className="bg-slate-900 text-white text-xs">
                              {division}
                            </Badge>
                          )}
                          {sportName && (
                            <span className="text-xs text-slate-500 font-medium">
                              {sportName}
                            </span>
                          )}
                          {effectiveMode === "demo" && (
                            <Badge variant="outline" className="text-xs">
                              Demo
                            </Badge>
                          )}
                          {isRegistered && (
                            <Badge className="bg-emerald-600 text-white text-xs">
                              Registered
                            </Badge>
                          )}
                          {isFavorite && !isRegistered && (
                            <Badge className="bg-amber-500 text-white text-xs">
                              Favorite
                            </Badge>
                          )}
                        </div>

                        <div className="text-base font-semibold text-deep-navy truncate">
                          {school}
                        </div>
                        <div className="text-sm text-slate-600 truncate">{camp}</div>

                        <div className="text-xs text-slate-500 mt-1">
                          {[
                            it?.city ? String(it.city) : null,
                            it?.state ? String(it.state) : null
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                      </div>

                      <ChevronRight className="w-5 h-5 text-slate-300 mt-1" />
                    </div>
                  </Card>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Filter Sheet */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        positions={positions}
        sports={sports}
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
        }}
      />

      <BottomNav />
    </div>
  );
}
