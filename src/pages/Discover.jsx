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

// If these exist in your project, keep them. If you ever get an import error, tell me and I’ll inline them.
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
    const mode = sp.get("mode"); // "demo" may be present
    const season = sp.get("season");
    return {
      mode: mode ? String(mode).toLowerCase() : null,
      seasonYear: season && Number.isFinite(Number(season)) ? Number(season) : null
    };
  } catch {
    return { mode: null, seasonYear: null };
  }
}

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();

  const currentPath = useMemo(
    () => (loc?.pathname || "") + (loc?.search || ""),
    [loc?.pathname, loc?.search]
  );
  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();
  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);

  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const forceDemoUrl = url.mode === "demo";

  // Persisted demo mode (set by Home "Access Demo")
  const demoSession = useMemo(() => readDemoMode(), []);
  const forceDemoSession = String(demoSession?.mode || "").toLowerCase() === "demo";

  // Effective mode
  const effectiveMode = (forceDemoUrl || forceDemoSession)
    ? "demo"
    : (season.mode === "paid" ? "paid" : "demo");

  const isPaid = effectiveMode === "paid";

  // Resolve seasonYear to query
  const seasonYear = useMemo(() => {
    // If explicitly demo (url or session), allow season override
    if (forceDemoUrl || forceDemoSession) {
      return (
        url.seasonYear ||
        demoSession?.seasonYear ||
        season.demoYear ||
        season.seasonYear
      );
    }

    // Paid/non-demo: honor requested season if present
    if (url.seasonYear) return url.seasonYear;

    return season.seasonYear;
  }, [
    forceDemoUrl,
    forceDemoSession,
    url.seasonYear,
    demoSession?.seasonYear,
    season.demoYear,
    season.seasonYear
  ]);

  /**
   * Season-aware gate:
   * If user requests a non-demo season (e.g. /Discover?season=2026) AND isn't explicitly forcing demo:
   * - if not authed -> Home?signin=1&next=...
   * - if authed but not entitled -> Subscribe?season=...&next=...
   */
  useEffect(() => {
    if (season.isLoading) return;

    const requested = url.seasonYear; // from ?season=YYYY
    const demoYear = season.demoYear;

    // URL demo wins
    if (forceDemoUrl) return;

    // No season requested → allow
    if (!requested) return;

    // requesting demo year is always allowed
    if (demoYear && String(requested) === String(demoYear)) return;

    // requesting non-demo season → gate
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

  // Filters + UI state
  const [filterOpen, setFilterOpen] = useState(false);
  const { nf, setNF, clearFilters } = useCampFilters();

  // Write gates for paid actions
  const writeGate = useWriteGate();

  /* -------------------------------------------------------
     DATA: Camps + lookup tables (School / Sport / Position)
     We hydrate client-side because Base44 does not give us
     a join/view entity like CampExpanded.
  ------------------------------------------------------- */

  const campsQuery = base44.useQuery(
    ["discover_camps", seasonYear, effectiveMode],
    async () => {
      // You are using a single Camp table as “occurrences”
      // Filter by season_year. If some old rows don’t have season_year yet, they won’t show.
      const rows = await base44.entities.Camp.filter({
        season_year: seasonYear
      });
      return asArray(rows);
    },
    { enabled: !season.isLoading && !!seasonYear }
  );

  const schoolsQuery = base44.useQuery(
    "discover_schools",
    async () => asArray(await base44.entities.School.filter({})),
    { enabled: !season.isLoading }
  );

  const sportsQuery = base44.useQuery(
    "discover_sports",
    async () => asArray(await base44.entities.Sport.filter({})),
    { enabled: !season.isLoading }
  );

  const positionsQuery = base44.useQuery(
    "discover_positions",
    async () => asArray(await base44.entities.Position.filter({})),
    { enabled: !season.isLoading }
  );

  const schoolMap = useMemo(() => {
    const m = {};
    for (const s of asArray(schoolsQuery.data)) m[String(s.id)] = s;
    return m;
  }, [schoolsQuery.data]);

  const sportMap = useMemo(() => {
    const m = {};
    for (const s of asArray(sportsQuery.data)) m[String(s.id)] = s;
    return m;
  }, [sportsQuery.data]);

  const positionMap = useMemo(() => {
    const m = {};
    for (const p of asArray(positionsQuery.data)) m[String(p.id)] = p;
    return m;
  }, [positionsQuery.data]);

  const loading =
    season.isLoading ||
    identityLoading ||
    campsQuery.isLoading ||
    schoolsQuery.isLoading ||
    sportsQuery.isLoading ||
    positionsQuery.isLoading;

  const error =
    campsQuery.error ||
    schoolsQuery.error ||
    sportsQuery.error ||
    positionsQuery.error;

  const hydratedRows = useMemo(() => {
    const src = asArray(campsQuery.data);

    // If you have filter logic that expects fields not in Camp, keep it defensive.
    return src.filter((r) => {
      // Apply filters only if they are set
      if (!matchesDivision(r, nf.divisions)) return false;
      if (!matchesSport(r, nf.sports)) return false;
      if (!matchesPositions(r, nf.positions)) return false;
      if (!matchesDateRange(r, nf.startDate || "", nf.endDate || "")) return false;
      return true;
    });
  }, [campsQuery.data, nf]);

  const title = "Discover";

  const renderBody = () => {
    if (loading) return <div className="py-10 text-center text-slate-500">Loading…</div>;

    if (error) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-rose-700">Error loading camps</div>
          <div className="mt-2 text-sm text-slate-600">{String(error?.message || error)}</div>
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

    if (!hydratedRows.length) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">No camps found</div>
          <div className="mt-1 text-sm text-slate-600">Try clearing filters or verify season_year data.</div>
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
        {hydratedRows.map((r) => {
          const campId = String(r?.id ?? "");
          const school = schoolMap[String(r?.school_id)] || null;
          const sport = sportMap[String(r?.sport_id)] || null;

          const posObjs = asArray(r?.position_ids)
            .map((pid) => positionMap[String(pid)] || null)
            .filter(Boolean);

          const camp = {
            id: campId,
            name: r?.camp_name ?? r?.name ?? null,
            camp_name: r?.camp_name ?? r?.name ?? null,
            start_date: r?.start_date ?? null,
            end_date: r?.end_date ?? null,
            cost: r?.price ?? r?.price_min ?? null,
            division: r?.division ?? null,
            url: r?.link_url ?? r?.registration_url ?? r?.source_url ?? null
          };

          const schoolObj = {
            id: school?.id || r?.school_id || "",
            name: school?.school_name || school?.name || r?.school_name || "Unknown School",
            school_name: school?.school_name || school?.name || r?.school_name || "Unknown School",
            city: r?.city || school?.city || null,
            state: r?.state || school?.state || null,
            conference: school?.conference || null
          };

          const sportObj = {
            id: sport?.id || r?.sport_id || "",
            name: sport?.sport_name || sport?.name || r?.sport_name || "Camp",
            sport_name: sport?.sport_name || sport?.name || r?.sport_name || "Camp"
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
            <div className="text-2xl font-bold text-deep-navy">{title}</div>
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
