// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Filter, ArrowRight } from "lucide-react";

import { createPageUrl } from "../utils";
import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import CampCard from "../components/camps/CampCard";
import FilterSheet from "../components/filters/FilterSheet";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

import { getDemoFavorites, toggleDemoFavorite } from "../components/hooks/demoFavorites";
import { isDemoRegistered, toggleDemoRegistered } from "../components/hooks/demoRegistered";

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

const yStart = (y) => `${Number(y)}-01-01`;
const yNext = (y) => `${Number(y) + 1}-01-01`;

function inSeasonYear(dateStr, year) {
  if (!dateStr || !year) return true;
  const d = String(dateStr).slice(0, 10);
  const start = yStart(year);
  const next = yNext(year);
  return d >= start && d < next;
}

function dayKey(dateStr) {
  // YYYY-MM-DD
  if (!dateStr) return "TBD";
  return String(dateStr).slice(0, 10);
}

function prettyDay(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return String(dateStr || "TBD");
  }
}

async function upsertIntent({ athleteId, campId, patch }) {
  try {
    const rows = await base44.entities.CampIntent.filter({
      athlete_id: athleteId,
      camp_id: campId
    });

    const existing = Array.isArray(rows) && rows[0] ? rows[0] : null;

    if (!existing) {
      await base44.entities.CampIntent.create({
        athlete_id: athleteId,
        camp_id: campId,
        ...patch
      });
      return;
    }

    const id = normId(existing) || existing?.id;
    if (!id) return;

    await base44.entities.CampIntent.update(id, { ...patch });
  } catch {
    // ignore (calendar should never hard-fail)
  }
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
  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);

  // Filters (same contract as Discover)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // Queries
  const paidQuery = useCampSummariesClient({
    athleteId: isPaid ? athleteId : null,
    sportId: filters.sport || null,
    enabled: isPaid && !!athleteId
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: "", // apply client-side for multi-division support
    positionIds: asArray(filters.positions),
    enabled: !isPaid
  });

  const loading = season.isLoading || (isPaid ? paidQuery.isLoading : demoQuery.isLoading);
  const rowsRaw = isPaid ? paidQuery.data : demoQuery.data;

  // Demo state
  const demoProfileId = "default";
  const demoFavs = useMemo(() => getDemoFavorites(demoProfileId, seasonYear), [demoProfileId, seasonYear]);

  // Client-side filtering + season gating (keeps parity between paid/demo)
  const rows = useMemo(() => {
    const list = asArray(rowsRaw);

    const selectedDivs = asArray(filters.divisions).filter(Boolean);
    const selectedPos = asArray(filters.positions).map(String).filter(Boolean);
    const startDate = filters.startDate ? String(filters.startDate) : "";
    const endDate = filters.endDate ? String(filters.endDate) : "";

    return list
      .filter((r) => inSeasonYear(r?.start_date, seasonYear))
      .filter((r) => {
        if (filters.sport && String(r?.sport_id || "") !== String(filters.sport)) return false;
        if (filters.state && String(r?.state || "") !== String(filters.state)) return false;

        if (selectedDivs.length > 0) {
          const div = r?.school_division || r?.division || null;
          if (!div || !selectedDivs.includes(div)) return false;
        }

        if (selectedPos.length > 0) {
          const rPos = asArray(r?.position_ids).map(String).filter(Boolean);
          if (!selectedPos.some((p) => rPos.includes(p))) return false;
        }

        if (startDate || endDate) {
          const d = r?.start_date ? String(r.start_date).slice(0, 10) : "";
          if (!d) return false;
          if (startDate && d < startDate) return false;
          if (endDate && d > endDate) return false;
        }

        return true;
      })
      // sort ascending by start_date
      .sort((a, b) => String(a?.start_date || "").localeCompare(String(b?.start_date || "")));
  }, [rowsRaw, filters, seasonYear]);

  // Group by day
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = dayKey(r?.start_date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    return Array.from(map.entries()); // [day, rows[]]
  }, [rows]);

  const isFavorite = (r) => {
    const campId = String(r?.camp_id || "");
    if (!campId) return false;

    if (!isPaid) return demoFavs.includes(campId);
    return String(r?.intent_status || "").toLowerCase() === "favorite";
  };

  const isRegistered = (r) => {
    const campId = String(r?.camp_id || "");
    if (!campId) return false;

    if (!isPaid) return isDemoRegistered(demoProfileId, campId);
    return String(r?.intent_status || "").toLowerCase() === "registered";
  };

  const toggleFavorite = async (r) => {
    const campId = String(r?.camp_id || "");
    if (!campId) return;

    if (!isPaid) {
      toggleDemoFavorite(demoProfileId, campId, seasonYear);
      // force rerender
      setFilters((f) => ({ ...f }));
      return;
    }

    if (!athleteId) return;

    const nextFav = !isFavorite(r);
    await upsertIntent({
      athleteId,
      campId,
      patch: { status: nextFav ? "favorite" : null }
    });

    try {
      paidQuery.refetch?.();
    } catch {}
  };

  const toggleRegistered = async (r) => {
    const campId = String(r?.camp_id || "");
    if (!campId) return;

    if (!isPaid) {
      toggleDemoRegistered(demoProfileId, campId);
      setFilters((f) => ({ ...f }));
      return;
    }

    if (!athleteId) return;

    const next = !isRegistered(r);
    await upsertIntent({
      athleteId,
      campId,
      patch: { status: next ? "registered" : null }
    });

    try {
      paidQuery.refetch?.();
    } catch {}
  };

  if (loading) return null;

  // Paid mode but missing profile: guide user cleanly (no loops, no broken queries)
  if (isPaid && !athleteId) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 pb-24">
        <div className="max-w-md mx-auto space-y-4">
          <Card className="p-5 border-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-deep-navy flex items-center gap-2">
                  <CalendarDays className="w-5 h-5" />
                  Calendar
                </div>
                <div className="text-sm text-slate-600 mt-1">
                  Complete your athlete profile to sync your calendar to favorites and registrations.
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

  // Optional lists for FilterSheet (safe empty = still renders)
  const sports = [];
  const positions = [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-24">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xl font-bold text-deep-navy flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Calendar
            </div>
            <div className="text-sm text-slate-600">{seasonYear ? `Season ${seasonYear}` : "Season"}</div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline">{isPaid ? "Paid" : "Demo"}</Badge>
            <Button variant="outline" onClick={() => setFiltersOpen(true)}>
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>

        {/* Content */}
        {rows.length === 0 ? (
          <Card className="p-6 border-slate-200">
            <div className="text-sm text-slate-600">No camps match your filters.</div>
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
          <div className="space-y-5">
            {grouped.map(([day, items]) => (
              <div key={day} className="space-y-2">
                <div className="text-sm font-semibold text-slate-700">{day === "TBD" ? "Date TBD" : prettyDay(day)}</div>

                <div className="space-y-3">
                  {items.map((r) => {
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

                    const sport = { name: r?.sport_name };

                    const posCodes = asArray(r?.position_codes);
                    const posObjs = posCodes.map((c, i) => ({ id: `${i}`, position_code: c }));

                    return (
                      <div key={String(r?.camp_id || `${r?.school_name}-${r?.camp_name}`)} className="space-y-2">
                        <CampCard
                          camp={camp}
                          school={school}
                          sport={sport}
                          positions={posObjs}
                          isFavorite={isFavorite(r)}
                          isRegistered={isRegistered(r)}
                          onFavoriteToggle={() => toggleFavorite(r)}
                          mode={isPaid ? "paid" : "demo"}
                          onClick={() => {
                            // future: nav to CampDetail
                          }}
                        />

                        {/* Optional quick action row (kept small, consistent with gate model) */}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => toggleRegistered(r)}
                          >
                            {isRegistered(r) ? "Unregister" : "Mark Registered"}
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => toggleFavorite(r)}
                          >
                            {isFavorite(r) ? "Unfavorite" : "Favorite"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
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
