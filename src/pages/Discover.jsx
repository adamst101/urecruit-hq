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

function yearFromDate(x) {
  if (!x) return null;
  const s = String(x).trim();

  // YYYY-MM-DD
  const m1 = s.match(/^(\d{4})-\d{2}-\d{2}$/);
  if (m1) return Number(m1[1]);

  // M/D/YYYY
  const m2 = s.match(/^\d{1,2}\/\d{1,2}\/(\d{4})$/);
  if (m2) return Number(m2[1]);

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

function safeMatches(fn, row, valA, valB) {
  try {
    // supports both (row, list) and (row, start, end)
    return typeof valB === "undefined" ? fn(row, valA) : fn(row, valA, valB);
  } catch {
    return true;
  }
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

  // ✅ Entitlement wins. If entitled, we behave as paid even if demo session exists.
  const isEntitled = !!season.accountId && !!season.hasAccess;
  const isPaid = isEntitled;

  const seasonYear = useMemo(() => {
    if (isPaid) return season.seasonYear;

    return (
      url.seasonYear ||
      demoSession?.seasonYear ||
      season.demoYear ||
      season.seasonYear
    );
  }, [
    isPaid,
    season.seasonYear,
    url.seasonYear,
    demoSession?.seasonYear,
    season.demoYear,
    season.seasonYear
  ]);

  // Gate: /Discover?season=2026 (without mode=demo) must require auth + entitlement
  useEffect(() => {
    if (season.isLoading) return;

    const requested = url.seasonYear;
    const demoYear = season.demoYear;

    // Explicit demo URL bypasses gating
    if (forceDemoUrl) return;

    // No requested season: no gate here
    if (!requested) return;

    // Demo year allowed without auth
    if (demoYear && String(requested) === String(demoYear)) return;

    // Non-demo year: require auth then entitlement
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

  // Filters
  const [filterOpen, setFilterOpen] = useState(false);
  const { nf, setNF, clearFilters } = useCampFilters();
  const writeGate = useWriteGate();

  // Data state
  const [camps, setCamps] = useState([]);
  const [demoSource, setDemoSource] = useState("-");
  const [counts, setCounts] = useState({
    campDemoAll: 0,
    campDemoYear: 0,
    campAll: 0,
    campYear: 0
  });

  const [schools, setSchools] = useState([]);
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  const [dataLoading, setDataLoading] = useState(true);
  const [entityErr, setEntityErr] = useState({
    CampDemo: "",
    Camp: "",
    School: "",
    Sport: "",
    Position: ""
  });

  const [fatalErr, setFatalErr] = useState("");

  // Lookups
  useEffect(() => {
    let alive = true;

    async function loadLookups() {
      try {
        const [schoolRows, sportRows, positionRows] = await Promise.all([
          base44.entities.School.filter({}).catch((e) => {
            if (alive) setEntityErr((p) => ({ ...p, School: String(e?.message || e) }));
            return [];
          }),
          base44.entities.Sport.filter({}).catch((e) => {
            if (alive) setEntityErr((p) => ({ ...p, Sport: String(e?.message || e) }));
            return [];
          }),
          base44.entities.Position.filter({}).catch((e) => {
            if (alive) setEntityErr((p) => ({ ...p, Position: String(e?.message || e) }));
            return [];
          })
        ]);

        if (!alive) return;
        setSchools(asArray(schoolRows));
        setSports(asArray(sportRows));
        setPositions(asArray(positionRows));
      } catch (e) {
        if (!alive) return;
        setFatalErr(String(e?.message || e));
      }
    }

    loadLookups();
    return () => {
      alive = false;
    };
  }, []);

  // Camps
  useEffect(() => {
    let alive = true;

    async function loadCamps() {
      if (season.isLoading) return;

      setDataLoading(true);
      setFatalErr("");

      // reset entity errors for Camp/CampDemo each run
      setEntityErr((p) => ({ ...p, CampDemo: "", Camp: "" }));

      try {
        if (isPaid) {
          // Paid: Camp by season_year
          let rows = [];
          try {
            rows = await base44.entities.Camp.filter({ season_year: seasonYear });
          } catch (e) {
            if (alive) setEntityErr((p) => ({ ...p, Camp: String(e?.message || e) }));
            rows = [];
          }

          if (!alive) return;
          setDemoSource("-");
          setCounts((c) => ({ ...c, campAll: asArray(rows).length, campYear: asArray(rows).length }));
          setCamps(asArray(rows));
          return;
        }

        // Demo: ALWAYS attempt both sources, choose best
        let campDemoAll = [];
        let campAll = [];
        let campDemoErr = "";
        let campErr = "";

        try {
          campDemoAll = await base44.entities.CampDemo.filter({});
        } catch (e) {
          campDemoErr = String(e?.message || e);
          campDemoAll = [];
        }

        try {
          campAll = await base44.entities.Camp.filter({});
        } catch (e) {
          campErr = String(e?.message || e);
          campAll = [];
        }

        const y = Number(seasonYear);
        const campDemoYear = Number.isFinite(y)
          ? asArray(campDemoAll).filter((r) => yearFromDate(r?.start_date) === y)
          : asArray(campDemoAll);

        const campYear = Number.isFinite(y)
          ? asArray(campAll).filter((r) => yearFromDate(r?.start_date) === y)
          : asArray(campAll);

        // Record counts + errors (per-entity)
        if (alive) {
          setEntityErr((p) => ({
            ...p,
            CampDemo: campDemoErr || "",
            Camp: campErr || ""
          }));

          setCounts({
            campDemoAll: asArray(campDemoAll).length,
            campDemoYear: asArray(campDemoYear).length,
            campAll: asArray(campAll).length,
            campYear: asArray(campYear).length
          });
        }

        // Choose dataset:
        // 1) CampDemo rows for year
        // 2) Camp rows for year
        // 3) CampDemo all (if exists) – means date parse/year mismatch
        // 4) Camp all (if exists)
        let chosen = [];
        let chosenLabel = "none";

        if (campDemoYear.length > 0) {
          chosen = campDemoYear;
          chosenLabel = "CampDemo(year)";
        } else if (campYear.length > 0) {
          chosen = campYear;
          chosenLabel = "Camp(year)";
        } else if (campDemoAll.length > 0) {
          chosen = campDemoAll;
          chosenLabel = "CampDemo(all-no-year-match)";
        } else if (campAll.length > 0) {
          chosen = campAll;
          chosenLabel = "Camp(all-no-year-match)";
        }

        if (!alive) return;
        setDemoSource(chosenLabel);
        setCamps(asArray(chosen));

        trackEvent({
          event_name: "discover_camps_loaded",
          source: "discover",
          mode: "demo",
          season_year: seasonYear,
          count: asArray(chosen).length,
          demo_source: chosenLabel,
          account_id: season.accountId || null
        });
      } catch (e) {
        if (!alive) return;
        setFatalErr(String(e?.message || e));
        setCamps([]);
      } finally {
        if (!alive) return;
        setDataLoading(false);
      }
    }

    loadCamps();
    return () => {
      alive = false;
    };
  }, [season.isLoading, isPaid, seasonYear, season.accountId]);

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
      if (!safeMatches(matchesDivision, r, nf.divisions)) return false;
      if (!safeMatches(matchesSport, r, nf.sports)) return false;
      if (!safeMatches(matchesPositions, r, nf.positions)) return false;
      if (!safeMatches(matchesDateRange, r, nf.startDate || "", nf.endDate || "")) return false;
      return true;
    });
  }, [camps, nf]);

  const renderErrors = () => {
    const msgs = [];
    if (entityErr.CampDemo) msgs.push(`CampDemo: ${entityErr.CampDemo}`);
    if (entityErr.Camp) msgs.push(`Camp: ${entityErr.Camp}`);
    if (entityErr.School) msgs.push(`School: ${entityErr.School}`);
    if (entityErr.Sport) msgs.push(`Sport: ${entityErr.Sport}`);
    if (entityErr.Position) msgs.push(`Position: ${entityErr.Position}`);
    if (!msgs.length) return null;

    return (
      <Card className="p-4 border-rose-200 bg-rose-50">
        <div className="font-semibold text-rose-800">Data errors detected</div>
        <div className="mt-2 text-sm text-rose-800 space-y-1">
          {msgs.map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      </Card>
    );
  };

  const renderBody = () => {
    if (loading) return <div className="py-10 text-center text-slate-500">Loading…</div>;

    if (fatalErr) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-rose-700">Discover crashed</div>
          <div className="mt-2 text-sm text-slate-600">{fatalErr}</div>
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

    if (!filteredRows.length) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">No camps found</div>
          <div className="mt-1 text-sm text-slate-600">
            CampDemo(year): {counts.campDemoYear} · Camp(year): {counts.campYear} ·
            CampDemo(all): {counts.campDemoAll} · Camp(all): {counts.campAll}
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
            name: sport?.sport_name || sport?.name || "Football",
            sport_name: sport?.sport_name || sport?.name || "Football"
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
                if (!isPaid) return;
                const ok = await writeGate.ensure("favorite");
                if (!ok) return;
              }}
              onToggleRegistered={async () => {
                if (!isPaid) return;
                const ok = await writeGate.ensure("registered");
                if (!ok) return;
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

        {/* Debug banner */}
        <div className="mb-4 mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span><b>mode:</b> {isPaid ? "paid" : "demo"}</span>
            <span><b>seasonYear:</b> {String(seasonYear)}</span>
            <span><b>accountId:</b> {season.accountId ? String(season.accountId) : "null"}</span>
            <span><b>entitled:</b> {String(!!season.hasAccess)}</span>
            <span><b>demoSource:</b> {demoSource}</span>
            <span><b>CampDemo(year/all):</b> {counts.campDemoYear}/{counts.campDemoAll}</span>
            <span><b>Camp(year/all):</b> {counts.campYear}/{counts.campAll}</span>
            <span><b>rawCamps:</b> {String(asArray(camps).length)}</span>
            <span><b>afterFilters:</b> {String(asArray(filteredRows).length)}</span>
            <span><b>forceDemo(url):</b> {String(!!forceDemoUrl)}</span>
            <span><b>forceDemo(session):</b> {String(!!forceDemoSession)}</span>
          </div>
        </div>

        {renderErrors()}

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
