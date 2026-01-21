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

  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const forceDemo = url.mode === "demo";

  // Persisted demo mode (set by Home "Access Demo" CTA)
  const demoSession = useMemo(() => readDemoMode(), []);
  const forceDemoSession = String(demoSession?.mode || "").toLowerCase() === "demo";

  // Paid entitlement ALWAYS wins unless URL explicitly forces demo.
  // Session demo is allowed to keep you in demo when URL doesn't force paid.
  const effectiveMode = (forceDemo || forceDemoSession)
    ? "demo"
    : (season.mode === "paid" ? "paid" : "demo");

  const isPaid = effectiveMode === "paid";

  const seasonYear = useMemo(() => {
    // Demo: use URL season if provided, otherwise default to configured demo year.
    if (forceDemo || forceDemoSession) {
      return (
        url.seasonYear ||
        demoSession?.seasonYear ||
        season.demoYear ||
        season.seasonYear
      );
    }

    // Paid or non-demo: honor requested season if present (useSeasonAccess should validate entitlement)
    if (url.seasonYear) return url.seasonYear;

    // Default: whatever useSeasonAccess resolved (demo year when not entitled; paid season when entitled)
    return season.seasonYear;
  }, [forceDemo, forceDemoSession, demoSession?.seasonYear, url.seasonYear, season.demoYear, season.seasonYear]);

  // Season-aware gate:
  // If the URL requests a non-demo season (e.g., ?season=2026) and the user did not explicitly force demo,
  // do NOT silently downgrade to demo data. Require sign-in and entitlement instead.
  useEffect(() => {
    if (season.isLoading) return;

    const requested = url.seasonYear; // from ?season=YYYY
    const demoYear = season.demoYear;

    // Explicit demo always wins (URL only)
    if (forceDemo) return;

    // No season requested → allow existing behavior
    if (!requested) return;

    // Requesting demo year is allowed without auth
    if (demoYear && String(requested) === String(demoYear)) return;

    // Non-demo season requested → gate
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
    forceDemo,
    url.seasonYear,
    nextParam,
    nav
  ]);

  // Filters + UI state
  const [filterOpen, setFilterOpen] = useState(false);
  const { nf, setNF, clearFilters } = useCampFilters();

  // Write gates for paid actions (favorites, registered, etc.)
  const writeGate = useWriteGate();

  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);

  // Queries
  const paidQuery = base44.useQuery(
    "discover_paid",
    async () => {
      // Paid: needs athlete context for intents (favorites/registered)
      // You can still list camps without athlete, but we enforce profile for MVP personalization.
      const rows = await base44.entities.CampExpanded.filter({
        season_year: seasonYear
      });
      return asArray(rows);
    },
    { enabled: !!isPaid && !season.isLoading }
  );

  const demoQuery = base44.useQuery(
    "discover_demo",
    async () => {
      const rows = await base44.entities.CampExpanded.filter({
        season_year: seasonYear
      });
      return asArray(rows);
    },
    { enabled: !isPaid && !season.isLoading }
  );

  const loading =
    season.isLoading ||
    identityLoading ||
    (isPaid ? paidQuery.isLoading : demoQuery.isLoading);

  const rows = useMemo(() => {
    const data = isPaid ? paidQuery.data : demoQuery.data;
    const src = asArray(data);

    return src.filter((r) => {
      // Apply filters (division / sport / positions / date range)
      if (!matchesDivision(r, nf.divisions)) return false;
      if (!matchesSport(r, nf.sports)) return false;
      if (!matchesPositions(r, nf.positions)) return false;
      if (!matchesDateRange(r, nf.startDate || "", nf.endDate || "")) return false;

      return true;
    });
  }, [isPaid, paidQuery.data, demoQuery.data, nf]);

  const title = "Discover";

  const renderBody = () => {
    if (loading) return <div className="py-10 text-center text-slate-500">Loading…</div>;

    // Paid workspace requires athlete profile (MVP rule)
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
          const campId = String(r?.camp_id ?? r?.id ?? "");
          const schoolId = String(r?.school_id ?? "");
          const sportId = String(r?.sport_id ?? "");

          const camp = {
            id: campId,
            name: r?.camp_name ?? r?.name ?? null,
            camp_name: r?.camp_name ?? r?.name ?? null,
            start_date: r?.start_date ?? null,
            end_date: r?.end_date ?? null,
            cost: r?.cost ?? null,
            division: r?.division ?? null,
            url: r?.url ?? null
          };

          const school = {
            id: schoolId,
            name: r?.school_name ?? null,
            school_name: r?.school_name ?? null,
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
            .map((pid) => (r?.positions_map ? r.positions_map[String(pid)] : null))
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
              onToggleFavorite={async () => {
                // Block writes in demo
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
            <span><b>season.mode:</b> {season.mode}</span>
            <span><b>isAuthenticated:</b> {String(!!season.isAuthenticated)}</span>
            <span><b>accountId:</b> {season.accountId ? String(season.accountId) : "null"}</span>
            <span><b>entitled:</b> {String(!!season.entitlement)}</span>
            <span><b>forceDemo(url):</b> {String(!!forceDemo)}</span>
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

