// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal, XCircle } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
// demoFavorites/demoRegistered are handled inside useDemoCampSummaries
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { useDemoCampSummaries } from "@/components/hooks/useDemoCampSummaries.jsx";

import {
  normalizeFilters,
  withinDateRange,
  normalizeState,
  matchesDivision,
} from "../components/filters/filterUtils.jsx";

import CampCard from "../components/camps/CampCard.jsx";

/* -------------------------
   Helpers (MVP-safe)
------------------------- */
function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function getUrlParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const mode = sp.get("mode");
    const season = sp.get("season");
    return {
      mode: mode ? String(mode).toLowerCase() : null,
      seasonYear: season && Number.isFinite(Number(season)) ? Number(season) : null,
    };
  } catch {
    return { mode: null, seasonYear: null };
  }
}

function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;

  const st = String(row?.status || "").toLowerCase().trim();
  if (st === "inactive") return false;
  if (st === "active") return true;
  return true; // default to shown
}

/* -------------------------
   Routes (no createPageUrl)
------------------------- */
const ROUTES = {
  Profile: "/Profile",
  CampDetail: "/CampDetail",
};

export default function Calendar() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { demoProfileId } = useDemoProfile();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  // ---- effective mode (URL ?mode=demo always wins) ----
  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const forceDemo = url.mode === "demo";
  const effectiveMode = forceDemo ? "demo" : season?.mode; // "demo" | "paid"
  const isPaid = effectiveMode === "paid";

  // Demo seasonYear can be overridden by URL ?season=
  const seasonYear = useMemo(() => {
    if (forceDemo && url.seasonYear) return url.seasonYear;
    return season?.seasonYear;
  }, [forceDemo, url.seasonYear, season?.seasonYear]);

  // ---- filters (FilterSheet contract) ----
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: "",
  });

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

  // ✅ Paid Calendar: lock sport to athlete profile sport_id
  const athleteId = useMemo(() => {
    if (!isPaid) return null;
    const id = athleteProfile?.id ?? athleteProfile?._id ?? athleteProfile?.uuid ?? null;
    return id ? String(id) : null;
  }, [isPaid, athleteProfile]);

  const athleteSportId = useMemo(() => {
    const sid = athleteProfile?.sport_id ?? athleteProfile?.sportId ?? null;
    return sid != null ? String(sid) : "";
  }, [athleteProfile]);

  const paidMissingSport = useMemo(() => {
    return isPaid && !!athleteId && !athleteSportId;
  }, [isPaid, athleteId, athleteSportId]);

  // ✅ HARD ENFORCE sport in paid mode (prevents localStorage / stale filter drift)
  useEffect(() => {
    if (!isPaid) return;
    if (!athleteSportId) return;

    const cur = String(filters?.sport || "");
    if (cur !== athleteSportId) {
      setFilters((prev) => ({ ...prev, sport: athleteSportId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid, athleteSportId]);

  const openFiltersOrProfile = () => {
    if (paidMissingSport) {
      nav(ROUTES.Profile);
      return;
    }
    setFilterOpen(true);
  };

  // ---- load filter picklists: sports + positions ----
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      // Sports
      try {
        const rows = await base44?.entities?.Sport?.list?.();
        if (mounted) setSports(Array.isArray(rows) ? rows : []);
      } catch {
        try {
          const rows2 = await base44?.entities?.Sport?.filter?.({});
          if (mounted) setSports(Array.isArray(rows2) ? rows2 : []);
        } catch {
          if (mounted) setSports([]);
        }
      }

      // Positions
      try {
        const rows = await base44?.entities?.Position?.list?.();
        if (mounted) setPositions(Array.isArray(rows) ? rows : []);
      } catch {
        try {
          const rows2 = await base44?.entities?.Position?.filter?.({});
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

  // ---- normalize filters once (single source of truth) ----
  const nf = useMemo(() => normalizeFilters(filters), [filters]);

  // ---- data source: paid vs demo ----
  const paidQuery = useCampSummariesClient({
    athleteId: athleteId || undefined,
    sportId: nf?.sportId || undefined,
    enabled: isPaid && !!athleteId,
  });

  // Demo query: uses DemoCamp entity via useDemoCampSummaries
  const demoQuery = useDemoCampSummaries({
    seasonYear,
    demoProfileId: demoProfileId || "default",
    enabled: !isPaid,
  });

  const loading =
    !!season?.isLoading ||
    (isPaid && identityLoading) ||
    (isPaid ? !!paidQuery?.isLoading : !!demoQuery?.isLoading);

  // ---- apply filters client-side (source-agnostic) ----
  const rows = useMemo(() => {
    const base = isPaid ? asArray(paidQuery?.data) : asArray(demoQuery?.data);
    const wantedState = nf?.state ? String(nf.state) : null;
    const wantedDivisions = asArray(nf?.divisions).map(String).filter(Boolean);
    const wantedPositions = asArray(nf?.positionIds).map(String).filter(Boolean);

    const result = base
      .filter((c) => readActiveFlag(c) === true)
      .filter((c) => {
        // In demo mode, only show camps the user has favorited or registered
        if (!isPaid) {
          const st = String(c?.intent_status || "").toLowerCase();
          if (st !== "favorite" && st !== "registered" && st !== "completed") return false;
        }

        if (wantedState) {
          const campState =
            normalizeState(c?.state || c?.camp_state || c?.school_state) || null;
          if (campState !== wantedState) return false;
        }

        if (wantedDivisions.length) {
          if (!matchesDivision(c, wantedDivisions)) return false;
        }

        if (wantedPositions.length) {
          const campPos = asArray(c?.position_ids).map(String);
          const hasAny = wantedPositions.some((pid) => campPos.includes(pid));
          if (!hasAny) return false;
        }

        const campStart = c?.start_date || null;
        const campEnd = c?.end_date || null;
        if (!withinDateRange(campStart, nf?.startDate || "", nf?.endDate || "", campEnd)) return false;

        return true;
      });

    // Sort by camp start date ascending
    result.sort((a, b) => {
      const da = String(a?.start_date || "9999").slice(0, 10);
      const db = String(b?.start_date || "9999").slice(0, 10);
      return da.localeCompare(db);
    });

    return result;
  }, [isPaid, paidQuery?.data, demoQuery?.data, nf]);

  const title = "Calendar";

  const renderBody = () => {
    if (loading) return <div className="py-10 text-center text-[#9ca3af]">Loading…</div>;

    // Paid mode needs profile to be meaningful
    if (isPaid && !athleteId) {
      return (
        <Card className="p-5 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Complete your athlete profile</div>
          <div className="mt-1 text-sm text-[#9ca3af]">
            Your paid workspace needs an athlete profile to personalize camps, targets, and intent.
          </div>
          <div className="mt-4">
            <Button className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]" onClick={() => nav(ROUTES.Profile)}>Go to Profile</Button>
          </div>
        </Card>
      );
    }

    // ✅ Paid mode: athlete exists but sport missing
    if (paidMissingSport) {
      return (
        <Card className="p-5 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Complete your profile</div>
          <div className="mt-1 text-sm text-[#9ca3af]">
            Add your sport so Calendar can lock results to the right camps.
          </div>
          <div className="mt-4">
            <Button className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]" onClick={() => nav(ROUTES.Profile)}>Go to Profile</Button>
          </div>
        </Card>
      );
    }

    if (!rows.length) {
      return (
        <Card className="p-5 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">No camps found</div>
          <div className="mt-1 text-sm text-[#9ca3af]">
            Try clearing filters or widening your date range.
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]" onClick={clearFilters}>
              <XCircle className="w-4 h-4 mr-2" />
              Clear filters
            </Button>
            <Button className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]" onClick={openFiltersOrProfile}>
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              {paidMissingSport ? "Complete Profile" : "Edit filters"}
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
            state: r?.state ?? null,
          };

          const school = {
            id: schoolId,
            school_name: r?.school_name ?? null,
            division: r?.school_division ?? null,
            logo_url: r?.school_logo_url ?? null,
            city: r?.school_city ?? null,
            state: r?.school_state ?? null,
            conference: r?.school_conference ?? null,
          };

          const sport = {
            id: sportId,
            name: r?.sport_name ?? null,
            sport_name: r?.sport_name ?? null,
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
                  nav(`${ROUTES.CampDetail}?id=${encodeURIComponent(campId)}`);
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
    <div className="min-h-screen bg-[#0a0e1a] text-[#f9fafb]">
      <div className="max-w-md mx-auto px-4 pt-5 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xl font-bold text-[#f9fafb]">{title}</div>
            <div className="text-xs text-[#9ca3af]">
              {isPaid ? "Paid workspace" : `Demo season: ${seasonYear}`}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={openFiltersOrProfile} className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#111827]">
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              {paidMissingSport ? "Complete Profile" : "Filter"}
            </Button>
          </div>
        </div>

        {/* Active filter summary */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(nf?.sportId ||
            nf?.state ||
            (nf?.divisions || []).length ||
            (nf?.positionIds || []).length ||
            nf?.startDate ||
            nf?.endDate) ? (
            <>
              <span className="text-xs text-[#9ca3af]">Active filters:</span>

              {nf?.state && (
                <span className="text-xs px-2 py-1 rounded bg-[#111827] text-[#f9fafb] border border-[#1f2937]">
                  State: {nf.state}
                </span>
              )}

              {(nf?.divisions || []).length > 0 && (
                <span className="text-xs px-2 py-1 rounded bg-[#111827] text-[#f9fafb] border border-[#1f2937]">
                  Divisions: {nf.divisions.length}
                </span>
              )}

              {(nf?.positionIds || []).length > 0 && (
                <span className="text-xs px-2 py-1 rounded bg-[#111827] text-[#f9fafb] border border-[#1f2937]">
                  Positions: {nf.positionIds.length}
                </span>
              )}

              {(nf?.startDate || nf?.endDate) && (
                <span className="text-xs px-2 py-1 rounded bg-[#111827] text-[#f9fafb] border border-[#1f2937]">
                  Dates: {nf.startDate || "…"} → {nf.endDate || "…"}
                </span>
              )}

              <button
                type="button"
                className="text-xs underline text-[#e8a020]"
                onClick={clearFilters}
              >
                Clear
              </button>
            </>
          ) : (
            <span className="text-xs text-[#9ca3af]">No filters applied.</span>
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
          // ✅ Paid: hide sport dropdown + force sport from athlete profile
          lockSportId={isPaid && athleteSportId ? athleteSportId : ""}
        />
      </div>

      <BottomNav />
    </div>
  );
}