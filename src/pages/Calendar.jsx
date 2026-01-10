// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Filter, Loader2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import BottomNav from "../components/navigation/BottomNav.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

import FilterSheet from "../components/filters/FilterSheet.jsx";

function safeDateStr(d) {
  if (!d) return null;
  const s = String(d);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

function inDateRange(dateStr, startDate, endDate) {
  if (!dateStr) return true;
  const d = safeDateStr(dateStr);
  if (!d) return true;

  const s = startDate ? safeDateStr(startDate) : null;
  const e = endDate ? safeDateStr(endDate) : null;

  if (s && d < s) return false;
  if (e && d > e) return false;
  return true;
}

function hasAnyPosition(summary, selectedPositionIds) {
  const selected = Array.isArray(selectedPositionIds) ? selectedPositionIds.filter(Boolean) : [];
  if (selected.length === 0) return true;

  const posIds = Array.isArray(summary?.position_ids) ? summary.position_ids.map(String) : [];
  return selected.some((id) => posIds.includes(String(id)));
}

export default function Calendar() {
  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const mode = season?.mode || "demo";
  const seasonYear = season?.seasonYear || new Date().getUTCFullYear() - 1;

  // ---------- filter state ----------
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  const [filterOpen, setFilterOpen] = useState(false);

  // ---------- reference lists for FilterSheet ----------
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);
  const [refLoading, setRefLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setRefLoading(true);
      try {
        const [sportsRows, posRows] = await Promise.all([
          base44.entities.Sport?.list?.().catch(() => []),
          base44.entities.Position?.list?.().catch(() => [])
        ]);

        if (!mounted) return;

        setSports(Array.isArray(sportsRows) ? sportsRows : []);
        setPositions(Array.isArray(posRows) ? posRows : []);
      } catch {
        if (mounted) {
          setSports([]);
          setPositions([]);
        }
      } finally {
        if (mounted) setRefLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ---------- data (paid vs demo) ----------
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || null,
    limit: 1500,
    enabled: mode === "paid" && !!athleteId
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: (filters.divisions && filters.divisions[0]) || null, // public hook supports single division
    positionIds: filters.positions || [],
    limit: 1500,
    enabled: mode !== "paid"
  });

  const loading =
    season.isLoading ||
    (mode === "paid" && identityLoading) ||
    (mode === "paid" ? paidQuery.isLoading : demoQuery.isLoading);

  const rawSummaries = useMemo(() => {
    const rows = mode === "paid" ? paidQuery.data : demoQuery.data;
    return Array.isArray(rows) ? rows : [];
  }, [mode, paidQuery.data, demoQuery.data]);

  // ---------- normalize + apply remaining client-side filters ----------
  const filtered = useMemo(() => {
    const divs = Array.isArray(filters.divisions) ? filters.divisions : [];
    const wantsDivisions = divs.length > 0;

    return rawSummaries
      .filter((s) => {
        // division filter (paid data may already contain division; demo hook already post-filters division if provided,
        // but we also support multi-select here)
        if (wantsDivisions) {
          const d = s?.school_division || null;
          if (!d || !divs.includes(d)) return false;
        }
        return true;
      })
      .filter((s) => {
        // positions multi-select
        return hasAnyPosition(s, filters.positions);
      })
      .filter((s) => {
        // date range
        const d = safeDateStr(s?.start_date);
        return inDateRange(d, filters.startDate, filters.endDate);
      });
  }, [rawSummaries, filters.divisions, filters.positions, filters.startDate, filters.endDate]);

  // ---------- group by date ----------
  const grouped = useMemo(() => {
    const map = new Map();
    for (const s of filtered) {
      const d = safeDateStr(s?.start_date) || "TBD";
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(s);
    }

    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "TBD") return 1;
      if (b === "TBD") return -1;
      return a.localeCompare(b);
    });

    return keys.map((k) => ({
      date: k,
      items: map.get(k) || []
    }));
  }, [filtered]);

  // ---------- actions ----------
  const clearFilters = () =>
    setFilters({
      sport: "",
      state: "",
      divisions: [],
      positions: [],
      startDate: "",
      endDate: ""
    });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Paid but missing profile -> direct them (best practice: don’t crash Calendar)
  if (mode === "paid" && !athleteId) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <div className="max-w-md mx-auto p-4 space-y-3">
          <Card className="p-4 border-slate-200">
            <div className="text-lg font-semibold text-deep-navy">Complete your athlete profile</div>
            <div className="text-sm text-slate-600 mt-1">
              Calendar needs an athlete profile to load your saved camps.
            </div>
            <Button
              className="mt-3 w-full"
              onClick={() => (window.location.href = createPageUrl("Profile"))}
            >
              Go to Profile
            </Button>
          </Card>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-bold text-deep-navy">Calendar</div>
            <div className="text-xs text-slate-500">
              {mode === "paid" ? "Paid workspace" : `Demo season ${seasonYear}`}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* FilterSheet */}
        <FilterSheet
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onFilterChange={setFilters}
          positions={positions}
          sports={sports}
          onApply={() => setFilterOpen(false)}
          onClear={() => {
            clearFilters();
            setFilterOpen(false);
          }}
        />

        {/* Content */}
        {refLoading && (
          <div className="text-xs text-slate-500">Loading filters…</div>
        )}

        {grouped.length === 0 ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-slate-600">No camps match your current filters.</div>
            <Button variant="outline" className="mt-3 w-full" onClick={clearFilters}>
              Clear filters
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.date} className="space-y-2">
                <div className="text-xs font-semibold text-slate-500">
                  {g.date === "TBD" ? "TBD" : g.date}
                </div>

                <div className="space-y-2">
                  {g.items.map((s) => (
                    <Card
                      key={String(s.camp_id)}
                      className="p-4 border-slate-200 bg-white"
                    >
                      <div className="text-base font-semibold text-deep-navy">
                        {s.school_name || "Unknown School"}
                      </div>
                      <div className="text-sm text-slate-600">
                        {s.camp_name || "Camp"}
                      </div>

                      <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                        {s.school_division ? <span>{s.school_division}</span> : null}
                        {s.sport_name ? <span>{s.sport_name}</span> : null}
                        {(s.city || s.state) ? (
                          <span>{[s.city, s.state].filter(Boolean).join(", ")}</span>
                        ) : null}
                        {typeof s.price === "number" ? (
                          <span>{s.price > 0 ? `$${s.price}` : "Free"}</span>
                        ) : null}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
