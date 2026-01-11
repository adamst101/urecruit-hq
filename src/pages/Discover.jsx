// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, XCircle } from "lucide-react";

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

import { normalizeFilters, withinDateRange, normalizeState } from "../components/filters/filterUtils.jsx";

import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites, toggleDemoFavorite } from "../components/hooks/demoFavorites.jsx";
import { useWriteGate } from "../components/hooks/useWriteGate.jsx";

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

async function upsertFavoriteIntent({ athleteId, campId, makeFavorite }) {
  // Base44 entity methods vary; use resilient patterns.
  const aId = athleteId ? String(athleteId) : null;
  const cId = campId ? String(campId) : null;
  if (!aId || !cId) return;

  // Find existing intent record for this athlete+camp
  let existing = null;
  try {
    const rows = await base44.entities.CampIntent.filter({ athlete_id: aId, camp_id: cId });
    existing = Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    existing = null;
  }

  const nextStatus = makeFavorite ? "favorite" : null;

  if (existing) {
    const intentId = normId(existing) || existing?.id || existing?._id || null;

    // Try update by (id, patch)
    try {
      if (typeof base44.entities.CampIntent.update === "function") {
        await base44.entities.CampIntent.update(intentId, { status: nextStatus });
        return;
      }
    } catch {}

    // Try update by object
    try {
      if (typeof base44.entities.CampIntent.update === "function") {
        await base44.entities.CampIntent.update({ id: intentId, status: nextStatus });
        return;
      }
    } catch {}

    // If update unsupported, fall back to create a new record (not ideal, but prevents dead button)
    try {
      await base44.entities.CampIntent.create({
        athlete_id: aId,
        camp_id: cId,
        status: nextStatus
      });
    } catch {}
    return;
  }

  // Create new
  try {
    await base44.entities.CampIntent.create({
      athlete_id: aId,
      camp_id: cId,
      status: "favorite"
    });
  } catch {}
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();
  const writeGate = useWriteGate();

  // ---- effective mode: URL ?mode=demo always wins ----
  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const forceDemo = url.mode === "demo";
  const effectiveMode = forceDemo ? "demo" : season.mode;
  const isPaid = effectiveMode === "paid";

  // demo seasonYear can be overridden by URL ?season=
  const seasonYear = useMemo(() => {
    if (forceDemo && url.seasonYear) return url.seasonYear;
    return season.seasonYear;
  }, [forceDemo, url.seasonYear, season.seasonYear]);

  // Demo profile (scopes demo favorites keys)
  const { demoProfileId } = useDemoProfile();

  // ---- filters (shared FilterSheet contract) ----
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

  // Load filter picklists: sports + positions
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

  // Normalize filters once
  const nf = useMemo(() => normalizeFilters(filters), [filters]);

  // Paid athlete id
  const athleteId = isPaid ? (athleteProfile?.id ? String(athleteProfile.id) : null) : null;

  // Data source:
  // - Paid: useCampSummariesClient
  // - Demo: usePublicCampSummariesClient
  //
  // IMPORTANT: Do NOT pass state into the public query because state values in Camp records
  // are often inconsistent (TX vs Texas). We apply state filter client-side via normalizeState().
  const paidQuery = useCampSummariesClient({
    athleteId: athleteId || undefined,
    sportId: nf.sportId || undefined,
    enabled: isPaid && !!athleteId
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: nf.sportId || null,
    state: null, // ✅ client-side state filtering for reliability
    division: nf.division || null,
    positionIds: nf.positionIds || [],
    enabled: !isPaid
  });

  const loading =
    season.isLoading ||
    (isPaid && identityLoading) ||
    (isPaid ? paidQuery.isLoading : demoQuery.isLoading);

  // Demo favorites (local)
  const demoFavorites = useMemo(() => {
    if (isPaid) return [];
    return getDemoFavorites(demoProfileId, seasonYear);
  }, [isPaid, demoProfileId, seasonYear]);

  // Apply remaining filters client-side
  const rows = useMemo(() => {
    const base = isPaid ? asArray(paidQuery.data) : asArray(demoQuery.data);

    const state2 = nf.state ? String(nf.state) : null;

    return base.filter((c) => {
      const campState = normalizeState(c?.state || c?.camp_state || c?.school_state) || null;

      // State (client-side, normalized)
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

  const onToggleFavorite = useCallback(
    async (campId, currentIsFav) => {
      const cid = campId ? String(campId) : null;
      if (!cid) return;

      // Demo: local toggle (always allowed)
      if (!isPaid) {
        toggleDemoFavorite(demoProfileId, cid, seasonYear);
        // force rerender by touching state (cheap + safe)
        setFilters((prev) => ({ ...prev }));
        return;
      }

      // Paid: require backend write eligibility (account + athlete profile)
      await writeGate.write({
        next: createPageUrl("Discover"),
        demo: async () => {},
        paid: async () => {
          const makeFavorite = !currentIsFav;
          await upsertFavoriteIntent({ athleteId, campId: cid, makeFavorite });

          // Refresh composed read model
          try {
            qc.invalidateQueries({ queryKey: ["myCampsSummaries_client"], exact: false });
          } catch {}
        }
      });
    },
    [isPaid, demoProfileId, seasonYear, athleteId, qc, writeGate]
  );

  const renderBody = () => {
    if (loading) return <div className="py-10 text-center text-slate-500">Loading…</div>;

    // Paid mode needs profile
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

          const paidIsFav = String(r?.intent_status || "").toLowerCase() === "favorite";
          const isFav = isPaid ? paidIsFav : demoFavorites.includes(campId);

          const paidIsReg = String(r?.intent_status || "").toLowerCase() === "registered";

          return (
            <CampCard
              key={campId}
              camp={camp}
              school={school}
              sport={sport}
              positions={posObjs}
              isFavorite={isFav}
              isRegistered={paidIsReg}
              mode={isPaid ? "paid" : "demo"}
              disabledFavorite={false}
              onClick={() => {
                try {
                  nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(campId)}`);
                } catch {}
              }}
              onFavoriteToggle={() => onToggleFavorite(campId, isFav)}
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
            <div className="text-xl font-bold text-deep-navy">Discover</div>
            <div className="text-xs text-slate-500">
              {isPaid ? "Paid workspace" : `Demo season: ${seasonYear}`}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filter
          </Button>
        </div>

        {/* Filter summary */}
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
