// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Filter } from "lucide-react";

import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import RouteGuard from "../components/auth/RouteGuard";
import BottomNav from "../components/navigation/BottomNav";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useDemoProfile } from "../components/hooks/useDemoProfile";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

import FilterSheet from "../components/filters/FilterSheet";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function toDateKey(d) {
  try {
    if (!d) return null;
    const s = String(d).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  } catch {
    return null;
  }
}

export default function Calendar() {
  const nav = useNavigate();

  // Access + identity
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();
  const { loaded: demoLoaded, demoProfile, demoProfileId } = useDemoProfile();

  const isPaid = season.mode === "paid";
  const athleteId = isPaid ? normId(athleteProfile) : null;

  // Filters (shared UI; demo actually uses these)
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // Effective sport id:
  // - Paid: use UI selection if set; otherwise let it be empty (all)
  // - Demo: default to demoProfile.sport_id if UI not chosen
  const effectiveSportId = useMemo(() => {
    const uiSport = filters.sport ? String(filters.sport) : "";
    if (uiSport) return uiSport;

    const demoSport = demoProfile?.sport_id ? String(normId(demoProfile.sport_id)) : "";
    return demoSport || "";
  }, [filters.sport, demoProfile?.sport_id]);

  // Demo-only filters
  const demoState = useMemo(() => {
    const ui = filters.state ? String(filters.state) : "";
    return ui || (demoProfile?.state || "");
  }, [filters.state, demoProfile?.state]);

  const demoDivision = useMemo(() => {
    // your demoProfile uses single division; FilterSheet uses divisions[]
    const ui = Array.isArray(filters.divisions) && filters.divisions[0] ? String(filters.divisions[0]) : "";
    return ui || (demoProfile?.division || "");
  }, [filters.divisions, demoProfile?.division]);

  const demoPositionIds = useMemo(() => {
    const ui = Array.isArray(filters.positions) ? filters.positions.map(String).filter(Boolean) : [];
    if (ui.length) return ui;

    const dp = Array.isArray(demoProfile?.position_ids)
      ? demoProfile.position_ids.map((x) => String(normId(x))).filter(Boolean)
      : [];
    return dp;
  }, [filters.positions, demoProfile?.position_ids]);

  // DATA: paid vs demo
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: effectiveSportId || undefined,
    enabled: isPaid && !!athleteId
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: effectiveSportId || undefined,
    state: demoState || undefined,
    division: demoDivision || undefined,
    positionIds: demoPositionIds,
    enabled: !isPaid && demoLoaded
  });

  const rows = (isPaid ? paidQuery.data : demoQuery.data) || [];
  const loading = isPaid ? paidQuery.isLoading : demoQuery.isLoading;

  // Group by date for a simple “calendar list” view (good enough for now)
  const byDate = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const k = toDateKey(r?.start_date);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    const keys = Array.from(map.keys()).sort();
    return keys.map((k) => ({ date: k, items: map.get(k) }));
  }, [rows]);

  const [filterOpen, setFilterOpen] = useState(false);

  return (
    <RouteGuard requireAuth={false} requirePaid={false} requireProfile={false}>
      <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-20">
        <div className="max-w-md mx-auto px-4 pt-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-slate-600" />
                <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
                {!isPaid && <Badge variant="outline">Demo</Badge>}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                {isPaid
                  ? "Your season schedule across saved and registered camps."
                  : "Demo schedule based on your demo preferences."}
              </div>
            </div>

            <Button variant="outline" onClick={() => setFilterOpen(true)}>
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>

          {/* Body */}
          {loading ? (
            <Card className="p-6 border-slate-200">
              <div className="text-sm text-slate-600">Loading calendar…</div>
            </Card>
          ) : byDate.length === 0 ? (
            <Card className="p-6 border-slate-200">
              <div className="text-sm text-slate-600">
                No camps found for your current filters.
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" onClick={() => setFilterOpen(true)}>
                  Adjust Filters
                </Button>
                <Button
                  onClick={() => nav(createPageUrl("Discover") + (!isPaid ? "?mode=demo" : ""))}
                >
                  Go to Discover
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {byDate.map((g) => (
                <Card key={g.date} className="p-4 border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-deep-navy">{g.date}</div>
                    <div className="text-xs text-slate-500">{g.items.length} camp(s)</div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {g.items.map((c) => (
                      <button
                        key={String(c.camp_id)}
                        type="button"
                        className="w-full text-left rounded-md p-3 bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition"
                        onClick={() => {
                          const url =
                            createPageUrl("CampDetail") +
                            `?id=${encodeURIComponent(String(c.camp_id))}` +
                            (!isPaid ? `&mode=demo&demoProfileId=${encodeURIComponent(String(demoProfileId || "default"))}` : "");
                          nav(url);
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-deep-navy truncate">
                              {c.school_name || "Unknown School"}
                            </div>
                            <div className="text-xs text-slate-600 truncate">
                              {c.camp_name || "Camp"}
                            </div>
                          </div>
                          {c.school_division && (
                            <Badge className="bg-slate-900 text-white text-xs">
                              {c.school_division}
                            </Badge>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Filter sheet */}
        <FilterSheet
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onFilterChange={setFilters}
          positions={[]}
          sports={[]}
          onApply={() => setFilterOpen(false)}
          onClear={() => {
            setFilters({
              sport: "",
              state: "",
              divisions: [],
              positions: [],
              startDate: "",
              endDate: ""
            });
            setFilterOpen(false);
          }}
        />

        <BottomNav />
      </div>
    </RouteGuard>
  );
}
