// src/pages/Discover.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

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

/* -------------------------
   Discover UX (Option A)
   - list-first
   - sticky chips row
   - sort
   - skeleton loading
   - paid sport lock
   - IMPORTANT: favorites use event_key (stable across promotions)
------------------------- */

function SkeletonCard() {
  return (
    <Card className="p-4 border-slate-200 bg-white">
      <div className="animate-pulse">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-slate-200" />
            <div className="min-w-0">
              <div className="h-3 w-24 bg-slate-200 rounded" />
              <div className="h-5 w-48 bg-slate-200 rounded mt-2" />
              <div className="h-4 w-40 bg-slate-200 rounded mt-2" />
            </div>
          </div>
          <div className="h-8 w-8 rounded bg-slate-200" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="h-4 w-32 bg-slate-200 rounded" />
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-4 w-24 bg-slate-200 rounded" />
        </div>
        <div className="mt-4 flex gap-2">
          <div className="h-9 w-24 bg-slate-200 rounded" />
          <div className="h-9 w-28 bg-slate-200 rounded" />
        </div>
      </div>
    </Card>
  );
}

function chipLabel(key, nf) {
  if (!nf) return "";
  if (key === "state") return nf.state ? String(nf.state).toUpperCase() : "State";
  if (key === "dates") {
    if (!nf.startDate && !nf.endDate) return "Dates";
    if (nf.startDate && !nf.endDate) return `From ${nf.startDate}`;
    if (!nf.startDate && nf.endDate) return `Until ${nf.endDate}`;
    return `${nf.startDate} → ${nf.endDate}`;
  }
  if (key === "division") return "Division";
  if (key === "position") return "Position";
  return "";
}

function hasActiveFilters(nf, isPaid) {
  if (!nf) return false;
  const divOn = Array.isArray(nf.divisions) && nf.divisions.length > 0;
  const posOn = Array.isArray(nf.positions) && nf.positions.length > 0;
  const stateOn = !!nf.state;
  const dateOn = !!nf.startDate || !!nf.endDate;
  const sportOn = !isPaid && Array.isArray(nf.sports) && nf.sports.length > 0;
  return divOn || posOn || stateOn || dateOn || sportOn;
}

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
  return true;
}

// Schema-safe Event telemetry
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
    // never break UX on telemetry
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
  const [sortKey, setSortKey] = useState("soonest"); // soonest | price_low | school_az
  const { nf, setNF, clearFilters } = useCampFilters();
  const writeGate = useWriteGate();

  // Paid-only: athlete intent map for favorite state and "My Camps" parity
  const [intentByKey, setIntentByKey] = useState({});
  const intentRefreshSeq = useRef(0);

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

  // Paid-only: load camp intents for favorite state
  // IMPORTANT: intents are keyed by camp_id which we will store as event_key going forward
  useEffect(() => {
    if (!isPaid) {
      setIntentByKey({});
      return;
    }
    if (!athleteId) return;

    let cancelled = false;
    const seq = ++intentRefreshSeq.current;

    (async () => {
      try {
        const rows = asArray(await base44?.entities?.CampIntent?.filter?.({ athlete_id: String(athleteId) }));
        if (cancelled) return;
        if (seq !== intentRefreshSeq.current) return;

        const map = {};
        for (const r of rows) {
          const key = String(r?.camp_id || "");
          if (!key) continue;
          map[key] = r;
        }
        setIntentByKey(map);
      } catch {
        if (!cancelled) setIntentByKey({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPaid, athleteId]);

  async function upsertIntent(intentKey, nextStatus) {
    if (!isPaid) return { ok: false };
    if (!athleteId) return { ok: false };
    const CampIntent = base44?.entities?.CampIntent;
    if (!CampIntent?.filter || !CampIntent?.create) return { ok: false };

    const key = String(intentKey || "");
    if (!key) return { ok: false };

    // optimistic UI
    setIntentByKey((prev) => {
      const cur = prev?.[key] || null;
      const next = { ...(cur || {}), athlete_id: String(athleteId), camp_id: key, status: nextStatus };
      return { ...(prev || {}), [key]: next };
    });

    try {
      const existing = asArray(await CampIntent.filter({ athlete_id: String(athleteId), camp_id: key }))[0];

      if (existing?.id && CampIntent.update) {
        await CampIntent.update(existing.id, { status: nextStatus });
      } else {
        await CampIntent.create({ athlete_id: String(athleteId), camp_id: key, status: nextStatus });
      }
      return { ok: true };
    } catch (e) {
      // revert optimistic on failure
      setIntentByKey((prev) => {
        const copy = { ...(prev || {}) };
        delete copy[key];
        return copy;
      });
      return { ok: false, error: String(e?.message || e) };
    }
  }

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

        let byYear = [];
        try {
          byYear = asArray(await CampEntity.filter({ season_year: seasonYear }));
        } catch {
          byYear = [];
        }

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

        const allRows = asArray(await CampEntity.filter({}));

        const filtered = allRows.filter((r) => {
          const syNum = safeNumber(r?.season_year ?? r?.seasonYear);
          if (syNum != null) return syNum === seasonYear;
          if (String((r?.season_year ?? r?.seasonYear) || "") === String(seasonYear)) return true;

          const derived = computeSeasonYearFootballFromStart(r?.start_date);
          return derived === seasonYear;
        });

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

    const filtered = src
      .filter((r) => readActiveFlag(r) === true)
      .filter((r) => {
        if (!matchesDivision(r, nf.divisions)) return false;
        if (!matchesSport(r, effectiveSports)) return false;
        if (!matchesPositions(r, nf.positions)) return false;
        if (!matchesState(r, nf.state)) return false;
        if (!matchesDateRange(r, nf.startDate || "", nf.endDate || "")) return false;
        return true;
      });

    const getStartTs = (r) => {
      const iso = toISODate(r?.start_date);
      if (!iso) return Number.POSITIVE_INFINITY;
      const d = new Date(`${iso}T00:00:00.000Z`);
      const t = d.getTime();
      return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
    };

    const getPrice = (r) => {
      const pMax = safeNumber(r?.price_max ?? r?.priceMax);
      const p = safeNumber(r?.price ?? r?.cost);
      if (pMax != null) return pMax;
      if (p != null) return p;
      return Number.POSITIVE_INFINITY;
    };

    const getSchoolName = (r) => {
      const schoolId = String(normId(r?.school_id) ?? "");
      const srow = schoolById?.[schoolId] || null;
      const nm = srow?.school_name || srow?.name || r?.school_name || r?.school || "";
      return String(nm || "").toLowerCase();
    };

    const sorted = [...filtered];
    if (sortKey === "price_low") {
      sorted.sort((a, b) => getPrice(a) - getPrice(b));
    } else if (sortKey === "school_az") {
      sorted.sort((a, b) => getSchoolName(a).localeCompare(getSchoolName(b)));
    } else {
      sorted.sort((a, b) => getStartTs(a) - getStartTs(b));
    }

    return sorted;
  }, [rawCamps, nf, isPaid, athleteSportId, sortKey, schoolById]);

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

  const sportLockedLabel = useMemo(() => {
    if (!isPaid) return null;
    if (!athleteSportId) return "Sport locked";
    const sp = sportById?.[String(athleteSportId)] || null;
    return sp?.sport_name || sp?.name || "Sport locked";
  }, [isPaid, athleteSportId, sportById]);

  const resultsCountLabel = useMemo(() => {
    const n = Array.isArray(rows) ? rows.length : 0;
    return `${n.toLocaleString()} camps`;
  }, [rows]);

  const renderBody = () => {
    if (loading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      );
    }

    if (campErr) {
      return (
        <Card className="p-5 border-amber-200 bg-amber-50">
          <div className="text-lg font-semibold text-amber-900">Camps not available</div>
          <div className="mt-2 text-sm text-amber-900/80">{campErr}</div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => nav("/AdminOps")}>
              Open Admin Ops
            </Button>
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
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
            <Button onClick={openFiltersOrProfile}>{paidMissingSport ? "Complete Profile" : "Edit filters"}</Button>
          </div>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {/* IMPORTANT NOTE: existing favorites saved before this change may not appear in MyCamps.
            User must un-favorite and favorite again once to write event_key-based intents. */}
        <Card className="p-3 border-slate-200 bg-white">
          <div className="text-xs text-slate-600">
            If My Camps looks empty after you favorited earlier today, unfavorite and favorite again once.
            We now save favorites using a stable key so they won’t break after promotions.
          </div>
        </Card>

        {rows.map((r) => {
          const campId = String(r?.id ?? "");
          const eventKey = r?.event_key ? String(r.event_key) : "";
          const intentKey = eventKey || campId; // <--- THIS IS THE FIX (stable)

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

          const priceMax = safeNumber(r?.price_max ?? r?.priceMax);
          const price = safeNumber(r?.price ?? r?.cost);
          const priceLabel =
            priceMax != null
              ? priceMax > 0
                ? `$${priceMax}`
                : "Free"
              : price != null
              ? price > 0
                ? `$${price}`
                : "Free"
              : "";

          const linkUrl = r?.link_url ?? r?.source_url ?? r?.url ?? null;
          const startIso = toISODate(r?.start_date);
          const endIso = toISODate(r?.end_date);
          const dateLabel =
            startIso && endIso && endIso !== startIso ? `${startIso} → ${endIso}` : startIso || "TBD";

          const intent = intentByKey?.[intentKey] || null;
          const isFavorite = String(intent?.status || "").toLowerCase() === "favorite";
          const isRegistered =
            String(intent?.status || "").toLowerCase() === "registered" ||
            String(intent?.status || "").toLowerCase() === "completed";

          return (
            <Card
              key={campId}
              className="p-4 border-slate-200 bg-white cursor-pointer hover:shadow-sm transition"
              role="button"
              tabIndex={0}
              onClick={() => {
                nav(isPaid ? `/CampDetail?id=${encodeURIComponent(campId)}` : `/CampDetailDemo?id=${encodeURIComponent(campId)}`);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  nav(isPaid ? `/CampDetail?id=${encodeURIComponent(campId)}` : `/CampDetailDemo?id=${encodeURIComponent(campId)}`);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                    {schoolLogo ? (
                      <img
                        src={schoolLogo}
                        alt={`${schoolName} logo`}
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <div className="text-[10px] text-slate-400">Logo</div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {schoolDivision && (
                        <Badge className="bg-slate-900 text-white text-xs">{schoolDivision}</Badge>
                      )}
                      {sportName && <span className="text-xs text-slate-500 font-medium">{sportName}</span>}
                      {isRegistered && <Badge className="bg-emerald-600 text-white text-xs">Registered</Badge>}
                      {!isPaid && (
                        <Badge variant="outline" className="text-xs">
                          Demo
                        </Badge>
                      )}
                    </div>

                    <div className="text-lg font-semibold text-deep-navy truncate mt-1">
                      {schoolName}
                    </div>
                    <div className="text-sm text-slate-600 truncate">
                      {r?.camp_name ?? r?.name ?? "Camp"}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-1">
                        {dateLabel}
                      </span>
                      {(schoolCity || schoolState) && (
                        <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-1">
                          {[schoolCity, schoolState].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {priceLabel && (
                        <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-1">
                          {priceLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!isPaid}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isPaid) return;
                    const ok = await (writeGate?.ensure ? writeGate.ensure("favorite") : true);
                    if (!ok) return;

                    const next = isFavorite ? "" : "favorite";
                    const res = await upsertIntent(intentKey, next);

                    trackEvent({
                      event_name: "favorite_toggle",
                      source: "discover",
                      camp_id: campId,
                      event_key: eventKey || null,
                      intent_key: intentKey,
                      next_status: next,
                      ok: res?.ok ? 1 : 0,
                    });
                  }}
                  aria-label={isPaid ? (isFavorite ? "Remove favorite" : "Add favorite") : "Favorites locked"}
                  title={isPaid ? (isFavorite ? "Remove favorite" : "Add favorite") : "Favorites are paid-only"}
                >
                  <span className={isFavorite ? "text-amber-500" : "text-slate-400"}>
                    {isFavorite ? "★" : "☆"}
                  </span>
                </Button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="text-xs text-slate-500 truncate">
                  {linkUrl ? "Registration available" : "No registration link"}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      nav(isPaid ? "/MyCamps" : "/Upgrade");
                    }}
                  >
                    {isPaid ? "My Camps" : "Upgrade"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!linkUrl}
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!linkUrl) return;

                      try {
                        window.open(String(linkUrl), "_blank", "noopener,noreferrer");
                      } catch {
                        // ignore
                      }

                      if (isPaid) {
                        const ok = await (writeGate?.ensure ? writeGate.ensure("register") : true);
                        if (ok) {
                          await upsertIntent(intentKey, "registered");
                        }
                      }

                      trackEvent({
                        event_name: "register_click",
                        source: "discover",
                        camp_id: campId,
                        event_key: eventKey || null,
                        intent_key: intentKey,
                      });
                    }}
                  >
                    Register
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-2xl font-bold text-deep-navy">Discover</div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                Season {seasonYear}
              </Badge>
              {isPaid ? <Badge className="bg-deep-navy text-white">Paid</Badge> : <Badge variant="outline">Demo</Badge>}
              <span className="text-xs text-slate-500">{resultsCountLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
              value={sortKey}
              onChange={(e) => setSortKey(String(e.target.value || "soonest"))}
              aria-label="Sort"
            >
              <option value="soonest">Sort: Soonest</option>
              <option value="price_low">Sort: Lowest price</option>
              <option value="school_az">Sort: School A–Z</option>
            </select>

            <Button variant="outline" onClick={() => (paidMissingSport ? nav("/Profile") : setFilterOpen(true))}>
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              {paidMissingSport ? "Complete Profile" : "Filters"}
            </Button>
          </div>
        </div>

        <div className="mt-4 sticky top-0 z-30 bg-slate-50 pt-2 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              type="button"
              className={
                "whitespace-nowrap text-sm px-3 py-2 rounded-full border " +
                (isPaid
                  ? "border-slate-300 bg-white text-slate-800"
                  : Array.isArray(nf?.sports) && nf.sports.length
                  ? "border-slate-800 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-800")
              }
              onClick={() => {
                if (isPaid) return;
                setFilterOpen(true);
              }}
              aria-label={isPaid ? "Sport locked" : "Filter sport"}
              title={isPaid ? "Sport is locked in paid mode" : "Choose sport"}
            >
              {isPaid ? `${sportLockedLabel} (locked)` : "Sport"}
            </button>

            <button
              type="button"
              className={
                "whitespace-nowrap text-sm px-3 py-2 rounded-full border " +
                (nf?.state ? "border-slate-800 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-800")
              }
              onClick={() => setFilterOpen(true)}
            >
              {chipLabel("state", nf)}
            </button>

            <button
              type="button"
              className={
                "whitespace-nowrap text-sm px-3 py-2 rounded-full border " +
                (nf?.startDate || nf?.endDate
                  ? "border-slate-800 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-800")
              }
              onClick={() => setFilterOpen(true)}
            >
              {chipLabel("dates", nf)}
            </button>

            <button
              type="button"
              className={
                "whitespace-nowrap text-sm px-3 py-2 rounded-full border " +
                (Array.isArray(nf?.divisions) && nf.divisions.length
                  ? "border-slate-800 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-800")
              }
              onClick={() => setFilterOpen(true)}
            >
              Division
            </button>

            <button
              type="button"
              className={
                "whitespace-nowrap text-sm px-3 py-2 rounded-full border " +
                (Array.isArray(nf?.positions) && nf.positions.length
                  ? "border-slate-800 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-800")
              }
              onClick={() => setFilterOpen(true)}
            >
              Position
            </button>

            {hasActiveFilters(nf, isPaid) && (
              <button
                type="button"
                className="whitespace-nowrap text-sm px-3 py-2 rounded-full border border-slate-300 bg-white text-slate-800"
                onClick={clearFilters}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {debugStats && (
          <Card className="p-3 mt-4 border border-slate-200 bg-white">
            <div className="text-sm font-semibold">Debug</div>
            <pre className="text-xs overflow-auto mt-2">{JSON.stringify(debugStats, null, 2)}</pre>
          </Card>
        )}

        <div className={debugStats ? "mt-4" : "mt-4"}>{renderBody()}</div>

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