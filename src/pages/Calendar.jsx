// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Filter } from "lucide-react";

import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { isDemoFavorite, toggleDemoFavorite, getDemoFavorites } from "../components/hooks/demoFavorites.js";
import { isDemoRegistered, toggleDemoRegistered } from "../components/hooks/demoRegistered.js";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function parseDate(d) {
  try {
    if (!d) return null;
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
}

function inRange(dateStr, startDate, endDate) {
  const d = parseDate(dateStr);
  if (!d) return false;

  if (startDate) {
    const s = parseDate(startDate);
    if (s && d < s) return false;
  }
  if (endDate) {
    const e = parseDate(endDate);
    if (e && d > e) return false;
  }
  return true;
}

export default function Calendar() {
  const nav = useNavigate();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const isPaid = season.mode === "paid";
  const athleteId = isPaid ? normId(athleteProfile) : null;

  // Demo profile (for local favorites/registered keys + optional filtering)
  const { loaded: demoLoaded, demoProfile, demoProfileId } = useDemoProfile();

  // Calendar filters (same model as FilterSheet)
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  const [sheetOpen, setSheetOpen] = useState(false);

  // ---- Data sources ----
  // Paid: pull full summaries (includes intent/targeting)
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || null,
    enabled: isPaid && !!athleteId
  });

  // Demo/Public: pull public summaries for season year + optional sport/state/division/positions
  const demoQuery = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: filters.sport || (demoProfile?.sport_id ?? null),
    state: filters.state || (demoProfile?.state ?? null),
    division: (filters.divisions || [])[0] || (demoProfile?.division ?? null),
    positionIds: (filters.positions && filters.positions.length ? filters.positions : demoProfile?.position_ids) || [],
    enabled: !isPaid && demoLoaded
  });

  const loading =
    season.isLoading ||
    (isPaid ? identityLoading || paidQuery.isLoading : demoQuery.isLoading);

  const summaries = useMemo(() => {
    const rows = isPaid ? paidQuery.data : demoQuery.data;
    return Array.isArray(rows) ? rows : [];
  }, [isPaid, paidQuery.data, demoQuery.data]);

  // Apply remaining filters client-side (date + multi-select division/positions)
  const filtered = useMemo(() => {
    const divs = Array.isArray(filters.divisions) ? filters.divisions : [];
    const pos = Array.isArray(filters.positions) ? filters.positions.map(String) : [];
    const sport = filters.sport ? String(filters.sport) : "";
    const state = filters.state ? String(filters.state) : "";
    const startDate = filters.startDate || "";
    const endDate = filters.endDate || "";

    return summaries.filter((c) => {
      // sport/state already applied server-side in most cases, but keep consistent
      if (sport && String(c.sport_id || "") !== sport) return false;
      if (state && String(c.state || "") !== state) return false;

      // division
      if (divs.length) {
        const d = c.school_division || "";
        if (!divs.includes(d)) return false;
      }

      // positions
      if (pos.length) {
        const ids = Array.isArray(c.position_ids) ? c.position_ids.map(String) : [];
        const hit = pos.some((p) => ids.includes(p));
        if (!hit) return false;
      }

      // date range (use camp start_date)
      if (startDate || endDate) {
        if (!inRange(c.start_date, startDate, endDate)) return false;
      }

      return true;
    });
  }, [summaries, filters]);

  // Demo favorites/registered state
  const demoFavSet = useMemo(() => {
    if (isPaid) return new Set();
    const ids = getDemoFavorites(demoProfileId, season.seasonYear);
    return new Set(ids.map(String));
  }, [isPaid, demoProfileId, season.seasonYear]);

  const onCampClick = (campId) => {
    nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(campId || ""))}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-slate-500">Loading calendar…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-600" />
            <h1 className="text-lg font-semibold text-deep-navy">Calendar</h1>
            {isPaid ? (
              <Badge className="bg-emerald-600 text-white">Paid</Badge>
            ) : (
              <Badge variant="outline">Demo</Badge>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* List (simple “calendar list” view) */}
        {filtered.length === 0 ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-slate-600">
              No camps match your filters.
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => {
              const campId = String(c.camp_id || "");
              const isDemo = !isPaid;

              const isFavorite = isPaid
                ? c.intent_status === "favorite"
                : demoFavSet.has(campId);

              const isRegistered = isPaid
                ? c.intent_status === "registered"
                : isDemoRegistered(demoProfileId, campId);

              return (
                <Card
                  key={campId}
                  className="p-4 border-slate-200 bg-white cursor-pointer hover:shadow-sm transition"
                  role="button"
                  tabIndex={0}
                  onClick={() => onCampClick(campId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onCampClick(campId);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                        {isDemo && <Badge variant="outline" className="text-xs">Demo</Badge>}
                        {isRegistered && (
                          <Badge className="bg-emerald-600 text-white text-xs">
                            Registered
                          </Badge>
                        )}
                        {isFavorite && (
                          <Badge className="bg-amber-500 text-white text-xs">
                            Favorite
                          </Badge>
                        )}
                      </div>

                      <div className="text-base font-semibold text-deep-navy truncate">
                        {c.school_name || "Unknown School"}
                      </div>
                      <div className="text-sm text-slate-600 truncate">
                        {c.camp_name || "Camp"} • {c.start_date || "TBD"}
                        {c.end_date && c.end_date !== c.start_date ? ` – ${c.end_date}` : ""}
                      </div>

                      {(c.city || c.state) && (
                        <div className="text-xs text-slate-500 mt-1">
                          {[c.city, c.state].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>

                    {/* Demo quick actions (local only) */}
                    {!isPaid && (
                      <div className="flex flex-col gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleDemoFavorite(demoProfileId, campId, season.seasonYear);
                          }}
                        >
                          {isFavorite ? "Unfav" : "Fav"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleDemoRegistered(demoProfileId, campId);
                          }}
                        >
                          {isRegistered ? "Unreg" : "Reg"}
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter Sheet */}
      <FilterSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        onFilterChange={(next) => setFilters(next || {})}
        // if you don’t have these lists yet, FilterSheet safely hides sections
        positions={[]}
        sports={[]}
        onApply={() => setSheetOpen(false)}
        onClear={() => {
          setFilters({
            sport: "",
            state: "",
            divisions: [],
            positions: [],
            startDate: "",
            endDate: ""
          });
          setSheetOpen(false);
        }}
      />
    </div>
  );
}
