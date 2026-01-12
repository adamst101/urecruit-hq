// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";

import { createPageUrl } from "../utils";
import { base44 } from "../api/base44Client";

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

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function getUrlParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const mode = sp.get("mode"); // "demo" may be present from Home demo CTA
    const season = sp.get("season");
    return {
      mode: mode ? String(mode).toLowerCase() : null,
      seasonYear: season && Number.isFinite(Number(season)) ? Number(season) : null
    };
  } catch {
    return { mode: null, seasonYear: null };
  }
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const forceDemo = url.mode === "demo";

  // Paid entitlement ALWAYS wins unless URL explicitly forces demo.
  const effectiveMode = forceDemo ? "demo" : (season.mode === "paid" ? "paid" : "demo");
  const isPaid = effectiveMode === "paid";

  const seasonYear = useMemo(() => {
    if (!isPaid && forceDemo && url.seasonYear) return url.seasonYear;
    return season.seasonYear;
  }, [isPaid, forceDemo, url.seasonYear, season.seasonYear]);

  // If user becomes entitled while sitting on a demo URL, normalize URL to paid view.
  useEffect(() => {
    if (season.isLoading) return;
    if (!isPaid) return;
    if (!forceDemo) return;
    nav(createPageUrl("Discover"), { replace: true });
  }, [season.isLoading, isPaid, forceDemo, nav]);

  // If authenticated but not entitled, route to Subscribe
  useEffect(() => {
    if (season.isLoading) return;
    if (!season.isAuthenticated) return;
    if (season.mode === "paid") return;
    nav(createPageUrl("Subscribe") + `?source=discover_gate`, { replace: true });
  }, [season.isLoading, season.isAuthenticated, season.mode, nav]);

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

  // ---- picklists ----
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
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

  const nf = useMemo(() => normalizeFilters(filters), [filters]);

  // ---- data sources ----
  const athleteId = isPaid ? (athleteProfile?.id ? String(athleteProfile.id) : null) : null;

  const paidQuery = useCampSummariesClient({
    athleteId: athleteId || undefined,
    sportId: nf.sportId || undefined,
    enabled: isPaid && !!athleteId
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: nf.sportId || null,
    state: nf.state || null,
    division: nf.division || null,
    positionIds: nf.positionIds || [],
    enabled: !isPaid
  });

  const loading =
    season.isLoading ||
    (isPaid && identityLoading) ||
    (isPaid ? paidQuery.isLoading : demoQuery.isLoading);

  const rows = useMemo(() => {
    const base = isPaid ? asArray(paidQuery.data) : asArray(demoQuery.data);
    const state2 = nf.state ? String(nf.state) : null;

    return base.filter((c) => {
      const campState = normalizeState(c?.state || c?.camp_state || c?.school_state) || null;

      if (state2 && campState !== state2) return false;

      if (nf.division) {
        const div = c?.school_division || c?.division || null;
        if (String(div || "") !== String(nf.division)) return false;
      }

      if (nf.positionIds && nf.positionIds.length) {
        const campPos = asArray(c?.position_ids);
        const has = nf.positionIds.some((pid) => campPos.map(String).includes(String(pid)));
        if (!has) return false;
      }

      const start = c?.start_date || null;
      if (!withinDateRange(start, nf.startDate || "", nf.endDate || "")) return false;

      return true;
    });
  }, [isPaid, paidQuery.data, demoQuery.data, nf]);

  const title = "Discover";

  const renderBody = () => {
    if (loading) return <div className="py-10 text-center text-slate-500">Loading…</div>;

    if (isPaid && !athleteId) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">Complete your athlete profile</div>
          <div className="mt-1 text-sm text-slate-600">
            Your paid workspace needs an athlete profile to personalize results.
          </div>
          <div className="mt-4">
            <Button onClick={() => nav(createPageUrl("Profile"))}>Go to Profile</Button>
          </div>
        </Card>
      );
    }

    if (!rows.length) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">No camps found</div>
          <div className="mt-1 text-sm text-slate-600">Try clearing filters.</div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={clearFilters}>
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
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xl font-bold text-deep-navy">{title}</div>
            <div className="text-xs text-slate-500">
              {isPaid ? "Paid workspace" : `Demo season: ${seasonYear}`}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filter
          </Button>
        </div>

        {/* Truth banner */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span><b>effectiveMode:</b> {effectiveMode}</span>
            <span><b>season.mode:</b> {season.mode}</span>
            <span><b>isAuthenticated:</b> {String(!!season.isAuthenticated)}</span>
            <span><b>accountId:</b> {season.accountId ? String(season.accountId) : "null"}</span>
            <span><b>entitled:</b> {String(!!season.entitlement)}</span>
            <span><b>forceDemo(url):</b> {String(!!forceDemo)}</span>
          </div>
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
