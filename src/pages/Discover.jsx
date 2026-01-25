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

/* -------------------------
   Helpers (MVP-safe)
------------------------- */
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
    const mode = sp.get("mode"); // "demo" may be present from Home demo CTA
    const season = sp.get("season");
    const src = sp.get("src") || sp.get("source") || null;

    return {
      mode: mode ? String(mode).toLowerCase() : null,
      requestedSeason: safeNumber(season),
      src: src ? String(src) : null
    };
  } catch {
    return { mode: null, requestedSeason: null, src: null };
  }
}

// Return YYYY-MM-DD (UTC) or null
function toISODate(dateInput) {
  if (!dateInput) return null;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  if (typeof dateInput === "string") {
    const s = dateInput.trim();
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      const mm = String(mdy[1]).padStart(2, "0");
      const dd = String(mdy[2]).padStart(2, "0");
      const yyyy = String(mdy[3]);
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Football rollover: Feb 1 (UTC)
function footballSeasonYearForDate(d = new Date()) {
  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0)); // Feb 1
  return d >= feb1 ? y : y - 1;
}

function computeSeasonYearFootballFromStart(startDate) {
  const iso = toISODate(startDate);
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
  return d >= feb1 ? y : y - 1;
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

/* -------------------------
   Discover (MVP)
   - Demo uses Camp table for previous season
   - Paid uses Camp table for entitled season
   - Enrichment from School/Sport/Position with independent errors
------------------------- */
export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const requestedSeason = url.requestedSeason;

  // ✅ If you applied the updated hook signature, this validates entitlement against ?season=YYYY too.
  // If not, it still works (extra arg ignored).
  const season = useSeasonAccess({ requestedSeasonYear: requestedSeason || null });

  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  // Filters + UI state
  const [filterOpen, setFilterOpen] = useState(false);
  const { nf, setNF, clearFilters } = useCampFilters();
  const writeGate = useWriteGate();

  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);

  const currentPath = useMemo(
    () => (loc?.pathname || "") + (loc?.search || ""),
    [loc?.pathname, loc?.search]
  );
  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  // “Demo flags” may exist in URL/session, but entitled ALWAYS wins.
  const demoSession = useMemo(() => readDemoMode(), []);
  const forceDemoUrl = url.mode === "demo";
  const forceDemoSession = String(demoSession?.mode || "").toLowerCase() === "demo";

  // Compute current/demo seasons (football rule) for demo browsing
  const computedCurrentSeason = useMemo(() => footballSeasonYearForDate(new Date()), []);
  const computedDemoSeason = useMemo(() => computedCurrentSeason - 1, [computedCurrentSeason]);

  // Paid signal (entitled)
  const entitledSeason = safeNumber(season?.entitlement?.season_year) || null;
  const isEntitled = !!season?.accountId && !!season?.hasAccess && !!entitledSeason;

  // ✅ Effective mode: paid always wins once entitled (ignore demo flags)
  const effectiveMode = isEntitled ? "paid" : "demo";
  const isPaid = effectiveMode === "paid";

  // ✅ Effective seasonYear:
  // - If URL requests a season and you're entitled to it => use it
  // - Otherwise:
  //   - paid => entitledSeason
  //   - demo => previous season
  const seasonYear = useMemo(() => {
    if (requestedSeason) {
      if (isEntitled && entitledSeason === requestedSeason) return requestedSeason;
      return isEntitled ? entitledSeason : computedDemoSeason;
    }
    return isEntitled ? entitledSeason : computedDemoSeason;
  }, [requestedSeason, isEntitled, entitledSeason, computedDemoSeason]);

  /* -------------------------------------------------------
     URL cleanup:
     If user is entitled but URL says mode=demo, remove it.
     This prevents "I’m paid but URL says demo" confusion.
  ------------------------------------------------------- */
  useEffect(() => {
    if (season?.isLoading) return;
    if (!isEntitled) return;
    if (!forceDemoUrl && !forceDemoSession) return;

    // Build a clean Discover URL (keep ?season if it matches entitlement)
    const keepSeason = requestedSeason && requestedSeason === entitledSeason;
    const clean = keepSeason
      ? `${createPageUrl("Discover")}?season=${encodeURIComponent(String(entitledSeason))}`
      : createPageUrl("Discover");

    if (clean !== currentPath) {
      nav(clean, { replace: true });
    }
  }, [
    season?.isLoading,
    isEntitled,
    forceDemoUrl,
    forceDemoSession,
    requestedSeason,
    entitledSeason,
    currentPath,
    nav
  ]);

  /* -------------------------------------------------------
     Season-aware gate (ONLY when ?season=YYYY is present)
     - Not logged in => go Home?signin=1&next=...
     - Logged in but not entitled to that season => Subscribe?season=...
     - DO NOT silently downgrade
  ------------------------------------------------------- */
  useEffect(() => {
    if (season?.isLoading) return;
    if (!requestedSeason) return;

    const entitled = safeNumber(season?.entitlement?.season_year) || null;

    if (!season?.accountId) {
      nav(createPageUrl("Home") + `?signin=1&next=${nextParam}`, { replace: true });
      return;
    }

    if (!entitled || entitled !== requestedSeason || !season?.hasAccess) {
      nav(
        createPageUrl("Subscribe") +
          `?season=${encodeURIComponent(requestedSeason)}` +
          `&source=${encodeURIComponent("discover_season_gate")}` +
          `&next=${nextParam}`,
        { replace: true }
      );
    }
  }, [
    season?.isLoading,
    season?.accountId,
    season?.hasAccess,
    season?.entitlement,
    requestedSeason,
    nextParam,
    nav
  ]);

  /* -------------------------------------------------------
     Load camps from Camp table (single source of truth)
     Strategy:
       A) Try server filter by season_year
       B) If none returned (or filter fails), load all and client-filter
  ------------------------------------------------------- */
  const [rawCamps, setRawCamps] = useState([]);
  const [loadingCamps, setLoadingCamps] = useState(true);
  const [campErr, setCampErr] = useState("");

  const [counts, setCounts] = useState({
    camp_year: 0,
    camp_all: 0,
    fallback_used: false
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoadingCamps(true);
      setCampErr("");
      setRawCamps([]);
      setCounts({ camp_year: 0, camp_all: 0, fallback_used: false });

      try {
        let byYear = [];
        try {
          byYear = asArray(await base44.entities.Camp.filter({ season_year: seasonYear }));
        } catch {
          byYear = [];
        }

        if (byYear.length > 0) {
          if (!cancelled) {
            setRawCamps(byYear);
            setCounts({ camp_year: byYear.length, camp_all: byYear.length, fallback_used: false });
          }
          return;
        }

        // fallback: pull all and compute derived season year
        const allRows = asArray(await base44.entities.Camp.filter({}));

        const filtered = allRows.filter((r) => {
          const sy = safeNumber(r?.season_year);
          if (sy != null) return sy === seasonYear;

          const derived = computeSeasonYearFootballFromStart(r?.start_date);
          return derived === seasonYear;
        });

        if (!cancelled) {
          setRawCamps(filtered);
          setCounts({ camp_year: filtered.length, camp_all: allRows.length, fallback_used: true });
        }
      } catch (e) {
        const msg = String(e?.message || e);
        if (!cancelled) {
          setCampErr(msg);
          setRawCamps([]);
          setCounts({ camp_year: 0, camp_all: 0, fallback_used: false });
        }
      } finally {
        if (!cancelled) setLoadingCamps(false);
      }
    }

    if (season?.isLoading) return;
    run();

    return () => {
      cancelled = true;
    };
  }, [season?.isLoading, seasonYear]);

  /* -------------------------------------------------------
     Enrichment: School / Sport / Position maps
     - independent errors per entity
     - we DO NOT block camps rendering if enrichment fails
     - for MVP we load all rows (works now; optimize later)
  ------------------------------------------------------- */
  const [schoolMap, setSchoolMap] = useState({});
  const [sportMap, setSportMap] = useState({});
  const [posMap, setPosMap] = useState({});

  const [schoolErr, setSchoolErr] = useState("");
  const [sportErr, setSportErr] = useState("");
  const [posErr, setPosErr] = useState("");

  const [enrichCounts, setEnrichCounts] = useState({
    schools: 0,
    sports: 0,
    positions: 0
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setSchoolErr("");
      setSportErr("");
      setPosErr("");
      setSchoolMap({});
      setSportMap({});
      setPosMap({});
      setEnrichCounts({ schools: 0, sports: 0, positions: 0 });

      // Only attempt enrichment if we have camps to enrich
      const camps = asArray(rawCamps);
      if (!camps.length) return;

      // MVP perf guard: if it grows huge, skip “load all” enrichment
      // (You can tune this number later)
      const BIG = 1200;
      const tooBig = camps.length > BIG;

      // Helpers to build maps safely
      const buildIdMap = (rows) => {
        const m = {};
        asArray(rows).forEach((r) => {
          if (r?.id) m[String(r.id)] = r;
        });
        return m;
      };

      // Schools
      if (!tooBig) {
        try {
          const rows = asArray(await base44.entities.School.filter({}));
          if (!cancelled) {
            setSchoolMap(buildIdMap(rows));
            setEnrichCounts((p) => ({ ...p, schools: rows.length }));
          }
        } catch (e) {
          if (!cancelled) setSchoolErr(String(e?.message || e));
        }
      } else {
        setSchoolErr(`Skipped School enrichment (too many camps: ${camps.length}).`);
      }

      // Sports
      if (!tooBig) {
        try {
          const rows = asArray(await base44.entities.Sport.filter({}));
          if (!cancelled) {
            setSportMap(buildIdMap(rows));
            setEnrichCounts((p) => ({ ...p, sports: rows.length }));
          }
        } catch (e) {
          if (!cancelled) setSportErr(String(e?.message || e));
        }
      } else {
        setSportErr(`Skipped Sport enrichment (too many camps: ${camps.length}).`);
      }

      // Positions
      if (!tooBig) {
        try {
          const rows = asArray(await base44.entities.Position.filter({}));
          if (!cancelled) {
            setPosMap(buildIdMap(rows));
            setEnrichCounts((p) => ({ ...p, positions: rows.length }));
          }
        } catch (e) {
          if (!cancelled) setPosErr(String(e?.message || e));
        }
      } else {
        setPosErr(`Skipped Position enrichment (too many camps: ${camps.length}).`);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [rawCamps]);

  /* -------------------------------------------------------
     Apply filters (division/sport/positions/date range)
  ------------------------------------------------------- */
  const rows = useMemo(() => {
    const src = asArray(rawCamps);
    return src.filter((r) => {
      if (!matchesDivision(r, nf.divisions)) return false;
      if (!matchesSport(r, nf.sports)) return false;
      if (!matchesPositions(r, nf.positions)) return false;
      if (!matchesDateRange(r, nf.startDate || "", nf.endDate || "")) return false;
      return true;
    });
  }, [rawCamps, nf]);

  const loading = season?.isLoading || identityLoading || loadingCamps;

  // Track page view (dedupe per season)
  useEffect(() => {
    const key = `evt_discover_viewed_${seasonYear}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "discover_viewed",
      effective_mode: effectiveMode,
      season_year: seasonYear,
      account_id: season?.accountId || null,
      entitled: isEntitled ? 1 : 0,
      requested_season: requestedSeason || null
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonYear]);

  /* -------------------------------------------------------
     Render helpers
  ------------------------------------------------------- */
  const renderBody = () => {
    if (loading) return <div className="py-10 text-center text-slate-500">Loading…</div>;

    if (campErr) {
      return (
        <Card className="p-5 border-rose-200 bg-rose-50">
          <div className="text-lg font-semibold text-rose-900">Error loading camps</div>
          <div className="mt-2 text-sm text-rose-900/80">{campErr}</div>
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

    if (!rows.length) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">No camps found</div>
          <div className="mt-1 text-sm text-slate-600">
            {effectiveMode === "demo"
              ? `No demo camps found for season ${seasonYear} (or filters excluded them).`
              : `No camps found for season ${seasonYear} (or filters excluded them).`}
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
        {rows.map((r) => {
          const campId = String(r?.id ?? "");
          const schoolId = String(r?.school_id ?? "");
          const sportId = String(r?.sport_id ?? "");

          const schoolRow = schoolMap[schoolId] || null;
          const sportRow = sportMap[sportId] || null;

          const camp = {
            id: campId,
            camp_name: r?.camp_name ?? r?.name ?? "Camp",
            name: r?.camp_name ?? r?.name ?? "Camp",
            start_date: r?.start_date ?? null,
            end_date: r?.end_date ?? null,
            cost: r?.price ?? null,
            price: r?.price ?? null,
            url: r?.link_url ?? r?.source_url ?? null,
            link_url: r?.link_url ?? null,
            notes: r?.notes ?? null
          };

          const school = {
            id: schoolId,
            name: schoolRow?.school_name || schoolRow?.name || r?.school_name || "Unknown School",
            city: schoolRow?.city || r?.city || null,
            state: schoolRow?.state || r?.state || null
          };

          const sport = {
            id: sportId,
            name: sportRow?.sport_name || sportRow?.name || r?.sport_name || "Football"
          };

          const posObjs = asArray(r?.position_ids)
            .map((pid) => {
              const row = posMap[String(pid)];
              return {
                id: String(pid),
                name: row?.position_name || row?.name || String(pid)
              };
            });

          return (
            <CampCard
              key={campId}
              camp={camp}
              school={school}
              sport={sport}
              positions={posObjs}
              isFavorite={false}
              isRegistered={false}
              mode={isPaid ? "paid" : "demo"}
              onToggleFavorite={async () => {
                if (!isPaid) {
                  trackEvent({ event_name: "demo_write_blocked", source: "discover", action: "favorite" });
                  return;
                }
                const ok = await (writeGate?.ensure ? writeGate.ensure("favorite") : true);
                if (!ok) return;
                trackEvent({ event_name: "favorite_toggle", source: "discover", camp_id: campId });
              }}
              onToggleRegistered={async () => {
                if (!isPaid) {
                  trackEvent({ event_name: "demo_write_blocked", source: "discover", action: "registered" });
                  return;
                }
                const ok = await (writeGate?.ensure ? writeGate.ensure("registered") : true);
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
              {isPaid ? `Paid season: ${seasonYear}` : `Demo season: ${seasonYear}`}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filter
          </Button>
        </div>

        {/* Truth banner (MVP testing) */}
        <div className="mb-4 mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span><b>mode:</b> {effectiveMode}</span>
            <span><b>seasonYear:</b> {String(seasonYear)}</span>
            <span><b>accountId:</b> {season?.accountId ? String(season.accountId) : "null"}</span>
            <span><b>entitled:</b> {String(!!season?.entitlement && !!season?.hasAccess)}</span>
            <span><b>requestedSeason:</b> {requestedSeason ? String(requestedSeason) : "null"}</span>
            <span><b>Camp(year/all):</b> {counts.camp_year}/{counts.camp_all}</span>
            <span><b>fallbackUsed:</b> {String(!!counts.fallback_used)}</span>

            <span><b>School:</b> {schoolErr ? "ERR" : `ok(${enrichCounts.schools})`}</span>
            <span><b>Sport:</b> {sportErr ? "ERR" : `ok(${enrichCounts.sports})`}</span>
            <span><b>Position:</b> {posErr ? "ERR" : `ok(${enrichCounts.positions})`}</span>
          </div>

          {(schoolErr || sportErr || posErr) ? (
            <div className="mt-2 text-[11px] text-amber-700">
              {schoolErr ? <div><b>School error:</b> {schoolErr}</div> : null}
              {sportErr ? <div><b>Sport error:</b> {sportErr}</div> : null}
              {posErr ? <div><b>Position error:</b> {posErr}</div> : null}
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
