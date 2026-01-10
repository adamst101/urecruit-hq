// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { CalendarDays, Filter } from "lucide-react";

import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";

// ✅ All your hooks/components are .jsx — use explicit .jsx paths
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

// ✅ FilterSheet is in src/components/filters/FilterSheet.jsx
import FilterSheet from "../components/filters/FilterSheet.jsx";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function ymd(d) {
  // expects "YYYY-MM-DD" in data; if not, returns ""
  if (!d) return "";
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function inDateRange(start, end, from, to) {
  const s = ymd(start);
  const e = ymd(end) || s;
  if (!s) return false;

  if (from && e < from) return false; // camp ends before window
  if (to && s > to) return false;     // camp starts after window
  return true;
}

export default function Calendar() {
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const mode = season.mode; // "demo" | "paid"
  const isPaid = mode === "paid";
  const seasonYear = season.seasonYear;

  // ---------- Filters (shared UI w/ Discover) ----------
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // For now: Calendar uses same filter model, applied client-side
  const selectedSportId = filters.sport ? String(filters.sport) : null;

  // ---------- Data ----------
  // Paid: pull full summaries tied to athlete (intent + target school flags, etc.)
  const paidSummaries = useCampSummariesClient({
    athleteId: normId(athleteProfile) || athleteProfile?.id || null,
    sportId: selectedSportId,
    enabled: isPaid && !!athleteProfile
  });

  // Demo/Public: pull public summaries by seasonYear and filters
  const publicSummaries = usePublicCampSummariesClient({
    seasonYear,
    sportId: selectedSportId,
    state: filters.state || null,
    division: null, // division is applied client-side after join in hook; keep null here for simplicity
    positionIds: asArray(filters.positions),
    enabled: !isPaid
  });

  const loading = paidSummaries.isLoading || publicSummaries.isLoading;

  const raw = useMemo(() => {
    if (isPaid) return asArray(paidSummaries.data);
    return asArray(publicSummaries.data);
  }, [isPaid, paidSummaries.data, publicSummaries.data]);

  // ---------- Client-side filtering (best-practice safety net) ----------
  const filtered = useMemo(() => {
    const divisions = asArray(filters.divisions);
    const positions = asArray(filters.positions).map(String);

    return raw.filter((r) => {
      // division filter
      if (divisions.length) {
        const div = r?.school_division || r?.division || null;
        if (!divisions.includes(div)) return false;
      }

      // positions filter
      if (positions.length) {
        const campPosIds = asArray(r?.position_ids).map(String);
        const match = positions.some((p) => campPosIds.includes(p));
        if (!match) return false;
      }

      // date range filter
      const from = filters.startDate ? String(filters.startDate) : "";
      const to = filters.endDate ? String(filters.endDate) : "";
      if ((from || to) && !inDateRange(r?.start_date, r?.end_date, from, to)) return false;

      return true;
    });
  }, [raw, filters.divisions, filters.positions, filters.startDate, filters.endDate]);

  // ---------- Lightweight “calendar-like” grouping ----------
  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of filtered) {
      const key = ymd(c?.start_date) || "TBD";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    // sort keys desc (latest first), TBD last
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "TBD") return 1;
      if (b === "TBD") return -1;
      return a < b ? 1 : -1;
    });
    return keys.map((k) => ({ date: k, items: map.get(k) || [] }));
  }, [filtered]);

  const appliedCount = useMemo(() => {
    let n = 0;
    if (filters.sport) n += 1;
    if (filters.state) n += 1;
    if (asArray(filters.divisions).length) n += 1;
    if (asArray(filters.positions).length) n += 1;
    if (filters.startDate || filters.endDate) n += 1;
    return n;
  }, [filters]);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-md mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-600" />
            <h1 className="text-xl font-semibold text-deep-navy">Calendar</h1>
            {mode === "demo" && (
              <Badge variant="outline" className="ml-2">
                Demo
              </Badge>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setFiltersOpen(true)}
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            Filters
            {appliedCount > 0 && (
              <span className="ml-1 rounded-full bg-slate-900 text-white text-xs px-2 py-0.5">
                {appliedCount}
              </span>
            )}
          </Button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="text-sm text-slate-500">Loading camps…</div>
        ) : grouped.length === 0 ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-slate-600">
              No camps match your current filters.
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Try clearing filters or switching the sport/state/date range.
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <Card key={g.date} className="p-4 border-slate-200">
                <div className="text-sm font-semibold text-slate-800">
                  {g.date === "TBD" ? "Date TBD" : g.date}
                </div>

                <div className="mt-3 space-y-2">
                  {g.items.slice(0, 15).map((c) => {
                    const title = c?.school_name || "Unknown School";
                    const subtitle = c?.camp_name || "Camp";
                    const loc = [c?.city, c?.state].filter(Boolean).join(", ");
                    const div = c?.school_division || null;

                    return (
                      <button
                        key={String(c?.camp_id || c?.id || Math.random())}
                        type="button"
                        className="w-full text-left rounded-lg border border-slate-200 bg-white p-3 hover:shadow-sm transition"
                        onClick={() => {
                          // Keep this simple: go to Discover for now (detail view can be wired later)
                          window.location.href =
                            createPageUrl("Discover") +
                            `?from=calendar&camp=${encodeURIComponent(String(c?.camp_id || ""))}` +
                            (mode === "demo" ? "&mode=demo" : "");
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-deep-navy truncate">
                              {title}
                            </div>
                            <div className="text-sm text-slate-600 truncate">
                              {subtitle}
                            </div>
                            {loc && (
                              <div className="text-xs text-slate-500 mt-1 truncate">
                                {loc}
                              </div>
                            )}
                          </div>
                          {div && (
                            <Badge className="bg-slate-900 text-white text-xs">
                              {div}
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {g.items.length > 15 && (
                    <div className="text-xs text-slate-500 pt-2">
                      Showing first 15 camps for this date.
                    </div>
                  )}
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
        positions={[]} // optional: wire when you have Position list in Discover
        sports={[]}    // optional: wire when you have Sport list in Discover
        onApply={() => setFiltersOpen(false)}
        onClear={() => {
          setFilters({
            sport: "",
            state: "",
            divisions: [],
            positions: [],
            startDate: "",
            endDate: ""
          });
          setFiltersOpen(false);
        }}
      />

      <BottomNav />
    </div>
  );
}
