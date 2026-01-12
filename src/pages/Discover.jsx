// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal, XCircle } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

import { normalizeFilters, withinDateRange, normalizeState } from "../components/filters/filterUtils.jsx";

import CampCard from "../components/camps/CampCard.jsx";
import { getDemoDefaults, setDemoMode, clearDemoMode } from "../components/hooks/demoMode.jsx";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}
function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function getUrlParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const mode = sp.get("mode");
    const season = sp.get("season");
    return {
      mode: mode ? String(mode).toLowerCase() : null,
      seasonYear: season && Number.isFinite(Number(season)) ? Number(season) : null
    };
  } catch {
    return { mode: null, seasonYear: null };
  }
}

function stripDemoParams(search) {
  const sp = new URLSearchParams(search || "");
  sp.delete("mode");
  sp.delete("season");
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  // ---- effective mode (URL ?mode=demo always wins until we explicitly strip it) ----
  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const forceDemo = url.mode === "demo";

  const effectiveMode = forceDemo ? "demo" : season.mode; // "demo" | "paid"
  const isPaid = effectiveMode === "paid";

  // Demo seasonYear can be overridden by URL ?season=YYYY
  const { demoSeasonYear } = getDemoDefaults();
  const seasonYear = useMemo(() => {
    if (forceDemo) return url.seasonYear || demoSeasonYear;
    return season.seasonYear;
  }, [forceDemo, url.seasonYear, demoSeasonYear, season.seasonYear]);

  // ---- critical: if user IS entitled (paid) but URL forces demo, strip params and clear demo mode ----
  useEffect(() => {
    if (!season.isAuthenticated) return;

    // If they are paid, they should never be stuck in demo unless they intentionally keep ?mode=demo.
    // We interpret "paid + landed here after login" as not intentional -> strip demo params.
    if (season.mode === "paid" && forceDemo) {
      try {
        clearDemoMode?.();
      } catch {}
      const nextSearch = stripDemoParams(loc.search);
      nav(`${createPageUrl("Discover")}${nextSearch}`, { replace: true });
      return;
    }

    // If they are paid and not in forced demo, make sure demo storage is cleared.
    if (season.mode === "paid" && !forceDemo) {
      try {
        clearDemoMode?.();
      } catch {}
    }
  }, [season.isAuthenticated, season.mode, forceDemo, loc.search, nav]);

  // ---- entitlement gate (Option B) ----
  // If authenticated but not entitled AND not in forced demo:
  // send to Subscribe (so login alone isn't "access").
  useEffect(() => {
    if (!season.isAuthenticated) return;
    if (forceDemo) return;
    if (season.mode !== "paid") {
      const next = encodeURIComponent(createPageUrl("Discover"));
      nav(`${createPageUrl("Subscribe")}?next=${next}&reason=entitlement_required`, { replace: true });
    }
  }, [season.isAuthenticated, season.mode, forceDemo, nav]);

  // ---- filters ----
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  const clearFilters = () => {
    setFilters({
      sport: "",
      state: "",
      divisions: [],
      positions: [],
      startDate: "",
      endDate: ""
    });
  };

  const nf = useMemo(() => normalizeFilters(filters), [filters]);

  // ---- picklists: sports + positions ----
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // sports
      try {
        const rows = await base44.entities.Sport?.list?.();
        if (mounted) setSports(Array.isArray(rows) ? rows : []);
      } catch {
        try {
          const rows2 = await base44.entities.Sport?.filter?.({});
          if (mounted) setSports(Array.isArray(rows2) ? rows2 : []);
        } catch {
          if (mounted) setSports([]);
        }
      }

      // positions
      try {
        const rows = await base44.entities.Position?.list?.();
        if (mounted) setPositions(Array.isArray(rows) ? rows : []);
      } catch {
        try {
          const rows2 = await base44.entities.Position?.filter?.({});
          if (mounted) setPositions(Array.isArray(rows2) ? rows2 : []);
        } catch {
          if (mounted) setPositions([]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const positionsMap = useMemo(() => {
    const m = new Map();
    for (const p of asArray(positions)) {
      const id = normId(p);
      if (!id) continue;
      m.set(String(id), p);
    }
    return m;
  }, [positions]);

  // ---- data sources ----
  const athleteId = isPaid ? (athleteProfile?.id ? String(athleteProfile.id) : undefined) : undefined;

  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: nf.sportId || undefined,
    enabled: isPaid // do not require athleteId just to browse Discover
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: nf.sportId || null,
    state: nf.state || null,
    division: nf.division || null,
    positionIds: nf.positionIds || [],
    enabled: !isPaid
  });

  const loading = season.isLoading || (isPaid ? paidQuery.isLoading : demoQuery.isLoading);

  // ---- apply remaining filters client-side (keeps behavior consistent) ----
  const rows = useMemo(() => {
    const base = isPaid ? asArray(paidQuery.data) : asArray(demoQuery.data);

    const state2 = nf.state ? String(nf.state) : null;

    return base.filter((c) => {
      const campState = normalizeState(c?.state || c?.camp_state || c?.school_state) || null;

      // State
      if (state2 && campState !== state2) return false;

      // Division
      if (nf.division) {
        const div = c?.school_division || c?.division || null;
        if (String(div || "") !== String(nf.division)) return false;
      }

      // Positions
      if (nf.positionIds && nf.positionIds.length) {
        const campPos = asArray(c?.position_ids);
        const has = nf.positionIds.some((pid) => campPos.map(String).includes(String(pid)));
        if (!has) return false;
      }

      // Date range
      const start = c?.start_date || null;
      if (!withinDateRange(start, nf.startDate || "", nf.endDate || "")) return false;

      return true;
    });
  }, [isPaid, paidQuery.data, demoQuery.data, nf]);

  // ---- telemetry ----
  useEffect(() => {
    trackEvent({
      event_name: "discover_view",
      source: "discover",
      mode: isPaid ? "paid" : "demo",
      season_year: seasonYear
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = "Discover";

  const renderBody = () => {
    if (loading) return <div className="py-10 text-center text-slate-500">Loading…</div>;

    // If they got forced to Subscribe, they will be navigated away.
    // But just in case nav is slow, show a simple card.
    if (season.isAuthenticated && !forceDemo && season.mode !== "paid") {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">Subscription required</div>
          <div className="mt-1 text-sm text-slate-600">
            Your login is active, but you don’t have an entitlement for the current season.
          </div>
          <div className="mt-4">
            <Button onClick={() => nav(createPageUrl("Subscribe"))}>Go to Sign-Up</Button>
          </div>
        </Card>
      );
    }

    if (!rows.length) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">No camps found</div>
          <div className="mt-1 text-sm text-slate-600">
            Try clearing filters or widening your date range.
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={clearFilters}>
              <XCircle className="w-4 h-4 mr-2" />
              Clear filters
            </Button>
            <Button onClick={() => setFilterOpen(true)}>
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Edit filters
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {rows.map((r) => {
          const campId = String(r?.camp_id || r?.id || "");
          const schoolId = r?.school_id ? String(r.school_id) : null;
          const sportId = r?.sport_id ? String(r.sport_id) : null;

          const camp = {
            id: campId,
            camp_name: r?.camp_name,
            start_date: r?.start_date,
            end_date: r?.end_date,
            price: r?.price ?? null,
            link_url: r?.link_url ?? null,
            notes: r?.notes ?? null,
            city: r?.city ?? null,
            state: r?.state ?? null
          };

          const school = {
            id: schoolId,
            school_name: r?.school_name ?? null,
            division: r?.school_division ?? null,
            logo_url: r?.school_logo_url ?? null,
            city: r?.school_city ?? null,
            state: r?.school_state ?? null,
            conference: r?.school_conference ?? null
          };

          const sport = {
            id: sportId,
            name: r?.sport_name ?? null,
            sport_name: r?.sport_name ?? null
          };

          const posObjs = asArray(r?.position_ids)
            .map((pid) => positionsMap.get(String(pid)))
            .filter(Boolean);

          return (
            <CampCard
              key={campId}
              camp={camp}
              school={school}
              sport={sport}
              positions={posObjs}
              isFavorite={String(r?.intent_status || "").toLowerCase() === "favorite"}
              isRegistered={String(r?.intent_status || "").toLowerCase() === "registered"}
              mode={isPaid ? "paid" : "demo"}
              disabledFavorite={!isPaid}
              onClick={() => {
                try {
                  nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(campId)}`);
                } catch {}
              }}
              onFavoriteToggle={() => {}}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-md mx-auto px-4 pt-5 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xl font-bold text-deep-navy">{title}</div>
            <div className="text-xs text-slate-500">
              {isPaid ? "Paid workspace" : `Demo season: ${seasonYear}`}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setFilterOpen(true)}>
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>
        </div>

        {/* Active filter summary */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(nf.sportId || nf.state || nf.division || (nf.positionIds || []).length || nf.startDate || nf.endDate) ? (
            <>
              <span className="text-xs text-slate-500">Active filters:</span>
              {nf.state && (
                <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">
                  State: {nf.state}
                </span>
              )}
              {nf.division && (
                <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">
                  Division: {nf.division}
                </span>
              )}
              {(nf.positionIds || []).length > 0 && (
                <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">
                  Positions: {nf.positionIds.length}
                </span>
              )}
              {(nf.startDate || nf.endDate) && (
                <span className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">
                  Dates: {nf.startDate || "…"} → {nf.endDate || "…"}
                </span>
              )}
              <button
                type="button"
                className="text-xs underline text-slate-600"
                onClick={clearFilters}
              >
                Clear
              </button>
            </>
          ) : (
            <span className="text-xs text-slate-500">No filters applied.</span>
          )}
        </div>

        {renderBody()}

        <FilterSheet
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onFilterChange={setFilters}
          sports={sports}
          positions={positions}
          onApply={() => setFilterOpen(false)}
          onClear={() => {
            clearFilters();
            setFilterOpen(false);
          }}
        />
      </div>

      <BottomNav />
    </div>
  );
}
