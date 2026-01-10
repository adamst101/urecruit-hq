// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { CalendarDays, Filter, Loader2 } from "lucide-react";

import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

import { useDemoProfile } from "../components/hooks/useDemoProfile";

// ---------- small helpers ----------
function ymd(d) {
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const da = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  } catch {
    return "";
  }
}

function prettyDate(d) {
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "TBD";
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "TBD";
  }
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function sanitizeDateStr(v) {
  if (!v) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// ---------- local FilterSheet (NO import dependency) ----------
const DIVISIONS = ["D1 (FBS)", "D1 (FCS)", "D2", "D3", "NAIA", "JUCO"];
const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

function FilterSheet({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  onApply,
  onClear,
}) {
  const safe = filters || {};

  const selectedDivisions = asArray(safe.divisions);
  const selectedState = safe.state ? String(safe.state) : "";
  const startDate = sanitizeDateStr(safe.startDate);
  const endDate = sanitizeDateStr(safe.endDate);

  const setFilters = (next) => onFilterChange?.(next);

  const toggleDivision = (div) => {
    const next = selectedDivisions.includes(div)
      ? selectedDivisions.filter((d) => d !== div)
      : [...selectedDivisions, div];
    setFilters({ ...safe, divisions: next });
  };

  const onStateChange = (value) => setFilters({ ...safe, state: value || "" });

  const onStartDateChange = (value) => {
    const v = sanitizeDateStr(value);
    const nextEnd = endDate && v && endDate < v ? "" : endDate;
    setFilters({ ...safe, startDate: v, endDate: nextEnd });
  };

  const onEndDateChange = (value) => {
    const v = sanitizeDateStr(value);
    if (startDate && v && v < startDate) {
      setFilters({ ...safe, endDate: "" });
      return;
    }
    setFilters({ ...safe, endDate: v });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        onClick={() => onClose?.()}
        aria-label="Close filters"
      />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-w-md mx-auto">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="font-semibold text-slate-900">Filter Camps</div>
          <button
            type="button"
            className="text-sm text-slate-600 hover:text-slate-900"
            onClick={() => onClose?.()}
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-6 max-h-[70vh] overflow-auto">
          {/* Division */}
          <div>
            <div className="text-sm font-semibold text-slate-800 mb-2">Division</div>
            <div className="grid grid-cols-2 gap-2">
              {DIVISIONS.map((div) => (
                <label key={div} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedDivisions.includes(div)}
                    onChange={() => toggleDivision(div)}
                  />
                  <span>{div}</span>
                </label>
              ))}
            </div>
          </div>

          {/* State */}
          <div>
            <div className="text-sm font-semibold text-slate-800 mb-2">State</div>
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              value={selectedState}
              onChange={(e) => onStateChange(e.target.value)}
            >
              <option value="">All States</option>
              {STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-800">Date Range</div>

            <div>
              <div className="text-xs text-slate-500 mb-1">Start Date</div>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
              />
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1">End Date</div>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => onEndDateChange(e.target.value)}
              />
            </div>

            {startDate && endDate && endDate < startDate && (
              <div className="text-xs text-rose-600">
                End date can’t be earlier than start date.
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex gap-2">
          <button
            type="button"
            className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
            onClick={() => onClear?.()}
          >
            Clear All
          </button>
          <button
            type="button"
            className="flex-1 bg-deep-navy text-white rounded-md px-3 py-2 text-sm"
            onClick={() => onApply?.()}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- main page ----------
export default function Calendar() {
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();
  const { demoProfile } = useDemoProfile();

  const [filtersOpen, setFiltersOpen] = useState(false);

  // Local UI filters (kept simple + resilient)
  const [filters, setFilters] = useState(() => ({
    // demo defaults from demo profile when present
    state: demoProfile?.state || "",
    divisions: demoProfile?.division ? [demoProfile.division] : [],
    startDate: "",
    endDate: "",
  }));

  const isPaid = season?.mode === "paid";
  const athleteId = athleteProfile?.id || null;

  // Paid: athlete-scoped summaries (if athlete exists)
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: null,
    enabled: Boolean(isPaid && athleteId),
    limit: 2000,
  });

  // Demo: public summaries
  const demoQuery = usePublicCampSummariesClient({
    seasonYear: season?.demoYear, // always demo year for demo browsing
    sportId: demoProfile?.sport_id || null,
    state: filters.state || null,
    division: filters.divisions?.length === 1 ? filters.divisions[0] : null,
    positionIds: demoProfile?.position_ids || [],
    enabled: Boolean(!isPaid),
    limit: 2000,
  });

  const loading = season?.loading || (isPaid ? paidQuery.isLoading : demoQuery.isLoading);

  const rawRows = useMemo(() => {
    const rows = isPaid ? (paidQuery.data || []) : (demoQuery.data || []);
    return Array.isArray(rows) ? rows : [];
  }, [isPaid, paidQuery.data, demoQuery.data]);

  // Apply simple client-side filters that are safe across both shapes
  const rows = useMemo(() => {
    let out = [...rawRows];

    // state filter (paid rows might have state directly or school_state)
    if (filters.state) {
      const st = String(filters.state).toUpperCase();
      out = out.filter((r) => {
        const a = String(r?.state || "").toUpperCase();
        const b = String(r?.school_state || "").toUpperCase();
        return a === st || b === st;
      });
    }

    // divisions multi-select (paid rows: school_division; public rows: school_division)
    const divs = asArray(filters.divisions);
    if (divs.length) {
      out = out.filter((r) => divs.includes(String(r?.school_division || "")));
    }

    // date range (use start_date)
    const s = sanitizeDateStr(filters.startDate);
    const e = sanitizeDateStr(filters.endDate);
    if (s) out = out.filter((r) => {
      const d = ymd(r?.start_date);
      return d && d >= s;
    });
    if (e) out = out.filter((r) => {
      const d = ymd(r?.start_date);
      return d && d <= e;
    });

    // sort ascending by start_date
    out.sort((a, b) => String(a?.start_date || "").localeCompare(String(b?.start_date || "")));
    return out;
  }, [rawRows, filters]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const k = ymd(r?.start_date) || "TBD";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-md mx-auto px-4 pt-6 pb-24">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-700" />
            <h1 className="text-lg font-semibold text-deep-navy">Calendar</h1>
          </div>

          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        <Card className="p-3 border-slate-200 bg-white mb-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Mode:{" "}
              <span className="font-medium text-slate-900">
                {isPaid ? "Paid" : "Demo"}
              </span>
            </div>
            {!isPaid && (
              <Button
                variant="ghost"
                className="text-sm"
                onClick={() => window.location.assign(createPageUrl("Subscribe"))}
              >
                Upgrade
              </Button>
            )}
          </div>
        </Card>

        {loading ? (
          <div className="min-h-[50vh] flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : rows.length === 0 ? (
          <Card className="p-6 border-slate-200 bg-white">
            <div className="text-slate-800 font-semibold mb-1">No camps found</div>
            <div className="text-sm text-slate-600">
              Try clearing filters or switching to Discover.
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {grouped.map(([day, items]) => (
              <div key={day}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-slate-800">
                    {day === "TBD" ? "TBD" : prettyDate(day)}
                  </div>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    {items.length}
                  </Badge>
                </div>

                <div className="space-y-2">
                  {items.map((r) => {
                    const key = String(r?.camp_id || r?.id || `${r?.camp_name}-${r?.start_date}`);
                    return (
                      <Card
                        key={key}
                        className="p-4 border-slate-200 bg-white"
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          const id = r?.camp_id || r?.id;
                          if (!id) return;
                          window.location.assign(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(id))}`);
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-deep-navy truncate">
                              {r?.school_name || "Unknown School"}
                            </div>
                            <div className="text-sm text-slate-600 truncate">
                              {r?.camp_name || "Camp"}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {(r?.school_division || "").toString()}
                              {(r?.school_division && (r?.state || r?.school_state)) ? " • " : ""}
                              {[r?.city, r?.state || r?.school_state].filter(Boolean).join(", ")}
                            </div>
                          </div>

                          {!isPaid && (
                            <Badge variant="outline" className="text-xs">
                              Demo
                            </Badge>
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
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        onClear={() => {
          setFilters({
            state: "",
            divisions: [],
            startDate: "",
            endDate: "",
          });
        }}
        onApply={() => setFiltersOpen(false)}
      />
    </div>
  );
}
