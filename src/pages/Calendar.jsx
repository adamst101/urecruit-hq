// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, SlidersHorizontal, Loader2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";
import CampCard from "../components/camps/CampCard.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites, toggleDemoFavorite } from "../components/hooks/demoFavorites.jsx";
import { isDemoRegistered, toggleDemoRegistered } from "../components/hooks/demoRegistered.jsx";

// ---------- helpers ----------
function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function inRange(dateStr, startDate, endDate) {
  if (!dateStr) return true;
  const d = String(dateStr).slice(0, 10);
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

function groupByDay(items) {
  const map = new Map();
  for (const x of items) {
    const day = String(x?.start_date || "").slice(0, 10) || "TBD";
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(x);
  }
  // sort keys desc (latest first)
  const keys = Array.from(map.keys()).sort((a, b) => String(b).localeCompare(String(a)));
  return keys.map((k) => ({ day: k, rows: map.get(k) }));
}

function uniqById(items) {
  const seen = new Set();
  const out = [];
  for (const x of items || []) {
    const id = x?.camp_id ? String(x.camp_id) : null;
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(x);
  }
  return out;
}

export default function Calendar() {
  const nav = useNavigate();

  const season = useSeasonAccess(); // { mode, seasonYear, ... }
  const isPaid = season.mode === "paid";
  const seasonYear = season.seasonYear;

  // Paid identity (only matters in paid mode)
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // Demo identity (local)
  const { loaded: demoLoaded, demoProfileId } = useDemoProfile();

  // Filters (shared UI)
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // Reference data for FilterSheet dropdowns
  const sportsQuery = base44?.entities?.Sport
    ? base44.entities.Sport.list?.bind(base44.entities.Sport)
    : null;
  const positionsQuery = base44?.entities?.Position
    ? base44.entities.Position.list?.bind(base44.entities.Position)
    : null;

  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);
  const [refLoading, setRefLoading] = useState(false);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setRefLoading(true);
      try {
        const [sRows, pRows] = await Promise.all([
          sportsQuery ? sportsQuery() : Promise.resolve([]),
          positionsQuery ? positionsQuery() : Promise.resolve([])
        ]);
        if (!mounted) return;
        setSports(Array.isArray(sRows) ? sRows : []);
        setPositions(Array.isArray(pRows) ? pRows : []);
      } catch {
        if (!mounted) return;
        setSports([]);
        setPositions([]);
      } finally {
        if (mounted) setRefLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- data fetch ----------
  // Paid: client-composed summaries (athlete scoped)
  const paidSummariesQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || null,
    enabled: isPaid && !!athleteId
  });

  // Demo/Public: year-gated public summaries
  const publicSummariesQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: asArray(filters.divisions).length === 1 ? filters.divisions[0] : null,
    positionIds: asArray(filters.positions),
    enabled: !isPaid
  });

  const loading =
    season.isLoading ||
    refLoading ||
    (isPaid ? identityLoading || paidSummariesQuery.isLoading : !demoLoaded || publicSummariesQuery.isLoading);

  const rawSummaries = useMemo(() => {
    const rows = isPaid ? paidSummariesQuery.data : publicSummariesQuery.data;
    return Array.isArray(rows) ? rows : [];
  }, [isPaid, paidSummariesQuery.data, publicSummariesQuery.data]);

  // ---------- client-side filtering (best-practice: consistent behavior across modes) ----------
  const filteredSummaries = useMemo(() => {
    const divs = asArray(filters.divisions);
    const pos = asArray(filters.positions).map(String);
    const st = filters.state ? String(filters.state) : "";
    const startDate = filters.startDate ? String(filters.startDate) : "";
    const endDate = filters.endDate ? String(filters.endDate) : "";

    let rows = uniqById(rawSummaries);

    // Date range always client-side (avoids backend operator variance)
    rows = rows.filter((r) => inRange(r?.start_date, startDate, endDate));

    // State filter (paid summaries have camp.state; public also)
    if (st) rows = rows.filter((r) => String(r?.state || "") === st);

    // Division filter:
    // - Public hook can handle single division server-side, but multiple divisions should still work client-side.
    if (divs.length > 0) {
      rows = rows.filter((r) => divs.includes(String(r?.school_division || "")));
    }

    // Positions filter:
    // - Public hook already filters, but keep client-side parity.
    if (pos.length > 0) {
      rows = rows.filter((r) => {
        const ids = asArray(r?.position_ids).map(String);
        return pos.some((p) => ids.includes(p));
      });
    }

    // Sort by start_date desc
    rows.sort((a, b) => String(b?.start_date || "").localeCompare(String(a?.start_date || "")));

    return rows;
  }, [rawSummaries, filters]);

  const grouped = useMemo(() => groupByDay(filteredSummaries), [filteredSummaries]);

  // ---------- demo local intent state ----------
  const demoFavorites = useMemo(() => {
    if (isPaid) return [];
    return getDemoFavorites(demoProfileId, seasonYear);
  }, [isPaid, demoProfileId, seasonYear]);

  const onToggleFavorite = (campId) => {
    if (isPaid) return; // paid writes handled elsewhere; keep calendar read-only in paid mode
    toggleDemoFavorite(demoProfileId, campId, seasonYear);
  };

  const onToggleRegistered = (campId) => {
    if (isPaid) return; // keep read-only for paid mode here
    toggleDemoRegistered(demoProfileId, campId);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-20">
      <div className="max-w-md mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-slate-600" />
            <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Empty state */}
        {filteredSummaries.length === 0 ? (
          <Card className="p-6 border-slate-200">
            <div className="text-sm text-slate-600">
              No camps match your filters.
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                onClick={() => setFilters({ sport: "", state: "", divisions: [], positions: [], startDate: "", endDate: "" })}
              >
                Clear filters
              </Button>
              <Button onClick={() => nav(createPageUrl("Discover") + (!isPaid ? "?mode=demo" : ""))}>
                Go to Discover
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={g.day}>
                <div className="text-xs font-semibold text-slate-500 mb-2">
                  {g.day === "TBD" ? "TBD" : g.day}
                </div>

                <div className="space-y-3">
                  {g.rows.map((s) => {
                    const campId = String(s.camp_id);

                    const isFav = !isPaid && demoFavorites.includes(campId);
                    const isReg = !isPaid && isDemoRegistered(demoProfileId, campId);

                    // Adapt summary shape → CampCard expected props
                    const camp = {
                      camp_name: s.camp_name,
                      start_date: s.start_date,
                      end_date: s.end_date,
                      price: s.price,
                      city: s.city,
                      state: s.state,
                      position_ids: s.position_ids
                    };

                    const school = {
                      school_name: s.school_name,
                      division: s.school_division
                    };

                    const sport = {
                      name: s.sport_name
                    };

                    const pos = asArray(s.position_codes).map((code, idx) => ({
                      id: `${code || "POS"}_${idx}`,
                      position_code: code
                    }));

                    return (
                      <div key={campId} className="space-y-2">
                        <CampCard
                          camp={camp}
                          school={school}
                          sport={sport}
                          positions={pos}
                          isFavorite={isPaid ? s.intent_status === "favorite" : isFav}
                          isRegistered={isPaid ? s.intent_status === "registered" : isReg}
                          onFavoriteToggle={() => onToggleFavorite(campId)}
                          onClick={() => {
                            // CampDetail is optional; if it exists, this is the clean routing.
                            const url =
                              createPageUrl("CampDetail") +
                              `?id=${encodeURIComponent(campId)}` +
                              (!isPaid ? "&mode=demo" : "");
                            nav(url);
                          }}
                          mode={isPaid ? "paid" : "demo"}
                          disabledFavorite={isPaid} // calendar stays read-only for paid (writes elsewhere)
                        />

                        {/* Demo-only quick actions */}
                        {!isPaid && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => onToggleFavorite(campId)}
                            >
                              {isFav ? "Unfavorite" : "Favorite"}
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1"
                              onClick={() => onToggleRegistered(campId)}
                            >
                              {isReg ? "Unregister" : "Registered"}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

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
            setFilters({ sport: "", state: "", divisions: [], positions: [], startDate: "", endDate: "" });
          }}
        />
      </div>

      <BottomNav />
    </div>
  );
}
