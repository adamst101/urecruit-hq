// src/pages/Calendar.jsx — clean rewrite
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { XCircle, SlidersHorizontal } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { base44 } from "../api/base44Client";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";
import DemoBanner from "../components/DemoBanner.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites, toggleDemoFavorite } from "../components/hooks/demoFavorites.jsx";
import { isDemoRegistered, toggleDemoRegistered } from "../components/hooks/demoRegistered.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { useDemoCampSummaries } from "@/components/hooks/useDemoCampSummaries.jsx";

import {
  normalizeFilters,
  withinDateRange,
  normalizeState,
  matchesDivision,
  matchesMonth,
  matchesStateSimple,
  matchesDivisionSimple,
  MONTH_OPTIONS,
  DIVISION_FILTER_OPTIONS,
} from "../components/filters/filterUtils.jsx";

import CampCard from "../components/camps/CampCard.jsx";
import WarningBanner from "../components/camps/WarningBanner.jsx";
import WarningBadge from "../components/camps/WarningBadge.jsx";
import { useConflictDetection } from "../components/hooks/useConflictDetection.jsx";

import CalendarViewToggle from "../components/calendar/CalendarViewToggle.jsx";
import MonthSubToggle from "../components/calendar/MonthSubToggle.jsx";
import WeekView from "../components/calendar/WeekView.jsx";
import MonthOverview from "../components/calendar/MonthOverview.jsx";
import MonthGridView from "../components/calendar/MonthGridView.jsx";
import CampDetailPanel from "../components/calendar/CampDetailPanel.jsx";
import RegisterConfirmModal from "../components/camps/RegisterConfirmModal.jsx";
import UnregisterConfirmModal from "../components/camps/UnregisterConfirmModal.jsx";

/* ═══════════════════════════════════════
   Helpers
   ═══════════════════════════════════════ */

function asArray(x) {
  return Array.isArray(x) ? x : [];
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
  return true;
}

function getUrlParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const mode = sp.get("mode");
    const season = sp.get("season");
    return {
      mode: mode ? String(mode).toLowerCase() : null,
      seasonYear: season && Number.isFinite(Number(season)) ? Number(season) : null,
    };
  } catch {
    return { mode: null, seasonYear: null };
  }
}

/** Normalise any date value to "YYYY-MM-DD" or null */
function normalizeDateKey(dateVal) {
  if (!dateVal) return null;
  try {
    const s = String(dateVal);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (s.includes("T")) return s.split("T")[0];
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    return null;
  } catch {
    return null;
  }
}

const ROUTES = { Profile: "/Profile" };

/* ═══════════════════════════════════════
   Component
   ═══════════════════════════════════════ */

export default function Calendar() {
  /* ── 1. Navigation ────────────────── */
  const nav = useNavigate();
  const loc = useLocation();
  const queryClient = useQueryClient();

  /* ── 2. Season / auth ─────────────── */
  const season = useSeasonAccess();
  const { demoProfileId } = useDemoProfile();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  // If season has resolved to paid, never let a stale ?mode=demo override it
  const forceDemo = url.mode === "demo" && season?.mode !== "paid";
  const effectiveMode = forceDemo ? "demo" : season?.mode;
  const isPaid = effectiveMode === "paid";

  const seasonYear = useMemo(() => {
    if (forceDemo && url.seasonYear) return url.seasonYear;
    return season?.seasonYear;
  }, [forceDemo, url.seasonYear, season?.seasonYear]);

  const athleteId = useMemo(() => {
    if (!isPaid) return null;
    const id = athleteProfile?.id ?? athleteProfile?._id ?? athleteProfile?.uuid ?? null;
    return id ? String(id) : null;
  }, [isPaid, athleteProfile]);

  const athleteSportId = useMemo(() => {
    const sid = athleteProfile?.sport_id ?? athleteProfile?.sportId ?? null;
    return sid != null ? String(sid) : "";
  }, [athleteProfile]);

  const paidMissingSport = useMemo(
    () => isPaid && !!athleteId && !athleteSportId,
    [isPaid, athleteId, athleteSportId],
  );

  /* ── 3. ALL useState declarations ─── */

  // Register/unregister modal state (same as Discover)
  const [registerModal, setRegisterModal] = useState({ open: false, camp: null });
  const [unregisterModal, setUnregisterModal] = useState({ open: false, camp: null });

  // View state
  const [calView, setCalView] = useState("list");
  const [monthSubView, setMonthSubView] = useState("agenda");
  const [currentWeek, setCurrentWeek] = useState(() => {
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    return sunday;
  });
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedCamp, setSelectedCamp] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Filter state
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "", state: "", divisions: [], positions: [], startDate: "", endDate: "",
  });
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [inlineState, setInlineState] = useState("all");
  const [inlineDivision, setInlineDivision] = useState("all");

  // Picklists
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  /* ── 4. Side effects ──────────────── */

  // Invalidate caches on mount
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["demoCampSummaries"] });
    queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });
  }, [queryClient]);

  // Strip stale ?mode=demo from URL once season resolves to paid
  useEffect(() => {
    if (season?.mode === "paid" && url.mode === "demo") {
      const sp = new URLSearchParams(loc.search);
      sp.delete("mode");
      nav({ search: sp.toString() }, { replace: true });
    }
  }, [season?.mode, url.mode]);

  // Auto-set sport filter for paid users
  useEffect(() => {
    if (!isPaid || !athleteSportId) return;
    if (String(filters?.sport || "") !== athleteSportId) {
      setFilters((prev) => ({ ...prev, sport: athleteSportId }));
    }
  }, [isPaid, athleteSportId]);

  // Load picklists
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await base44?.entities?.Sport?.list?.();
        if (mounted) setSports(Array.isArray(r) ? r : []);
      } catch {
        try {
          const r2 = await base44?.entities?.Sport?.filter?.({});
          if (mounted) setSports(Array.isArray(r2) ? r2 : []);
        } catch { if (mounted) setSports([]); }
      }
      try {
        const r = await base44?.entities?.Position?.list?.();
        if (mounted) setPositions(Array.isArray(r) ? r : []);
      } catch {
        try {
          const r2 = await base44?.entities?.Position?.filter?.({});
          if (mounted) setPositions(Array.isArray(r2) ? r2 : []);
        } catch { if (mounted) setPositions([]); }
      }
    })();
    return () => { mounted = false; };
  }, []);

  /* ── 5. Data sources ──────────────── */

  const nf = useMemo(() => normalizeFilters(filters), [filters]);

  const paidQuery = useCampSummariesClient({
    athleteId: athleteId || undefined,
    sportId: nf?.sportId || undefined,
    enabled: !season.isLoading && isPaid && !!athleteId,
  });

  const demoQuery = useDemoCampSummaries({
    seasonYear,
    demoProfileId: demoProfileId || "default",
    enabled: !season.isLoading && !isPaid,
  });

  const loading =
    !!season?.isLoading ||
    (isPaid && identityLoading) ||
    (isPaid ? !!paidQuery?.isLoading : !!demoQuery?.isLoading);

  /* ── 6. Derived data (useMemo) ────── */

  const positionsMap = useMemo(() => {
    const m = new Map();
    for (const p of asArray(positions)) {
      const id = normId(p);
      if (id) m.set(String(id), p);
    }
    return m;
  }, [positions]);

  /**
   * allUserCamps — camps with intent (favorite / registered) after
   * applying FilterSheet filters, but BEFORE inline list-only filters.
   * Month views use this so they always show the full set.
   */
  const allUserCamps = useMemo(() => {
    const base = isPaid ? asArray(paidQuery?.data) : asArray(demoQuery?.data);
    const wantedState = nf?.state ? String(nf.state) : null;
    const wantedDivisions = asArray(nf?.divisions).map(String).filter(Boolean);
    const wantedPositions = asArray(nf?.positionIds).map(String).filter(Boolean);

    const result = base
      .filter((c) => readActiveFlag(c))
      .filter((c) => {
        // In demo mode, only show camps with intent
        if (!isPaid) {
          const st = String(c?.intent_status || "").toLowerCase();
          if (st !== "favorite" && st !== "registered" && st !== "completed") return false;
        }
        if (wantedState) {
          const campState = normalizeState(c?.state || c?.camp_state || c?.school_state) || null;
          if (campState !== wantedState) return false;
        }
        if (wantedDivisions.length && !matchesDivision(c, wantedDivisions)) return false;
        if (wantedPositions.length) {
          const campPos = asArray(c?.position_ids).map(String);
          if (!wantedPositions.some((pid) => campPos.includes(pid))) return false;
        }
        const campStart = c?.start_date || null;
        const campEnd = c?.end_date || null;
        if (!withinDateRange(campStart, nf?.startDate || "", nf?.endDate || "", campEnd)) return false;
        return true;
      });

    result.sort((a, b) => {
      const da = normalizeDateKey(a?.start_date) || "9999";
      const db = normalizeDateKey(b?.start_date) || "9999";
      return da.localeCompare(db);
    });
    return result;
  }, [isPaid, paidQuery?.data, demoQuery?.data, nf]);

  /**
   * listRows — allUserCamps + inline filters (month / state / division).
   * Only used by the list view.
   */
  const listRows = useMemo(() => {
    return allUserCamps.filter((c) => {
      if (!matchesMonth(c, selectedMonth)) return false;
      if (!matchesStateSimple(c, inlineState)) return false;
      if (!matchesDivisionSimple(c, inlineDivision)) return false;
      return true;
    });
  }, [allUserCamps, selectedMonth, inlineState, inlineDivision]);

  /**
   * campsByDate — built from allUserCamps (NOT listRows).
   * Month sub-views use this so inline filters don't hide camps.
   */
  const campsByDate = useMemo(() => {
    const map = {};
    allUserCamps.forEach((c) => {
      const key = normalizeDateKey(c?.start_date);
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(c);
    });
    return map;
  }, [allUserCamps]);

  const conflictDates = useMemo(() => {
    const dates = new Set();
    Object.entries(campsByDate).forEach(([date, camps]) => {
      if (camps.length > 1) dates.add(date);
    });
    return dates;
  }, [campsByDate]);

  const schoolMap = useMemo(() => {
    const map = {};
    allUserCamps.forEach((r) => {
      const campId = String(r?.camp_id || r?.id || "");
      map[campId] = {
        school_name: r?.school_name,
        division: r?.school_division,
        logo_url: r?.school_logo_url,
      };
    });
    return map;
  }, [allUserCamps]);

  // Auto-jump calendar to first camp month/week when camps load.
  // Critical for demo mode (2025 camps vs 2026 default) and
  // helps paid users whose first camp may be in a future month.
  const hasJumpedRef = React.useRef(false);
  useEffect(() => {
    if (!allUserCamps?.length) return;
    if (hasJumpedRef.current) return;
    const keys = Object.keys(campsByDate).sort();
    if (keys.length === 0) return;
    const firstDate = new Date(keys[0] + "T00:00:00");
    if (isNaN(firstDate.getTime())) return;
    hasJumpedRef.current = true;
    setCurrentMonth(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1));
    const dayOfWeek = firstDate.getDay();
    const sunday = new Date(firstDate);
    sunday.setDate(firstDate.getDate() - dayOfWeek);
    setCurrentWeek(sunday);
  }, [allUserCamps, campsByDate]);

  /* ── 7. Conflict detection ────────── */

  const favCamps = useMemo(
    () => allUserCamps.filter((r) => String(r?.intent_status || "").toLowerCase() === "favorite"),
    [allUserCamps],
  );
  const regCamps = useMemo(
    () => allUserCamps.filter((r) => {
      const st = String(r?.intent_status || "").toLowerCase();
      return st === "registered" || st === "completed";
    }),
    [allUserCamps],
  );

  const { warnings: allWarnings, getWarningsForCamp } = useConflictDetection({
    favoritedCamps: favCamps.map((r) => ({
      id: r?.camp_id || r?.id, camp_name: r?.camp_name,
      start_date: r?.start_date, city: r?.city || r?.school_city,
      state: r?.state || r?.school_state, school_name: r?.school_name,
    })),
    registeredCamps: regCamps.map((r) => ({
      id: r?.camp_id || r?.id, camp_name: r?.camp_name,
      start_date: r?.start_date, city: r?.city || r?.school_city,
      state: r?.state || r?.school_state, school_name: r?.school_name,
    })),
    homeCity: athleteProfile?.home_city || null,
    homeState: athleteProfile?.home_state || null,
    isPaid,
  });

  /* ── 8. Event handlers ────────────── */

  function invalidateCampCaches() {
    queryClient.invalidateQueries({ queryKey: ["demoCampSummaries"] });
    queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });
  }

  // Opens the same RegisterConfirmModal that Discover uses
  function handleRegisterClick(camp) {
    const cid = String(camp?.camp_id || camp?.id || "");
    if (isCampRegistered(cid)) {
      setUnregisterModal({ open: true, camp });
    } else {
      setRegisterModal({ open: true, camp });
    }
  }

  function isCampRegistered(campId) {
    if (isPaid) {
      // Check from the query data — look for registered/completed status
      const base = asArray(paidQuery?.data);
      const row = base.find((r) => String(r?.camp_id || r?.id || "") === String(campId));
      const st = String(row?.intent_status || "").toLowerCase();
      return st === "registered" || st === "completed";
    }
    return isDemoRegistered(demoProfileId, campId);
  }

  function isCampFavorite(campId) {
    if (isPaid) {
      const base = asArray(paidQuery?.data);
      const row = base.find((r) => String(r?.camp_id || r?.id || "") === String(campId));
      return String(row?.intent_status || "").toLowerCase() === "favorite";
    }
    return false;
  }

  function doRegister(camp) {
    const cid = String(camp?.camp_id || camp?.id || "");
    if (!cid) return;
    if (!isPaid) {
      toggleDemoRegistered(demoProfileId, cid);
      invalidateCampCaches();
    } else {
      upsertIntent(cid, "registered");
    }
  }

  function doUnregister(camp) {
    const cid = String(camp?.camp_id || camp?.id || "");
    if (!cid) return;
    if (!isPaid) {
      toggleDemoRegistered(demoProfileId, cid);
      invalidateCampCaches();
    } else {
      upsertIntent(cid, "");
    }
    setUnregisterModal({ open: false, camp: null });
  }

  function handleFavorite(camp) {
    const cid = String(camp?.camp_id || camp?.id || "");
    if (!cid) return;
    if (!isPaid) {
      toggleDemoFavorite(demoProfileId, cid, seasonYear);
      invalidateCampCaches();
    }
  }

  function handleUnfavorite(camp) {
    const cid = String(camp?.camp_id || camp?.id || "");
    if (!cid) return;
    if (!isPaid) {
      toggleDemoFavorite(demoProfileId, cid, seasonYear);
      invalidateCampCaches();
    }
  }

  async function upsertIntent(campId, nextStatus) {
    const CampIntent = base44?.entities?.CampIntent;
    if (!CampIntent?.create) return;
    const key = String(campId || "");
    if (!key) return;

    try {
      // Find existing intent for this camp
      const aId = athleteId;
      if (!aId) return;
      const existing = await CampIntent.filter({ athlete_id: aId, camp_id: key }).then(
        (rows) => (Array.isArray(rows) && rows.length > 0 ? rows[0] : null)
      ).catch(() => null);

      if (!nextStatus) {
        if (existing?.id) await CampIntent.update(existing.id, { status: "" });
      } else if (existing?.id) {
        await CampIntent.update(existing.id, { status: String(nextStatus) });
      } else {
        await CampIntent.create({ camp_id: key, status: String(nextStatus), athlete_id: aId });
      }
    } catch (err) {
      console.error("[Calendar upsertIntent]", err);
    }
    invalidateCampCaches();
  }

  function handleRegisteredToggle(campIdOrCamp) {
    const cid = typeof campIdOrCamp === "string"
      ? campIdOrCamp
      : String(campIdOrCamp?.camp_id || campIdOrCamp?.id || "");
    if (!cid) return;
    const isReg = isCampRegistered(cid);
    if (!isPaid) {
      toggleDemoRegistered(demoProfileId, cid);
      invalidateCampCaches();
    } else {
      if (isReg) {
        const isFav = isCampFavorite(cid);
        upsertIntent(cid, isFav ? "favorite" : "");
      } else {
        upsertIntent(cid, "registered");
      }
    }
  }

  const clearFilters = () => {
    setFilters({ sport: "", state: "", divisions: [], positions: [], startDate: "", endDate: "" });
    setSelectedMonth("all");
    setInlineState("all");
    setInlineDivision("all");
  };

  const openFiltersOrProfile = () => {
    if (paidMissingSport) { nav(ROUTES.Profile); return; }
    setFilterOpen(true);
  };

  function openCampDetail(camp) {
    setSelectedCamp(camp);
    setPanelOpen(true);
  }

  function closeCampDetail() {
    setPanelOpen(false);
    setTimeout(() => setSelectedCamp(null), 300);
  }

  function getConflictPartner(camp) {
    if (!camp) return null;
    const d = normalizeDateKey(camp?.start_date);
    if (!d) return null;
    const others = (campsByDate[d] || []).filter(
      (c) => String(c?.camp_id || c?.id) !== String(camp?.camp_id || camp?.id),
    );
    return others.length > 0 ? (others[0]?.school_name || "another camp") : null;
  }

  /* ── 9. Render: list view body ────── */

  const renderListBody = () => {
    if (loading) return <div className="py-10 text-center text-[#9ca3af]">Loading…</div>;

    if (isPaid && !athleteId) {
      return (
        <Card className="p-5 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Complete your athlete profile</div>
          <div className="mt-1 text-sm text-[#9ca3af]">
            Your paid workspace needs an athlete profile to personalize camps, targets, and intent.
          </div>
          <div className="mt-4">
            <Button className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]" onClick={() => nav(ROUTES.Profile)}>Go to Profile</Button>
          </div>
        </Card>
      );
    }

    if (paidMissingSport) {
      return (
        <Card className="p-5 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Complete your profile</div>
          <div className="mt-1 text-sm text-[#9ca3af]">
            Add your sport so Calendar can lock results to the right camps.
          </div>
          <div className="mt-4">
            <Button className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]" onClick={() => nav(ROUTES.Profile)}>Go to Profile</Button>
          </div>
        </Card>
      );
    }

    if (!listRows.length) {
      return (
        <Card className="p-5 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">No camps found</div>
          <div className="mt-1 text-sm text-[#9ca3af]">
            Try clearing filters or widening your date range.
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="border-[#374151] bg-transparent text-[#f9fafb] hover:bg-[#1f2937]" onClick={clearFilters}>
              <XCircle className="w-4 h-4 mr-2" /> Clear filters
            </Button>
            <Button className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]" onClick={openFiltersOrProfile}>
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              {paidMissingSport ? "Complete Profile" : "Edit filters"}
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {listRows.map((r) => {
          const campId = String(r?.camp_id || r?.id || "");
          const campWarnings = getWarningsForCamp(campId);
          const schoolId = r?.school_id ? String(r.school_id) : null;
          const sportId = r?.sport_id ? String(r.sport_id) : null;
          const st = String(r?.intent_status || "").toLowerCase();
          const isFav = st === "favorite";
          const isReg = st === "registered" || st === "completed";

          const camp = {
            id: campId, camp_name: r?.camp_name,
            start_date: r?.start_date, end_date: r?.end_date,
            price: r?.price ?? null, link_url: r?.link_url ?? null,
            notes: r?.notes ?? null, city: r?.city ?? null, state: r?.state ?? null,
          };
          const school = {
            id: schoolId, school_name: r?.school_name ?? null,
            division: r?.school_division ?? null, logo_url: r?.school_logo_url ?? null,
            city: r?.school_city ?? null, state: r?.school_state ?? null,
            conference: r?.school_conference ?? null,
          };
          const sport = { id: sportId, name: r?.sport_name ?? null, sport_name: r?.sport_name ?? null };
          const posObjs = asArray(r?.position_ids).map((pid) => positionsMap.get(String(pid))).filter(Boolean);

          return (
            <div key={campId} className="relative">
              <CampCard
                camp={camp} school={school} sport={sport} positions={posObjs}
                isFavorite={isFav}
                isRegistered={isReg}
                mode={isPaid ? "paid" : "demo"}
                disabledFavorite={!isPaid}
                onClick={undefined}
                onFavoriteToggle={() => {}}
                onRegisteredToggle={() => handleRegisteredToggle(campId)}
                warningBadge={campWarnings.length > 0 ? <WarningBadge warnings={campWarnings} /> : null}
                onRegisterClick={() => {
                  const url = r?.link_url || r?.source_url;
                  if (url) window.open(String(url), "_blank", "noopener,noreferrer");
                }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  /* ── 10. Render: month view body ──── */

  const renderMonthBody = () => {
    if (loading) return <div className="py-10 text-center text-[#9ca3af]">Loading…</div>;

    if (isPaid && !athleteId) {
      return (
        <Card className="p-5 border-[#1f2937] bg-[#111827]">
          <div className="text-lg font-semibold text-[#f9fafb]">Complete your athlete profile</div>
          <div className="mt-1 text-sm text-[#9ca3af]">Set up your profile to see camps.</div>
          <div className="mt-4">
            <Button className="bg-[#e8a020] text-[#0a0e1a] hover:bg-[#f3b13f]" onClick={() => nav(ROUTES.Profile)}>Go to Profile</Button>
          </div>
        </Card>
      );
    }

    return (
      <>
        <MonthSubToggle subView={monthSubView} setSubView={setMonthSubView} />
        {monthSubView === "week" && (
          <WeekView
            currentWeek={currentWeek} setCurrentWeek={setCurrentWeek}
            campsByDate={campsByDate} conflictDates={conflictDates}
            schoolMap={schoolMap} onCampClick={openCampDetail}
            onRegister={(c) => {
              const url = c?.link_url || c?.source_url;
              if (url) window.open(String(url), "_blank", "noopener,noreferrer");
            }}
            onFavoriteToggle={(c) => handleFavorite(c)}
            onRegisteredToggle={(campId) => handleRegisteredToggle(campId)}
            onJumpToDate={(date) => {
              setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
              const d = date.getDay();
              const sun = new Date(date);
              sun.setDate(date.getDate() - d);
              setCurrentWeek(sun);
            }}
          />
        )}
        {monthSubView === "agenda" && (
          <MonthOverview
            currentMonth={currentMonth} setCurrentMonth={setCurrentMonth}
            campsByDate={campsByDate} conflictDates={conflictDates}
            schoolMap={schoolMap} onCampClick={openCampDetail}
            onRegister={(c) => {
              const url = c?.link_url || c?.source_url;
              if (url) window.open(String(url), "_blank", "noopener,noreferrer");
            }}
            onFavoriteToggle={(c) => handleFavorite(c)}
            onRegisteredToggle={(campId) => handleRegisteredToggle(campId)}
            onJumpToDate={(date) => {
              setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
              const d = date.getDay();
              const sun = new Date(date);
              sun.setDate(date.getDate() - d);
              setCurrentWeek(sun);
            }}
          />
        )}
        {monthSubView === "grid" && (
          <MonthGridView
            currentMonth={currentMonth} setCurrentMonth={setCurrentMonth}
            campsByDate={campsByDate} conflictDates={conflictDates}
            schoolMap={schoolMap} onCampClick={openCampDetail}
            onJumpToDate={(date) => {
              setCurrentMonth(new Date(date.getFullYear(), date.getMonth(), 1));
              const d = date.getDay();
              const sun = new Date(date);
              sun.setDate(date.getDate() - d);
              setCurrentWeek(sun);
            }}
          />
        )}
      </>
    );
  };

  /* ── 11. Detail panel data ────────── */

  const panelCamp = selectedCamp;
  const panelCampId = String(panelCamp?.camp_id || panelCamp?.id || "");
  const panelSchool = schoolMap[panelCampId] || { school_name: panelCamp?.school_name };
  const panelStatus = String(panelCamp?.intent_status || "").toLowerCase();
  const panelDateKey = normalizeDateKey(panelCamp?.start_date);
  const panelIsConflict = panelDateKey ? conflictDates.has(panelDateKey) : false;
  const panelConflictWith = getConflictPartner(panelCamp);

  /* ── 12. Return JSX ───────────────── */

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#f9fafb]">
      <div className="max-w-5xl mx-auto px-4 pt-5 pb-24">

        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xl font-bold text-[#f9fafb]">Calendar</div>
          <CalendarViewToggle calView={calView} setCalView={setCalView} />
        </div>

        {!isPaid && <div className="mb-4"><DemoBanner seasonYear={seasonYear} /></div>}

        {/* Inline filters — list view only */}
        {calView === "list" && (
          <div className="mb-4 flex flex-wrap gap-3 items-center">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-9 px-3 text-xs rounded-lg bg-[#1f2937] border border-[#374151] text-[#f9fafb] focus:border-[#e8a020] focus:outline-none"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              value={inlineState}
              onChange={(e) => setInlineState(e.target.value)}
              className="h-9 px-3 text-xs rounded-lg bg-[#1f2937] border border-[#374151] text-[#f9fafb] focus:border-[#e8a020] focus:outline-none"
            >
              <option value="all">All States</option>
              {(() => {
                const base = isPaid ? asArray(paidQuery?.data) : asArray(demoQuery?.data);
                const states = [...new Set(base.map((c) => normalizeState(c?.state || c?.camp_state || c?.school_state)).filter(Boolean))].sort();
                return states.map((st) => <option key={st} value={st}>{st}</option>);
              })()}
            </select>
            <select
              value={inlineDivision}
              onChange={(e) => setInlineDivision(e.target.value)}
              className="h-9 px-3 text-xs rounded-lg bg-[#1f2937] border border-[#374151] text-[#f9fafb] focus:border-[#e8a020] focus:outline-none"
            >
              {DIVISION_FILTER_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
        )}

        {calView === "list" && <WarningBanner warnings={allWarnings} />}

        {calView === "list" ? renderListBody() : renderMonthBody()}

        <FilterSheet
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onFilterChange={setFilters}
          sports={sports}
          positions={positions}
          onApply={() => setFilterOpen(false)}
          onClear={() => { clearFilters(); setFilterOpen(false); }}
          lockSportId={isPaid && athleteSportId ? athleteSportId : ""}
        />
      </div>

      <BottomNav />

      {panelOpen && panelCamp && (
        <CampDetailPanel
          camp={panelCamp}
          school={panelSchool}
          status={panelStatus}
          isConflict={panelIsConflict}
          conflictWith={panelConflictWith}
          onClose={closeCampDetail}
          onRegisterClick={() => {
            const url = panelCamp?.link_url || panelCamp?.source_url;
            if (url) window.open(String(url), "_blank", "noopener,noreferrer");
            closeCampDetail();
          }}
          onUnregister={() => { doUnregister(panelCamp); closeCampDetail(); }}
          onFavorite={() => handleFavorite(panelCamp)}
          onUnfavorite={() => handleUnfavorite(panelCamp)}
          onRegisteredToggle={() => { handleRegisteredToggle(panelCampId); closeCampDetail(); }}
        />
      )}

      {/* Same modals as Discover */}
      <RegisterConfirmModal
        open={registerModal.open}
        onClose={() => setRegisterModal({ open: false, camp: null })}
        campName={registerModal.camp?.camp_name || registerModal.camp?.school_name || "this camp"}
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

      <UnregisterConfirmModal
        open={unregisterModal.open}
        onClose={() => setUnregisterModal({ open: false, camp: null })}
        campName={unregisterModal.camp?.camp_name || unregisterModal.camp?.school_name || "this camp"}
        onRemove={() => doUnregister(unregisterModal.camp)}
      />
    </div>
  );
}