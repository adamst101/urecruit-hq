// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Filter } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import RouteGuard from "../components/auth/RouteGuard.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";

import CampCard from "../components/camps/CampCard.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites, toggleDemoFavorite } from "../components/hooks/demoFavorites.jsx";
import { isDemoRegistered } from "../components/hooks/demoRegistered.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

/* ------------------ tracking ------------------ */
function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

/* ------------------ helpers ------------------ */
function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function normalizeState(v) {
  if (!v) return "";
  return String(v).trim().toUpperCase();
}
function normalizeDivision(v) {
  if (!v) return "";
  return String(v).trim();
}
function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function inRange(dateStr, start, end) {
  if (!dateStr) return true;
  const d = String(dateStr);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}
function dateKey(d) {
  // Expect YYYY-MM-DD; if anything else, best-effort
  if (!d) return "TBD";
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}
function friendlyDate(k) {
  if (!k || k === "TBD") return "TBD";
  // k = YYYY-MM-DD
  try {
    const [y, m, d] = k.split("-").map((x) => Number(x));
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return k;
  }
}

export default function Calendar() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  // URL override for demo: ?mode=demo&season=YYYY
  const urlMode = useMemo(() => {
    try {
      const m = sp.get("mode");
      return m ? String(m).toLowerCase() : null;
    } catch {
      return null;
    }
  }, [sp]);

  const forceDemo = urlMode === "demo";

  const urlSeasonYear = useMemo(() => {
    try {
      return safeNum(sp.get("season"));
    } catch {
      return null;
    }
  }, [sp]);

  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // Paid only when NOT forcing demo and season says paid and we have athlete context
  const isPaid = !forceDemo && season.mode === "paid" && !!athleteId;

  // Season year: demo can be forced to a specific year via URL
  const seasonYear = forceDemo ? (urlSeasonYear || season.demoYear) : season.seasonYear;

  // Demo profile (local personalization + favorites scope)
  const { loaded: demoLoaded, demoProfileId } = useDemoProfile();

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "", // sport_id
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
        const [s, p] = await Promise.all([
          base44.entities.Sport.list?.() || base44.entities.Sport.filter?.({}) || [],
          base44.entities.Position.list?.() || base44.entities.Position.filter?.({}) || [],
        ]);
        if (!mounted) return;
        setSports(Array.isArray(s) ? s : []);
        setPositions(Array.isArray(p) ? p : []);
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

  // Data sources:
  // - Paid: athlete-scoped summaries (sport can be server-side)
  // - Demo: public summaries (sport can be server-side); EVERYTHING else filter client-side
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport ? String(filters.sport) : null,
    enabled: isPaid && !!athleteId,
    limit: 1200,
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport ? String(filters.sport) : null,
    state: "", // IMPORTANT: client-side state filtering (data may be inconsistent)
    division: "", // client-side
    positionIds: [], // client-side
    enabled: !isPaid, // includes forced demo or true demo
    limit: 1200,
  });

  const rawRows = useMemo(() => {
    const rows = isPaid ? paidQuery.data : demoQuery.data;
    return Array.isArray(rows) ? rows : [];
  }, [isPaid, paidQuery.data, demoQuery.data]);

  // Demo favorites local
  const demoSeasonKey = String(seasonYear || "");
  const [demoFavs, setDemoFavs] = useState([]);

  useEffect(() => {
    if (isPaid) return;
    if (!demoLoaded) return;
    setDemoFavs(getDemoFavorites(demoProfileId, demoSeasonKey));
  }, [isPaid, demoLoaded, demoProfileId, demoSeasonKey]);

  // Apply filters client-side (authoritative)
  const filteredRows = useMemo(() => {
    const stateNeedle = normalizeState(filters.state);
    const selectedDivs = asArray(filters.divisions).map(normalizeDivision).filter(Boolean);
    const selectedPos = new Set(asArray(filters.positions).map(String).filter(Boolean));

    const startDate = filters.startDate ? String(filters.startDate) : "";
    const endDate = filters.endDate ? String(filters.endDate) : "";

    return rawRows.filter((r) => {
      // State
      if (stateNeedle) {
        const rs = normalizeState(r?.state || r?.school_state || "");
        if (!rs) return false;
        if (rs !== stateNeedle) return false;
      }

      // Division
      if (selectedDivs.length) {
        const div = normalizeDivision(r?.school_division || r?.division || "");
        if (!div) return false;
        if (!selectedDivs.includes(div)) return false;
      }

      // Positions
      if (selectedPos.size) {
        const ids = asArray(r?.position_ids).map(String);
        const hit = ids.some((x) => selectedPos.has(x));
        if (!hit) return false;
      }

      // Date range (anchor on start_date)
      if (!inRange(r?.start_date, startDate, endDate)) return false;

      return true;
    });
  }, [rawRows, filters]);

  // Group by start date for a simple “calendar list”
  const grouped = useMemo(() => {
    const m = new Map();
    for (const r of filteredRows) {
      const k = dateKey(r?.start_date);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }

    const keys = Array.from(m.keys()).sort((a, b) => {
      if (a === "TBD") return 1;
      if (b === "TBD") return -1;
      return String(a).localeCompare(String(b));
    });

    return keys.map((k) => ({ date: k, items: m.get(k) || [] }));
  }, [filteredRows]);

  // Track view once
  useEffect(() => {
    const key = `evt_calendar_viewed_${isPaid ? "paid" : "demo"}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "calendar_viewed",
      mode: isPaid ? "paid" : "demo",
      season_year: seasonYear,
      account_id: season.accountId || null,
      athlete_id: athleteId || null,
      source: "calendar",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onOpenCamp = (row) => {
    const campId = String(row?.camp_id || row?.id || "");
    if (!campId) return;

    const base = createPageUrl("CampDetail");
    const url = `${base}?id=${encodeURIComponent(campId)}${!isPaid ? `&mode=demo&season=${encodeURIComponent(String(seasonYear))}` : ""}`;
    nav(url);
  };

  const onFavoriteToggle = async (row) => {
    const campId = String(row?.camp_id || row?.id || "");
    if (!campId) return;

    if (!isPaid) {
      const next = toggleDemoFavorite(demoProfileId, campId, demoSeasonKey);
      setDemoFavs(next);
      trackEvent({ event_name: "demo_favorite_toggled", camp_id: campId, season_year: seasonYear, source: "calendar" });
      return;
    }

    // Paid: toggle CampIntent.status favorite/none (best effort)
    try {
      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteId,
        camp_id: campId,
      });

      const one = Array.isArray(existing) ? existing[0] : null;

      if (one?.id) {
        const nextStatus = one?.status === "favorite" ? "none" : "favorite";
        await base44.entities.CampIntent.update(one.id, { status: nextStatus });
      } else {
        await base44.entities.CampIntent.create({
          athlete_id: athleteId,
          camp_id: campId,
          status: "favorite",
        });
      }
    } catch {}

    try {
      paidQuery.refetch?.();
    } catch {}
  };

  const clearFilters = () => {
    setFilters({
      sport: "",
      state: "",
      divisions: [],
      positions: [],
      startDate: "",
      endDate: "",
    });
  };

  const applyFilters = () => {
    setFiltersOpen(false);
  };

  const loading = isPaid ? paidQuery.isLoading : demoQuery.isLoading;
  const error = isPaid ? paidQuery.isError : demoQuery.isError;

  return (
    <RouteGuard requireAuth={false} requirePaid={false} requireProfile={false}>
      <div className="min-h-screen bg-surface pb-20">
        <div className="max-w-md mx-auto px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-extrabold text-deep-navy">Calendar</div>
              <div className="text-xs text-slate-500">
                {!isPaid ? `Demo season ${seasonYear}` : `Season ${seasonYear}`}
              </div>
            </div>

            <Button variant="outline" onClick={() => setFiltersOpen(true)}>
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>

          <Card className="p-3 border-slate-200 bg-white">
            <div className="text-sm text-slate-600">
              {!isPaid ? (
                <span>
                  You’re in <span className="font-semibold">demo</span>. Filters + favorites are local to this device.
                </span>
              ) : (
                <span>
                  You’re in <span className="font-semibold">paid</span>. Favorites sync to your account.
                </span>
              )}
            </div>
          </Card>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading calendar…</div>
          ) : error ? (
            <div className="py-10 text-center text-sm text-rose-600">Couldn’t load calendar.</div>
          ) : grouped.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No camps found. Try clearing filters.
              <div className="mt-3">
                <Button variant="outline" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((g) => (
                <div key={g.date} className="space-y-2">
                  <div className="text-sm font-semibold text-slate-700">
                    {friendlyDate(g.date)}
                  </div>

                  <div className="space-y-3">
                    {g.items.map((r) => {
                      const campId = String(r?.camp_id || r?.id || "");
                      const isFav = !isPaid ? demoFavs.includes(campId) : String(r?.intent_status || "") === "favorite";
                      const isReg = !isPaid ? isDemoRegistered(demoProfileId, campId) : String(r?.intent_status || "") === "registered";

                      return (
                        <CampCard
                          key={campId}
                          camp={{
                            camp_name: r.camp_name,
                            start_date: r.start_date,
                            end_date: r.end_date,
                            price: r.price,
                            city: r.city,
                            state: r.state,
                          }}
                          school={{
                            school_name: r.school_name,
                            school_division: r.school_division,
                          }}
                          sport={{
                            sport_name: r.sport_name,
                          }}
                          positions={(asArray(r.position_ids) || []).map((id) => ({ id }))}
                          isFavorite={isFav}
                          isRegistered={isReg}
                          mode={!isPaid ? "demo" : "paid"}
                          onFavoriteToggle={() => onFavoriteToggle(r)}
                          onClick={() => onOpenCamp(r)}
                        />
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
          positions={positions}
          sports={sports}
          onApply={applyFilters}
          onClear={clearFilters}
        />

        <BottomNav />
      </div>
    </RouteGuard>
  );
}
