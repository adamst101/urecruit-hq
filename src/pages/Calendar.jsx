// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Filter, Loader2, Search, CalendarDays } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import CampCard from "../components/camps/CampCard.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

// --- state normalization (fixes your "State filter breaks" issue) ---
const STATE_NAME_TO_CODE = {
  "ALABAMA": "AL",
  "ALASKA": "AK",
  "ARIZONA": "AZ",
  "ARKANSAS": "AR",
  "CALIFORNIA": "CA",
  "COLORADO": "CO",
  "CONNECTICUT": "CT",
  "DELAWARE": "DE",
  "FLORIDA": "FL",
  "GEORGIA": "GA",
  "HAWAII": "HI",
  "IDAHO": "ID",
  "ILLINOIS": "IL",
  "INDIANA": "IN",
  "IOWA": "IA",
  "KANSAS": "KS",
  "KENTUCKY": "KY",
  "LOUISIANA": "LA",
  "MAINE": "ME",
  "MARYLAND": "MD",
  "MASSACHUSETTS": "MA",
  "MICHIGAN": "MI",
  "MINNESOTA": "MN",
  "MISSISSIPPI": "MS",
  "MISSOURI": "MO",
  "MONTANA": "MT",
  "NEBRASKA": "NE",
  "NEVADA": "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  "OHIO": "OH",
  "OKLAHOMA": "OK",
  "OREGON": "OR",
  "PENNSYLVANIA": "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  "TENNESSEE": "TN",
  "TEXAS": "TX",
  "UTAH": "UT",
  "VERMONT": "VT",
  "VIRGINIA": "VA",
  "WASHINGTON": "WA",
  "WEST VIRGINIA": "WV",
  "WISCONSIN": "WI",
  "WYOMING": "WY",
};

function normState(v) {
  if (!v) return "";
  const s = String(v).trim();
  if (!s) return "";
  const up = s.toUpperCase();
  if (/^[A-Z]{2}$/.test(up)) return up;
  return STATE_NAME_TO_CODE[up] || up;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function cleanDate(v) {
  if (!v) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// Group by YYYY-MM (for a simple “calendar-ish” view without a full calendar lib)
function monthKey(dateStr) {
  const d = cleanDate(dateStr);
  if (!d) return "Unknown";
  return d.slice(0, 7);
}

export default function Calendar() {
  const season = useSeasonAccess();

  const [filterOpen, setFilterOpen] = useState(false);
  const [q, setQ] = useState("");

  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: "",
  });

  // Lists for FilterSheet
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [sRows, pRows] = await Promise.all([
          base44.entities.Sport?.list?.().catch(() => []),
          base44.entities.Position?.list?.().catch(() => []),
        ]);
        if (!mounted) return;

        setSports(Array.isArray(sRows) ? sRows : []);
        setPositions(Array.isArray(pRows) ? pRows : []);
      } catch {
        if (!mounted) return;
        setSports([]);
        setPositions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Pull broadly; filter client-side so state/division/position filters don’t “false-zero” results
  const seasonYear = season?.seasonYear;
  const sportId = filters.sport ? String(filters.sport) : null;

  const campsQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId,
    state: null,
    division: null,
    positionIds: null,
    limit: 2000,
    enabled: !!seasonYear,
  });

  const raw = Array.isArray(campsQuery.data) ? campsQuery.data : [];

  const filtered = useMemo(() => {
    const needle = String(q || "").trim().toLowerCase();

    const selectedDivisions = asArray(filters.divisions);
    const selectedPositions = asArray(filters.positions).map(String).filter(Boolean);

    const selectedState = filters.state ? normState(filters.state) : "";
    const start = cleanDate(filters.startDate);
    const end = cleanDate(filters.endDate);

    return raw
      .filter((c) => {
        // search
        if (needle) {
          const a = String(c?.school_name || "").toLowerCase();
          const b = String(c?.camp_name || "").toLowerCase();
          if (!a.includes(needle) && !b.includes(needle)) return false;
        }

        // state
        if (selectedState) {
          const campState = normState(c?.state || "");
          if (!campState) return false;
          if (campState !== selectedState) return false;
        }

        // divisions
        if (selectedDivisions.length > 0) {
          const div = String(c?.school_division || "").trim();
          if (!div) return false;
          if (!selectedDivisions.includes(div)) return false;
        }

        // positions (any-match)
        if (selectedPositions.length > 0) {
          const campPos = asArray(c?.position_ids).map(String);
          const hit = selectedPositions.some((pid) => campPos.includes(pid));
          if (!hit) return false;
        }

        // date range (start_date)
        const d = cleanDate(c?.start_date);
        if (start && (!d || d < start)) return false;
        if (end && (!d || d > end)) return false;

        return true;
      })
      .sort((a, b) => String(a?.start_date || "").localeCompare(String(b?.start_date || "")));
  }, [raw, q, filters]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of filtered) {
      const k = monthKey(c?.start_date);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    }
    // Stable order
    return Array.from(map.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  }, [filtered]);

  const loading = campsQuery.isLoading;
  const showEmpty = !loading && filtered.length === 0;

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-md mx-auto px-4 pt-5 pb-24">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-slate-500" />
              <div className="text-xl font-extrabold text-deep-navy">Calendar</div>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Season: {season?.seasonYear} · Mode: {season?.mode === "paid" ? "Paid" : "Demo"}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)} className="shrink-0">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Search */}
        <Card className="mt-4 p-3 border-slate-200">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search school or camp…"
            />
          </div>
        </Card>

        {/* Results */}
        <div className="mt-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading camps…
            </div>
          )}

          {!loading &&
            grouped.map(([month, items]) => (
              <div key={month} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-deep-navy">
                    {month === "Unknown" ? "TBD Dates" : month}
                  </div>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    {items.length}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {items.map((c) => {
                    const camp = {
                      camp_name: c.camp_name,
                      start_date: c.start_date,
                      end_date: c.end_date,
                      price: c.price,
                      link_url: c.link_url,
                      notes: c.notes,
                      city: c.city,
                      state: c.state,
                    };

                    const school = {
                      school_name: c.school_name,
                      division: c.school_division,
                    };

                    const sport = {
                      name: c.sport_name,
                      sport_name: c.sport_name,
                    };

                    return (
                      <CampCard
                        key={String(c.camp_id)}
                        camp={camp}
                        school={school}
                        sport={sport}
                        positions={[]}
                        isFavorite={false}
                        isRegistered={false}
                        disabledFavorite={true}
                        mode={season?.mode === "paid" ? "paid" : "demo"}
                        onClick={() => {
                          if (c?.link_url) {
                            try {
                              window.open(String(c.link_url), "_blank", "noopener,noreferrer");
                            } catch {}
                          }
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}

          {showEmpty && (
            <Card className="p-6 border-slate-200 text-center">
              <div className="text-base font-semibold text-deep-navy">No camps found</div>
              <div className="text-sm text-slate-500 mt-1">
                Clear filters or broaden your search.
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setQ("");
                    setFilters({
                      sport: "",
                      state: "",
                      divisions: [],
                      positions: [],
                      startDate: "",
                      endDate: "",
                    });
                  }}
                >
                  Reset
                </Button>
              </div>
            </Card>
          )}
        </div>
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
            endDate: "",
          });
          setFilterOpen(false);
        }}
      />

      {/* Bottom navigation */}
      <BottomNav />
    </div>
  );
}
