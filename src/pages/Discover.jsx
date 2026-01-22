// src/pages/Discover.jsx (MVP: Gate + Event-by-season)
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { readDemoMode } from "../components/hooks/demoMode.jsx";

import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampFilters } from "../components/filters/useCampFilters.jsx";

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

// Best-effort fetch by id (Base44-safe)
async function fetchById(entity, id) {
  if (!entity || !id) return null;
  try {
    if (typeof entity.get === "function") return await entity.get(id);
  } catch {}
  try {
    const rows = await entity.filter({ id });
    return asArray(rows)[0] || null;
  } catch {
    return null;
  }
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const forceDemoUrl = url.mode === "demo";

  const demoSession = useMemo(() => readDemoMode(), []);
  const forceDemoSession = String(demoSession?.mode || "").toLowerCase() === "demo";

  const currentPath = useMemo(
    () => (loc?.pathname || "") + (loc?.search || ""),
    [loc?.pathname, loc?.search]
  );
  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  // Mode resolution (paid wins unless explicit demo)
  const effectiveMode = (forceDemoUrl || forceDemoSession)
    ? "demo"
    : (season.mode === "paid" ? "paid" : "demo");

  const isPaid = effectiveMode === "paid";

  // Resolve seasonYear
  const seasonYear = useMemo(() => {
    // Explicit demo
    if (forceDemoUrl || forceDemoSession) {
      return (
        url.seasonYear ||
        demoSession?.seasonYear ||
        season.demoYear ||
        season.seasonYear
      );
    }

    // Paid/non-demo season requested
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

  // Gate: requesting a non-demo season must not silently show demo
  useEffect(() => {
    if (season.isLoading) return;

    const requested = url.seasonYear;
    const demoYear = season.demoYear;

    if (forceDemoUrl) return; // explicit demo is allowed
    if (!requested) return;   // no season requested, normal flow
    if (demoYear && String(requested) === String(demoYear)) return;

    // Non-demo season requested -> require auth
    if (!season.accountId) {
      nav(createPageUrl("Home") + `?signin=1&next=${nextParam}`, { replace: true });
      return;
    }

    // Auth but not entitled -> subscribe for that season
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

  // Filters
  const [filterOpen, setFilterOpen] = useState(false);
  const { nf, setNF, clearFilters } = useCampFilters();

  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);

  // Data state (no base44.useQuery -> prevents blank screen)
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErr("");
      setRows([]);

      try {
        if (season.isLoading) return;
        if (!seasonYear) return;

        // Pull Events for season_year
        const events = await base44.entities.Event.filter({ season_year: seasonYear });

        // Join minimal supporting data for MVP cards
        const out = [];
        for (const ev of asArray(events)) {
          const camp = await fetchById(base44.entities.Camp, ev?.camp_id);
          const school = await fetchById(base44.entities.School, ev?.school_id);
          const sport = await fetchById(base44.entities.Sport, ev?.sport_id);

          // Positions: if event has position_ids
          let positions = [];
          const pids = asArray(ev?.position_ids);
          for (const pid of pids.slice(0, 12)) {
            const p = await fetchById(base44.entities.Position, pid);
            if (p) positions.push(p);
          }

          out.push({ ev, camp, school, sport, positions });
        }

        if (!alive) return;
        setRows(out);
      } catch (e) {
        if (!alive) return;
        setErr(String(e?.message || e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    run();
    return () => { alive = false; };
  }, [season.isLoading, seasonYear]);

  // Apply filters
  const filtered = useMemo(() => {
    return asArray(rows).filter(({ ev }) => {
      if (!matchesDivision(ev, nf.divisions)) return false;
      if (!matchesSport(ev, nf.sports)) return false;
      if (!matchesPositions(ev, nf.positions)) return false;
      if (!matchesDateRange(ev, nf.startDate || "", nf.endDate || "")) return false;
      return true;
    });
  }, [rows, nf]);

  const renderBody = () => {
    if (loading) return <div className="py-10 text-center text-slate-500">Loading…</div>;
    if (err) return (
      <Card className="p-5 border-slate-200">
        <div className="text-lg font-semibold text-deep-navy">Error</div>
        <div className="mt-1 text-sm text-rose-700">{err}</div>
        <div className="mt-3 text-sm text-slate-600">
          Most common cause: <b>Event.season_year is blank</b> so the filter returns nothing. Backfill it first.
        </div>
      </Card>
    );

    // Optional: require profile only for paid actions, not for viewing
    if (isPaid && !athleteId) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">Complete your athlete profile</div>
          <div className="mt-1 text-sm text-slate-600">
            You can browse, but to save favorites / registrations you’ll need an athlete profile.
          </div>
          <div className="mt-4">
            <Button onClick={() => nav(createPageUrl("Profile"))}>Go to Profile</Button>
          </div>
        </Card>
      );
    }

    if (!filtered.length) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">No camps found</div>
          <div className="mt-1 text-sm text-slate-600">Try clearing filters or confirm Events have season_year.</div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
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
        {filtered.map(({ ev, camp, school, sport, positions }) => {
          const campId = String(ev?.camp_id ?? camp?.id ?? ev?.id ?? "");
          const schoolId = String(ev?.school_id ?? school?.id ?? "");
          const sportId = String(ev?.sport_id ?? sport?.id ?? "");

          return (
            <CampCard
              key={`${campId}-${ev?.id || ""}`}
              camp={{
                id: campId,
                name: camp?.name || camp?.camp_name || ev?.camp_name || "Camp",
                start_date: ev?.start_date || null,
                end_date: ev?.end_date || null,
                cost: ev?.cost ?? null,
                division: ev?.division ?? null,
                url: ev?.url || camp?.url || null
              }}
              school={{
                id: schoolId,
                name: school?.name || school?.school_name || ev?.school_name || null,
                city: school?.city || ev?.school_city || null,
                state: school?.state || ev?.school_state || null
              }}
              sport={{
                id: sportId,
                name: sport?.name || ev?.sport_name || null
              }}
              positions={positions || []}
              mode={isPaid ? "paid" : "demo"}
              onToggleFavorite={() => {
                if (!isPaid) {
                  trackEvent({ event_name: "demo_write_blocked", source: "discover", action: "favorite" });
                  return;
                }
                trackEvent({ event_name: "favorite_toggle", source: "discover", camp_id: campId });
              }}
              onToggleRegistered={() => {
                if (!isPaid) {
                  trackEvent({ event_name: "demo_write_blocked", source: "discover", action: "registered" });
                  return;
                }
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
