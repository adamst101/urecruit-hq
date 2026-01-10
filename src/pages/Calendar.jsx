// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Filter } from "lucide-react";

import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function yStart(y) {
  return `${Number(y)}-01-01`;
}
function yNext(y) {
  return `${Number(y) + 1}-01-01`;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function campStartDateKey(c) {
  const d = c?.start_date || c?.startDate;
  if (!d) return "";
  return String(d).slice(0, 10); // YYYY-MM-DD
}

function inSeasonYear(startDate, seasonYear) {
  const d = String(startDate || "").slice(0, 10);
  if (!d || !seasonYear) return true;
  return d >= yStart(seasonYear) && d < yNext(seasonYear);
}

export default function Calendar() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  // URL override: ?mode=demo forces demo UI even for paid users
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

  const seasonYear = useMemo(() => {
    return isPaidMode ? season.currentYear : season.demoYear;
  }, [isPaidMode, season.currentYear, season.demoYear]);

  const athleteId = useMemo(() => {
    return normId(athleteProfile) || athleteProfile?.id || null;
  }, [athleteProfile]);

  // ----------------------------
  // Filters
  // ----------------------------
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });
  const [filterOpen, setFilterOpen] = useState(false);

  // ----------------------------
  // Data source
  // - Paid: useCampSummariesClient (includes intent + targeting)
  // - Demo: usePublicCampSummariesClient
  // ----------------------------
  const paidQuery = useCampSummariesClient({
    athleteId: athleteId || null,
    sportId: filters.sport ? String(filters.sport) : null,
    limit: 2000,
    enabled: isPaidMode && !!athleteId && !season.isLoading && !identityLoading
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport ? String(filters.sport) : null,
    state: filters.state ? String(filters.state) : null,
    division:
      asArray(filters.divisions).length === 1 ? String(asArray(filters.divisions)[0]) : null,
    positionIds: asArray(filters.positions),
    limit: 2000,
    enabled: !isPaidMode && !season.isLoading && !!seasonYear
  });

  const rawRows = useMemo(() => {
    const rows = isPaidMode ? paidQuery.data : demoQuery.data;
    return Array.isArray(rows) ? rows : [];
  }, [isPaidMode, paidQuery.data, demoQuery.data]);

  // Normalize shape so we can render one way
  const rows = useMemo(() => {
    const selectedDivs = asArray(filters.divisions);
    const selectedPos = asArray(filters.positions).map(String).filter(Boolean);
    const start = filters.startDate ? String(filters.startDate) : "";
    const end = filters.endDate ? String(filters.endDate) : "";

    const withinDateRange = (d) => {
      const dd = String(d || "").slice(0, 10);
      if (!dd) return true;
      if (start && dd < start) return false;
      if (end && dd > end) return false;
      return true;
    };

    return rawRows
      .map((r) => {
        // paid rows already have school_name/sport_name fields from useCampSummariesClient
        const campId = String(r?.camp_id || r?.id || "");
        const startDate = r?.start_date || null;

        return {
          camp_id: campId,
          camp_name: r?.camp_name || "Camp",
          start_date: startDate,
          end_date: r?.end_date || null,
          city: r?.city || null,
          state: r?.state || null,
          price: typeof r?.price === "number" ? r.price : null,

          school_name: r?.school_name || r?.school?.school_name || r?.school?.name || "Unknown School",
          school_division: r?.school_division || r?.school_division || r?.school?.division || null,

          sport_name: r?.sport_name || r?.sport?.sport_name || r?.sport?.name || null,

          // Paid-only fields (safe to be null in demo)
          intent_status: r?.intent_status || null
        };
      })
      // Season year gate (important: paid query can return multiple years)
      .filter((r) => inSeasonYear(r?.start_date, seasonYear))
      // State filter (paid side may not have been filtered server-side)
      .filter((r) => {
        if (!filters.state) return true;
        return String(r?.state || "") === String(filters.state);
      })
      // Division filter (paid side: client filter)
      .filter((r) => {
        if (selectedDivs.length === 0) return true;
        return selectedDivs.includes(String(r?.school_division || ""));
      })
      // Date range filter
      .filter((r) => withinDateRange(r?.start_date))
      // NOTE: Positions filter: paid summaries return position_codes/ids in some versions;
      // If your paid summaries include position_ids, you can add that filter here later.
      .sort((a, b) => String(b?.start_date || "").localeCompare(String(a?.start_date || "")));
  }, [rawRows, filters, seasonYear]);

  // Group by start date (simple “calendar list” view)
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const k = campStartDateKey(r) || "TBD";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    // Keep most recent dates first
    const keys = Array.from(map.keys()).sort((a, b) => String(b).localeCompare(String(a)));
    return keys.map((k) => ({ date: k, items: map.get(k) || [] }));
  }, [rows]);

  const loading =
    season.isLoading ||
    (isPaidMode ? paidQuery.isLoading || identityLoading : demoQuery.isLoading);

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

            <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>

        <div className="mt-2 text-sm text-slate-600">
          {effectiveMode === "demo"
            ? `Showing sample season (${seasonYear}).`
            : `Showing season (${seasonYear}).`}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 max-w-md mx-auto space-y-3">
        {loading ? (
          <div className="text-sm text-slate-600">Loading calendar…</div>
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
          grouped.map((g) => (
            <div key={g.date} className="space-y-2">
              <div className="text-xs font-semibold text-slate-600 tracking-wide">
                {g.date === "TBD" ? "Date TBD" : g.date}
              </div>

              {g.items.map((r) => {
                const status = String(r?.intent_status || "").toLowerCase();
                const isFav = status === "favorite";
                const isReg = status === "registered";

                return (
                  <Card
                    key={r.camp_id}
                    className="p-4 border-slate-200 bg-white cursor-pointer hover:shadow-sm transition"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      // If CampDetail exists, great; otherwise fall back to Discover
                      try {
                        nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(r.camp_id)}`);
                      } catch {
                        nav(createPageUrl("Discover"));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        try {
                          nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(r.camp_id)}`);
                        } catch {
                          nav(createPageUrl("Discover"));
                        }
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                          {effectiveMode === "demo" && (
                            <Badge variant="outline" className="text-xs">
                              Demo
                            </Badge>
                          )}
                          {isReg && (
                            <Badge className="bg-emerald-600 text-white text-xs">
                              Registered
                            </Badge>
                          )}
                          {isFav && !isReg && (
                            <Badge className="bg-amber-500 text-white text-xs">
                              Favorite
                            </Badge>
                          )}
                        </div>

                        <div className="text-base font-semibold text-deep-navy truncate">
                          {r.school_name}
                        </div>
                        <div className="text-sm text-slate-600 truncate">
                          {r.camp_name}
                        </div>

                        {(r.city || r.state) && (
                          <div className="text-xs text-slate-500 mt-1">
                            {[r.city, r.state].filter(Boolean).join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Filters */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        positions={[]}   // optional: wire Position.list later if you want
        sports={[]}      // optional: wire Sport.list later if you want
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
