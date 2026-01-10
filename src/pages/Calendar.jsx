// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";

import BottomNav from "../components/navigation/BottomNav.jsx";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites, toggleDemoFavorite } from "../components/hooks/demoFavorites.jsx";
import { isDemoRegistered, toggleDemoRegistered } from "../components/hooks/demoRegistered.jsx";

// ---------------- helpers ----------------
function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function safeDateStr(d) {
  if (!d) return "";
  const s = String(d);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}

function withinRange(d, start, end) {
  const ds = safeDateStr(d);
  if (!ds) return false;
  if (start && ds < start) return false;
  if (end && ds > end) return false;
  return true;
}

function divisionMatch(schoolDivision, selectedDivisions) {
  const divs = asArray(selectedDivisions).filter(Boolean);
  if (!divs.length) return true;
  return divs.includes(String(schoolDivision || ""));
}

function positionMatch(campPositionIds, selectedPositionIds) {
  const sel = asArray(selectedPositionIds).map(String).filter(Boolean);
  if (!sel.length) return true;
  const camp = asArray(campPositionIds).map(String).filter(Boolean);
  return sel.some((p) => camp.includes(p));
}

function stateMatch(state, selectedState) {
  if (!selectedState) return true;
  return String(state || "") === String(selectedState);
}

function sportMatch(sportId, selectedSport) {
  if (!selectedSport) return true;
  return String(sportId || "") === String(selectedSport);
}

function groupByStartDate(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = safeDateStr(r?.start_date) || "TBD";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }

  // sort days ascending, keep TBD last
  const keys = Array.from(map.keys()).sort((a, b) => {
    if (a === "TBD") return 1;
    if (b === "TBD") return -1;
    return a.localeCompare(b);
  });

  return keys.map((k) => ({
    date: k,
    rows: map.get(k) || []
  }));
}

// ---------------- page ----------------
export default function Calendar() {
  const { mode, seasonYear } = useSeasonAccess();
  const isDemo = mode !== "paid";

  const { athleteProfile } = useAthleteIdentity(); // only meaningful in paid
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // Demo profile id (used for demo-local favorites/registered)
  const { demoProfileId, loaded: demoLoaded } = useDemoProfile();

  const [filterOpen, setFilterOpen] = useState(false);

  // FilterSheet contract (use these exact keys)
  const [filters, setFilters] = useState({
    sport: "", // sport id string
    state: "", // state code
    divisions: [], // array of division strings
    positions: [], // array of position ids (strings)
    startDate: "",
    endDate: ""
  });

  // Reference data for filter UI
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  // Load sports/positions once (simple + Base44-safe)
  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const s = await base44.entities.Sport.list();
        if (mounted) setSports(Array.isArray(s) ? s : []);
      } catch {
        if (mounted) setSports([]);
      }

      try {
        const p = await base44.entities.Position.list();
        if (mounted) setPositions(Array.isArray(p) ? p : []);
      } catch {
        if (mounted) setPositions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // --- Data sources ---
  // Demo/public summaries (already joined to school/sport names)
  const publicQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: null, // we apply multi-division client-side
    positionIds: asArray(filters.positions),
    limit: 500,
    enabled: isDemo && !!seasonYear
  });

  // Paid summaries (athlete-scoped, joined + intent_status)
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || null,
    limit: 500,
    enabled: !isDemo && !!athleteId
  });

  const loading =
    (isDemo ? publicQuery.isLoading : paidQuery.isLoading) ||
    (isDemo ? !demoLoaded : false);

  const rawRows = useMemo(() => {
    const rows = isDemo ? publicQuery.data : paidQuery.data;
    return Array.isArray(rows) ? rows : [];
  }, [isDemo, publicQuery.data, paidQuery.data]);

  // Normalize rows to one common shape for rendering + filtering
  const rows = useMemo(() => {
    return rawRows.map((r) => ({
      camp_id: String(r?.camp_id || normId(r) || ""),
      camp_name: r?.camp_name || "Camp",
      start_date: r?.start_date || null,
      end_date: r?.end_date || null,
      city: r?.city || null,
      state: r?.state || null,
      price: typeof r?.price === "number" ? r.price : null,

      sport_id: r?.sport_id ? String(r.sport_id) : null,
      sport_name: r?.sport_name || null,

      school_id: r?.school_id ? String(r.school_id) : null,
      school_name: r?.school_name || null,
      school_division: r?.school_division || null,

      position_ids: asArray(r?.position_ids),

      // Paid-only
      intent_status: r?.intent_status || null
    }));
  }, [rawRows]);

  // Apply filters client-side (consistent for demo + paid)
  const filteredRows = useMemo(() => {
    const start = filters.startDate ? safeDateStr(filters.startDate) : "";
    const end = filters.endDate ? safeDateStr(filters.endDate) : "";

    return rows
      .filter((r) => r.camp_id)
      .filter((r) => sportMatch(r.sport_id, filters.sport))
      .filter((r) => stateMatch(r.state, filters.state))
      .filter((r) => divisionMatch(r.school_division, filters.divisions))
      .filter((r) => positionMatch(r.position_ids, filters.positions))
      .filter((r) => {
        if (!start && !end) return true;
        return withinRange(r.start_date, start, end);
      });
  }, [rows, filters]);

  const grouped = useMemo(() => groupByStartDate(filteredRows), [filteredRows]);

  // Demo-local favorites + registered
  const demoFavs = useMemo(() => {
    if (!isDemo) return [];
    return getDemoFavorites(demoProfileId, seasonYear);
  }, [isDemo, demoProfileId, seasonYear]);

  const toggleFavorite = (campId) => {
    if (!isDemo) return; // paid favorites handled elsewhere (not in this file)
    toggleDemoFavorite(demoProfileId, campId, seasonYear);
    // force rerender by touching state
    setFilters((f) => ({ ...f }));
  };

  const toggleRegistered = (campId) => {
    if (!isDemo) return;
    toggleDemoRegistered(demoProfileId, campId);
    setFilters((f) => ({ ...f }));
  };

  const clearFilters = () => {
    setFilters({
      sport: "",
      state: "",
      divisions: [],
      positions: [],
      startDate: "",
      endDate: ""
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-md mx-auto px-4 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold text-deep-navy">Calendar</div>
            <div className="text-xs text-slate-500 mt-1">
              {isDemo ? (
                <>
                  Demo season <Badge variant="outline">{seasonYear}</Badge>
                </>
              ) : (
                <>
                  Your season <Badge variant="outline">{seasonYear}</Badge>
                </>
              )}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Errors */}
        {(isDemo ? publicQuery.isError : paidQuery.isError) && (
          <Card className="mt-4 p-4 border-rose-200 bg-rose-50">
            <div className="text-sm text-rose-700 font-medium">Couldn’t load camps.</div>
            <div className="text-xs text-rose-600 mt-1">
              Try refreshing. If it persists, your Base44 entities/filters may be rejecting a query shape.
            </div>
          </Card>
        )}

        {/* Empty */}
        {!loading && grouped.length === 0 && (
          <Card className="mt-4 p-5 border-slate-200">
            <div className="text-sm font-medium text-slate-900">No camps match your filters.</div>
            <div className="text-xs text-slate-500 mt-1">Try clearing filters.</div>
            <div className="mt-3">
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </Card>
        )}

        {/* List */}
        {loading ? (
          <div className="mt-6 text-sm text-slate-500">Loading…</div>
        ) : (
          <div className="mt-5 space-y-6">
            {grouped.map((g) => (
              <div key={g.date}>
                <div className="text-xs font-semibold text-slate-600 mb-2">
                  {g.date === "TBD" ? "TBD" : g.date}
                </div>

                <div className="space-y-3">
                  {g.rows.map((r) => {
                    const isFav = isDemo
                      ? demoFavs.includes(String(r.camp_id))
                      : r.intent_status === "favorite";

                    const isReg = isDemo
                      ? isDemoRegistered(demoProfileId, r.camp_id)
                      : r.intent_status === "registered";

                    return (
                      <Card key={r.camp_id} className="p-4 border-slate-200 bg-white">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {r.school_division && (
                                <Badge className="bg-slate-900 text-white text-xs">
                                  {r.school_division}
                                </Badge>
                              )}
                              {r.sport_name && (
                                <span className="text-xs text-slate-500 font-medium">
                                  {r.sport_name}
                                </span>
                              )}
                              {isDemo && (
                                <Badge variant="outline" className="text-xs">
                                  Demo
                                </Badge>
                              )}
                              {isReg && (
                                <Badge className="bg-emerald-600 text-white text-xs">
                                  Registered
                                </Badge>
                              )}
                            </div>

                            <div className="text-base font-semibold text-deep-navy mt-1 truncate">
                              {r.school_name || "Unknown School"}
                            </div>
                            <div className="text-sm text-slate-600 truncate">
                              {r.camp_name || "Camp"}
                            </div>

                            {(r.city || r.state) && (
                              <div className="text-xs text-slate-500 mt-1 truncate">
                                {[r.city, r.state].filter(Boolean).join(", ")}
                              </div>
                            )}
                          </div>

                          {/* Demo-only actions (keeps paid behavior untouched) */}
                          {isDemo && (
                            <div className="flex flex-col gap-2">
                              <Button
                                variant={isFav ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleFavorite(r.camp_id)}
                              >
                                {isFav ? "Favorited" : "Favorite"}
                              </Button>

                              <Button
                                variant={isReg ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleRegistered(r.camp_id)}
                              >
                                {isReg ? "Registered" : "Register"}
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        positions={positions}
        sports={sports}
        onApply={() => setFilterOpen(false)}
        onClear={clearFilters}
      />

      <BottomNav />
    </div>
  );
}
