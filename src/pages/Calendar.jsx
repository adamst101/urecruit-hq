// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Filter, Loader2 } from "lucide-react";

import { base44 } from "../api/base44Client";
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

function safeStr(x) {
  if (x === null || x === undefined) return "";
  return String(x);
}

function inDateRange(dateStr, startDate, endDate) {
  // dateStr expected YYYY-MM-DD (Base44 date)
  if (!dateStr) return true;
  const d = safeStr(dateStr);
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

export default function Calendar() {
  const loc = useLocation();

  // URL force demo: ?mode=demo (must override paid/profile gating behavior)
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc.search]);

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const effectiveMode = forceDemo ? "demo" : season.mode; // "demo" | "paid"
  const seasonYear = forceDemo ? season.demoYear : season.seasonYear;

  // Filters (FilterSheet contract)
  const [filters, setFilters] = useState({
    sport: "",
    divisions: [],
    positions: [],
    state: "",
    startDate: "",
    endDate: "",
  });

  const [sheetOpen, setSheetOpen] = useState(false);

  // Lookup lists for FilterSheet
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const s = await base44.entities.Sport.list?.();
        if (mounted) setSports(Array.isArray(s) ? s : []);
      } catch {
        if (mounted) setSports([]);
      }

      try {
        const p = await base44.entities.Position.list?.();
        if (mounted) setPositions(Array.isArray(p) ? p : []);
      } catch {
        if (mounted) setPositions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // Paid: athlete-scoped read model
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || null,
    enabled: effectiveMode === "paid" && !!athleteId,
    limit: 500,
  });

  // Demo/public: season-scoped read model
  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: Array.isArray(filters.divisions) && filters.divisions.length ? filters.divisions[0] : null,
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    enabled: effectiveMode !== "paid" && !!seasonYear,
    limit: 500,
  });

  const loading =
    season.isLoading ||
    (effectiveMode === "paid" ? paidQuery.isLoading : demoQuery.isLoading);

  const rawRows = effectiveMode === "paid" ? (paidQuery.data || []) : (demoQuery.data || []);

  // Normalize row shape for Calendar rendering
  const rows = useMemo(() => {
    const startDate = safeStr(filters.startDate).trim();
    const endDate = safeStr(filters.endDate).trim();

    return (rawRows || [])
      .map((r) => ({
        camp_id: safeStr(r?.camp_id || r?.id),
        camp_name: r?.camp_name || "Camp",
        start_date: r?.start_date || null,
        end_date: r?.end_date || null,
        city: r?.city || null,
        state: r?.state || null,
        price: typeof r?.price === "number" ? r.price : null,
        link_url: r?.link_url || null,

        school_name: r?.school_name || r?.school || "Unknown School",
        school_division: r?.school_division || null,
        sport_name: r?.sport_name || null,

        intent_status: r?.intent_status || null,
        is_target_school: !!r?.is_target_school,
      }))
      .filter((r) => !!r.camp_id)
      .filter((r) => {
        // Date range filter (client-side; reliable regardless of backend operator quirks)
        return inDateRange(r.start_date, startDate, endDate);
      });
  }, [rawRows, filters.startDate, filters.endDate]);

  // Group by start date for a simple calendar-like agenda view
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = r.start_date || "TBD";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }

    const keys = Array.from(map.keys()).sort((a, b) => safeStr(a).localeCompare(safeStr(b)));
    return keys.map((k) => ({
      date: k,
      items: (map.get(k) || []).sort((a, b) => safeStr(a.school_name).localeCompare(safeStr(b.school_name))),
    }));
  }, [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-20">
      <div className="max-w-md mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Calendar</div>
            <div className="text-sm text-slate-600">
              {effectiveMode === "paid" ? "Paid season workspace" : "Demo calendar"} • {seasonYear}
            </div>
          </div>

          <Button variant="outline" onClick={() => setSheetOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Content */}
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : grouped.length === 0 ? (
            <Card className="p-6 border-slate-200">
              <div className="text-deep-navy font-semibold">No camps found</div>
              <div className="text-sm text-slate-600 mt-1">
                Try clearing filters or adjusting date range.
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    setFilters({
                      sport: "",
                      divisions: [],
                      positions: [],
                      state: "",
                      startDate: "",
                      endDate: "",
                    })
                  }
                >
                  Clear Filters
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {grouped.map((g) => (
                <div key={g.date}>
                  <div className="text-sm font-semibold text-slate-700 mb-2">
                    {g.date === "TBD" ? "Date TBD" : g.date}
                  </div>

                  <div className="space-y-3">
                    {g.items.map((c) => (
                      <Card key={c.camp_id} className="p-4 border-slate-200 bg-white">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
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
                              {effectiveMode !== "paid" && (
                                <Badge variant="outline" className="text-xs">
                                  Demo
                                </Badge>
                              )}
                              {c.is_target_school && (
                                <Badge className="bg-emerald-600 text-white text-xs">
                                  Target
                                </Badge>
                              )}
                              {c.intent_status && (
                                <Badge variant="secondary" className="text-xs">
                                  {c.intent_status}
                                </Badge>
                              )}
                            </div>

                            <div className="text-lg font-semibold text-deep-navy truncate mt-1">
                              {c.school_name}
                            </div>
                            <div className="text-sm text-slate-600 truncate">
                              {c.camp_name}
                            </div>

                            {(c.city || c.state) && (
                              <div className="text-xs text-slate-500 mt-1">
                                {[c.city, c.state].filter(Boolean).join(", ")}
                              </div>
                            )}
                          </div>

                          {typeof c.price === "number" && (
                            <div className="text-right">
                              <div className="text-xs text-slate-500">Price</div>
                              <div className="font-semibold text-deep-navy">
                                {c.price > 0 ? `$${c.price}` : "Free"}
                              </div>
                            </div>
                          )}
                        </div>

                        {c.link_url && (
                          <div className="mt-3">
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() => {
                                try {
                                  window.open(c.link_url, "_blank", "noopener,noreferrer");
                                } catch {}
                              }}
                            >
                              Open Camp Link
                            </Button>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filter Sheet */}
      <FilterSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        onFilterChange={(next) => setFilters(next)}
        positions={positions}
        sports={sports}
        onApply={() => setSheetOpen(false)}
        onClear={() => {
          setFilters({
            sport: "",
            divisions: [],
            positions: [],
            state: "",
            startDate: "",
            endDate: "",
          });
          setSheetOpen(false);
        }}
      />

      <BottomNav />
    </div>
  );
}
