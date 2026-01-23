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

// Parse year out of either YYYY-MM-DD or M/D/YYYY
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

// If your filter utils are strict when fields are missing, avoid “filter-to-zero”
function safeMatches(fn, row, val) {
  try {
    return fn(row, val);
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

  // Demo session state set by Home "Access Demo"
  const demoSession = useMemo(() => readDemoMode(), []);
  const forceDemoSession = String(demoSession?.mode || "").toLowerCase() === "demo";

  // ✅ Your rule: entitlement wins. Entitled users should not see demo.
  const isEntitled = !!season.accountId && !!season.hasAccess;
  const isPaid = isEntitled;

  // Choose season year
  const seasonYear = useMemo(() => {
    // Paid: use hook’s resolved season
    if (isPaid) return season.seasonYear;

    // Demo: honor URL season, else demoSession, else hook demoYear
    return (
      url.seasonYear ||
      demoSession?.seasonYear ||
      season.demoYear ||
      season.seasonYear
    );
  }, [isPaid, season.seasonYear, url.seasonYear, demoSession?.seasonYear, season.demoYear, season.seasonYear]);

  // Gate: /Discover?season=2026 without mode=demo should not silently show demo
  useEffect(() => {
    if (season.isLoading) return;

    const requested = url.seasonYear;
    const demoYear = season.demoYear;

    // Explicit demo allowed (URL)
    if (forceDemoUrl) return;

    // No requested season → do nothing
    if (!requested) return;

    // Requesting the demo year is allowed without auth
    if (demoYear && String(requested) === String(demoYear)) return;

    // Non-demo season requested → require auth, then entitlement
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
  const writeGate = useWriteGate();

  // Data state
  const [camps, setCamps] = useState([]);
  const [demoSource, setDemoSource] = useState(null); // "CampDemo" | "Camp" | null
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

  // Load lookups
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

  // Load camps (paid or demo)
  useEffect(() => {
    let alive = true;

    async function loadCamps() {
      if (season.isLoading) return;

      setDataLoading(true);
      setFatalErr("");

      // Reset per-run entity errors for Camp/CampDemo
      setEntityErr((p) => ({ ...p, CampDemo: "", Camp: "" }));

      try {
        let rows = [];
        let usedDemoSource = null;

        if (isPaid) {
          // Paid: use season_year
          try {
            rows = await base44.entities.Camp.filter({ season_year: seasonYear });
          } catch (e) {
            if (alive) setEntityErr((p) => ({ ...p, Camp: String(e?.message || e) }));
            rows = [];
          }
          usedDemoSource = null;
        } else {
          // Demo: try CampDemo first; if empty OR errored, fall back to Camp
          let demoRows = [];
          let campDemoErr = "";
          let campErr = "";

          try {
            demoRows = await base44.entities.CampDemo.filter({});
          } catch (e) {
            campDemoErr = String(e?.message || e);
            demoRows = [];
          }

          // If CampDemo has no rows OR failed, fall back to Camp
          if (!Array.isArray(demoRows) || demoRows.length === 0) {
            usedDemoSource = "Camp";
            try {
              demoRows = await base44.entities.Camp.filter({});
            } catch (e) {
              campErr = String(e?.message || e);
              demoRows = [];
            }
          } else {
            usedDemoSource = "CampDemo";
          }

          // Persist the per-entity errors so we can see them
          if (alive) {
            setEntityErr((p) => ({
              ...p,
              CampDemo: campDemoErr || "",
              Camp: campErr || p.Camp || ""
            }));
          }

          // Filter to requested demo year by start_date year (works even if season_year isn't populated)
          const y = Number(seasonYear);
          if (Number.isFinite(y)) {
            demoRows = asArray(demoRows).filter((r) => yearFromDate(r?.start_date) === y);
          }

          rows = demoRows;
        }

        if (!alive) return;

        setDemoSource(usedDemoSource);
        setCamps(asArray(rows));

        trackEvent({
          event_name: "discover_camps_loaded",
          source: "discover",
          mode: isPaid ? "paid" : "demo",
          season_year: seasonYear,
          count: asArray(rows).length,
          demo_source: usedDemoSource || null,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    // Paid requires athlete profile (your MVP rule)
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
            Demo source has 0 records for year {String(seasonYear)} (or filters excluded them).
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

  const title = "Discover";

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

        {/* Debug banner */}
        <div className="mb-4 mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span><b>mode:</b> {isPaid ? "paid" : "demo"}</span>
            <span><b>seasonYear:</b> {String(seasonYear)}</span>
            <span><b>accountId:</b> {season.accountId ? String(season.accountId) : "null"}</span>
            <span><b>entitled:</b> {String(!!season.hasAccess)}</span>
            <span><b>demoSource:</b> {demoSource || "-"}</span>
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
