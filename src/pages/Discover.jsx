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
import { readDemoMode } from "../components/hooks/demoMode.jsx";

import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampFilters } from "../components/filters/useCampFilters.jsx";
import { useWriteGate } from "../components/hooks/useWriteGate.jsx";

import {
  matchesDivision,
  matchesSport,
  matchesPositions,
  matchesDateRange
} from "../components/filters/filterUtils.jsx";

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
    const mode = sp.get("mode");
    const season = sp.get("season");
    return {
      mode: mode ? String(mode).toLowerCase() : null,
      seasonYear: season && Number.isFinite(Number(season)) ? Number(season) : null,
      src: sp.get("src") || sp.get("source") || null
    };
  } catch {
    return { mode: null, seasonYear: null, src: null };
  }
}

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

// Best-effort: clear persisted demo flags (exact keys vary by your demoMode implementation)
function clearDemoPersistence() {
  try {
    localStorage.removeItem("demo_mode");
    localStorage.removeItem("demo_season_year");
    localStorage.removeItem("demoYear");
    localStorage.removeItem("demoSeasonYear");
    localStorage.removeItem("demo");
  } catch {}
  try {
    sessionStorage.removeItem("demo_mode");
    sessionStorage.removeItem("demo_season_year");
    sessionStorage.removeItem("demoYear");
    sessionStorage.removeItem("demoSeasonYear");
    sessionStorage.removeItem("demo");
  } catch {}
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();
  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);

  const currentPath = useMemo(
    () => (loc?.pathname || "") + (loc?.search || ""),
    [loc?.pathname, loc?.search]
  );
  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const forceDemoUrl = url.mode === "demo";

  const demoSession = useMemo(() => readDemoMode(), []);
  const forceDemoSession = String(demoSession?.mode || "").toLowerCase() === "demo";

  // ✅ Rule you want:
  // If logged in + entitled => ALWAYS PAID, regardless of demo overrides.
  const isEntitled = !!season.accountId && !!season.hasAccess;
  const effectiveMode = isEntitled ? "paid" : ((forceDemoUrl || forceDemoSession) ? "demo" : "demo");
  const isPaid = effectiveMode === "paid";

  // ✅ When entitled, strip demo params + clear persisted demo so you never “fall back” to demo
  useEffect(() => {
    if (season.isLoading) return;
    if (!isEntitled) return;

    const hasDemoSignal = forceDemoUrl || forceDemoSession;
    if (!hasDemoSignal) return;

    clearDemoPersistence();

    // Replace URL with clean paid Discover (no mode=demo)
    nav(createPageUrl("Discover"), { replace: true });
  }, [season.isLoading, isEntitled, forceDemoUrl, forceDemoSession, nav]);

  // Resolve seasonYear to query
  const seasonYear = useMemo(() => {
    // Paid: always use entitled season resolved by useSeasonAccess
    if (isPaid) return season.seasonYear;

    // Demo: allow URL override if present, else session demo year, else hook demoYear
    return (
      url.seasonYear ||
      demoSession?.seasonYear ||
      season.demoYear ||
      season.seasonYear
    );
  }, [isPaid, season.seasonYear, url.seasonYear, demoSession?.seasonYear, season.demoYear, season.seasonYear]);

  /**
   * Season-aware gate (non-demo season requested):
   * /Discover?season=2026 (without mode=demo) should not show demo.
   * It should send to Home signin, then Subscribe if not entitled.
   */
  useEffect(() => {
    if (season.isLoading) return;

    const requested = url.seasonYear;
    const demoYear = season.demoYear;

    // If URL explicitly says demo, allow demo browsing
    if (forceDemoUrl) return;

    if (!requested) return;

    // requesting demo year is allowed without auth
    if (demoYear && String(requested) === String(demoYear)) return;

    // non-demo season requested -> gate
    if (!season.accountId) {
      nav(createPageUrl("Home") + `?signin=1&next=${nextParam}`, { replace: true });
      return;
    }

    if (!season.hasAccess) {
      nav(
        createPageUrl("Subscribe") +
          `?season=${encodeURIComponent(requested)}` +
          `&source=${encodeURIComponent("discover_season_gate")}` +
          `&next=${nextParam}`,
        { replace: true }
      );
    }
  }, [
    season.isLoading,
    season.accountId,
    season.hasAccess,
    season.demoYear,
    forceDemoUrl,
    url.seasonYear,
    nextParam,
    nav
  ]);

  // Filters + UI
  const [filterOpen, setFilterOpen] = useState(false);
  const { nf, setNF, clearFilters } = useCampFilters();
  const writeGate = useWriteGate();

  // Data state
  const [camps, setCamps] = useState([]);
  const [schools, setSchools] = useState([]);
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataErr, setDataErr] = useState("");

  // Load lookups
  useEffect(() => {
    let alive = true;

    async function loadLookups() {
      try {
        const [schoolRows, sportRows, positionRows] = await Promise.all([
          base44.entities.School.filter({}),
          base44.entities.Sport.filter({}),
          base44.entities.Position.filter({})
        ]);
        if (!alive) return;
        setSchools(asArray(schoolRows));
        setSports(asArray(sportRows));
        setPositions(asArray(positionRows));
      } catch (e) {
        if (!alive) return;
        setDataErr(String(e?.message || e));
      }
    }

    loadLookups();
    return () => { alive = false; };
  }, []);

  // Load camps for seasonYear
  useEffect(() => {
    let alive = true;

    async function loadCamps() {
      if (season.isLoading) return;
      if (!seasonYear) return;

      setDataLoading(true);
      setDataErr("");

      try {
        let rows = [];

        if (isPaid) {
          // Paid reads from Camp
          rows = await base44.entities.Camp.filter({ season_year: seasonYear });
        } else {
          // Demo reads from CampDemo (fallback to Camp if needed)
          try {
            rows = await base44.entities.CampDemo.filter({ season_year: seasonYear });
          } catch {
            rows = await base44.entities.Camp.filter({ season_year: seasonYear });
          }
        }

        if (!alive) return;
        setCamps(asArray(rows));

        trackEvent({
          event_name: "discover_camps_loaded",
          source: "discover",
          effective_mode: effectiveMode,
          season_year: seasonYear,
          count: asArray(rows).length,
          account_id: season.accountId || null
        });
      } catch (e) {
        if (!alive) return;
        setDataErr(String(e?.message || e));
        setCamps([]);
      } finally {
        if (!alive) return;
        setDataLoading(false);
      }
    }

    loadCamps();
    return () => { alive = false; };
  }, [season.isLoading, seasonYear, isPaid, effectiveMode, season.accountId]);

  const schoolMap = useMemo(() => {
    const m = {};
    for (const s of asArray(schools)) m[String(s.id)] = s;
    return m;
  }, [schools]);

  const sportMap = useMemo(() => {
    const m = {};
    for (const s of asArray(sports)) m[String(s.id)] = s;
    return m;
  }, [sports]);

  const positionMap = useMemo(() => {
    const m = {};
    for (const p of asArray(positions)) m[String(p.id)] = p;
    return m;
  }, [positions]);

  const loading = season.isLoading || identityLoading || dataLoading;

  const filteredRows = useMemo(() => {
    const src = asArray(camps);
    return src.filter((r) => {
      if (!matchesDivision(r, nf.divisions)) return false;
      if (!matchesSport(r, nf.sports)) return false;
      if (!matchesPositions(r, nf.positions)) return false;
      if (!matchesDateRange(r, nf.startDate || "", nf.endDate || "")) return false;
      return true;
    });
  }, [camps, nf]);

  const renderBody = () => {
    if (loading) return <div className="py-10 text-center text-slate-500">Loading…</div>;

    if (dataErr) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-rose-700">Error loading camps</div>
          <div className="mt-2 text-sm text-slate-600">{dataErr}</div>
        </Card>
      );
    }

    // Paid workspace requires athlete profile (your MVP rule)
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

    if (!filteredRows.length) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">No camps found</div>
          <div className="mt-1 text-sm text-slate-600">
            Try clearing filters or confirm camps exist for season_year {String(seasonYear)}.
          </div>
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
        {filteredRows.map((r) => {
          const campId = String(r?.id ?? "");
          const school = schoolMap[String(r?.school_id)] || null;
          const sport = sportMap[String(r?.sport_id)] || null;

          const posObjs = asArray(r?.position_ids)
            .map((pid) => positionMap[String(pid)] || null)
            .filter(Boolean);

          const camp = {
            id: campId,
            name: r?.camp_name ?? null,
            camp_name: r?.camp_name ?? null,
            start_date: r?.start_date ?? null,
            end_date: r?.end_date ?? null,
            cost: r?.price ?? r?.price_min ?? null,
            url: r?.link_url ?? r?.registration_url ?? r?.source_url ?? null
          };

          const schoolObj = {
            id: school?.id || r?.school_id || "",
            name: school?.school_name || school?.name || "Unknown School",
            school_name: school?.school_name || school?.name || "Unknown School",
            city: r?.city || school?.city || null,
            state: r?.state || school?.state || null
          };

          const sportObj = {
            id: sport?.id || r?.sport_id || "",
            name: sport?.sport_name || sport?.name || "Camp",
            sport_name: sport?.sport_name || sport?.name || "Camp"
          };

          return (
            <CampCard
              key={campId}
              camp={camp}
              school={schoolObj}
              sport={sportObj}
              positions={posObjs}
              isFavorite={false}
              isRegistered={false}
              mode={isPaid ? "paid" : "demo"}
              onToggleFavorite={async () => {
                if (!isPaid) {
                  trackEvent({ event_name: "demo_write_blocked", source: "discover", action: "favorite" });
                  return;
                }
                const ok = await writeGate.ensure("favorite");
                if (!ok) return;
                trackEvent({ event_name: "favorite_toggle", source: "discover", camp_id: campId });
              }}
              onToggleRegistered={async () => {
                if (!isPaid) {
                  trackEvent({ event_name: "demo_write_blocked", source: "discover", action: "registered" });
                  return;
                }
                const ok = await writeGate.ensure("registered");
                if (!ok) return;
                trackEvent({ event_name: "registered_toggle", source: "discover", camp_id: campId });
              }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Discover</div>
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
        <div className="mb-4 mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span><b>effectiveMode:</b> {effectiveMode}</span>
            <span><b>seasonYear:</b> {String(seasonYear)}</span>
            <span><b>accountId:</b> {season.accountId ? String(season.accountId) : "null"}</span>
            <span><b>entitled:</b> {String(!!season.entitlement)}</span>
            <span><b>forceDemo(url):</b> {String(!!forceDemoUrl)}</span>
            <span><b>forceDemo(session):</b> {String(!!forceDemoSession)}</span>
            <span><b>campCount:</b> {String(asArray(camps).length)}</span>
          </div>
        </div>

        {renderBody()}

        <FilterSheet
          open={filterOpen}
          setOpen={setFilterOpen}
          nf={nf}
          setNF={setNF}
          onClear={clearFilters}
        />
      </div>

      <BottomNav />
    </div>
  );
}
