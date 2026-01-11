// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { CalendarDays, Filter as FilterIcon } from "lucide-react";

import { base44 } from "../api/base44Client";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

// ---------------- helpers ----------------
function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function safeStr(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function ymd(v) {
  const s = safeStr(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function normalizeDivision(v) {
  const s = safeStr(v).trim().toUpperCase();
  if (!s) return "";
  if (s.includes("FBS")) return "D1 (FBS)";
  if (s.includes("FCS")) return "D1 (FCS)";
  if (s === "D2" || s === "DII" || s.includes("DIVISION II")) return "D2";
  if (s === "D3" || s === "DIII" || s.includes("DIVISION III")) return "D3";
  if (s.includes("NAIA")) return "NAIA";
  if (s.includes("JUCO") || s.includes("NJCAA")) return "JUCO";
  return safeStr(v).trim();
}

const STATE_NAME_TO_ABBR = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
  "DISTRICT OF COLUMBIA": "DC",
};

function normalizeState(v) {
  const s = safeStr(v).trim();
  if (!s) return "";
  const upper = s.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  const abbr = STATE_NAME_TO_ABBR[upper];
  if (abbr) return abbr;
  const m = upper.match(/\b[A-Z]{2}\b/);
  if (m && m[0]) return m[0];
  return upper;
}

function inDateRange(campStart, campEnd, startFilter, endFilter) {
  const cs = ymd(campStart);
  const ce = ymd(campEnd) || cs;

  const fs = ymd(startFilter);
  const fe = ymd(endFilter);

  if (!fs && !fe) return true;
  if (fs && !fe) return cs >= fs;
  if (!fs && fe) return cs <= fe;

  return !(ce < fs || cs > fe);
}

function toDateKey(d) {
  const s = ymd(d);
  return s || "";
}

// ---------------- component ----------------
export default function Calendar() {
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const mode = season.mode; // "paid" | "demo"
  const seasonYear = season.seasonYear;

  // Filter UI state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: "",
  });
  const [applied, setApplied] = useState(filters);

  // Reference lists for FilterSheet
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  // Lazy-load filter picklists (non-blocking)
  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const rows = await base44.entities.Sport.list();
        if (mounted) setSports(Array.isArray(rows) ? rows : []);
      } catch {
        if (mounted) setSports([]);
      }
    })();

    (async () => {
      try {
        const rows = await base44.entities.Position.list();
        if (mounted) setPositions(Array.isArray(rows) ? rows : []);
      } catch {
        if (mounted) setPositions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const sportId = applied.sport ? String(applied.sport) : null;

  // Paid: use athlete-aware list; Demo: use public list
  const paidQuery = useCampSummariesClient({
    athleteId: athleteProfile?.id ? String(athleteProfile.id) : null,
    sportId,
    limit: 2000,
    enabled: mode === "paid" && !!athleteProfile?.id,
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId,
    state: null,        // ✅ client-side
    division: null,     // ✅ client-side
    positionIds: null,  // ✅ client-side
    limit: 2000,
    enabled: mode !== "paid" && !!seasonYear,
  });

  const loading = mode === "paid" ? paidQuery.isLoading : demoQuery.isLoading;

  const raw = useMemo(() => {
    const list =
      mode === "paid"
        ? Array.isArray(paidQuery.data) ? paidQuery.data : []
        : Array.isArray(demoQuery.data) ? demoQuery.data : [];

    // Normalize into a consistent shape for calendar rendering
    return list.map((c) => ({
      camp_id: String(c.camp_id || c.id || normId(c) || ""),
      camp_name: c.camp_name || "Camp",
      start_date: c.start_date,
      end_date: c.end_date || null,
      city: c.city || null,
      state: c.state || null,

      school_id: c.school_id ? String(c.school_id) : null,
      school_name: c.school_name || c.school?.school_name || c.school?.name || "Unknown School",
      school_division: c.school_division || null,
      school_state: c.school_state || c.school?.state || null,

      sport_id: c.sport_id ? String(c.sport_id) : null,
      sport_name: c.sport_name || null,

      position_ids: Array.isArray(c.position_ids) ? c.position_ids.map((x) => String(normId(x) || x)).filter(Boolean) : [],

      // paid-only fields (safe in demo too)
      intent_status: c.intent_status || null,
      intent_priority: c.intent_priority || null,
      is_target_school: !!c.is_target_school,
    }));
  }, [mode, paidQuery.data, demoQuery.data]);

  const filtered = useMemo(() => {
    const selectedState = applied.state ? normalizeState(applied.state) : "";
    const selectedDivs = Array.isArray(applied.divisions)
      ? applied.divisions.map((d) => normalizeDivision(d)).filter(Boolean)
      : [];
    const selectedPos = Array.isArray(applied.positions)
      ? applied.positions.map((p) => String(p)).filter(Boolean)
      : [];
    const startFilter = applied.startDate || "";
    const endFilter = applied.endDate || "";

    return raw.filter((c) => {
      // state: match camp.state OR school_state
      if (selectedState) {
        const campState = normalizeState(c.state || "");
        const schoolState = normalizeState(c.school_state || "");
        if (campState !== selectedState && schoolState !== selectedState) return false;
      }

      // division
      if (selectedDivs.length) {
        const div = normalizeDivision(c.school_division);
        if (!selectedDivs.includes(div)) return false;
      }

      // positions (any match)
      if (selectedPos.length) {
        const campPos = Array.isArray(c.position_ids) ? c.position_ids : [];
        if (!selectedPos.some((p) => campPos.includes(p))) return false;
      }

      // date range overlap
      if (!inDateRange(c.start_date, c.end_date, startFilter, endFilter)) return false;

      return true;
    });
  }, [raw, applied]);

  // Simple “by-day” buckets for display
  const byDay = useMemo(() => {
    const map = new Map();
    for (const c of filtered) {
      const k = toDateKey(c.start_date);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    }
    // sort each day
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => safeStr(a.school_name).localeCompare(safeStr(b.school_name)));
      map.set(k, arr);
    }
    // sorted keys desc (newest first)
    return Array.from(map.entries()).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  }, [filtered]);

  const hasFilters = !!(
    applied.sport ||
    applied.state ||
    (applied.divisions && applied.divisions.length) ||
    (applied.positions && applied.positions.length) ||
    applied.startDate ||
    applied.endDate
  );

  const clearFilters = () => {
    const next = {
      sport: "",
      state: "",
      divisions: [],
      positions: [],
      startDate: "",
      endDate: "",
    };
    setFilters(next);
    setApplied(next);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-md mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-700" />
            <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
            <Badge variant="outline">{mode === "paid" ? "Paid" : "Demo"}</Badge>
          </div>

          <Button variant="outline" className="gap-2" onClick={() => setFilterOpen(true)}>
            <FilterIcon className="w-4 h-4" />
            Filters
          </Button>
        </div>

        <div className="text-sm text-slate-500 mt-2">Showing season {seasonYear}</div>

        {/* Content */}
        <div className="mt-5 space-y-3">
          {loading ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-600">Loading camps…</div>
            </Card>
          ) : byDay.length === 0 ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm font-semibold text-deep-navy">
                No camps match your current filters.
              </div>
              <div className="text-sm text-slate-600 mt-1">
                Try clearing filters or adjusting state/division/date range.
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={clearFilters}
                  disabled={!hasFilters}
                >
                  Clear filters
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setFilterOpen(true)}>
                  Edit filters
                </Button>
              </div>
            </Card>
          ) : (
            byDay.map(([day, items]) => (
              <div key={day} className="space-y-2">
                <div className="text-xs font-semibold text-slate-600">{day}</div>

                {items.map((c) => {
                  const div = normalizeDivision(c.school_division);
                  const stateLabel = [c.city, c.state].filter(Boolean).join(", ");

                  return (
                    <Card key={c.camp_id} className="p-4 border-slate-200 bg-white">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {div ? (
                              <Badge className="bg-slate-900 text-white text-xs">{div}</Badge>
                            ) : null}
                            {c.sport_name ? (
                              <span className="text-xs text-slate-500 font-medium">
                                {c.sport_name}
                              </span>
                            ) : null}
                            {mode !== "paid" ? (
                              <Badge variant="outline" className="text-xs">
                                Demo
                              </Badge>
                            ) : null}
                          </div>

                          <div className="mt-1 text-base font-semibold text-deep-navy truncate">
                            {c.school_name}
                          </div>
                          <div className="text-sm text-slate-600 truncate">{c.camp_name}</div>

                          {stateLabel ? (
                            <div className="mt-2 text-xs text-slate-500">{stateLabel}</div>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Filter sheet */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        sports={sports}
        positions={positions}
        onClear={clearFilters}
        onApply={() => {
          setApplied(filters);
          setFilterOpen(false);
        }}
      />

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
