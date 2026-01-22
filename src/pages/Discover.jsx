// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal, RefreshCcw } from "lucide-react";

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

import {
  normalizeFilters,
  withinDateRange,
  normalizeState
} from "../components/filters/filterUtils.jsx";

import CampCard from "../components/camps/CampCard.jsx";

const FORCE_DEMO_SESSION_KEY = "force_demo_session_v1";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function forceDemoSessionOn() {
  try {
    return sessionStorage.getItem(FORCE_DEMO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function getUrlParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const mode = sp.get("mode"); // "demo"
    const season = sp.get("season"); // "YYYY"
    const src = sp.get("src");
    const debug = sp.get("debug");
    return {
      mode: mode ? String(mode).toLowerCase() : null,
      seasonYear: season && Number.isFinite(Number(season)) ? Number(season) : null,
      src: src ? String(src) : null,
      debug: debug === "1"
    };
  } catch {
    return { mode: null, seasonYear: null, src: null, debug: false };
  }
}

function normalizeNext(pathname, search) {
  const p = (pathname || "") + (search || "");
  try {
    return encodeURIComponent(p || createPageUrl("Discover"));
  } catch {
    return encodeURIComponent(createPageUrl("Discover"));
  }
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading, isError: identityError } = useAthleteIdentity();

  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const nextParam = useMemo(() => normalizeNext(loc.pathname, loc.search), [loc.pathname, loc.search]);

  // Demo can be forced by URL OR session override (testing)
  const forceDemoUrl = url.mode === "demo";
  const forceDemoSession = useMemo(() => forceDemoSessionOn(), []);
  const forceDemo = forceDemoUrl || forceDemoSession;

  // Paid wins only when demo isn't forced
  const effectiveMode = forceDemo ? "demo" : (season.mode === "paid" ? "paid" : "demo");
  const isPaid = effectiveMode === "paid";

  // seasonYear used by demo query (URL wins for demo)
  const seasonYear = useMemo(() => {
    if (!isPaid && forceDemo && url.seasonYear) return url.seasonYear;
    return season.seasonYear;
  }, [isPaid, forceDemo, url.seasonYear, season.seasonYear]);

  /* ------------------------------------------------------------------
     ✅ INCORPORATED: REQUESTED-SEASON GATE (your snippet)
     Goal:
     - Only gate when user explicitly requests a non-demo season via ?season=YYYY
     - Allow demoYear request without auth
     - Use window.location.replace() for Base44 bulletproof redirects
  ------------------------------------------------------------------ */
  useEffect(() => {
    if (season.isLoading) return;

    const requested = url.seasonYear; // from ?season=YYYY
    const demoYear = season.demoYear;

    // Explicit demo always wins (URL or session) — do not gate
    if (forceDemo) return;

    // No season requested → allow existing behavior
    if (!requested) return;

    // Requesting demo year is allowed without auth
    if (demoYear && String(requested) === String(demoYear)) return;

    // Non-demo season requested → gate (HARD redirect)
    if (!season.accountId) {
      const target = createPageUrl("Home") + `?signin=1&next=${nextParam}`;
      window.location.replace(target);
      return;
    }

    if (!season.hasAccess) {
      const target =
        createPageUrl("Subscribe") +
        `?season=${encodeURIComponent(requested)}` +
        `&source=${encodeURIComponent("discover_season_gate")}` +
        `&next=${nextParam}`;

      window.location.replace(target);
      return;
    }
  }, [
    season.isLoading,
    season.accountId,
    season.hasAccess,
    season.demoYear,
    forceDemo,
    url.seasonYear,
    nextParam
  ]);

  // If user becomes paid while sitting on an explicit demo URL, normalize to paid Discover
  // But don't override session-based demo testing
  useEffect(() => {
    if (season.isLoading) return;
    if (!isPaid) return;
    if (!forceDemoUrl) return;
    if (forceDemoSession) return;

    nav(createPageUrl("Discover"), { replace: true });
  }, [season.isLoading, isPaid, forceDemoUrl, forceDemoSession, nav]);

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
  const [picklistErr, setPicklistErr] = useState("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      setPicklistErr("");

      // Sports
      try {
        const rows = await base44.entities.Sport?.list?.();
        if (mounted) setSports(Array.isArray(rows) ? rows : []);
      } catch {
        try {
          const rows2 = await base44.entities.Sport?.filter?.({});
          if (mounted) setSports(Array.isArray(rows2) ? rows2 : []);
        } catch (e) {
          if (mounted) {
            setSports([]);
            setPicklistErr(String(e?.message || e || "Failed to load sports"));
          }
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
        } catch (e) {
          if (mounted) {
            setPositions([]);
            setPicklistErr(String(e?.message || e || "Failed to load positions"));
          }
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

  const paidEnabled = isPaid && !!athleteId;
  const demoEnabled = !isPaid;

  const paidQuery = useCampSummariesClient({
    athleteId: athleteId || undefined,
    sportId: nf.sportId || undefined,
    enabled: paidEnabled
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: nf.sportId || null,
    state: nf.state || null,
    division: nf.division || null,
    positionIds: nf.positionIds || [],
    enabled: demoEnabled
  });

  const loading =
    season.isLoading ||
    (isPaid && identityLoading) ||
    (isPaid ? paidQuery.isLoading : demoQuery.isLoading);

  const dataError = useMemo(() => {
    const err =
      (isPaid ? paidQuery.error : demoQuery.error) ||
      (isPaid && identityError ? "Profile lookup failed." : "") ||
      picklistErr ||
      "";
    return err ? String(err) : "";
  }, [isPaid, paidQuery.error, demoQuery.error, identityError, picklistErr]);

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
    if (loading) {
      return <div className="py-10 text-center text-slate-500">Loading…</div>;
    }

    if (dataError) {
      return (
        <Card className="p-5 border-rose-200 bg-rose-50">
          <div className="text-lg font-semibold text-rose-800">Discover couldn’t load</div>
          <div className="mt-2 text-sm text-rose-800/90 break-words">{dataError}</div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => window.location.reload()} className="gap-2">
              <RefreshCcw className="w-4 h-4" />
              Reload
            </Button>
            <Button variant="outline" onClick={() => nav(createPageUrl("Home"))}>
              Back to Home
            </Button>
          </div>
        </Card>
      );
    }

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

        {url.debug ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span><b>effectiveMode:</b> {effectiveMode}</span>
              <span><b>season.mode:</b> {season.mode}</span>
              <span><b>isAuthenticated:</b> {String(!!season.isAuthenticated)}</span>
              <span><b>accountId:</b> {season.accountId ? String(season.accountId) : "null"}</span>
              <span><b>hasAccess:</b> {String(!!season.hasAccess)}</span>
              <span><b>entitled:</b> {String(!!season.entitlement)}</span>
              <span><b>forceDemo(url):</b> {String(!!forceDemoUrl)}</span>
              <span><b>forceDemo(session):</b> {String(!!forceDemoSession)}</span>
              <span><b>requestedSeason(url):</b> {String(url.seasonYear || "")}</span>
              <span><b>demoYear:</b> {String(season.demoYear || "")}</span>
              <span><b>seasonYear(effective):</b> {String(seasonYear)}</span>
              <span><b>src:</b> {url.src ? url.src : "null"}</span>
              <span><b>paidEnabled:</b> {String(!!paidEnabled)}</span>
              <span><b>demoEnabled:</b> {String(!!demoEnabled)}</span>
            </div>
          </div>
        ) : null}

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

