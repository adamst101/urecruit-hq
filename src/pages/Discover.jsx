// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { base44 } from "../api/base44Client";
import { trackEvent } from "../utils/trackEvent.js";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";
import SchoolGroupCard from "../components/camps/SchoolGroupCard.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { readDemoMode } from "../components/hooks/demoMode.jsx";
import { DEMO_COACH_PROFILE } from "../lib/demoCoachData.js";
import { loadDemoCamps } from "../lib/demoCampData.js";
import { initDemoUserState, DEMO_SEASON_YEAR, DEMO_ATHLETE } from "../lib/demoUserData.js";
import { footballDemoSeasonYear } from "../components/utils/seasonEntitlements.jsx";

import { useActiveAthlete } from "../components/hooks/useActiveAthlete.jsx";
import AthleteSwitcher from "../components/workspace/AthleteSwitcher.jsx";
import { useCampFilters } from "../components/filters/useCampFilters.jsx";
import { useWriteGate } from "../components/hooks/useWriteGate.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites, toggleDemoFavorite } from "../components/hooks/demoFavorites.jsx";

// ✅ Centralised school identity resolution (logo, name, division)
import { useSchoolIdentity } from "../components/hooks/useSchoolIdentity.jsx";
import { getCityCoords } from "../components/hooks/useCityCoords.jsx";

import InlineFilterBar from "../components/filters/InlineFilterBar.jsx";
import DemoBanner from "../components/DemoBanner.jsx";
import GuidedTourOverlay from "../components/demo/GuidedTourOverlay.jsx";
import DemoPreviewStrip from "../components/demo/DemoPreviewStrip.jsx";
import ConflictWarningModal from "../components/camps/ConflictWarningModal.jsx";
import RegisterConfirmModal from "../components/camps/RegisterConfirmModal.jsx";
import UnregisterConfirmModal from "../components/camps/UnregisterConfirmModal.jsx";
import { detectConflicts } from "../components/hooks/useConflictDetection.jsx";
import { isDemoRegistered, toggleDemoRegistered } from "../components/hooks/demoRegistered.jsx";

import {
  matchesDivision,
  matchesSport,
  matchesPositions,
  matchesState,
  matchesDateRange,
  matchesMonth,
  normalizeDivisionForSort,
} from "../components/filters/filterUtils.jsx";
import { toast } from "../components/ui/use-toast";

/* ─── Module-level camp list cache (prevents re-fetch on every navigation) ── */
let _discoverCache = { rows: [], ts: 0, seasonYear: null, isPaid: null };
const DISCOVER_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

/* ─── helpers ──────────────────────────────────────────────────────────────── */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

function isRateLimitError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("rate limited") ||
    msg.includes("429") ||
    msg.includes("too many")
  );
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
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim()))
    return dateInput.trim();
  if (typeof dateInput === "string") {
    const mdy = dateInput.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      return `${mdy[3]}-${String(mdy[1]).padStart(2, "0")}-${String(mdy[2]).padStart(2, "0")}`;
    }
  }
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function footballSeasonYearForDate(d = new Date()) {
  const y = d.getUTCFullYear();
  return d >= new Date(Date.UTC(y, 1, 1)) ? y : y - 1;
}

function getUrlParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    return {
      mode: sp.get("mode") ? String(sp.get("mode")).toLowerCase() : null,
      requestedSeason: safeNumber(sp.get("season")),
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
  return (
    (Array.isArray(nf.divisions) && nf.divisions.length > 0) ||
    (Array.isArray(nf.positions) && nf.positions.length > 0) ||
    !!nf.state ||
    !!nf.startDate || !!nf.endDate ||
    (!isPaid && Array.isArray(nf.sports) && nf.sports.length > 0)
  );
}


function initialBadge(name) {
  const s = String(name || "").trim();
  return (s.replace(/[^A-Za-z0-9]/g, "").slice(0, 1) || "?").toUpperCase();
}

/* ─── LogoAvatar ────────────────────────────────────────────────────────────── */

function LogoAvatar({ schoolName, logoUrl }) {
  const [imgErr, setImgErr] = useState(false);
  const showImg = !!logoUrl && !imgErr;

  return (
    <div className="w-10 h-10 rounded-lg bg-ur-page border border-ur-border overflow-hidden flex items-center justify-center flex-shrink-0">
      {showImg ? (
        <img
          src={logoUrl}
          alt={`${schoolName} logo`}
          className="w-full h-full object-contain"
          loading="lazy"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div className="text-xs font-semibold text-ur-secondary">{initialBadge(schoolName)}</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Page
═══════════════════════════════════════════════════════════════════════════════ */

function invalidateCampCaches(qc) {
  qc.invalidateQueries({ queryKey: ["demoCampSummaries"] });
  qc.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();
  const queryClient = useQueryClient();

  const { activeAthlete: athleteProfile } = useActiveAthlete();
  const { demoProfileId } = useDemoProfile();

  // Only use athlete sport_id for camp filtering if it looks like a real entity UUID.
  // Profiles created via checkout have a 20+-char hex UUID. Legacy/test profiles
  // may store a name slug like "football" which will never match camp sport_id UUIDs
  // and would silently hide all camps. In that case, skip the auto-filter entirely.
  const rawSportId = athleteProfile?.sport_id != null ? String(athleteProfile.sport_id) : "";
  const athleteSportId = /^[0-9a-f]{20,}$/i.test(rawSportId) ? rawSportId : "";

  const { hasAccess, seasonYear: accessSeasonYear, accountId: seasonAccountId, mode: seasonMode, isLoading: seasonLoading } = useSeasonAccess();
  const writeGate = useWriteGate();

  // Use useSeasonAccess as single source of truth for paid vs demo.
  // readDemoMode() can have stale data before useSeasonAccess clears it.
  const isPaid = seasonMode === "paid" || seasonMode === "coach" || seasonMode === "coach_pending";

  // Parse the ?demo= URL param as the primary demo entry signal.
  // URL param drives demo mode independently of auth state — a ?demo=coach
  // URL always shows demo data even for authenticated/paid users.
  const demoParam = useMemo(() => {
    try { return new URLSearchParams(loc?.search || "").get("demo") || null; }
    catch { return null; }
  }, [loc?.search]);
  const isCoachDemo    = demoParam === "coach";
  const _isUserDemoParam = demoParam === "user";
  const isTourMode     = new URLSearchParams(loc?.search || "").get("tour") !== null;
  const isPreviewMode  = new URLSearchParams(loc?.search || "").get("preview") === "1";
  // Preview mode acts as user demo for data loading purposes
  const isUserDemo     = _isUserDemoParam || isPreviewMode;

  // Read demo mode only for season year override (not for isPaid determination)
  const dm             = readDemoMode();           // null | { mode, seasonYear, setAt }
  // URL demo param takes priority: any ?demo= entry forces demo mode
  const isDemoMode     = !isPaid || isCoachDemo || isUserDemo;
  const demoSeasonOverride = Number.isFinite(Number(dm?.seasonYear)) ? Number(dm.seasonYear) : null;

  const urlp = useMemo(() => getUrlParams(loc?.search || ""), [loc?.search]);
  const seasonYear = useMemo(() => {
    if (urlp?.requestedSeason) return urlp.requestedSeason;
    if (isDemoMode && demoSeasonOverride) return demoSeasonOverride;
    // Coach demo is unauthenticated — no accessSeasonYear. Use previous season
    // to match the DemoCamp data that GenerateDemoCamps populates.
    if (isCoachDemo) return footballDemoSeasonYear();
    if (accessSeasonYear) return accessSeasonYear;
    return footballSeasonYearForDate(new Date());
  }, [urlp?.requestedSeason, isDemoMode, demoSeasonOverride, isCoachDemo, accessSeasonYear]);

  const [isLoading, setIsLoading]         = useState(false);
  const [campErr, setCampErr]             = useState(null);
  const [rawRows, setRawRows]             = useState([]);
  const [intentByKey, setIntentByKey]     = useState({});
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [demoFavoriteIds, setDemoFavoriteIds] = useState([]);
  const [distanceMiles, setDistanceMiles] = useState(null);
  const [distanceWarning, setDistanceWarning] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [visibleCount, setVisibleCount]   = useState(50);
  const [coachRoster, setCoachRoster]     = useState([]);

  const isCoach = seasonMode === "coach" || seasonMode === "coach_pending" || isCoachDemo;

  // Load coach roster when in coach mode (skip for demo coach — no real profile exists)
  useEffect(() => {
    if (isCoachDemo) {
      setCoachRoster(Array.isArray(DEMO_COACH_PROFILE.roster) ? DEMO_COACH_PROFILE.roster : []);
      return;
    }
    if (!isCoach) return;
    base44.functions.invoke("getMyCoachProfile", {})
      .then((res) => {
        const roster = Array.isArray(res?.data?.roster) ? res.data.roster : [];
        setCoachRoster(roster);
      })
      .catch(() => {});
  }, [isCoach, isCoachDemo]);

  // Modal states
  const [conflictModal, setConflictModal] = useState({ open: false, warnings: [], campId: null, action: null });
  const [registerModal, setRegisterModal] = useState({ open: false, camp: null });
  const [unregisterModal, setUnregisterModal] = useState({ open: false, camp: null });

  // Home coordinates from athlete profile (paid mode distance filter)
  // Try explicit lat/lng first, then fall back to city/state lookup
  const homeCoords = useMemo(() => {
    const lat = athleteProfile?.home_lat ?? null;
    const lng = athleteProfile?.home_lng ?? null;
    if (lat != null && lng != null) return { lat, lng };
    // Fallback: resolve from city/state
    const city = athleteProfile?.home_city || null;
    const state = athleteProfile?.home_state || null;
    if (city || state) {
      const coords = getCityCoords(city, state);
      if (coords) return coords;
    }
    return null;
  }, [athleteProfile?.home_lat, athleteProfile?.home_lng, athleteProfile?.home_city, athleteProfile?.home_state]);

  const homeLat = homeCoords?.lat ?? null;
  const homeLng = homeCoords?.lng ?? null;

  // Whether the user has a home location set at all
  const hasHomeLocation = !!(athleteProfile?.home_city || athleteProfile?.home_state || (athleteProfile?.home_lat != null && athleteProfile?.home_lng != null));

  const filtersApi = useCampFilters();
  useEffect(() => {
    if (isPaid) {
      setDemoFavoriteIds([]);
      return;
    }
    // Seed user demo state on direct entry to Discover (e.g. /Discover?demo=user)
    if (isUserDemo && demoProfileId) {
      initDemoUserState(demoProfileId, DEMO_SEASON_YEAR);
    }
    setDemoFavoriteIds(getDemoFavorites(demoProfileId, seasonYear));
  }, [isPaid, demoProfileId, seasonYear, isUserDemo]);
  const nf = filtersApi?.nf || null;

  const campKeyForRow = (r) => {
    return String(r?.id ?? "");
  };

  const resultsCountLabel = useMemo(() => {
    if (isLoading) return "Loading…";
    if (campErr)   return "Error";
    const campCount = Array.isArray(rawRows) ? rawRows.length : 0;
    return `${campCount} camps`;
  }, [rawRows, isLoading, campErr]);

  /* ─── intents ─────────────────────────────────────────────────────────── */

  async function loadIntents(keys) {
    try {
      if (!isPaid) return {}; // Demo mode doesn't use CampIntent
      const aId = athleteProfile?.id || athleteProfile?._id || athleteProfile?.uuid || null;
      const effectiveAId = aId || (seasonAccountId ? seasonAccountId : null);
      if (!effectiveAId) return {};

      // Read from production entity store via server-side function
      const res = await base44.functions.invoke("getMyCampIntents", {
        athleteId: String(aId || ""),
        accountId: String(seasonAccountId || ""),
      }).catch(() => null);

      const intents = res?.data?.ok && Array.isArray(res.data.intents) ? res.data.intents : null;

      // Fallback to client-side if function call fails
      let rows = [];
      if (intents !== null) {
        rows = intents;
      } else {
        const CampIntent = base44?.entities?.CampIntent;
        if (!CampIntent?.filter) return {};
        try {
          rows = await safeFilter(CampIntent, { athlete_id: String(effectiveAId) }, "-updated_date", 2000);
        } catch (readErr) {
          console.error("[loadIntents] CampIntent read failed:", String(readErr?.message || readErr));
          return {};
        }
      }

      const out = {};
      for (const r of asArray(rows)) {
        const k = String(r?.camp_id || "");
        if (k) out[k] = r;
      }
      return out;
    } catch {
      return {};
    }
  }

  async function upsertIntent(intentKey, nextStatus) {
    const key = String(intentKey || "");
    if (!key) return;

    const existing = intentByKey?.[key] || null;

    const aId = athleteProfile?.id || athleteProfile?._id || athleteProfile?.uuid || null;
    const effectiveAthleteId = aId || (seasonAccountId ? seasonAccountId : null);

    if (!effectiveAthleteId) {
      console.warn("[upsertIntent] No athlete or account ID — skipping DB write");
      return;
    }

    // Optimistic local update FIRST so star fills immediately
    const optimisticStatus = nextStatus ? String(nextStatus) : "";
    setIntentByKey((p) => ({
      ...p,
      [key]: { ...(existing || { camp_id: key }), status: optimisticStatus },
    }));

    try {
      const res = await base44.functions.invoke("saveCampIntent", {
        accountId: seasonAccountId || "",
        athleteId: String(effectiveAthleteId),
        campId: key,
        status: nextStatus || "",
      });
      if (res?.data?.intent) {
        setIntentByKey((p) => ({ ...p, [key]: res.data.intent }));
      }
      try { localStorage.setItem("intentUpdatedAt", Date.now().toString()); } catch {}
      try { window.dispatchEvent(new CustomEvent("intentUpdated")); } catch {}
    } catch (err) {
      const msg = String(err?.message || err || "Unknown error");
      console.error("[upsertIntent] DB write failed:", msg, err);
      toast({
        title: "Could not save — permission error",
        description: msg,
        variant: "destructive",
      });
      // Revert optimistic update on error
      setIntentByKey((p) => ({
        ...p,
        [key]: existing || undefined,
      }));
    }
  }

  /* ─── filters (derived, reactive to nf changes) ──────────────────────── */

  /* ─── load camps ──────────────────────────────────────────────────────── */

  const [allRows, setAllRows] = useState([]);

  // ✅ School identity via dedicated hook — uses allRows so school data
  // is available for filtering (division, state) before display
  const { resolveIdentity, schoolById } = useSchoolIdentity(allRows);

  async function loadCamps() {
    // ── Demo path: curated static dataset, no DB query ───────────────────────
    // Triggered by any ?demo= URL param OR by !isPaid (unauthenticated / free user).
    // Pre-clears allRows synchronously before the async load so stale production
    // data is never visible during the await. loadDemoCamps() is itself cached.
    if (isDemoMode) {
      setAllRows([]);   // synchronous clear — prevent production rows from showing
      setIsLoading(true);
      setCampErr(null);
      try {
        const rows = await loadDemoCamps();
        const active = asArray(rows).filter(readActiveFlag);
        setAllRows(active);
        setIntentByKey({});
        trackEvent("discover_loaded", {
          source: "discover", season_year: seasonYear, paid: false,
          raw_camps: rows.length, shown_camps: active.length,
        });
      } catch (e) {
        setCampErr(String(e?.message || e || "Failed to load camps"));
        setAllRows([]);
        setRawRows([]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // ── Paid path: real Camp entity with module-level cache ──────────────────
    const now = Date.now();
    if (
      !isDemoMode &&   // belt-and-suspenders: never serve production cache in demo mode
      _discoverCache.ts &&
      now - _discoverCache.ts < DISCOVER_CACHE_TTL &&
      _discoverCache.seasonYear === seasonYear &&
      _discoverCache.isPaid === isPaid
    ) {
      setAllRows(_discoverCache.rows);
      const keys = _discoverCache.rows.map(campKeyForRow).filter(Boolean);
      const intents = await loadIntents(keys);
      setIntentByKey(intents);
      return;
    }

    setIsLoading(true);
    setCampErr(null);

    try {
      // Absolute guard — if any demo signal is present, never query production camps.
      // This catches any case where isDemoMode could be stale in a closure.
      if (isDemoMode || isCoachDemo || isUserDemo) {
        setAllRows([]);
        setIsLoading(false);
        return;
      }

      const CampEntity = base44?.entities?.Camp;
      if (!CampEntity?.filter) {
        setAllRows([]);
        setRawRows([]);
        setCampErr("Camps not available.");
        return;
      }

      let rows = [];
      try {
        rows = await safeFilter(CampEntity, { season_year: seasonYear }, "-start_date", 2000);
      } catch (e1) {
        try {
          rows = await safeFilter(CampEntity, { season_year: String(seasonYear) }, "-start_date", 2000);
        } catch (e2) {
          throw e2 || e1;
        }
      }
      const active = asArray(rows).filter(readActiveFlag);
      _discoverCache = { rows: active, ts: Date.now(), seasonYear, isPaid };
      setAllRows(active);

      const keys    = active.map(campKeyForRow).filter(Boolean);
      const intents = await loadIntents(keys);
      setIntentByKey(intents);

      trackEvent("discover_loaded", {
        source:      "discover",
        season_year: seasonYear,
        paid:        isPaid,
        raw_camps:   Array.isArray(rows) ? rows.length : 0,
        shown_camps: active.length,
      });
    } catch (e) {
      const msg = isRateLimitError(e)
        ? "Camps not available: Rate limit exceeded"
        : String(e?.message || e || "Failed to load camps");
      setCampErr(msg);
      setAllRows([]);
      setRawRows([]);
      trackEvent("discover_error", { source: "discover", season_year: seasonYear, paid: isPaid, error: msg });
    } finally {
      setIsLoading(false);
    }
  }

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(50);
  }, [nf, distanceMiles, selectedMonth]);

  // Reactively apply filters whenever nf, allRows, or schoolById change.
  // We enrich each camp row with school division/state so filters work correctly.
  useEffect(() => {
    const enrichedRows = allRows.map((r) => {
      const sid = String(normId(r?.school_id) || "");
      const sch = sid ? schoolById[sid] : null;
      const campCity = r?.city || sch?.city || null;
      const campState = r?.state || sch?.state || null;
      // Prefer stored lat/lng on school, then lookup table
      const storedLat = sch?.lat ?? null;
      const storedLng = sch?.lng ?? null;
      const hasStoredCoords = storedLat != null && storedLng != null && storedLat !== 0 && storedLng !== 0;
      const campCoords = hasStoredCoords ? { lat: storedLat, lng: storedLng } : getCityCoords(campCity, campState);
      return sch ? {
        ...r,
        division: r?.division || sch?.division || sch?.school_division || null,
        school_division: r?.school_division || sch?.division || sch?.school_division || null,
        subdivision: r?.subdivision || sch?.subdivision || null,
        school_subdivision: r?.school_subdivision || sch?.subdivision || null,
        state: r?.state || sch?.state || null,
        school_state: r?.school_state || sch?.state || null,
        _school_lat: campCoords?.lat ?? null,
        _school_lng: campCoords?.lng ?? null,
        _school_name: sch?.school_name || sch?.name || r?.host_org || r?.ryzer_program_name || r?.camp_name || "",
      } : {
        ...r,
        _school_lat: campCoords?.lat ?? null,
        _school_lng: campCoords?.lng ?? null,
        _school_name: r?.host_org || r?.ryzer_program_name || r?.camp_name || "",
      };
    });

    const filtered = enrichedRows.filter((enriched) => {
      if (isPaid) {
        if (!matchesSport(enriched, [athleteSportId].filter(Boolean))) return false;
      } else {
        if (Array.isArray(nf?.sports) && nf.sports.length > 0 && !matchesSport(enriched, nf.sports))
          return false;
      }
      if (Array.isArray(nf?.divisions) && nf.divisions.length > 0 && !matchesDivision(enriched, nf.divisions))
        return false;
      if (Array.isArray(nf?.positions) && nf.positions.length > 0 && !matchesPositions(enriched, nf.positions))
        return false;
      if (nf?.state && !matchesState(enriched, nf.state)) return false;
      if ((nf?.startDate || nf?.endDate) && !matchesDateRange(enriched, nf.startDate || "", nf.endDate || ""))
        return false;

      // Month filter
      if (!matchesMonth(enriched, selectedMonth)) return false;

      // Distance filter (paid mode only)
      if (isPaid && distanceMiles && homeLat != null && homeLng != null) {
        const campLat = enriched?._school_lat ?? null;
        const campLng = enriched?._school_lng ?? null;
        if (campLat != null && campLng != null) {
          const dist = haversine(homeLat, homeLng, campLat, campLng);
          if (dist > distanceMiles) return false;
        } else {
          // No coordinates — use same-state as a fallback heuristic.
          // Include if camp is in the user's home state, exclude otherwise.
          const homeState = (athleteProfile?.home_state || "").trim().toUpperCase();
          const campSt = (enriched?.state || enriched?.school_state || "").trim().toUpperCase();
          if (homeState && campSt && campSt !== homeState) return false;
          // If both are blank or match, let it through
        }
      }

      return true;
    });

    // Sort: division tier then alphabetically by school name
    const DIV_ORDER = { "D1 (FBS)": 0, "D1 (FCS)": 1, "D2": 2, "D3": 3, "NAIA": 4, "JUCO": 5 };
    filtered.sort((a, b) => {
      const da = normalizeDivisionForSort(a?.division || a?.school_division || "", a?.subdivision || a?.school_subdivision || "");
      const db = normalizeDivisionForSort(b?.division || b?.school_division || "", b?.subdivision || b?.school_subdivision || "");
      const oa = DIV_ORDER[da] ?? 99;
      const ob = DIV_ORDER[db] ?? 99;
      if (oa !== ob) return oa - ob;
      const na = String(a?._school_name || "").toLowerCase();
      const nb = String(b?._school_name || "").toLowerCase();
      return na.localeCompare(nb);
    });

    setRawRows(filtered);
  }, [allRows, nf, isPaid, athleteSportId, schoolById, distanceMiles, selectedMonth, homeLat, homeLng]);

  useEffect(() => {
    if (seasonLoading) return;
    loadCamps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonYear, isPaid, isDemoMode, seasonLoading]);

  // Re-run loadIntents once athleteProfile becomes available.
  // loadCamps() fires as soon as seasonLoading resolves, but athleteProfile
  // may not be loaded yet — causing loadIntents to send athleteId="" and find
  // nothing. This effect re-fetches intents as soon as the athlete ID is known.
  const athleteProfileId = athleteProfile?.id || athleteProfile?._id || athleteProfile?.uuid || null;
  useEffect(() => {
    if (!isPaid || !athleteProfileId || allRows.length === 0) return;
    loadIntents(allRows.map(campKeyForRow).filter(Boolean)).then(setIntentByKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteProfileId, isPaid]);

  // Reload intents when Calendar/MyCamps writes an intent (same-window CustomEvent
  // or cross-tab storage event) so the favorite star updates without a full reload.
  useEffect(() => {
    function handleIntentUpdate(e) {
      if (e.type === "intentUpdated" || e.key === "intentUpdatedAt") {
        loadIntents(allRows.map(campKeyForRow).filter(Boolean)).then(setIntentByKey);
      }
    }
    window.addEventListener("storage", handleIntentUpdate);
    window.addEventListener("intentUpdated", handleIntentUpdate);
    return () => {
      window.removeEventListener("storage", handleIntentUpdate);
      window.removeEventListener("intentUpdated", handleIntentUpdate);
    };
  }, [allRows]);

  // Strip stale ?mode=demo from URL once season resolves to paid
  useEffect(() => {
    if (seasonMode === "paid" && urlp?.mode === "demo") {
      const sp = new URLSearchParams(loc.search);
      sp.delete("mode");
      nav({ search: sp.toString() }, { replace: true });
    }
  }, [seasonMode, urlp?.mode]);

  function clearFilters() {
    filtersApi?.clearFilters?.();
    setSelectedMonth("all");
  }

  /* ─── derived ─────────────────────────────────────────────────────────── */

  const favoriteCount = useMemo(() => {
    let c = 0;
    for (const k of Object.keys(intentByKey || {})) {
      if (String(intentByKey[k]?.status || "").toLowerCase() === "favorite") c += 1;
    }
    return c;
  }, [intentByKey]);

  const activeChipKeys = useMemo(() => {
    const out = [];
    if (Array.isArray(nf?.divisions) && nf.divisions.length) out.push("divisions");
    if (Array.isArray(nf?.positions) && nf.positions.length) out.push("positions");
    if (nf?.state) out.push("state");
    if (nf?.startDate || nf?.endDate) out.push("dates");
    if (!isPaid && Array.isArray(nf?.sports) && nf.sports.length) out.push("sports");
    return out;
  }, [nf, isPaid]);

  const chipsLabel = (k) => {
    if (k === "divisions") return `Division: ${nf?.divisions?.join(", ") || ""}`;
    if (k === "positions") return `Position: ${nf?.positions?.join(", ") || ""}`;
    if (k === "sports")    return `Sport: ${nf?.sports?.join(", ") || ""}`;
    return chipLabel(k, nf);
  };

  /* ─── School grouping ──────────────────────────────────────────────────── */

  const [expandedSchools, setExpandedSchools] = useState({});
  const [schoolSearch, setSchoolSearch] = useState("");

  const schoolGroups = useMemo(() => {
    const rows = asArray(rawRows);
    const grouped = {};
    for (const camp of rows) {
      const schoolId = String(normId(camp?.school_id) || normId(camp?.school) || "");
      const key = schoolId || camp?.camp_name || camp?.id || Math.random().toString();
      const identity = resolveIdentity(schoolId, camp);
      if (!grouped[key]) {
        grouped[key] = {
          key,
          school_name: identity.name || camp?._school_name || "Unknown",
          school_id: schoolId,
          school_logo_url: identity.logoUrl || null,
          division: identity.division || camp?.division || camp?.school_division || null,
          subdivision: identity.subdivision || camp?.subdivision || camp?.school_subdivision || null,
          camps: [],
        };
      }
      grouped[key].camps.push(camp);
    }
    // Preserve the division → alphabetical order from rawRows (already sorted)
    const DIV_ORDER = { "D1 (FBS)": 0, "D1 (FCS)": 1, "D2": 2, "D3": 3, "NAIA": 4, "JUCO": 5 };
    return Object.values(grouped).sort((a, b) => {
      const da = normalizeDivisionForSort(a.division || "", a.subdivision || "");
      const db = normalizeDivisionForSort(b.division || "", b.subdivision || "");
      const oa = DIV_ORDER[da] ?? 99;
      const ob = DIV_ORDER[db] ?? 99;
      if (oa !== ob) return oa - ob;
      return String(a.school_name).toLowerCase().localeCompare(String(b.school_name).toLowerCase());
    });
  }, [rawRows, resolveIdentity]);

  function isCampFavorite(campId) {
    if (isPaid) {
      return String(intentByKey?.[campId]?.status || "").toLowerCase() === "favorite";
    }
    return demoFavoriteIds.includes(campId);
  }

  function isCampRegistered(campId) {
    if (isPaid) {
      const st = String(intentByKey?.[campId]?.status || "").toLowerCase();
      return st === "registered" || st === "completed";
    }
    return isDemoRegistered(demoProfileId, campId);
  }

  // Build list of all camps the user has saved (for conflict detection)
  function getSavedCamps() {
    return asArray(rawRows).filter((r) => {
      const cid = String(r?.id ?? "");
      return isCampFavorite(cid) || isCampRegistered(cid);
    });
  }

  function doFavoriteToggle(campId) {
    if (!isPaid) {
      const next = toggleDemoFavorite(demoProfileId, campId, seasonYear);
      setDemoFavoriteIds(next);
      invalidateCampCaches(queryClient);
      return;
    }
    const isFav = isCampFavorite(campId);
    upsertIntent(campId, isFav ? "" : "favorite");
    invalidateCampCaches(queryClient);
  }

  async function handleFavoriteToggle(campId) {
    if (isUserDemo) return; // interception handled in SchoolGroupCard (demo hint popup)
    // Demo users: skip writeGate entirely, allow local-only favorite
    if (!isPaid) {
      if (isCampFavorite(campId)) {
        doFavoriteToggle(campId);
        return;
      }
      const camp = rawRows.find((r) => String(r?.id) === String(campId));
      if (!camp) { doFavoriteToggle(campId); return; }
      const existing = getSavedCamps();
      const warnings = detectConflicts({
        camps: [...existing, camp],
        homeCity: athleteProfile?.home_city || null,
        homeState: athleteProfile?.home_state || null,
        homeLat: athleteProfile?.home_lat ?? null,
        homeLng: athleteProfile?.home_lng ?? null,
        isPaid,
      }).filter((w) => w.campIds?.includes(String(campId)));
      if (warnings.length > 0) {
        setConflictModal({ open: true, warnings, campId, action: "favorite" });
      } else {
        doFavoriteToggle(campId);
      }
      return;
    }

    // Paid users: run writeGate
    const ok = await writeGate.ensure("favorite", { campId });
    if (!ok) return;

    // If already favorited, just unfavorite (no conflict check)
    if (isCampFavorite(campId)) {
      doFavoriteToggle(campId);
      return;
    }

    // Check for conflicts before adding
    const camp = rawRows.find((r) => String(r?.id) === String(campId));
    if (!camp) { doFavoriteToggle(campId); return; }

    const existing = getSavedCamps();
    const warnings = detectConflicts({
      camps: [...existing, camp],
      homeCity: athleteProfile?.home_city || null,
      homeState: athleteProfile?.home_state || null,
      homeLat: athleteProfile?.home_lat ?? null,
      homeLng: athleteProfile?.home_lng ?? null,
      isPaid,
    }).filter((w) => w.campIds?.includes(String(campId)));

    if (warnings.length > 0) {
      setConflictModal({ open: true, warnings, campId, action: "favorite" });
    } else {
      doFavoriteToggle(campId);
    }
  }

  function doRegister(camp) {
    const campId = String(camp?.id ?? "");
    if (!isPaid) {
      toggleDemoRegistered(demoProfileId, campId);
      setDemoFavoriteIds(getDemoFavorites(demoProfileId, seasonYear));
      setIntentByKey((p) => ({ ...p }));
      invalidateCampCaches(queryClient);
    } else {
      upsertIntent(campId, "registered");
      invalidateCampCaches(queryClient);
    }
  }

  function handleRegisteredToggle(campId) {
    if (isUserDemo) return; // interception handled in SchoolGroupCard (demo hint popup)
    const id = String(campId ?? "");
    if (!id) return;
    const isReg = isCampRegistered(id);
    if (!isPaid) {
      toggleDemoRegistered(demoProfileId, id);
      setDemoFavoriteIds(getDemoFavorites(demoProfileId, seasonYear));
      setIntentByKey((p) => ({ ...p }));
      invalidateCampCaches(queryClient);
    } else {
      if (isReg) {
        // Unregister: revert to favorite if favorited, else clear
        const isFav = isCampFavorite(id);
        upsertIntent(id, isFav ? "favorite" : "");
      } else {
        upsertIntent(id, "registered");
      }
      invalidateCampCaches(queryClient);
    }
  }

  async function handleRegisterClick(camp) {
    if (isTourMode || isUserDemo) return;
    const campId = String(camp?.id ?? "");

    // Demo users: skip writeGate entirely, allow local-only register
    if (!isPaid) {
      if (isCampRegistered(campId)) {
        setUnregisterModal({ open: true, camp });
      } else {
        setRegisterModal({ open: true, camp });
      }
      return;
    }

    // Paid users: run writeGate
    const ok = await writeGate.ensure("register", { campId });
    if (!ok) return;

    if (isCampRegistered(campId)) {
      setUnregisterModal({ open: true, camp });
      return;
    }
    setRegisterModal({ open: true, camp });
  }

  function handleUnregister(camp) {
    const campId = String(camp?.id ?? "");
    if (!isPaid) {
      toggleDemoRegistered(demoProfileId, campId);
      setIntentByKey((p) => ({ ...p }));
    } else {
      upsertIntent(campId, "");
    }
    invalidateCampCaches(queryClient);
    setUnregisterModal({ open: false, camp: null });
  }

  /* ─── CampList ────────────────────────────────────────────────────────── */

  const CampList = () => {
    if (campErr) {
      return (
        <Card className="p-5 border-ur-border bg-ur-card">
          <div className="text-lg font-semibold text-ur-primary">Camps not available</div>
          <div className="mt-1 text-sm text-ur-secondary">{campErr}</div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="border-ur-border-input bg-transparent text-ur-primary hover:bg-ur-border" onClick={() => loadCamps()}>Retry</Button>
            <Button variant="outline" className="border-ur-border-input bg-transparent text-ur-primary hover:bg-ur-border" onClick={() => nav("/AdminHQ")}>Open Admin Ops</Button>
          </div>
        </Card>
      );
    }

    if (isLoading) {
      return (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <Card key={n} className="p-4 border-ur-border bg-ur-card">
              <div className="animate-pulse">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-ur-page border border-ur-border flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="h-3 w-28 bg-ur-border rounded" />
                      <div className="mt-2 h-5 w-56 bg-ur-border rounded" />
                      <div className="mt-2 h-4 w-40 bg-ur-border rounded" />
                    </div>
                  </div>
                  <div className="h-9 w-9 bg-ur-border rounded flex-shrink-0" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      );
    }

    if (!schoolGroups.length) {
      return (
        <Card className="p-5 border-ur-border bg-ur-card">
          <div className="text-lg font-semibold text-ur-primary">No camps found</div>
          <div className="mt-1 text-sm text-ur-secondary">
            No camps found for season {seasonYear} (or filters excluded them).
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="border-ur-border-input bg-transparent text-ur-primary hover:bg-ur-border" onClick={clearFilters}>Clear filters</Button>
            <Button className="bg-ur-amber text-ur-page hover:bg-ur-amber-hover" onClick={() => setIsFiltersOpen(true)}>Edit filters</Button>
          </div>
        </Card>
      );
    }

    const searchTerm = schoolSearch.trim().toLowerCase();
    const filteredGroups = searchTerm
      ? schoolGroups.filter((g) => String(g.school_name || "").toLowerCase().includes(searchTerm))
      : schoolGroups;
    const visibleGroups = filteredGroups.slice(0, visibleCount);
    const hasMore = filteredGroups.length > visibleCount;

    return (
      <div className="space-y-3">
        {visibleGroups.map((group) => (
          <SchoolGroupCard
            key={group.key}
            group={group}
            isExpanded={!!expandedSchools[group.key]}
            onToggle={() => setExpandedSchools((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
            isPaid={isPaid}
            isCoach={isCoach}
            isCoachDemo={isCoachDemo}
            isUserDemo={isUserDemo}
            coachRoster={coachRoster}
            isCampFavorite={isCampFavorite}
            isCampRegistered={isCampRegistered}
            onFavoriteToggle={handleFavoriteToggle}
            onRegisteredToggle={isCoach ? null : handleRegisteredToggle}
            onRegisterClick={(camp) => {
              if (isUserDemo) return; // interception handled in SchoolGroupCard (demo hint popup)
              const url = camp?.link_url || camp?.source_url;
              if (url) window.open(String(url), "_blank", "noopener,noreferrer");
            }}
            onCampClick={() => {}}
            getWarningsForCamp={(campId) => {
              if (isCoach) return [];
              const existing = getSavedCamps();
              if (!existing.some((r) => String(r?.id) === String(campId))) return [];
              return detectConflicts({
                camps: existing,
                homeCity: (isUserDemo ? DEMO_ATHLETE.home_city : null) || athleteProfile?.home_city || null,
                homeState: (isUserDemo ? DEMO_ATHLETE.home_state : null) || athleteProfile?.home_state || null,
                homeLat: athleteProfile?.home_lat ?? null,
                homeLng: athleteProfile?.home_lng ?? null,
                isPaid: isPaid || isUserDemo,
              }).filter((w) => w.campIds?.includes(String(campId)));
            }}
          />
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + 50)}
            className="w-full py-3 text-sm font-semibold text-ur-amber bg-ur-card border border-ur-border rounded-lg hover:bg-ur-border transition-colors"
          >
            Load more ({filteredGroups.length - visibleCount} remaining)
          </button>
        )}
      </div>
    );
  };

  /* ─── render ──────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-ur-page text-ur-primary pb-20">
      {/* DemoPreview funnel strip — replaces guided overlay on curated screens */}
      {isPreviewMode && (
        <DemoPreviewStrip
          payoff="Turn searching into a plan"
          nextRoute="/Calendar?preview=1&src=demo_preview"
          nextLabel="See Calendar"
        />
      )}
      <div className="max-w-5xl mx-auto px-4 pt-6">
        {/* ← HQ navigation — hidden during guided tour and preview mode */}
        {!isTourMode && !isPreviewMode && (
          <button
            type="button"
            onClick={() => nav(isCoach ? "/CoachDashboard" : isUserDemo ? "/Workspace?demo=user&src=home_demo" : "/Workspace")}
            className="mb-3 text-sm font-medium text-ur-amber hover:text-ur-amber-hover flex items-center gap-1"
          >
            ← {isCoach ? "Coach HQ" : "HQ"}
          </button>
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold text-ur-primary">Discover</div>
              <span className="text-sm text-ur-secondary">{resultsCountLabel}</span>
            </div>
          </div>


        </div>

        {hasActiveFilters(nf, isPaid) && (
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            {activeChipKeys.map((k) => (
              <button
                key={k}
                type="button"
                className="text-xs px-2 py-1 rounded-full border border-ur-border-input bg-ur-card text-ur-primary hover:bg-ur-border transition-colors"
                onClick={() => setIsFiltersOpen(true)}
              >
                {chipsLabel(k)}
              </button>
            ))}
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-full border border-ur-border-input bg-ur-card hover:bg-ur-border text-ur-secondary transition-colors"
              onClick={clearFilters}
            >
              Clear
            </button>
          </div>
        )}

        {/* Athlete switcher — only shows when account has 2+ athletes */}
        {seasonAccountId && isPaid && (
          <div className="mt-4 mb-2">
            <AthleteSwitcher
              accountId={seasonAccountId}
              seasonYear={Number(accessSeasonYear || new Date().getFullYear())}
              onAddAthlete={() => nav("/Checkout?mode=addon")}
            />
          </div>
        )}

        {!isPaid && !isCoachDemo && !isPreviewMode && <div className="mt-5 mb-2"><DemoBanner seasonYear={seasonYear} compact={isTourMode} /></div>}

        {/* Inline filter dropdowns */}
        <div className="mt-4">
          <InlineFilterBar
            nf={nf}
            setNF={filtersApi?.setNF}
            isPaid={isPaid}
            distanceMiles={distanceMiles}
            distanceWarning={distanceWarning}
            onDistanceChange={(val) => {
              if (val && !hasHomeLocation) {
                setDistanceWarning("Set your city & state in Profile to use distance filter.");
                setDistanceMiles(null);
                return;
              }
              setDistanceWarning("");
              setDistanceMiles(val);
            }}
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
          />
        </div>

        {/* School name search */}
        <div className="mt-3 relative">
          <input
            type="text"
            placeholder="Search schools…"
            value={schoolSearch}
            onChange={(e) => { setSchoolSearch(e.target.value); setVisibleCount(50); }}
            className="w-full rounded-lg px-4 py-2 text-sm bg-ur-input border border-ur-border-input text-ur-primary placeholder-ur-muted focus:outline-none focus:border-ur-amber"
          />
          {schoolSearch && (
            <button
              type="button"
              onClick={() => setSchoolSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ur-muted hover:text-ur-primary text-lg leading-none transition-colors"
            >
              ×
            </button>
          )}
        </div>

        <div className="mt-4">
          <CampList />
        </div>
      </div>

      {/* Conflict warning modal */}
      <ConflictWarningModal
        open={conflictModal.open}
        warnings={conflictModal.warnings}
        onClose={() => setConflictModal({ open: false, warnings: [], campId: null, action: null })}
        confirmLabel={conflictModal.action === "favorite" ? "Favorite Anyway" : "Register Anyway"}
        onConfirm={() => {
          const { action: cAction, campId: cCampId } = conflictModal;
          setConflictModal({ open: false, warnings: [], campId: null, action: null });
          if (cAction === "favorite" && cCampId) {
            // Explicitly ADD as favorite — do not re-check isCampFavorite direction,
            // which could race to "unfavorite" if state changed while modal was open.
            if (!isPaid) {
              const next = toggleDemoFavorite(demoProfileId, cCampId, seasonYear);
              setDemoFavoriteIds(next);
              invalidateCampCaches(queryClient);
            } else {
              upsertIntent(cCampId, "favorite");
              invalidateCampCaches(queryClient);
            }
          }
        }}
      />

      {/* Register confirm modal */}
      <RegisterConfirmModal
        open={registerModal.open}
        onClose={() => setRegisterModal({ open: false, camp: null })}
        campName={registerModal.camp?.camp_name || "this camp"}
        isPaid={isPaid}
        linkUrl={registerModal.camp?.link_url || registerModal.camp?.source_url || null}
        onMarkRegistered={() => {
          doRegister(registerModal.camp);
          setRegisterModal({ open: false, camp: null });
        }}
        onGoToLink={() => {
          const url = registerModal.camp?.link_url || registerModal.camp?.source_url;
          if (url) window.open(String(url), "_blank", "noopener,noreferrer");
          doRegister(registerModal.camp);
          setRegisterModal({ open: false, camp: null });
        }}
        onSubscribe={() => {
          window.open("https://camp-connect-698c00ef.base44.app/Subscribe?source=workspace_banner", "_blank", "noopener,noreferrer");
          setRegisterModal({ open: false, camp: null });
        }}
      />

      {/* Unregister confirm modal */}
      <UnregisterConfirmModal
        open={unregisterModal.open}
        onClose={() => setUnregisterModal({ open: false, camp: null })}
        campName={unregisterModal.camp?.camp_name || "this camp"}
        onRemove={() => handleUnregister(unregisterModal.camp)}
      />

      <FilterSheet
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        filters={nf || {}}
        onFilterChange={(next) => filtersApi?.setNF?.(next)}
        positions={[]}
        sports={[]}
        lockSportId={isPaid ? String(athleteSportId || "") : ""}
        onClear={clearFilters}
        onApply={() => {
          setIsFiltersOpen(false);
        }}
      />

      <GuidedTourOverlay tourKey="discover" />
      <BottomNav />
    </div>
  );
}