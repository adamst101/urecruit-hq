// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";
import SchoolGroupCard from "../components/camps/SchoolGroupCard.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { readDemoMode } from "../components/hooks/demoMode.jsx";

import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampFilters } from "../components/filters/useCampFilters.jsx";
import { useWriteGate } from "../components/hooks/useWriteGate.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites, toggleDemoFavorite } from "../components/hooks/demoFavorites.jsx";

// ✅ Centralised school identity resolution (logo, name, division)
import { useSchoolIdentity } from "../components/hooks/useSchoolIdentity.jsx";

import InlineFilterBar from "../components/filters/InlineFilterBar.jsx";
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
  normalizeDivisionForSort,
} from "../components/filters/filterUtils.jsx";

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

function trackEvent(payload) {
  try {
    const EventEntity = base44?.entities?.Event || base44?.entities?.Events;
    if (!EventEntity?.create) return;
    const iso = new Date().toISOString();
    const eventName = payload?.event_name || "event";
    const src = payload?.source_platform || "web";
    EventEntity.create({
      source_platform: String(src),
      event_type: String(eventName),
      title: String(payload?.title || String(eventName)),
      source_key: String(payload?.source_key || `${src}:${eventName}`),
      start_date: payload?.start_date || iso.slice(0, 10),
      payload_json: JSON.stringify(payload || {}),
      ts: iso,
    });
  } catch { /* ignore */ }
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
    <div className="w-10 h-10 rounded-lg bg-[#0f172a] border border-[#1f2937] overflow-hidden flex items-center justify-center flex-shrink-0">
      {showImg ? (
        <img
          src={logoUrl}
          alt={`${schoolName} logo`}
          className="w-full h-full object-contain"
          loading="lazy"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div className="text-xs font-semibold text-[#9ca3af]">{initialBadge(schoolName)}</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Page
═══════════════════════════════════════════════════════════════════════════════ */

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  // ✅ FIX 1: readDemoMode() returns null when not set — always use optional chaining
  const dm             = readDemoMode();           // null | { mode, seasonYear, setAt }
  const isDemoMode     = dm?.mode === "demo";
  const demoSeasonOverride = Number.isFinite(Number(dm?.seasonYear)) ? Number(dm.seasonYear) : null;

  const { identity: athleteProfile } = useAthleteIdentity();
  const { demoProfileId } = useDemoProfile();
  const athleteSportId = athleteProfile?.sport_id != null ? String(athleteProfile.sport_id) : "";

  const { hasAccess, seasonYear: accessSeasonYear } = useSeasonAccess();
  const writeGate = useWriteGate();

  const isPaid = !!hasAccess && !isDemoMode;

  const urlp = useMemo(() => getUrlParams(loc?.search || ""), [loc?.search]);
  const seasonYear = useMemo(() => {
    if (urlp?.requestedSeason) return urlp.requestedSeason;
    if (isDemoMode && demoSeasonOverride) return demoSeasonOverride;
    if (accessSeasonYear) return accessSeasonYear;
    return footballSeasonYearForDate(new Date());
  }, [urlp?.requestedSeason, isDemoMode, demoSeasonOverride, accessSeasonYear]);

  const [isLoading, setIsLoading]         = useState(false);
  const [campErr, setCampErr]             = useState(null);
  const [rawRows, setRawRows]             = useState([]);
  const [intentByKey, setIntentByKey]     = useState({});
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [demoFavoriteIds, setDemoFavoriteIds] = useState([]);
  const [distanceMiles, setDistanceMiles] = useState(null);

  // Modal states
  const [conflictModal, setConflictModal] = useState({ open: false, warnings: [], campId: null, action: null });
  const [registerModal, setRegisterModal] = useState({ open: false, camp: null });
  const [unregisterModal, setUnregisterModal] = useState({ open: false, camp: null });

  // Home coordinates from athlete profile (paid mode distance filter)
  const homeLat = athleteProfile?.home_lat ?? null;
  const homeLng = athleteProfile?.home_lng ?? null;

  const filtersApi = useCampFilters();
  useEffect(() => {
    if (isPaid) {
      setDemoFavoriteIds([]);
      return;
    }
    setDemoFavoriteIds(getDemoFavorites(demoProfileId, seasonYear));
  }, [isPaid, demoProfileId, seasonYear]);
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
      const CampIntent = base44?.entities?.CampIntent;
      if (!CampIntent?.filter) return {};
      const keyArr = asArray(keys).filter(Boolean);
      if (!keyArr.length) return {};

      const out = {};
      for (const g of chunk(keyArr, 50)) {
        const rows = await safeFilter(CampIntent, { camp_id: g }, "-updated_date", 2000);
        for (const r of asArray(rows)) {
          const k = String(r?.camp_id || "");
          if (k) out[k] = r;
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  async function upsertIntent(intentKey, nextStatus) {
    const CampIntent = base44?.entities?.CampIntent;
    if (!CampIntent?.create) return;
    const key = String(intentKey || "");
    if (!key) return;

    const existing = intentByKey?.[key] || null;

    // Resolve athlete_id for CampIntent records
    const aId = athleteProfile?.id || athleteProfile?._id || athleteProfile?.uuid || null;

    if (!nextStatus) {
      if (existing?.id && CampIntent?.update) {
        await CampIntent.update(existing.id, { status: "" });
        setIntentByKey((p) => ({ ...p, [key]: { ...existing, status: "" } }));
      }
      return;
    }

    if (existing?.id && CampIntent?.update) {
      const updated = await CampIntent.update(existing.id, { status: String(nextStatus) });
      setIntentByKey((p) => ({ ...p, [key]: updated || { ...existing, status: String(nextStatus) } }));
      return;
    }

    const created = await CampIntent.create({
      camp_id: key,
      athlete_id: aId ? String(aId) : null,
      status: String(nextStatus),
    });
    setIntentByKey((p) => ({ ...p, [key]: created || { camp_id: key, status: String(nextStatus) } }));
  }

  /* ─── filters (derived, reactive to nf changes) ──────────────────────── */

  /* ─── load camps ──────────────────────────────────────────────────────── */

  const [allRows, setAllRows] = useState([]);

  // ✅ School identity via dedicated hook — uses allRows so school data
  // is available for filtering (division, state) before display
  const { resolveIdentity, schoolById } = useSchoolIdentity(allRows);

  async function loadCamps() {
    setIsLoading(true);
    setCampErr(null);

    try {
      const useDemoEntity = isDemoMode;
      const CampEntity = useDemoEntity ? base44?.entities?.DemoCamp : base44?.entities?.Camp;
      if (!CampEntity?.filter) {
        setAllRows([]);
        setRawRows([]);
        setCampErr("Camps not available.");
        return;
      }

      let rows = [];
      const filterField = useDemoEntity ? "demo_season_year" : "season_year";
      try {
        rows = await safeFilter(CampEntity, { [filterField]: seasonYear }, "-start_date", 2000);
      } catch (e1) {
        try {
          rows = await safeFilter(CampEntity, { [filterField]: String(seasonYear) }, "-start_date", 2000);
        } catch (e2) {
          throw e2 || e1;
        }
      }

      const active = asArray(rows).filter(readActiveFlag);
      setAllRows(active);

      const keys    = active.map(campKeyForRow).filter(Boolean);
      const intents = await loadIntents(keys);
      setIntentByKey(intents);

      trackEvent({
        event_name:  "discover_loaded",
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
      trackEvent({ event_name: "discover_error", source: "discover", season_year: seasonYear, paid: isPaid, error: msg });
    } finally {
      setIsLoading(false);
    }
  }

  // Reactively apply filters whenever nf, allRows, or schoolById change.
  // We enrich each camp row with school division/state so filters work correctly.
  useEffect(() => {
    const enrichedRows = allRows.map((r) => {
      const sid = String(normId(r?.school_id) || "");
      const sch = sid ? schoolById[sid] : null;
      return sch ? {
        ...r,
        division: r?.division || sch?.division || sch?.school_division || null,
        school_division: r?.school_division || sch?.division || sch?.school_division || null,
        subdivision: r?.subdivision || sch?.subdivision || null,
        school_subdivision: r?.school_subdivision || sch?.subdivision || null,
        state: r?.state || sch?.state || null,
        school_state: r?.school_state || sch?.state || null,
        _school_lat: sch?.lat ?? sch?.home_lat ?? null,
        _school_lng: sch?.lng ?? sch?.home_lng ?? null,
        _school_name: sch?.school_name || sch?.name || r?.camp_name || "",
      } : { ...r, _school_name: r?.camp_name || "" };
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

      // Distance filter (paid mode only)
      if (isPaid && distanceMiles && homeLat != null && homeLng != null) {
        const campLat = enriched?._school_lat ?? null;
        const campLng = enriched?._school_lng ?? null;
        if (campLat == null || campLng == null) return true;
        const dist = haversine(homeLat, homeLng, campLat, campLng);
        if (dist > distanceMiles) return false;
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
  }, [allRows, nf, isPaid, athleteSportId, schoolById, distanceMiles, homeLat, homeLng]);

  useEffect(() => {
    loadCamps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonYear, isPaid]);

  function clearFilters() {
    filtersApi?.clearFilters?.();
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
      return;
    }
    const isFav = isCampFavorite(campId);
    upsertIntent(campId, isFav ? "" : "favorite");
  }

  async function handleFavoriteToggle(campId) {
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
      // force re-render by updating intentByKey
      setIntentByKey((p) => ({ ...p }));
    } else {
      upsertIntent(campId, "registered");
    }
  }

  function handleRegisterClick(camp) {
    const campId = String(camp?.id ?? "");

    // If already registered, show unregister modal
    if (isCampRegistered(campId)) {
      setUnregisterModal({ open: true, camp });
      return;
    }

    // Show register confirm modal
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
    setUnregisterModal({ open: false, camp: null });
  }

  /* ─── CampList ────────────────────────────────────────────────────────── */

  const CampList = () => {
    if (campErr) {
      return (
        <Card className="p-5 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Camps not available</div>
          <div className="mt-1 text-sm text-[#9ca3af]">{campErr}</div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]" onClick={() => loadCamps()}>Retry</Button>
            <Button variant="outline" className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]" onClick={() => nav("/AdminOps")}>Open Admin Ops</Button>
          </div>
        </Card>
      );
    }

    if (isLoading) {
      return (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <Card key={n} className="p-4 border-[#1f2937] bg-[#111827]">
              <div className="animate-pulse">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#0f172a] border border-[#1f2937] flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="h-3 w-28 bg-[#1f2937] rounded" />
                      <div className="mt-2 h-5 w-56 bg-[#1f2937] rounded" />
                      <div className="mt-2 h-4 w-40 bg-[#1f2937] rounded" />
                    </div>
                  </div>
                  <div className="h-9 w-9 bg-[#1f2937] rounded flex-shrink-0" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      );
    }

    if (!schoolGroups.length) {
      return (
        <Card className="p-5 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">No camps found</div>
          <div className="mt-1 text-sm text-[#9ca3af]">
            No camps found for season {seasonYear} (or filters excluded them).
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]" onClick={clearFilters}>Clear filters</Button>
            <Button className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]" onClick={() => setIsFiltersOpen(true)}>Edit filters</Button>
          </div>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {schoolGroups.map((group) => (
          <SchoolGroupCard
            key={group.key}
            group={group}
            isExpanded={!!expandedSchools[group.key]}
            onToggle={() => setExpandedSchools((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
            isPaid={isPaid}
            isCampFavorite={isCampFavorite}
            isCampRegistered={isCampRegistered}
            onFavoriteToggle={handleFavoriteToggle}
            onRegisterClick={handleRegisterClick}
            onCampClick={(campId) =>
              nav(`/CampDetail?id=${encodeURIComponent(campId)}${!isPaid ? "&mode=demo" : ""}`)
            }
            getWarningsForCamp={(campId) => {
              const existing = getSavedCamps();
              if (!existing.some((r) => String(r?.id) === String(campId))) return [];
              return detectConflicts({
                camps: existing,
                homeCity: athleteProfile?.home_city || null,
                homeState: athleteProfile?.home_state || null,
                isPaid,
              }).filter((w) => w.campIds?.includes(String(campId)));
            }}
          />
        ))}
      </div>
    );
  };

  /* ─── render ──────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#f9fafb] pb-20">
      <div className="max-w-5xl mx-auto px-4 pt-6">
        {/* ← HQ navigation */}
        <button
          type="button"
          onClick={() => nav("/Workspace")}
          className="mb-3 text-sm font-medium text-[#e8a020] hover:text-[#f3b13f] flex items-center gap-1"
        >
          ← HQ
        </button>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-2xl font-bold text-[#f9fafb]">Discover</div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-[#111827] text-[#9ca3af] border border-[#1f2937]">
                Season {seasonYear}
              </Badge>
              {isPaid
                ? <Badge className="bg-[#e8a020] text-[#0a0e1a]">Paid</Badge>
                : <Badge variant="outline" className="border-[#374151] text-[#9ca3af]">Demo</Badge>
              }
              <span className="text-xs text-[#9ca3af]">{resultsCountLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPaid && (
              <Button
                variant="outline"
                onClick={() => nav("/MyCamps")}
                aria-label="Go to My Camps"
                className="whitespace-nowrap border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#111827]"
              >
                My Camps
                {favoriteCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[22px] h-[22px] px-2 rounded-full bg-slate-900 text-white text-xs">
                    {favoriteCount}
                  </span>
                )}
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsFiltersOpen(true)} aria-label="Open filters" className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#111827]">
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>

        {hasActiveFilters(nf, isPaid) && (
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            {activeChipKeys.map((k) => (
              <button
                key={k}
                type="button"
                className="text-xs px-2 py-1 rounded-full border border-[#374151] bg-[#111827] text-[#f9fafb] hover:bg-[#1f2937]"
                onClick={() => setIsFiltersOpen(true)}
              >
                {chipsLabel(k)}
              </button>
            ))}
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-full border border-[#374151] bg-[#111827] hover:bg-[#1f2937] text-[#9ca3af]"
              onClick={clearFilters}
            >
              Clear
            </button>
          </div>
        )}

        {/* Inline filter dropdowns */}
        <div className="mt-4">
          <InlineFilterBar
            nf={nf}
            setNF={filtersApi?.setNF}
            isPaid={isPaid}
            distanceMiles={distanceMiles}
            onDistanceChange={setDistanceMiles}
          />
        </div>

        <div className="mt-4">
          <CampList />
        </div>
      </div>

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

      <BottomNav />
    </div>
  );
}