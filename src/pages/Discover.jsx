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

import {
  normalizeFilters,
  withinDateRange,
  normalizeState
} from "../components/filters/filterUtils.jsx";

import CampCard from "../components/camps/CampCard.jsx";

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

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const urlWantsDemo = url.mode === "demo";

  // Best-practice behavior:
  // - If you’re entitled (paid), you should NOT remain in demo due to a lingering ?mode=demo.
  // - Demo is for non-entitled/anon. If a paid user hits demo URL, we normalize to paid.
  const isPaid = season?.mode === "paid";

  // If authed+not entitled, only allow staying on Discover in demo when URL explicitly requests demo.
  // Otherwise push to Subscribe.
  useEffect(() => {
    if (season?.isLoading) return;

    const authed = !!season?.accountId;

    if (authed && !isPaid && !urlWantsDemo) {
      const next = encodeURIComponent(createPageUrl("Discover"));
      nav(createPageUrl("Subscribe") + `?source=discover_gate&next=${next}`, { replace: true });
    }
  }, [season?.isLoading, season?.accountId, isPaid, urlWantsDemo, nav]);

  // If user becomes paid, strip demo query params so the page flips to paid mode immediately.
  useEffect(() => {
    if (season?.isLoading) return;
    if (!isPaid) return;

    // If URL contains demo indicators, normalize to the paid Discover URL.
    if (urlWantsDemo || url.seasonYear) {
      nav(createPageUrl("Discover"), { replace: true });
    }
  }, [season?.isLoading, isPaid, urlWantsDemo, url.seasonYear, nav]);

  // Effective mode:
  // - paid if entitled
  // - else demo only when URL explicitly requests demo
  // - else (anon) demo
  const effectiveMode = isPaid ? "paid" : "demo";

  const seasonYear = useMemo(() => {
    // Only honor URL season in demo mode; paid uses canonical seasonYear.
    if (!isPaid && urlWantsDemo && url.seasonYear) return url.seasonYear;
    return season?.seasonYear;
  }, [isPaid, urlWantsDemo, url.seasonYear, season?.seasonYear]);

  // ---- filters (FilterSheet contract) ----
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

  // ---- load filter picklists: sports + positions ----
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // Sports
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

      // Positions
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

  const athleteId =
    isPaid && athleteProfile?.id ? String(athleteProfile.id) : null;

  // Paid data: personalized to athlete
  const paidQuery = useCampSummariesClient({
    athleteId: athleteId || undefined,
    sportId: nf.sportId || undefined,
    enabled: isPaid && !!athleteId
  });

  // Demo data: public summaries
  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: nf.sportId || null,
    state: nf.state || null,
    division: nf.division || null,
    positionIds: nf.positionIds || [],
    enabled: !isPaid
  });

  const loading =
    season?.isLoading ||
    (isPaid && identityLoading) ||
    (isPaid ? paidQuery.isLoading : demoQuery.isLoading);

  const rows = useMemo(() => {
    const base = isPaid ? asArray(paidQuery.data) : asArray(demoQuery.data);

    const state2 = nf.state ? String(nf.state) : null;

    return base.filter((c) => {
      // State (always enforce client-side; protects against inconsistent source fields)
      if (state2) {
        const campState =
          normalizeState(c?.state || c?.camp_state || c?.school_state) || null;
        if (campState !== state2) return false;
      }

      // Division
      if (nf.division) {
        const div = c?.school_division || c?.division || null;
        if (String(div || "") !== String(nf.division)) return false;
      }

      // Positions
      if (nf.positionIds && nf.positionIds.length) {
        const campPos = asArray(c?.position_ids);
        const has = nf.positionIds.some((pid) =>
          campPos.map(String).includes(String(pid))
        );
        if (!has) return false;
      }

      // Date range
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
            Your paid workspace needs an athlete profile to personalize camps, targets, and intent.
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
              mode={effectiveMode}
              disabledFavorite={!isPaid}
              onClick={() => {
                try {
                  nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(campId)}`);
                } catch {}
              }}
              onFavoriteToggle={() => {
                // Keep writes centralized (useWriteGate / MyCamps) to avoid duplicating business logic.
              }}
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
