// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal, LogIn } from "lucide-react";

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

function clearDemoFlagsEverywhere() {
  // session demo flags
  try {
    sessionStorage.removeItem("demo_mode_v1");
    sessionStorage.removeItem("demo_year_v1");
  } catch {}
  // some apps accidentally use localStorage too
  try {
    localStorage.removeItem("demo_mode_v1");
    localStorage.removeItem("demo_year_v1");
  } catch {}
}

function stripDemoParamsFromSearch(search) {
  const sp = new URLSearchParams(search || "");
  // remove any demo forcing knobs
  sp.delete("mode");
  sp.delete("src");
  sp.delete("source");
  // you can keep season if present
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/* -------------------------
   Discover (MVP)
------------------------- */
export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  // Filters + UI state
  const [filterOpen, setFilterOpen] = useState(false);
  const { nf, setNF, clearFilters } = useCampFilters();
  const writeGate = useWriteGate();

  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);

  const url = useMemo(() => getUrlParams(loc.search), [loc.search]);
  const requestedSeason = url.requestedSeason;

  const currentPath = useMemo(
    () => (loc?.pathname || "") + (loc?.search || ""),
    [loc?.pathname, loc?.search]
  );
  const nextParam = useMemo(() => encodeURIComponent(currentPath), [currentPath]);

  // Demo flags (URL/session). These should NEVER override paid once entitled.
  const demoSession = useMemo(() => readDemoMode(), []);
  const forceDemoUrl = url.mode === "demo";
  const forceDemoSession = String(demoSession?.mode || "").toLowerCase() === "demo";

  // Entitlement truth
  const entitlementSeason = safeNumber(season?.entitlement?.season_year) || null;
  const isEntitledNow = !!season?.accountId && !!season?.hasAccess && !!entitlementSeason;

  // ✅ HARDENING (2): if entitled, always strip demo flags (URL + session) and normalize the URL.
  useEffect(() => {
    if (season?.isLoading) return;
    if (!isEntitledNow) return;

    // Clear sticky demo session flags so they can’t poison future navigation.
    clearDemoFlagsEverywhere();

    // If the URL is still carrying demo params, replace it with a clean URL.
    const hasDemoParams = forceDemoUrl || !!url.src;
    const hasDemoSession = forceDemoSession;

    if (hasDemoParams || hasDemoSession) {
      // Keep season only if it matches entitlement; otherwise drop it (avoid confusion)
      const keepSeason =
        requestedSeason && entitlementSeason && requestedSeason === entitlementSeason;

      const clean =
        createPageUrl("Discover") + (keepSeason ? `?season=${encodeURIComponent(entitlementSeason)}` : "");

      nav(clean, { replace: true });
    }
  }, [
    season?.isLoading,
    isEntitledNow,
    forceDemoUrl,
    forceDemoSession,
    url.src,
    requestedSeason,
    entitlementSeason,
    nav
  ]);

  // Effective mode: paid ALWAYS wins if entitled
  const effectiveMode = isEntitledNow ? "paid" : "demo";
  const isPaid = effectiveMode === "paid";

  // Demo year always previous season as computed by useSeasonAccess
  const demoBrowseYear = safeNumber(season?.demoYear) || null;
  const paidBrowseYear = entitlementSeason;

  // Effective browse year
  const seasonYear = useMemo(() => {
    // If URL requests a season:
    // - paid: allow only the entitled season (anything else is gated)
    // - demo: allow only the demo year (anything else is gated)
    if (requestedSeason) {
      if (isEntitledNow) return paidBrowseYear;
      return demoBrowseYear || paidBrowseYear;
    }

    return isEntitledNow ? paidBrowseYear : demoBrowseYear || paidBrowseYear;
  }, [requestedSeason, isEntitledNow, paidBrowseYear, demoBrowseYear]);

  /* -------------------------------------------------------
     Season-aware gate:
     If URL requests a season (e.g., ?season=2026):
       - Not logged in => go Home?signin=1&next=...
       - Logged in but not entitled to THAT season => go Subscribe?season=...
     IMPORTANT: do NOT silently downgrade to demo in this case.
  ------------------------------------------------------- */
  useEffect(() => {
    if (season?.isLoading) return;
    if (!requestedSeason) return;

    // Not authed -> Home signin
    if (!season?.accountId) {
      nav(createPageUrl("Home") + `?signin=1&next=${nextParam}`, { replace: true });
      return;
    }

    // Authed but not entitled to requested season -> Subscribe
    if (!isEntitledNow || entitlementSeason !== requestedSeason) {
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
    requestedSeason,
    nextParam,
    nav,
    isEntitledNow,
    entitlementSeason
  ]);

  /* -------------------------------------------------------
     Fix (3): Discover "Log in" button should NOT send users back to demo.
     We force a clean from_url that goes to Subscribe (auth_gate) with next=/Discover
     and we clear demo flags BEFORE redirecting.
  ------------------------------------------------------- */
  function handleLoginFromDiscover() {
    trackEvent({ event_name: "cta_login_click", source: "discover", via: "header_login" });

    // user intent = paid flow; don't keep sticky demo flags
    clearDemoFlagsEverywhere();

    // Build a clean next (NO mode=demo, NO src)
    const cleanSearch = stripDemoParamsFromSearch(loc.search);
    const nextPath = `${createPageUrl("Discover")}${cleanSearch}`;

    // Send user through Subscribe gate after login, targeting CURRENT season offering
    // (Subscribe page already shows current season; we also pass season for clarity)
    const targetSeason = safeNumber(season?.currentYear) || undefined;

    const fromUrl =
      `${window.location.origin}${createPageUrl("Subscribe")}` +
      `?source=auth_gate` +
      (targetSeason ? `&season=${encodeURIComponent(String(targetSeason))}` : "") +
      `&next=${encodeURIComponent(nextPath)}`;

    const loginUrl = `${window.location.origin}/login?from_url=${encodeURIComponent(fromUrl)}`;
    window.location.assign(loginUrl);
  }

  /* -------------------------------------------------------
     Load camps from Camp table (single source of truth)
     Strategy:
       1) Try server filter by season_year (fast if field exists)
       2) If that fails OR returns 0, load all and client-filter by derived season year
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
        let allRows = [];

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

        allRows = asArray(await base44.entities.Camp.filter({}));

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

  // Apply filters
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

  /* -------------------------------------------------------
     Render
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

    // Paid workspace requires athlete profile
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
            name: r?.school_name ?? "Unknown School",
            city: r?.city ?? null,
            state: r?.state ?? null
          };

          const sport = {
            id: sportId,
            name: r?.sport_name ?? "Football"
          };

          const posObjs = asArray(r?.position_ids).map((pid) => ({ id: String(pid), name: String(pid) }));

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

  const showLogin = !season?.accountId; // show login button when anon

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Discover</div>
            <div className="text-xs text-slate-500">
              {isPaid ? "Paid workspace" : `Demo season: ${seasonYear}`}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {showLogin ? (
              <Button variant="outline" onClick={handleLoginFromDiscover}>
                <LogIn className="w-4 h-4 mr-2" />
                Log in
              </Button>
            ) : null}

            <Button variant="outline" onClick={() => setFilterOpen(true)}>
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>
        </div>

        {/* Truth banner (keep for MVP testing; remove later) */}
        <div className="mb-4 mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span><b>effectiveMode:</b> {effectiveMode}</span>
            <span><b>isEntitledNow:</b> {String(!!isEntitledNow)}</span>
            <span><b>entitledSeason:</b> {entitlementSeason ? String(entitlementSeason) : "null"}</span>
            <span><b>browseSeasonYear:</b> {String(seasonYear)}</span>
            <span><b>forceDemo(url):</b> {String(!!forceDemoUrl)}</span>
            <span><b>forceDemo(session):</b> {String(!!forceDemoSession)}</span>
            <span><b>requestedSeason:</b> {requestedSeason ? String(requestedSeason) : "null"}</span>
            <span><b>Camp(year/all):</b> {counts.camp_year}/{counts.camp_all}</span>
            <span><b>fallbackUsed:</b> {String(!!counts.fallback_used)}</span>
          </div>
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

