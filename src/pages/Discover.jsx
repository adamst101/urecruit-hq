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

// ---------------- helpers ----------------
function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
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

// Return YYYY from either season_year or start_date
function getCampSeasonYear(row) {
  const sy = safeNumber(row?.season_year);
  if (sy) return sy;

  const s = String(row?.start_date || "").trim();
  if (!s) return null;

  // ISO: YYYY-MM-DD
  const iso = s.match(/^(\d{4})-\d{2}-\d{2}$/);
  if (iso) return safeNumber(iso[1]);

  // M/D/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return safeNumber(mdy[3]);

  // Date parse fallback
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getUTCFullYear();

  return null;
}

// Best-effort fetch wrapper (so a missing Entity doesn’t blank the page)
async function safeFilter(entityName, filterObj) {
  try {
    const ent = base44?.entities?.[entityName];
    if (!ent || typeof ent.filter !== "function") {
      return { ok: false, error: `Entity "${entityName}" not available`, rows: [] };
    }
    const rows = await ent.filter(filterObj || {});
    return { ok: true, error: "", rows: asArray(rows) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), rows: [] };
  }
}

// ---------------- component ----------------
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

  // Session demo mode (set by Home "Access Demo")
  const demoSession = useMemo(() => readDemoMode(), []);
  const forceDemoSession = String(demoSession?.mode || "").toLowerCase() === "demo";

  // Entitlement signals
  const entitledSeason = safeNumber(season?.entitlement?.season_year) || null;
  const isEntitledNow = !!season?.accountId && !!season?.hasAccess && !!entitledSeason;

  /**
   * ✅ ADD: Paid override redirect
   * If user is entitled, always drop demo forcing and normalize URL to paid season.
   */
  useEffect(() => {
    if (season?.isLoading) return;

    if (!isEntitledNow) return;

    const sp = new URLSearchParams(loc.search || "");
    const hasDemoParam = String(sp.get("mode") || "").toLowerCase() === "demo";

    // If URL is forcing demo OR user is sitting on demo-session forcing, normalize to paid Discover
    if (hasDemoParam || forceDemoSession) {
      // clear session demo flag (best-effort)
      try {
        // new key (from our demoMode.jsx)
        sessionStorage.removeItem("demoMode_v1");
        // older keys (if you had them at some point)
        sessionStorage.removeItem("demoMode");
        sessionStorage.removeItem("demoSeasonYear");
        sessionStorage.removeItem("demo_mode_v1");
        sessionStorage.removeItem("demo_year_v1");
      } catch {}

      // remove mode=demo and set season to entitled season
      sp.delete("mode");
      sp.set("season", String(entitledSeason));

      nav(`${createPageUrl("Discover")}?${sp.toString()}`, { replace: true });
    }
  }, [
    season?.isLoading,
    isEntitledNow,
    entitledSeason,
    loc.search,
    nav,
    forceDemoSession
  ]);

  // Effective mode: entitled always wins unless URL explicitly forces demo (but paid override will normalize anyway)
  const effectiveMode = useMemo(() => {
    if (forceDemoUrl) return "demo";
    if (forceDemoSession) return "demo";
    return season?.mode === "paid" ? "paid" : "demo";
  }, [forceDemoUrl, forceDemoSession, season?.mode]);

  const isPaid = effectiveMode === "paid";

  // Which year are we browsing?
  const browseSeasonYear = useMemo(() => {
    // If entitled, always use entitled season (even if URL missing)
    if (isEntitledNow) return entitledSeason;

    // Demo: prefer session/demo defaults, but allow url.seasonYear when forcing demo
    if (forceDemoUrl || forceDemoSession) {
      return (
        url.seasonYear ||
        safeNumber(demoSession?.seasonYear) ||
        safeNumber(season?.demoYear) ||
        safeNumber(season?.seasonYear)
      );
    }

    // Non-demo: honor requested season if present, else whatever the hook says
    if (url.seasonYear) return url.seasonYear;
    return safeNumber(season?.seasonYear);
  }, [
    isEntitledNow,
    entitledSeason,
    forceDemoUrl,
    forceDemoSession,
    url.seasonYear,
    demoSession?.seasonYear,
    season?.demoYear,
    season?.seasonYear
  ]);

  // Season-aware gate:
  // If the URL requests a non-demo season and user isn't entitled, do not silently downgrade.
  useEffect(() => {
    if (season?.isLoading) return;

    const requested = url.seasonYear; // from ?season=YYYY
    const demoYear = safeNumber(season?.demoYear);

    // Explicit demo URL always wins
    if (forceDemoUrl) return;

    // No season requested → allow
    if (!requested) return;

    // Requesting demo year is allowed without auth
    if (demoYear && String(requested) === String(demoYear)) return;

    // Non-demo season requested → gate
    if (!season?.accountId) {
      nav(createPageUrl("Home") + `?signin=1&next=${nextParam}`, { replace: true });
      return;
    }

    // Signed in but not entitled for current season -> send to subscribe selling requested season
    if (!season?.hasAccess) {
      nav(
        createPageUrl("Subscribe") +
          `?season=${encodeURIComponent(requested)}` +
          `&source=${encodeURIComponent("discover_season_gate")}` +
          `&next=${nextParam}`,
        { replace: true }
      );
    }
  }, [
    season?.isLoading,
    season?.accountId,
    season?.hasAccess,
    season?.demoYear,
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

  // Data state (no base44.useQuery — Base44-safe)
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(true);

  const [errCampDemo, setErrCampDemo] = useState("");
  const [errCamp, setErrCamp] = useState("");

  const [counts, setCounts] = useState({
    campDemoAll: 0,
    campDemoYear: 0,
    campAll: 0,
    campYear: 0,
    demoSource: ""
  });

  // Load camps
  useEffect(() => {
    let alive = true;

    async function run() {
      if (season?.isLoading) return;

      setLoadingRows(true);
      setErrCampDemo("");
      setErrCamp("");
      setRows([]);

      const year = safeNumber(browseSeasonYear);

      // For paid: we only use Camp (your real table)
      if (isPaid) {
        const rCamp = await safeFilter("Camp", {});
        if (!alive) return;

        if (!rCamp.ok) setErrCamp(rCamp.error || "Camp fetch failed");

        const all = asArray(rCamp.rows);
        const yearRows = year ? all.filter((x) => getCampSeasonYear(x) === year) : all;

        setCounts((p) => ({
          ...p,
          campAll: all.length,
          campYear: yearRows.length,
          campDemoAll: 0,
          campDemoYear: 0,
          demoSource: "paid:Camp"
        }));

        setRows(yearRows);
        setLoadingRows(false);
        return;
      }

      // Demo: try CampDemo first, then fallback to Camp
      const rDemo = await safeFilter("CampDemo", {});
      if (!alive) return;

      if (!rDemo.ok) setErrCampDemo(rDemo.error || "CampDemo fetch failed");

      const demoAll = asArray(rDemo.rows);
      const demoYearRows = year ? demoAll.filter((x) => getCampSeasonYear(x) === year) : demoAll;

      // If CampDemo has rows for the year, use them. Otherwise, fallback to Camp.
      if (demoYearRows.length > 0) {
        setCounts((p) => ({
          ...p,
          campDemoAll: demoAll.length,
          campDemoYear: demoYearRows.length,
          campAll: 0,
          campYear: 0,
          demoSource: "CampDemo(year)"
        }));
        setRows(demoYearRows);
        setLoadingRows(false);
        return;
      }

      // Fallback to Camp
      const rCamp = await safeFilter("Camp", {});
      if (!alive) return;

      if (!rCamp.ok) setErrCamp(rCamp.error || "Camp fetch failed");

      const campAll = asArray(rCamp.rows);
      const campYearRows = year ? campAll.filter((x) => getCampSeasonYear(x) === year) : campAll;

      setCounts((p) => ({
        ...p,
        campDemoAll: demoAll.length,
        campDemoYear: demoYearRows.length,
        campAll: campAll.length,
        campYear: campYearRows.length,
        demoSource: "Camp(year)"
      }));

      setRows(campYearRows);
      setLoadingRows(false);
    }

    run().catch(() => {
      if (!alive) return;
      setLoadingRows(false);
    });

    return () => {
      alive = false;
    };
  }, [season?.isLoading, isPaid, browseSeasonYear]);

  const loading = season?.isLoading || identityLoading || loadingRows;

  // Apply filters on top of loaded rows
  const filtered = useMemo(() => {
    const src = asArray(rows);

    return src.filter((r) => {
      if (!matchesDivision(r, nf.divisions)) return false;
      if (!matchesSport(r, nf.sports)) return false;
      if (!matchesPositions(r, nf.positions)) return false;
      if (!matchesDateRange(r, nf.startDate || "", nf.endDate || "")) return false;
      return true;
    });
  }, [rows, nf]);

  const title = "Discover";

  const renderBody = () => {
    if (loading) return <div className="py-10 text-center text-slate-500">Loading…</div>;

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

    if (!filtered.length) {
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
        {filtered.map((r) => {
          const campId = String(r?.camp_id ?? r?.id ?? "");
          const schoolId = String(r?.school_id ?? "");
          const sportId = String(r?.sport_id ?? "");

          const camp = {
            id: campId,
            name: r?.camp_name ?? r?.name ?? null,
            camp_name: r?.camp_name ?? r?.name ?? null,
            start_date: r?.start_date ?? null,
            end_date: r?.end_date ?? null,
            cost: r?.price ?? r?.cost ?? null,
            division: r?.division ?? null,
            url: r?.link_url ?? r?.url ?? null
          };

          const school = {
            id: schoolId,
            name: r?.school_name ?? null,
            school_name: r?.school_name ?? null,
            city: r?.school_city ?? r?.city ?? null,
            state: r?.school_state ?? r?.state ?? null,
            conference: r?.school_conference ?? null
          };

          const sport = {
            id: sportId,
            name: r?.sport_name ?? null,
            sport_name: r?.sport_name ?? null
          };

          const posObjs = asArray(r?.position_ids).map((pid) => ({ id: String(pid) }));

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
              {isPaid ? `Paid workspace · Season ${browseSeasonYear}` : `Demo season: ${browseSeasonYear}`}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filter
          </Button>
        </div>

        {/* Data + Errors banner */}
        <div className="mb-4 mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span><b>effectiveMode:</b> {effectiveMode}</span>
            <span><b>isEntitledNow:</b> {String(isEntitledNow)}</span>
            <span><b>entitledSeason:</b> {entitledSeason ? String(entitledSeason) : "null"}</span>
            <span><b>browseSeasonYear:</b> {browseSeasonYear ? String(browseSeasonYear) : "null"}</span>
            <span><b>forceDemo(url):</b> {String(forceDemoUrl)}</span>
            <span><b>forceDemo(session):</b> {String(forceDemoSession)}</span>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-600">
            <span><b>CampDemo(year/all):</b> {counts.campDemoYear}/{counts.campDemoAll}</span>
            <span><b>Camp(year/all):</b> {counts.campYear}/{counts.campAll}</span>
            <span><b>demoSource:</b> {counts.demoSource || "-"}</span>
          </div>

          {(errCampDemo || errCamp) ? (
            <div className="mt-2 text-[11px]">
              {errCampDemo ? (
                <div className="text-rose-700"><b>CampDemo error:</b> {errCampDemo}</div>
              ) : null}
              {errCamp ? (
                <div className="text-rose-700"><b>Camp error:</b> {errCamp}</div>
              ) : null}
            </div>
          ) : null}
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
