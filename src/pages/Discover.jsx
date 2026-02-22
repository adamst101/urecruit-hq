// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";

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
  matchesState,
  matchesDateRange,
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
    const mode = sp.get("mode");
    const season = sp.get("season");
    const src = sp.get("src") || sp.get("source") || null;

    return {
      mode: mode ? String(mode).toLowerCase() : null,
      requestedSeason: safeNumber(season),
      src: src ? String(src) : null,
    };
  } catch {
    return { mode: null, requestedSeason: null, src: null };
  }
}

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

function footballSeasonYearForDate(d = new Date()) {
  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
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

function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;

  const st = String(row?.status || "").toLowerCase().trim();
  if (st === "inactive") return false;
  if (st === "active") return true;
  return true; // default to shown
}

// Schema-safe Event telemetry (no page-breaking required-field errors)
function trackEvent(payload) {
  try {
    const EventEntity = base44?.entities?.Event || base44?.entities?.Events;
    if (!EventEntity?.create) return;

    const now = new Date();
    const iso = now.toISOString();
    const day = iso.slice(0, 10);

    const eventName =
      payload?.event_name || payload?.event_type || payload?.title || payload?.name || "event";
    const sourcePlatform = payload?.source_platform || payload?.source || "web";
    const title = payload?.title || String(eventName);
    const sourceKey =
      payload?.source_key || payload?.sourceKey || `${String(sourcePlatform)}:${String(eventName)}`;
    const startDate = payload?.start_date || day;

    EventEntity.create({
      source_platform: String(sourcePlatform),
      event_type: String(eventName),
      title: String(title),
      source_key: String(sourceKey),
      start_date: String(startDate),
      payload_json: JSON.stringify(payload || {}),
      ts: iso,
    });
  } catch {
    // never break product UX on telemetry
  }
}

async function fetchByIds(entity, ids) {
  const clean = Array.from(new Set(asArray(ids).filter(Boolean).map(String)));
  if (!entity || clean.length === 0) return [];

  const tries = [
    { id: { in: clean } },
    { id: { $in: clean } },
    { _id: { in: clean } },
    { _id: { $in: clean } },
  ];

  for (const q of tries) {
    try {
      const rows = asArray(await entity.filter(q));
      if (rows.length) return rows;
    } catch {
      // keep trying
    }
  }

  try {
    const all = asArray((await entity.list?.()) ?? (await entity.filter?.({})));
    const set = new Set(clean);
    return all.filter((r) => set.has(String(r?.id ?? r?._id ?? "")));
  } catch {
    return [];
  }
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const [filterOpen, setFilterOpen] = useState(false);
  const { nf, setNF, clearFilters } = useCampFilters();
  const writeGate = useWriteGate();

  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);

  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const requestedSeason = url.requestedSeason;
  const debugMode = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      return sp.get("debug") === "1";
    } catch {
      return false;
    }
  }, [loc.search]);

  const currentPath = useMemo(
    () => (loc?.pathname || "") + (loc?.search || ""),
    [loc?.pathname, loc?.search]
  );
  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  const demoSession = useMemo(() => readDemoMode(), []);
  const forceDemoUrl = url.mode === "demo";
  const forceDemoSession = String(demoSession?.mode || "").toLowerCase() === "demo";

  const computedCurrentSeason = useMemo(() => footballSeasonYearForDate(new Date()), []);
  const computedDemoSeason = useMemo(() => computedCurrentSeason - 1, [computedCurrentSeason]);

  const entitledSeason = safeNumber(season?.entitlement?.season_year) || null;
  const isEntitled = !!season?.accountId && !!season?.hasAccess && !!entitledSeason;

  const effectiveMode = isEntitled ? "paid" : "demo";
  const isPaid = effectiveMode === "paid";

  const seasonYear = useMemo(() => {
    if (requestedSeason) {
      if (isEntitled && entitledSeason === requestedSeason) return requestedSeason;
      return isEntitled ? entitledSeason : computedDemoSeason;
    }
    return isEntitled ? entitledSeason : computedDemoSeason;
  }, [requestedSeason, isEntitled, entitledSeason, computedDemoSeason]);

  // Paid Discover: lock sport to athlete profile sport_id
  const athleteSportId = useMemo(() => {
    const sid = athleteProfile?.sport_id ?? athleteProfile?.sportId ?? null;
    return sid != null ? String(sid) : "";
  }, [athleteProfile]);

  // Hard enforce in paid mode (even if localStorage filters drift)
  useEffect(() => {
    if (!isPaid) return;
    if (!athleteSportId) return;

    const cur = Array.isArray(nf?.sports) ? nf.sports.map(String) : [];
    const ok = cur.length === 1 && cur[0] === athleteSportId;
    if (!ok) setNF({ sports: [athleteSportId], positions: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid, athleteSportId]);

  const paidMissingSport = useMemo(() => {
    return isPaid && !!athleteId && !athleteSportId;
  }, [isPaid, athleteId, athleteSportId]);

  // Season-aware gate only if a season is explicitly requested
  useEffect(() => {
    if (season?.isLoading) return;
    if (!requestedSeason) return;

    const entitled = safeNumber(season?.entitlement?.season_year) || null;

    if (!season?.accountId) {
      nav(`/Home?signin=1&next=${nextParam}`, { replace: true });
      return;
    }

    if (!entitled || entitled !== requestedSeason || !season?.hasAccess) {
      nav(
        `/Subscribe?season=${encodeURIComponent(requestedSeason)}` +
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
    nav,
  ]);

  // Load picklists for filter UI
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
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

  const [rawCamps, setRawCamps] = useState([]);
  const [loadingCamps, setLoadingCamps] = useState(true);
  const [campErr, setCampErr] = useState("");

  const [schoolById, setSchoolById] = useState({});
  const [sportById, setSportById] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoadingCamps(true);
      setCampErr("");
      setRawCamps([]);

      try {
        const CampEntity = base44?.entities?.Camp || base44?.entities?.Camps;
        if (!CampEntity?.filter) throw new Error("Camp entity not available.");

        // Prefer server-side filtering by season_year first.
        let byYear = [];
        try {
          byYear = asArray(await CampEntity.filter({ season_year: seasonYear }));
        } catch {
          byYear = [];
        }

        // If season_year stored as string, try again.
        if (byYear.length === 0) {
          try {
            byYear = asArray(await CampEntity.filter({ season_year: String(seasonYear) }));
          } catch {
            // ignore
          }
        }

        if (byYear.length > 0) {
          if (!cancelled) setRawCamps(byYear);
          return;
        }

        // Fallback: fetch and derive season on the client.
        const allRows = asArray(await CampEntity.filter({}));

        const filtered = allRows.filter((r) => {
          const syNum = safeNumber(r?.season_year ?? r?.seasonYear);
          if (syNum != null) return syNum === seasonYear;
          if (String((r?.season_year ?? r?.seasonYear) || "") === String(seasonYear)) return true;

          const derived = computeSeasonYearFootballFromStart(r?.start_date);
          return derived === seasonYear;
        });

        // Important: do NOT silently show all seasons.
        // If we cannot find the season, fail closed and show a clear action message.
        if (!cancelled) {
          setRawCamps(filtered);
          if (filtered.length === 0 && allRows.length > 0) {
            setCampErr(
              `No camps match season ${seasonYear}. Camp has ${allRows.length} rows, but season_year/start_date derivation did not match. If you just promoted data, check that season_year is populated on Camp rows.`
            );
          }
        }
      } catch (e) {
        const msg = String(e?.message || e);
        if (!cancelled) {
          setCampErr(msg);
          setRawCamps([]);
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

  // Enrich: schools + sports
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ids = asArray(rawCamps)
        .map((r) => normId(r?.school_id))
        .filter(Boolean);
      const sportIds = asArray(rawCamps)
        .map((r) => normId(r?.sport_id))
        .filter(Boolean);

      try {
        const rows = await fetchByIds(base44?.entities?.School, ids);
        const map = {};
        for (const s of asArray(rows)) {
          const id = String(normId(s?.id ?? s?._id) || "");
          if (!id) continue;
          map[id] = s;
        }
        if (!cancelled) setSchoolById(map);
      } catch {
        if (!cancelled) setSchoolById({});
      }

      try {
        const rows = await fetchByIds(base44?.entities?.Sport, sportIds);
        const map = {};
        for (const sp of asArray(rows)) {
          const id = String(normId(sp?.id ?? sp?._id) || "");
          if (!id) continue;
          map[id] = sp;
        }
        if (!cancelled) setSportById(map);
      } catch {
        if (!cancelled) setSportById({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rawCamps]);

  const rows = useMemo(() => {
    const src = asArray(rawCamps);

    const effectiveSports =
      isPaid && athleteSportId
        ? [athleteSportId]
        : Array.isArray(nf?.sports)
        ? nf.sports
        : [];

    return src
      .filter((r) => readActiveFlag(r) === true)
      .filter((r) => {
        if (!matchesDivision(r, nf.divisions)) return false;
        if (!matchesSport(r, effectiveSports)) return false;
        if (!matchesPositions(r, nf.positions)) return false;
        if (!matchesState(r, nf.state)) return false;
        if (!matchesDateRange(r, nf.startDate || "", nf.endDate || "")) return false;
        return true;
      });
  }, [rawCamps, nf, isPaid, athleteSportId]);

  const debugStats = useMemo(() => {
    if (!debugMode) return null;
    return {
      mode: effectiveMode,
      seasonYear,
      requestedSeason: requestedSeason || null,
      entitledSeason,
      hasAccess: !!season?.hasAccess,
      accountId: season?.accountId ? "yes" : "no",
      athleteId: athleteId ? "yes" : "no",
      athleteSportId: athleteSportId || null,
      nfSports: Array.isArray(nf?.sports) ? nf.sports : [],
      nfState: nf?.state || null,
      nfDivisions: Array.isArray(nf?.divisions) ? nf.divisions : [],
      nfPositions: Array.isArray(nf?.positions) ? nf.positions : [],
      nfStart: nf?.startDate || null,
      nfEnd: nf?.endDate || null,
      rawCamps: Array.isArray(rawCamps) ? rawCamps.length : 0,
      rows: Array.isArray(rows) ? rows.length : 0,
      campErr: campErr || null,
    };
  }, [
    debugMode,
    effectiveMode,
    seasonYear,
    requestedSeason,
    entitledSeason,
    season?.hasAccess,
    season?.accountId,
    athleteId,
    athleteSportId,
    nf,
    rawCamps,
    rows,
    campErr,
  ]);

  const loading = season?.isLoading || identityLoading || loadingCamps;

  useEffect(() => {
    const key = `evt_discover_viewed_${seasonYear}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }

    trackEvent({
      event_name: "discover_viewed",
      effective_mode: effectiveMode,
      season_year: seasonYear,
      account_id: season?.accountId || null,
      entitled: isEntitled ? 1 : 0,
      requested_season: requestedSeason || null,
      force_demo_url: forceDemoUrl ? 1 : 0,
      force_demo_session: forceDemoSession ? 1 : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonYear]);

  const openFiltersOrProfile = () => {
    if (paidMissingSport) {
      nav("/Profile");
      return;
    }
    setFilterOpen(true);
  };

  const renderBody = () => {
    if (loading) return <div className="py-10 text-center text-slate-500">Loading…</div>;

    if (campErr) {
      return (
        <Card className="p-5 border-amber-200 bg-amber-50">
          <div className="text-lg font-semibold text-amber-900">Camps not available</div>
          <div className="mt-2 text-sm text-amber-900/80">{campErr}</div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => nav("/AdminOps")}>Open Admin Ops</Button>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </div>
          <div className="mt-3 text-xs text-amber-900/70">
            Tip: If you just ingested camps, run promotion (CampDemo → Camp) in Admin Ops so paid Discover can read Camp.
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
            <Button onClick={() => nav("/Profile")}>Go to Profile</Button>
          </div>
        </Card>
      );
    }

    if (!rows.length) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">No camps found</div>
          <div className="mt-1 text-sm text-slate-600">
            No camps found for season {seasonYear} (or filters excluded them).
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
            <Button onClick={openFiltersOrProfile}>{paidMissingSport ? "Complete Profile" : "Edit filters"}</Button>
          </div>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {rows.map((r) => {
          const campId = String(r?.id ?? "");
          const schoolId = String(normId(r?.school_id) ?? "");
          const sportId = String(r?.sport_id ?? "");

          const srow = schoolById[schoolId] || null;
          const sprow = sportById[sportId] || null;

          const schoolName =
            srow?.school_name || srow?.name || r?.school_name || r?.school || "Unknown School";
          const schoolCity = srow?.city || r?.city || null;
          const schoolState = srow?.state || r?.state || null;
          const schoolDivision =
            srow?.division || srow?.school_division || r?.division || r?.school_division || null;
          const schoolLogo =
            srow?.logo_url || srow?.school_logo_url || srow?.logo || srow?.image_url || null;

          const sportName = sprow?.sport_name || sprow?.name || r?.sport_name || r?.sport || "Sport";

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
            notes: r?.notes ?? null,
            city: r?.city ?? schoolCity,
            state: r?.state ?? schoolState,
          };

          const school = {
            id: schoolId,
            name: schoolName,
            school_name: schoolName,
            city: schoolCity,
            state: schoolState,
            division: schoolDivision,
            logo_url: schoolLogo,
          };

          const sport = {
            id: sportId,
            name: sportName,
            sport_name: sportName,
          };

          const posObjs = asArray(r?.position_ids).map((pid) => ({
            id: String(pid),
            name: String(pid),
          }));

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
              onClick={() => {
                try {
                  nav(
                    isPaid
                      ? `/CampDetail?id=${encodeURIComponent(campId)}`
                      : `/CampDetailDemo?id=${encodeURIComponent(campId)}`
                  );
                } catch {
                  // ignore
                }
              }}
              disabledFavorite={!isPaid}
              onFavoriteToggle={async () => {
                if (!isPaid) return;
                const ok = await (writeGate?.ensure ? writeGate.ensure("favorite") : true);
                if (!ok) return;
                trackEvent({ event_name: "favorite_toggle", source: "discover", camp_id: campId });
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
            <div className="text-xs text-slate-500">{isPaid ? "Paid workspace" : `Demo season: ${seasonYear}`}</div>
          </div>

          <Button variant="outline" onClick={openFiltersOrProfile}>
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            {paidMissingSport ? "Complete Profile" : "Filter"}
          </Button>
        </div>

        {debugStats && (
          <Card className="p-3 mt-4 border border-slate-200 bg-white">
            <div className="text-sm font-semibold">Debug</div>
            <pre className="text-xs overflow-auto mt-2">{JSON.stringify(debugStats, null, 2)}</pre>
          </Card>
        )}

        <div className={debugStats ? "mt-4" : "mt-6"}>{renderBody()}</div>

        <FilterSheet
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={nf}
          onFilterChange={setNF}
          sports={sports}
          positions={positions}
          onApply={() => setFilterOpen(false)}
          onClear={() => {
            clearFilters();
            setFilterOpen(false);
          }}
          lockSportId={isPaid && athleteSportId ? athleteSportId : ""}
        />
      </div>

      <BottomNav />
    </div>
  );
}
