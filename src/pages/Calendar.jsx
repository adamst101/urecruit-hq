// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Filter, ArrowRight } from "lucide-react";

import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet";
import CampCard from "../components/camps/CampCard";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function parseUrlMode(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const m = sp.get("mode");
    return m ? String(m).toLowerCase() : null;
  } catch {
    return null;
  }
}

function inDateRange(dateStr, start, end) {
  if (!dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

export default function Calendar() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const urlMode = useMemo(() => parseUrlMode(loc?.search), [loc?.search]);
  const effectiveMode = urlMode === "demo" ? "demo" : season.mode;

  const isPaid = effectiveMode === "paid";
  const seasonYear = season.seasonYear;

  // Filters (same structure as FilterSheet expects)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // Convert multi-select divisions to a single division for the public hook (only if exactly 1)
  const publicDivision = useMemo(() => {
    const divs = asArray(filters.divisions).filter(Boolean);
    return divs.length === 1 ? divs[0] : "";
  }, [filters.divisions]);

  // ---------- data sources ----------
  const paidQuery = useCampSummariesClient({
    athleteId: isPaid ? normId(athleteProfile) : null,
    sportId: filters.sport || null,
    enabled: isPaid && !!normId(athleteProfile)
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear: seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: publicDivision || null,
    positionIds: asArray(filters.positions),
    enabled: !isPaid
  });

  const loading = season.isLoading || (isPaid ? paidQuery.isLoading : demoQuery.isLoading);
  const rowsRaw = isPaid ? paidQuery.data : demoQuery.data;

  // Client-side filtering (works for both sources; keeps behavior consistent)
  const rows = useMemo(() => {
    const list = asArray(rowsRaw);

    const selectedDivs = asArray(filters.divisions).filter(Boolean);
    const selectedPos = asArray(filters.positions).map(String).filter(Boolean);

    return list.filter((r) => {
      // state (paid summaries may have state)
      if (filters.state && String(r?.state || "") !== String(filters.state)) return false;

      // divisions (paid summaries have school_division)
      if (selectedDivs.length > 0) {
        const div = r?.school_division || r?.division || null;
        if (!div || !selectedDivs.includes(div)) return false;
      }

      // positions
      if (selectedPos.length > 0) {
        const rPos = asArray(r?.position_ids).map(String).filter(Boolean);
        if (!selectedPos.some((p) => rPos.includes(p))) return false;
      }

      // date range (use start_date)
      if (filters.startDate || filters.endDate) {
        if (!inDateRange(r?.start_date, filters.startDate || "", filters.endDate || "")) return false;
      }

      return true;
    });
  }, [rowsRaw, filters]);

  // Group by start_date (YYYY-MM-DD)
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = (r?.start_date ? String(r.start_date).slice(0, 10) : "TBD") || "TBD";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }

    // sort keys (TBD last)
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "TBD") return 1;
      if (b === "TBD") return -1;
      return a.localeCompare(b);
    });

    return keys.map((k) => ({ date: k, items: map.get(k) || [] }));
  }, [rows]);

  // Sports / positions lists for FilterSheet (optional). Keep empty unless you already have them wired.
  const sports = []; // If you already load sports elsewhere, pass them here.
  const positions = []; // If you already load positions elsewhere, pass them here.

  if (loading) return null;

  // Paid mode but missing profile: guide user (no loops)
  if (isPaid && !normId(athleteProfile)) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-md mx-auto space-y-4">
          <Card className="p-5 border-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-deep-navy">Calendar</div>
                <div className="text-sm text-slate-600 mt-1">
                  Complete your athlete profile to unlock your season workspace.
                </div>
              </div>
              <Badge className="bg-deep-navy text-white">Paid</Badge>
            </div>

            <Button
              className="w-full mt-4"
              onClick={() => nav(createPageUrl("Profile") + `?next=${encodeURIComponent(createPageUrl("Calendar"))}`)}
            >
              Go to Profile
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-bold text-deep-navy">Calendar</div>
            <div className="text-sm text-slate-600">
              {seasonYear ? `Season ${seasonYear}` : "Season"}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline">{isPaid ? "Paid" : "Demo"}</Badge>
            <Button variant="outline" onClick={() => setFiltersOpen(true)}>
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>

        {/* Empty state */}
        {rows.length === 0 ? (
          <Card className="p-6 border-slate-200">
            <div className="text-sm text-slate-600">
              No camps match your filters.
            </div>
            <Button
              variant="outline"
              className="mt-3"
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
          </Card>
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={g.date} className="space-y-3">
                <div className="text-xs font-semibold text-slate-500">
                  {g.date === "TBD" ? "TBD" : g.date}
                </div>

                <div className="space-y-3">
                  {g.items.map((r) => {
                    const camp = {
                      camp_name: r?.camp_name,
                      start_date: r?.start_date,
                      end_date: r?.end_date,
                      price: r?.price,
                      city: r?.city,
                      state: r?.state
                    };

                    const school = {
                      school_name: r?.school_name,
                      division: r?.school_division
                    };

                    const sport = {
                      name: r?.sport_name
                    };

                    const posCodes = asArray(r?.position_codes);
                    const posObjs = posCodes.map((c, i) => ({
                      id: `${i}`,
                      position_code: c
                    }));

                    return (
                      <CampCard
                        key={String(r?.camp_id || `${g.date}-${r?.camp_name}`)}
                        camp={camp}
                        school={school}
                        sport={sport}
                        positions={posObjs}
                        isFavorite={false}
                        isRegistered={String(r?.intent_status || "").toLowerCase() === "registered"}
                        disabledFavorite={true}
                        mode={isPaid ? "paid" : "demo"}
                        onFavoriteToggle={() => {}}
                        onClick={() => {
                          // If you have CampDetail page wired, route there; otherwise noop
                          // nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(r?.camp_id))}`);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filter Sheet */}
        <FilterSheet
          isOpen={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          filters={filters}
          onFilterChange={setFilters}
          positions={positions}
          sports={sports}
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
          onApply={() => setFiltersOpen(false)}
        />
      </div>
    </div>
  );
}
