// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Filter as FilterIcon } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
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
  if (s === "D1" || s === "DI" || s.includes("DIVISION I")) return "D1";
  if (s === "D2" || s === "DII" || s.includes("DIVISION II")) return "D2";
  if (s === "D3" || s === "DIII" || s.includes("DIVISION III")) return "D3";
  if (s.includes("NAIA")) return "NAIA";
  if (s.includes("JUCO") || s.includes("NJCAA")) return "JUCO";

  if (s.startsWith("D1 (FBS)")) return "D1 (FBS)";
  if (s.startsWith("D1 (FCS)")) return "D1 (FCS)";

  return safeStr(v).trim();
}

// Full-name -> abbreviation map (for resilient filtering)
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
  "DISTRICT OF COLUMBIA": "DC"
};

function normalizeState(v) {
  const s = safeStr(v).trim();
  if (!s) return "";

  const upper = s.toUpperCase();

  // Already 2-letter code (TX)
  if (/^[A-Z]{2}$/.test(upper)) return upper;

  // Might be "Texas", "texas", etc.
  const abbr = STATE_NAME_TO_ABBR[upper];
  if (abbr) return abbr;

  // Sometimes stored like "TX - Texas" or "Texas (TX)"
  // Extract first 2-letter code if present
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

function formatRange(start, end) {
  const s = ymd(start);
  const e = ymd(end);
  if (!s) return "TBD";
  if (!e || e === s) return s;
  return `${s} – ${e}`;
}

// ---------------- component ----------------
export default function Calendar() {
  const nav = useNavigate();
  const season = useSeasonAccess();

  const [filterOpen, setFilterOpen] = useState(false);

  // Editable filters
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // Applied filters
  const [applied, setApplied] = useState(filters);

  // Options for FilterSheet
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const rows = await base44.entities.Sport.list();
        if (!mounted) return;
        setSports(Array.isArray(rows) ? rows : []);
      } catch {
        if (mounted) setSports([]);
      }
    })();

    (async () => {
      try {
        const rows = await base44.entities.Position.list();
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

  const seasonYear = season.seasonYear;

  // Server-filter ONLY by season (+ optional sport). State is client-side now.
  const sportId = applied.sport ? String(applied.sport) : null;

  const { data: publicSummaries, isLoading } = usePublicCampSummariesClient({
    seasonYear,
    sportId,
    state: null,        // ✅ do NOT server-filter state
    division: null,     // ✅ client-side
    positionIds: null,  // ✅ client-side
    limit: 2000,
    enabled: !!seasonYear
  });

  const mode = season.mode; // "demo" | "paid"

  const rows = useMemo(() => {
    const list = Array.isArray(publicSummaries) ? publicSummaries : [];

    const selectedState = applied.state ? normalizeState(applied.state) : "";

    const selectedDivs = Array.isArray(applied.divisions)
      ? applied.divisions.map((d) => normalizeDivision(d)).filter(Boolean)
      : [];

    const selectedPos = Array.isArray(applied.positions)
      ? applied.positions.map((p) => String(p)).filter(Boolean)
      : [];

    const startFilter = applied.startDate || "";
    const endFilter = applied.endDate || "";

    return list.filter((c) => {
      // ✅ State (match against camp.state OR school_state)
      if (selectedState) {
        const campState = normalizeState(c.state || "");
        const schoolState = normalizeState(c.school_state || "");
        if (campState !== selectedState && schoolState !== selectedState) return false;
      }

      // Division
      if (selectedDivs.length) {
        const campDiv = normalizeDivision(c.school_division);
        if (!selectedDivs.includes(campDiv)) return false;
      }

      // Positions (camp.position_ids contains ids)
      if (selectedPos.length) {
        const campPos = Array.isArray(c.position_ids)
          ? c.position_ids.map((x) => String(normId(x) || x)).filter(Boolean)
          : [];
        if (!selectedPos.some((p) => campPos.includes(p))) return false;
      }

      // Date range
      if (!inDateRange(c.start_date, c.end_date, startFilter, endFilter)) return false;

      return true;
    });
  }, [publicSummaries, applied]);

  const hasFilters = useMemo(() => {
    return !!(
      applied.sport ||
      applied.state ||
      (applied.divisions && applied.divisions.length) ||
      (applied.positions && applied.positions.length) ||
      applied.startDate ||
      applied.endDate
    );
  }, [applied]);

  const clearFilters = () => {
    const next = {
      sport: "",
      state: "",
      divisions: [],
      positions: [],
      startDate: "",
      endDate: ""
    };
    setFilters(next);
    setApplied(next);
  };

  const recheckSeason = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-md mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-700" />
            <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
            <Badge variant="outline" className="ml-1">
              {mode === "paid" ? "Paid" : "Demo"}
            </Badge>
          </div>

          <Button
            variant="outline"
            onClick={() => setFilterOpen(true)}
            className="gap-2"
          >
            <FilterIcon className="w-4 h-4" />
            Filters
          </Button>
        </div>

        <div className="text-sm text-slate-500 mt-2">Showing season {seasonYear}</div>

        {/* Content */}
        <div className="mt-5 space-y-3">
          {isLoading ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-600">Loading camps…</div>
            </Card>
          ) : rows.length === 0 ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm font-semibold text-deep-navy">
                No camps match your current filters.
              </div>
              <div className="text-sm text-slate-600 mt-1">
                Try clearing filters or switching sport/state/date range.
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  disabled={!hasFilters}
                  className="flex-1"
                >
                  Clear filters
                </Button>
                <Button variant="outline" onClick={recheckSeason} className="flex-1">
                  Re-check season
                </Button>
              </div>
            </Card>
          ) : (
            rows.map((c) => {
              const div = normalizeDivision(c.school_division);
              const sportName = c.sport_name || "Sport";
              const location = [c.city, c.state].filter(Boolean).join(", ");

              return (
                <Card key={String(c.camp_id)} className="p-4 border-slate-200 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {div ? (
                          <Badge className="bg-slate-900 text-white text-xs">{div}</Badge>
                        ) : null}
                        <span className="text-xs text-slate-500 font-medium">
                          {sportName}
                        </span>
                        {mode !== "paid" && (
                          <Badge variant="outline" className="text-xs">
                            Demo
                          </Badge>
                        )}
                      </div>

                      <div className="mt-1 text-base font-semibold text-deep-navy truncate">
                        {c.school_name || "Unknown School"}
                      </div>
                      <div className="text-sm text-slate-600 truncate">
                        {c.camp_name || "Camp"}
                      </div>

                      <div className="mt-2 text-xs text-slate-500">
                        {formatRange(c.start_date, c.end_date)}
                        {location ? ` • ${location}` : ""}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => {
                        nav(
                          createPageUrl("CampDetail") +
                            `?campId=${encodeURIComponent(String(c.camp_id))}` +
                            (mode !== "paid" ? `&mode=demo` : "")
                        );
                      }}
                    >
                      View
                    </Button>
                  </div>
                </Card>
              );
            })
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
    </div>
  );
}
