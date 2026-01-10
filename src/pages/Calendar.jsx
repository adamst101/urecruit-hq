// src/pages/Calendar.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Filter as FilterIcon } from "lucide-react";

import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import {
  usePublicCampSummariesClient,
  publicCampYearHasData,
} from "../components/hooks/usePublicCampSummariesClient.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";

// ---------- small helpers ----------
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

function inDateRange(c, startDate, endDate) {
  const sd = safeDateStr(c?.start_date);
  if (!sd) return false;
  if (startDate && sd < startDate) return false;
  if (endDate && sd > endDate) return false;
  return true;
}

function matchesAnyDivision(c, divisions) {
  const divs = asArray(divisions).filter(Boolean);
  if (!divs.length) return true;
  return divs.includes(c?.school_division);
}

function matchesState(c, st) {
  if (!st) return true;
  return String(c?.state || "").toUpperCase() === String(st).toUpperCase();
}

function matchesAnyPosition(c, positionIds) {
  const sel = asArray(positionIds).map(String).filter(Boolean);
  if (!sel.length) return true;
  const campPos = asArray(c?.position_ids).map(String);
  return sel.some((p) => campPos.includes(p));
}

function matchesSport(c, sportId) {
  if (!sportId) return true;
  return String(c?.sport_id || "") === String(sportId);
}

function pickDivisionForPublicHook(divisions) {
  // public hook accepts one division; if user selects multiple, we pass null and filter client-side
  const divs = asArray(divisions).filter(Boolean);
  return divs.length === 1 ? divs[0] : null;
}

const DEFAULT_FILTERS = {
  sport: "",
  state: "",
  divisions: [],
  positions: [],
  startDate: "",
  endDate: "",
};

export default function Calendar() {
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  // Treat everything as demo unless season says paid
  const isPaid = season?.mode === "paid";
  const isDemo = !isPaid;

  // UI state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  // Demo year resolver (Option A)
  const [resolvedDemoYear, setResolvedDemoYear] = useState(null);
  const [resolvingDemoYear, setResolvingDemoYear] = useState(false);

  const effectiveSeasonYear = useMemo(() => {
    if (isPaid) return season?.seasonYear || season?.currentYear || new Date().getUTCFullYear();
    // demo
    return resolvedDemoYear || season?.seasonYear || season?.demoYear || new Date().getUTCFullYear() - 1;
  }, [isPaid, season?.seasonYear, season?.currentYear, season?.demoYear, resolvedDemoYear]);

  const resolveDemoYear = useCallback(async () => {
    // Scan backwards from the demo year (or current demo seasonYear) until we find data.
    const base = Number(season?.seasonYear || season?.demoYear || new Date().getUTCFullYear() - 1);
    const yearsToTry = [];
    for (let i = 0; i <= 6; i++) yearsToTry.push(base - i); // base, base-1, ... base-6

    setResolvingDemoYear(true);
    try {
      for (const y of yearsToTry) {
        try {
          const has = await publicCampYearHasData(y);
          if (has) {
            setResolvedDemoYear(y);
            return y;
          }
        } catch {
          // keep trying
        }
      }
      // fallback to base even if empty (still deterministic)
      setResolvedDemoYear(base);
      return base;
    } finally {
      setResolvingDemoYear(false);
    }
  }, [season?.seasonYear, season?.demoYear]);

  // Auto-resolve demo year once (Option A)
  useEffect(() => {
    if (!isDemo) return;
    if (resolvedDemoYear != null) return;
    // kick once
    resolveDemoYear();
  }, [isDemo, resolvedDemoYear, resolveDemoYear]);

  // -------- data sources --------
  // Demo/public summaries (seasonYear-scoped, supports sport/state/division/positionIds)
  const publicDivision = useMemo(
    () => pickDivisionForPublicHook(filters?.divisions),
    [filters?.divisions]
  );

  const publicQuery = usePublicCampSummariesClient({
    seasonYear: effectiveSeasonYear,
    sportId: filters?.sport || null,
    state: filters?.state || null,
    division: publicDivision || null,
    positionIds: asArray(filters?.positions),
    limit: 1500,
    enabled: isDemo && !!effectiveSeasonYear && !resolvingDemoYear,
  });

  // Paid summaries (athlete-scoped)
  const paidQuery = useCampSummariesClient({
    athleteId: normId(athleteProfile) || athleteProfile?.id || null,
    sportId: filters?.sport || null,
    limit: 1500,
    enabled: isPaid && !!athleteProfile,
  });

  // Combine + normalize into one list for rendering
  const rawCamps = useMemo(() => {
    const rows = isPaid ? paidQuery.data : publicQuery.data;
    return Array.isArray(rows) ? rows : [];
  }, [isPaid, paidQuery.data, publicQuery.data]);

  // Apply remaining filters client-side (multi-division, dates, state for paid mode, etc.)
  const filteredCamps = useMemo(() => {
    const divs = asArray(filters?.divisions);
    const pos = asArray(filters?.positions);
    const startDate = filters?.startDate || "";
    const endDate = filters?.endDate || "";

    return rawCamps
      .filter((c) => matchesSport(c, filters?.sport))
      .filter((c) => matchesState(c, filters?.state))
      .filter((c) => matchesAnyDivision(c, divs))
      .filter((c) => matchesAnyPosition(c, pos))
      .filter((c) => inDateRange(c, startDate, endDate))
      .sort((a, b) => String(a?.start_date || "").localeCompare(String(b?.start_date || "")));
  }, [rawCamps, filters]);

  // Minimal lists for FilterSheet dropdowns
  const sportsForSheet = useMemo(() => {
    // Build a set from currently loaded rows (works in demo without separate Sport.list)
    const map = new Map();
    rawCamps.forEach((c) => {
      const id = c?.sport_id ? String(c.sport_id) : null;
      const name = c?.sport_name || null;
      if (id && name && !map.has(id)) map.set(id, { id, sport_name: name });
    });
    return Array.from(map.values()).sort((a, b) => String(a.sport_name).localeCompare(String(b.sport_name)));
  }, [rawCamps]);

  const positionsForSheet = useMemo(() => {
    // We only have position_ids on summaries; keep empty unless your app passes a Position list elsewhere
    return [];
  }, []);

  const loading = useMemo(() => {
    if (season?.isLoading) return true;
    if (isDemo) return publicQuery.isLoading || resolvingDemoYear;
    return paidQuery.isLoading;
  }, [season?.isLoading, isDemo, publicQuery.isLoading, resolvingDemoYear, paidQuery.isLoading]);

  const modeLabel = isPaid ? "Paid" : "Demo";

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarDays className="w-5 h-5 text-slate-600" />
            <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
            <Badge variant="outline" className="text-xs">
              {modeLabel}
            </Badge>
          </div>

          <Button
            variant="outline"
            onClick={() => setFiltersOpen(true)}
            className="gap-2"
          >
            <FilterIcon className="w-4 h-4" />
            Filters
          </Button>
        </div>

        <div className="text-sm text-slate-600">
          Showing season {String(effectiveSeasonYear || "")}
        </div>

        {/* Content */}
        {loading ? (
          <Card className="p-6 border-slate-200">
            <div className="text-sm text-slate-600">Loading camps…</div>
          </Card>
        ) : filteredCamps.length === 0 ? (
          <Card className="p-6 border-slate-200">
            <div className="space-y-3">
              <div className="font-semibold text-deep-navy">
                No camps match your current filters.
              </div>
              <div className="text-sm text-slate-600">
                Try clearing filters or switching sport/state/date range.
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                >
                  Clear filters
                </Button>

                {isDemo && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setResolvedDemoYear(null);
                      resolveDemoYear();
                    }}
                    disabled={resolvingDemoYear}
                  >
                    Re-check season
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredCamps.map((c) => {
              const key = c?.camp_id || `${c?.school_id || "sch"}-${c?.start_date || "d"}`;
              return (
                <Card key={key} className="p-4 border-slate-200 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {c?.school_division && (
                          <Badge className="bg-slate-900 text-white text-xs">
                            {c.school_division}
                          </Badge>
                        )}
                        {c?.sport_name && (
                          <span className="text-xs text-slate-500 font-medium">
                            {c.sport_name}
                          </span>
                        )}
                        {isDemo && (
                          <Badge variant="outline" className="text-xs">
                            Demo
                          </Badge>
                        )}
                      </div>

                      <div className="text-base font-semibold text-deep-navy truncate">
                        {c?.school_name || "Unknown School"}
                      </div>
                      <div className="text-sm text-slate-600 truncate">
                        {c?.camp_name || "Camp"}
                      </div>

                      <div className="mt-2 text-xs text-slate-500">
                        {safeDateStr(c?.start_date)}
                        {c?.end_date && safeDateStr(c?.end_date) !== safeDateStr(c?.start_date)
                          ? ` – ${safeDateStr(c?.end_date)}`
                          : ""}
                        {c?.city || c?.state ? ` • ${[c?.city, c?.state].filter(Boolean).join(", ")}` : ""}
                      </div>
                    </div>

                    {c?.link_url ? (
                      <Button
                        variant="outline"
                        onClick={() => window.open(c.link_url, "_blank")}
                      >
                        View
                      </Button>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Filter Sheet */}
        <FilterSheet
          isOpen={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          filters={filters}
          onFilterChange={setFilters}
          sports={sportsForSheet}
          positions={positionsForSheet}
          onApply={() => setFiltersOpen(false)}
          onClear={() => {
            setFilters(DEFAULT_FILTERS);
            setFiltersOpen(false);
          }}
        />
      </div>
    </div>
  );
}
