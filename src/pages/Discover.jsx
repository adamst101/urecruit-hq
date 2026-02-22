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
   Rate-limit hardened helpers
------------------------- */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

function isRateLimitError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("rate limited") || msg.includes("429") || msg.includes("too many");
}

async function safeFilter(entity, where, sort, limit, { retries = 2, baseDelayMs = 350 } = {}) {
  if (!entity?.filter) return [];
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const rows = await entity.filter(where || {}, sort, limit);
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      lastErr = e;
      if (!isRateLimitError(e) || attempt === retries) break;
      await sleep(baseDelayMs * Math.pow(2, attempt));
    }
  }

  throw lastErr;
}

function chunk(arr, size) {
  const out = [];
  const a = Array.isArray(arr) ? arr : [];
  const n = Math.max(1, Number(size) || 50);
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

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

function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;

  const st = String(row?.status || "").toLowerCase().trim();
  if (st === "inactive") return false;
  if (st === "active") return true;
  return true;
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

function getUrlParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const mode = sp.get("mode");
    const season = sp.get("season");
    return {
      mode: mode ? String(mode).toLowerCase() : null,
      requestedSeason: safeNumber(season),
    };
  } catch {
    return { mode: null, requestedSeason: null };
  }
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

// Schema-safe Event telemetry (never breaks UX)
function trackEvent(payload) {
  try {
    const EventEntity = base44?.entities?.Event || base44?.entities?.Events;
    if (!EventEntity?.create) return;

    const iso = new Date().toISOString();
    const day = iso.slice(0, 10);

    const eventName = payload?.event_name || payload?.event_type || "event";
    const sourcePlatform = payload?.source_platform || "web";
    const title = payload?.title || String(eventName);
    const sourceKey = payload?.source_key || `${String(sourcePlatform)}:${String(eventName)}`;

    EventEntity.create({
      source_platform: String(sourcePlatform),
      event_type: String(eventName),
      title: String(title),
      source_key: String(sourceKey),
      start_date: payload?.start_date || day,
      payload_json: JSON.stringify(payload || {}),
      ts: iso,
    });
  } catch {
    // ignore
  }
}

/**
 * Base44-safe bulk fetch by ids (no "list all" fallback).
 * If it fails, we just return empty and cards render without enrichment.
 */
async function batchFetchByIds(entity, ids, { chunkSize = 60 } = {}) {
  const clean = Array.from(new Set(asArray(ids).map(normId).filter(Boolean).map(String)));
  if (!entity?.filter || clean.length === 0) return [];

  const out = [];
  for (const part of chunk(clean, chunkSize)) {
    const tries = [{ id: { in: part } }, { id: { $in: part } }, { _id: { in: part } }, { _id: { $in: part } }];
    let got = [];
    for (const w of tries) {
      try {
        got = await safeFilter(entity, w, undefined, undefined, { retries: 2, baseDelayMs: 250 });
        if (got.length) break;
      } catch (e) {
        // on rate limits, safeFilter already retried; keep trying other operator forms
        if (!isRateLimitError(e)) {
          // continue to next operator form
        }
      }
    }
    out.push(...asArray(got));
  }

  // de-dupe
  const seen = new Set();
  const deduped = [];
  for (const r of out) {
    const k = normId(r);
    if (!k) continue;
    const key = String(k);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped;
}

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

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();
  const { nf, setNF, clearFilters } = useCampFilters();
  const writeGate = useWriteGate();

  const [filterOpen, setFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState("soonest"); // soonest | price_low | school_az

  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const requestedSeason = url.requestedSeason;

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

  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);
  const athleteSportId = useMemo(() => {
    const sid = athleteProfile?.sport_id ?? athleteProfile?.sportId ?? null;
    return sid != null ? String(sid) : "";
  }, [athleteProfile]);

  // Paid lock: sport always enforced
  useEffect(() => {
    if (!isPaid) return;
    if (!athleteSportId) return;

    const cur = Array.isArray(nf?.sports) ? nf.sports.map(String) : [];
    const ok = cur.length === 1 && cur[0] === athleteSportId;
    if (!ok) setNF({ sports: [athleteSportId], positions: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid, athleteSportId]);

  const paidMissingSport = useMemo(() => isPaid && !!athleteId && !athleteSportId, [isPaid, athleteId, athleteSportId]);

  // Intents map (keyed by camp_id which should be event_key going forward)
  const [intentByKey, setIntentByKey] = useState({});
  const intentRefreshSeq = useRef(0);

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
        const rows = asArray(await safeFilter(base44?.entities?.CampIntent, { athlete_id: String(athleteId) }, undefined, undefined, { retries: 2 }));
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

    // optimistic
    setIntentByKey((prev) => {
      const cur = prev?.[key] || null;
      const next = { ...(cur || {}), athlete_id: String(athleteId), camp_id: key, status: nextStatus };
      return { ...(prev || {}), [key]: next };
    });

    try {
      const existing = asArray(await safeFilter(CampIntent, { athlete_id: String(athleteId), camp_id: key }, undefined, undefined, { retries: 2 }))[0];
      if (existing?.id && CampIntent.update) {
        await CampIntent.update(existing.id, { status: nextStatus });
      } else {
        await CampIntent.create({ athlete_id: String(athleteId), camp_id: key, status: nextStatus });
      }
      return { ok: true };
    } catch (e) {
      setIntentByKey((prev) => {
        const copy = { ...(prev || {}) };
        delete copy[key];
        return copy;
      });
      return { ok: false, error: String(e?.message || e) };
    }
  }

  // Lazy picklists: only load when filter sheet opens
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);
  const [picklistsLoaded, setPicklistsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!filterOpen) return;
    if (picklistsLoaded) return;

    (async () => {
      try {
        // Paid mode doesn't need sport list for lock, but keep it for demo / future.
        const [sportsRows, posRows] = await Promise.all([
          safeFilter(base44?.entities?.Sport, {}, undefined, 500, { retries: 2, baseDelayMs: 250 }).catch(() => []),
          safeFilter(base44?.entities?.Position, {}, undefined, 500, { retries: 2, baseDelayMs: 250 }).catch(() => []),
        ]);
        if (cancelled) return;
        setSports(Array.isArray(sportsRows) ? sportsRows : []);
        setPositions(Array.isArray(posRows) ? posRows : []);
        setPicklistsLoaded(true);
      } catch {
        if (!cancelled) {
          setSports([]);
          setPositions([]);
          setPicklistsLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filterOpen, picklistsLoaded]);

  const [rawCamps, setRawCamps] = useState([]);
  const [loadingCamps, setLoadingCamps] = useState(true);
  const [campErr, setCampErr] = useState("");

  const [schoolById, setSchoolById] = useState({});
  const [sportById, setSportById] = useState({});

  async function loadCamps() {
    setLoadingCamps(true);
    setCampErr("");
    setRawCamps([]);

    try {
      const CampEntity = base44?.entities?.Camp;
      if (!CampEntity?.filter) throw new Error("Camp entity not available.");

      // Primary: server-side season_year
      let rows = [];
      try {
        rows = await safeFilter(CampEntity, { season_year: seasonYear }, "-start_date", 2000, { retries: 2, baseDelayMs: 350 });
      } catch {
        rows = [];
      }

      if (rows.length === 0) {
        try {
          rows = await safeFilter(CampEntity, { season_year: String(seasonYear) }, "-start_date", 2000, { retries: 2, baseDelayMs: 350 });
        } catch {
          rows = [];
        }
      }

      // If still none, do NOT pull whole table (that triggers throttling). Return empty state.
      setRawCamps(rows);
    } catch (e) {
      const msg = String(e?.message || e);
      if (isRateLimitError(e)) {
        setCampErr("Rate limit exceeded. Retry in a moment.");
      } else {
        setCampErr(msg);
      }
      setRawCamps([]);
    } finally {
      setLoadingCamps(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (season?.isLoading) return;

    (async () => {
      if (cancelled) return;
      await loadCamps();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season?.isLoading, seasonYear]);

  // Enrichment: fetch schools and sports for current result set (batched, no list-all fallback)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const campRows = asArray(rawCamps);
      if (campRows.length === 0) {
        if (!cancelled) {
          setSchoolById({});
          setSportById({});
        }
        return;
      }

      const schoolIds = campRows.map((r) => normId(r?.school_id)).filter(Boolean);
      const sportIds = campRows.map((r) => normId(r?.sport_id)).filter(Boolean);

      try {
        const [schoolsRows, sportsRows] = await Promise.all([
          batchFetchByIds(base44?.entities?.School, schoolIds, { chunkSize: 60 }).catch(() => []),
          batchFetchByIds(base44?.entities?.Sport, sportIds, { chunkSize: 60 }).catch(() => []),
        ]);

        if (cancelled) return;

        const sMap = {};
        for (const s of asArray(schoolsRows)) {
          const id = String(normId(s) || "");
          if (id) sMap[id] = s;
        }
        const spMap = {};
        for (const sp of asArray(sportsRows)) {
          const id = String(normId(sp) || "");
          if (id) spMap[id] = sp;
        }

        setSchoolById(sMap);
        setSportById(spMap);
      } catch {
        if (!cancelled) {
          setSchoolById({});
          setSportById({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rawCamps]);

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

  const sportLockedLabel = useMemo(() => {
    if (!isPaid) return null;
    if (!athleteSportId) return "Sport locked";
    const sp = sportById?.[String(athleteSportId)] || null;
    return sp?.sport_name || sp?.name || "Sport locked";
  }, [isPaid, athleteSportId, sportById]);

  const openFiltersOrProfile = () => {
    if (paidMissingSport) {
      nav("/Profile");
      return;
    }
    setFilterOpen(true);
  };

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
    if (sortKey === "price_low") sorted.sort((a, b) => getPrice(a) - getPrice(b));
    else if (sortKey === "school_az") sorted.sort((a, b) => getSchoolName(a).localeCompare(getSchoolName(b)));
    else sorted.sort((a, b) => getStartTs(a) - getStartTs(b));

    return sorted;
  }, [rawCamps, nf, isPaid, athleteSportId, sortKey, schoolById]);

  const resultsCountLabel = useMemo(() => `${(rows?.length || 0).toLocaleString()} camps`, [rows]);

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
            <Button variant="outline" onClick={() => loadCamps()}>
              Retry
            </Button>
            <Button variant="outline" onClick={() => nav("/AdminOps")}>
              Open Admin Ops
            </Button>
          </div>
          <div className="mt-3 text-xs text-amber-900/70">
            Tip: If this keeps happening, you’re hitting Base44 throttling. Retry after a few seconds. We now avoid full-table fallbacks to reduce load.
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
            <Button onClick={openFiltersOrProfile}>Edit filters</Button>
          </div>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {rows.map((r) => {
          const campId = String(r?.id ?? "");
          const eventKey = r?.event_key ? String(r.event_key) : "";
          const intentKey = eventKey || campId;

          const schoolId = String(normId(r?.school_id) ?? "");
          const sportId = String(r?.sport_id ?? "");

          const srow = schoolById[schoolId] || null;
          const sprow = sportById[sportId] || null;

          const schoolName = srow?.school_name || srow?.name || r?.school_name || "Unknown School";
          const schoolCity = srow?.city || r?.city || null;
          const schoolState = srow?.state || r?.state || null;
          const schoolDivision = srow?.division || srow?.school_division || r?.division || null;
          const schoolLogo = srow?.logo_url || srow?.school_logo_url || null;

          const sportName = sprow?.sport_name || sprow?.name || r?.sport_name || "Sport";

          const priceMax = safeNumber(r?.price_max ?? r?.priceMax);
          const price = safeNumber(r?.price ?? r?.cost);
          const priceLabel =
            priceMax != null ? (priceMax > 0 ? `$${priceMax}` : "Free") : price != null ? (price > 0 ? `$${price}` : "Free") : "";

          const linkUrl = r?.link_url ?? r?.source_url ?? r?.url ?? null;
          const startIso = toISODate(r?.start_date);
          const endIso = toISODate(r?.end_date);
          const dateLabel =
            startIso && endIso && endIso !== startIso ? `${startIso} → ${endIso}` : startIso || "TBD";

          const intent = intentByKey?.[intentKey] || null;
          const isFavorite = String(intent?.status || "").toLowerCase() === "favorite";

          return (
            <Card
              key={campId}
              className="p-4 border-slate-200 bg-white cursor-pointer hover:shadow-sm transition"
              role="button"
              tabIndex={0}
              onClick={() => nav(isPaid ? `/CampDetail?id=${encodeURIComponent(campId)}` : `/CampDetailDemo?id=${encodeURIComponent(campId)}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                    {schoolLogo ? (
                      <img src={schoolLogo} alt={`${schoolName} logo`} className="w-full h-full object-contain" loading="lazy" />
                    ) : (
                      <div className="text-[10px] text-slate-400">Logo</div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {schoolDivision && <Badge className="bg-slate-900 text-white text-xs">{schoolDivision}</Badge>}
                      {sportName && <span className="text-xs text-slate-500 font-medium">{sportName}</span>}
                      {!isPaid && <Badge variant="outline" className="text-xs">Demo</Badge>}
                    </div>

                    <div className="text-lg font-semibold text-deep-navy truncate mt-1">{schoolName}</div>
                    <div className="text-sm text-slate-600 truncate">{r?.camp_name ?? r?.name ?? "Camp"}</div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-1">{dateLabel}</span>
                      {(schoolCity || schoolState) && (
                        <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-1">
                          {[schoolCity, schoolState].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {priceLabel && <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-1">{priceLabel}</span>}
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
                    await upsertIntent(intentKey, next);

                    trackEvent({
                      event_name: "favorite_toggle",
                      source: "discover",
                      camp_id: campId,
                      event_key: eventKey || null,
                      intent_key: intentKey,
                      next_status: next,
                    });
                  }}
                  aria-label={isPaid ? (isFavorite ? "Remove favorite" : "Add favorite") : "Favorites locked"}
                >
                  <span className={isFavorite ? "text-amber-500" : "text-slate-400"}>{isFavorite ? "★" : "☆"}</span>
                </Button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="text-xs text-slate-500 truncate">{linkUrl ? "Registration available" : "No registration link"}</div>
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
                        if (ok) await upsertIntent(intentKey, "registered");
                      }

                      trackEvent({ event_name: "register_click", source: "discover", camp_id: campId, intent_key: intentKey });
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

            <Button variant="outline" onClick={openFiltersOrProfile}>
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              {paidMissingSport ? "Complete Profile" : "Filters"}
            </Button>
          </div>
        </div>

        {/* Sticky chips row */}
        <div className="mt-4 sticky top-0 z-30 bg-slate-50 pt-2 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              type="button"
              className={
                "whitespace-nowrap text-sm px-3 py-2 rounded-full border " +
                (isPaid ? "border-slate-300 bg-white text-slate-800" : "border-slate-300 bg-white text-slate-800")
              }
              onClick={() => {
                if (isPaid) return;
                setFilterOpen(true);
              }}
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

        <div className="mt-4">{renderBody()}</div>

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