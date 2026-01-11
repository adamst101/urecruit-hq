// src/pages/Discover.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Filter, Search, Lock, CalendarDays, Compass } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { readDemoMode, getDemoDefaults, setDemoMode } from "../components/hooks/demoMode.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites, toggleDemoFavorite } from "../components/hooks/demoFavorites.jsx";
import { isDemoRegistered, toggleDemoRegistered } from "../components/hooks/demoRegistered.jsx";

import { useWriteGate } from "../components/hooks/useWriteGate.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";

// ---------------- helpers ----------------
function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

function normStr(x) {
  return String(x || "").trim();
}

function yStart(y) {
  return `${Number(y)}-01-01`;
}
function yNext(y) {
  return `${Number(y) + 1}-01-01`;
}

function normStateCode(raw) {
  const s = normStr(raw).toUpperCase();
  if (!s) return "";
  // If already 2-letter, keep it
  if (/^[A-Z]{2}$/.test(s)) return s;

  // Common full-name mapping (minimal, extend later if needed)
  const map = {
    TEXAS: "TX",
    OKLAHOMA: "OK",
    CALIFORNIA: "CA",
    FLORIDA: "FL",
    GEORGIA: "GA",
    ALABAMA: "AL",
    ARIZONA: "AZ",
    ARKANSAS: "AR",
    COLORADO: "CO",
    CONNECTICUT: "CT",
    DELAWARE: "DE",
    ILLINOIS: "IL",
    INDIANA: "IN",
    IOWA: "IA",
    KANSAS: "KS",
    KENTUCKY: "KY",
    LOUISIANA: "LA",
    MAINE: "ME",
    MARYLAND: "MD",
    MASSACHUSETTS: "MA",
    MICHIGAN: "MI",
    MINNESOTA: "MN",
    MISSISSIPPI: "MS",
    MISSOURI: "MO",
    MONTANA: "MT",
    NEBRASKA: "NE",
    NEVADA: "NV",
    "NEW HAMPSHIRE": "NH",
    "NEW JERSEY": "NJ",
    "NEW MEXICO": "NM",
    "NEW YORK": "NY",
    "NORTH CAROLINA": "NC",
    "NORTH DAKOTA": "ND",
    OHIO: "OH",
    OREGON: "OR",
    PENNSYLVANIA: "PA",
    "RHODE ISLAND": "RI",
    "SOUTH CAROLINA": "SC",
    "SOUTH DAKOTA": "SD",
    TENNESSEE: "TN",
    UTAH: "UT",
    VERMONT: "VT",
    VIRGINIA: "VA",
    WASHINGTON: "WA",
    "WEST VIRGINIA": "WV",
    WISCONSIN: "WI",
    WYOMING: "WY",
  };

  return map[s] || ""; // if unknown full name, fail open (no filter match)
}

function dateInSeason(d, seasonYear) {
  if (!d || !seasonYear) return true;
  const start = yStart(seasonYear);
  const next = yNext(seasonYear);
  const s = String(d);
  return s >= start && s < next;
}

function withinDateRange(summary, startDate, endDate) {
  const sd = summary?.start_date ? String(summary.start_date) : "";
  if (!sd) return true;

  if (startDate && sd < startDate) return false;
  if (endDate && sd > endDate) return false;
  return true;
}

function safeLower(s) {
  return String(s || "").toLowerCase();
}

// ---------------- page ----------------
export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();
  const queryClient = useQueryClient();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();
  const writeGate = useWriteGate();

  // -------- resolve effective mode + seasonYear (URL > local demo > entitlement) --------
  const { effectiveMode, seasonYear, urlSeasonYear } = useMemo(() => {
    let urlMode = null;
    let urlSeason = null;

    try {
      const sp = new URLSearchParams(loc.search || "");
      urlMode = sp.get("mode");
      urlSeason = sp.get("season");
    } catch {}

    const local = readDemoMode(); // { mode, seasonYear }
    const defaults = getDemoDefaults(); // { demoSeasonYear }

    const forcedDemo = String(urlMode || "").toLowerCase() === "demo" || local?.mode === "demo";

    const parsedUrlSeason = Number(urlSeason);
    const urlSeasonYear2 = Number.isFinite(parsedUrlSeason) ? parsedUrlSeason : null;

    const resolvedDemoYear =
      urlSeasonYear2 ||
      (Number.isFinite(Number(local?.seasonYear)) ? Number(local.seasonYear) : null) ||
      (Number.isFinite(Number(defaults?.demoSeasonYear)) ? Number(defaults.demoSeasonYear) : null) ||
      season.demoYear;

    const effMode = forcedDemo ? "demo" : season.mode === "paid" ? "paid" : "demo";
    const effSeasonYear = effMode === "paid" ? season.currentYear : resolvedDemoYear;

    return {
      effectiveMode: effMode,
      seasonYear: effSeasonYear,
      urlSeasonYear: urlSeasonYear2,
    };
  }, [loc.search, season.mode, season.currentYear, season.demoYear]);

  // Ensure local demo mode is set when user arrives via URL demo (keeps mode sticky across nav)
  useEffect(() => {
    if (effectiveMode !== "demo") return;
    // If user entered demo via URL only, lock it locally so other pages align
    try {
      setDemoMode(seasonYear);
    } catch {}
  }, [effectiveMode, seasonYear]);

  const isDemo = effectiveMode === "demo";
  const hasProfile = !!athleteProfile?.id;

  // -------- filters state --------
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: "",
  });

  const [search, setSearch] = useState("");

  // Load sports/positions for FilterSheet (safe, optional)
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sp = await base44.entities.Sport.list?.();
        if (mounted) setSports(Array.isArray(sp) ? sp : []);
      } catch {
        if (mounted) setSports([]);
      }
      try {
        const ps = await base44.entities.Position.list?.();
        if (mounted) setPositions(Array.isArray(ps) ? ps : []);
      } catch {
        if (mounted) setPositions([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // -------- demo profile + local favorites/registered --------
  const { loaded: demoLoaded, demoProfileId } = useDemoProfile();

  const [demoFavIds, setDemoFavIds] = useState([]);
  useEffect(() => {
    if (!isDemo) return;
    if (!demoLoaded) return;
    setDemoFavIds(getDemoFavorites(demoProfileId, seasonYear));
  }, [isDemo, demoLoaded, demoProfileId, seasonYear]);

  // -------- data source --------
  // Demo + Paid-without-profile uses public read model (season-scoped).
  const publicQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: null, // IMPORTANT: state filter is applied client-side for robustness
    division: null, // apply client-side (multi-select)
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    limit: 2000,
    enabled: isDemo || !hasProfile, // demo OR paid missing profile
  });

  // Paid-with-profile uses personalized read model (then we season-filter client-side).
  const personalQuery = useCampSummariesClient({
    athleteId: hasProfile ? String(athleteProfile.id) : null,
    sportId: filters.sport || null,
    limit: 2000,
    enabled: !isDemo && hasProfile,
  });

  const loading = isDemo ? publicQuery.isLoading : hasProfile ? personalQuery.isLoading : publicQuery.isLoading;
  const rawRows = useMemo(() => {
    if (isDemo) return publicQuery.data || [];
    if (hasProfile) return personalQuery.data || [];
    return publicQuery.data || [];
  }, [isDemo, hasProfile, publicQuery.data, personalQuery.data]);

  // -------- robust client-side filtering (state/divisions/dates/search + season scoping) --------
  const filtered = useMemo(() => {
    const rows = Array.isArray(rawRows) ? rawRows : [];

    const selectedState = normStateCode(filters.state);
    const selectedDivisions = Array.isArray(filters.divisions) ? filters.divisions : [];
    const selectedPositions = Array.isArray(filters.positions) ? filters.positions.map(String) : [];

    const startDate = normStr(filters.startDate);
    const endDate = normStr(filters.endDate);

    const needle = safeLower(search).trim();

    return rows
      // season scoping (critical in paid mode if personalQuery returns multiple years)
      .filter((r) => dateInSeason(r?.start_date, seasonYear))
      // state (robust)
      .filter((r) => {
        if (!selectedState) return true;
        const campState = normStateCode(r?.state);
        return campState === selectedState;
      })
      // divisions (multi-select)
      .filter((r) => {
        if (!selectedDivisions.length) return true;
        const div = normStr(r?.school_division);
        return selectedDivisions.includes(div);
      })
      // positions (any match)
      .filter((r) => {
        if (!selectedPositions.length) return true;
        const ids = Array.isArray(r?.position_ids) ? r.position_ids.map(String) : [];
        return selectedPositions.some((p) => ids.includes(p));
      })
      // date range
      .filter((r) => withinDateRange(r, startDate, endDate))
      // search
      .filter((r) => {
        if (!needle) return true;
        const hay = safeLower(
          `${r?.school_name || ""} ${r?.camp_name || ""} ${r?.city || ""} ${r?.state || ""} ${r?.sport_name || ""}`
        );
        return hay.includes(needle);
      });
  }, [rawRows, filters, search, seasonYear]);

  // -------- navigation helper (preserve demo params) --------
  const pageUrl = useCallback(
    (pageName) => {
      const base = createPageUrl(pageName);
      if (!isDemo) return base;

      const sp = new URLSearchParams();
      sp.set("mode", "demo");
      sp.set("season", String(seasonYear));
      return `${base}?${sp.toString()}`;
    },
    [isDemo, seasonYear]
  );

  // -------- actions (favorite / register) --------
  const onToggleFavorite = useCallback(
    async (campId) => {
      const cid = String(campId || "");
      if (!cid) return;

      // Demo: local-only
      if (isDemo) {
        const next = toggleDemoFavorite(demoProfileId, cid, seasonYear);
        setDemoFavIds(next);
        trackEvent({ event_name: "demo_favorite_toggled", camp_id: cid, season_year: seasonYear });
        return;
      }

      // Paid: gate + backend
      const ok = writeGate.requirePaid({ next: createPageUrl("Discover"), source: "discover_favorite" });
      if (!ok) return;

      if (!hasProfile) {
        // paid user but no profile -> write gate will route; fail safe
        return;
      }

      // Determine existing status from current list
      const row = (Array.isArray(rawRows) ? rawRows : []).find((r) => String(r?.camp_id) === cid);
      const status = String(row?.intent_status || "").toLowerCase();
      const isFav = ["favorite", "planned", "considering"].includes(status);

      const nextStatus = isFav ? null : "favorite";

      try {
        const athleteId = String(athleteProfile.id);

        // Upsert intent
        let existing = [];
        try {
          existing = await base44.entities.CampIntent.filter({ athlete_id: athleteId, camp_id: cid });
        } catch {
          existing = [];
        }
        const ex = Array.isArray(existing) ? existing[0] : null;
        const exId = ex?.id || ex?._id || ex?.uuid || null;

        if (!nextStatus) {
          // remove intent if possible
          if (exId && typeof base44.entities.CampIntent.delete === "function") {
            await base44.entities.CampIntent.delete(exId);
          } else if (exId && typeof base44.entities.CampIntent.update === "function") {
            await base44.entities.CampIntent.update(exId, { status: "none" });
          }
        } else {
          if (exId && typeof base44.entities.CampIntent.update === "function") {
            await base44.entities.CampIntent.update(exId, { status: nextStatus });
          } else if (typeof base44.entities.CampIntent.create === "function") {
            await base44.entities.CampIntent.create({ athlete_id: athleteId, camp_id: cid, status: nextStatus });
          }
        }

        trackEvent({
          event_name: "paid_favorite_toggled",
          camp_id: cid,
          next_status: nextStatus || "cleared",
          season_year: seasonYear,
        });

        // refresh
        queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"], exact: false });
      } catch {
        // fail silently (don’t block UI)
      }
    },
    [isDemo, demoProfileId, seasonYear, writeGate, hasProfile, athleteProfile?.id, rawRows, queryClient]
  );

  const onToggleRegistered = useCallback(
    async (campId) => {
      const cid = String(campId || "");
      if (!cid) return;

      if (isDemo) {
        toggleDemoRegistered(demoProfileId, cid);
        trackEvent({ event_name: "demo_registered_toggled", camp_id: cid, season_year: seasonYear });
        // registered is read directly via isDemoRegistered(), no state needed
        return;
      }

      const ok = writeGate.requirePaid({ next: createPageUrl("Discover"), source: "discover_registered" });
      if (!ok) return;

      if (!hasProfile) return;

      const row = (Array.isArray(rawRows) ? rawRows : []).find((r) => String(r?.camp_id) === cid);
      const status = String(row?.intent_status || "").toLowerCase();
      const isReg = status === "registered";
      const nextStatus = isReg ? "favorite" : "registered"; // keep it “in plan” when toggling off

      try {
        const athleteId = String(athleteProfile.id);

        let existing = [];
        try {
          existing = await base44.entities.CampIntent.filter({ athlete_id: athleteId, camp_id: cid });
        } catch {
          existing = [];
        }
        const ex = Array.isArray(existing) ? existing[0] : null;
        const exId = ex?.id || ex?._id || ex?.uuid || null;

        if (exId && typeof base44.entities.CampIntent.update === "function") {
          await base44.entities.CampIntent.update(exId, { status: nextStatus });
        } else if (typeof base44.entities.CampIntent.create === "function") {
          await base44.entities.CampIntent.create({ athlete_id: athleteId, camp_id: cid, status: nextStatus });
        }

        trackEvent({
          event_name: "paid_registered_toggled",
          camp_id: cid,
          next_status: nextStatus,
          season_year: seasonYear,
        });

        queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"], exact: false });
      } catch {}
    },
    [isDemo, demoProfileId, seasonYear, writeGate, hasProfile, athleteProfile?.id, rawRows, queryClient]
  );

  // -------- view tracking --------
  useEffect(() => {
    const key = `evt_discover_viewed_${isDemo ? "demo" : "paid"}_${seasonYear}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "discover_view",
      mode: isDemo ? "demo" : "paid",
      season_year: seasonYear,
      authed: season.accountId ? 1 : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, seasonYear]);

  // -------- bottom nav (mode-aware, avoids the “paid nav while demo” problem) --------
  const BottomNavInline = useMemo(() => {
    const items = isDemo
      ? [
          { key: "Discover", label: "Discover", icon: Compass, to: pageUrl("Discover") },
          { key: "Calendar", label: "Calendar", icon: CalendarDays, to: pageUrl("Calendar") },
          {
            key: "Upgrade",
            label: "Upgrade",
            icon: Lock,
            to:
              createPageUrl("Subscribe") +
              `?source=bottom_nav_upgrade&next=${encodeURIComponent(pageUrl("Discover"))}`,
          },
        ]
      : [
          { key: "Discover", label: "Discover", icon: Compass, to: pageUrl("Discover") },
          { key: "Calendar", label: "Calendar", icon: CalendarDays, to: pageUrl("Calendar") },
          { key: "MyCamps", label: "MyCamps", icon: Lock, to: pageUrl("MyCamps") },
        ];

    return function Nav() {
      const pathname = loc?.pathname || "";
      const isActive = (to) => String(to || "").split("?")[0] === pathname;

      return (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="max-w-md mx-auto bg-white border-t border-slate-200">
            <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
              {items.map((it) => {
                const Icon = it.icon;
                const active = isActive(it.to);
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => nav(it.to)}
                    className={`py-3 flex flex-col items-center justify-center gap-1 transition-colors ${
                      active ? "text-deep-navy" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${active ? "text-deep-navy" : ""}`} />
                    <span className={`text-xs font-medium ${active ? "text-deep-navy" : ""}`}>{it.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    };
  }, [isDemo, pageUrl, loc?.pathname, nav]);

  // -------- render --------
  const resultsCount = filtered.length;

  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="max-w-md mx-auto px-4 pt-5">
        {/* Demo banner */}
        {isDemo && (
          <Card className="mb-3 p-3 border-amber-200 bg-amber-50">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-amber-900">Demo Mode</div>
                <div className="text-xs text-amber-800">
                  Prior-season data ({seasonYear}). Favorites save on this device.
                </div>
              </div>
              <Button
                className="shrink-0"
                onClick={() =>
                  nav(
                    createPageUrl("Subscribe") +
                      `?source=demo_banner&next=${encodeURIComponent(pageUrl("Discover"))}`
                  )
                }
              >
                Upgrade
              </Button>
            </div>
          </Card>
        )}

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-extrabold text-deep-navy">Discover</div>
            <div className="text-xs text-slate-500">
              {isDemo ? `Demo season ${seasonYear}` : `Season ${seasonYear}`} · {resultsCount} camps
            </div>
          </div>

          <Button variant="outline" onClick={() => setSheetOpen(true)} className="shrink-0">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Search */}
        <div className="mt-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search school, camp, city…"
              className="pl-9"
            />
          </div>
        </div>

        {/* Active filter pills (quick clarity) */}
        <div className="mt-3 flex flex-wrap gap-2">
          {!!filters.sport && <Badge variant="secondary">Sport</Badge>}
          {!!filters.state && <Badge variant="secondary">State: {filters.state}</Badge>}
          {Array.isArray(filters.divisions) && filters.divisions.length > 0 && (
            <Badge variant="secondary">Divisions: {filters.divisions.length}</Badge>
          )}
          {Array.isArray(filters.positions) && filters.positions.length > 0 && (
            <Badge variant="secondary">Positions: {filters.positions.length}</Badge>
          )}
          {!!filters.startDate && <Badge variant="secondary">From: {filters.startDate}</Badge>}
          {!!filters.endDate && <Badge variant="secondary">To: {filters.endDate}</Badge>}
        </div>

        {/* List */}
        <div className="mt-4 space-y-3">
          {loading ? (
            <Card className="p-4 text-sm text-slate-600">Loading camps…</Card>
          ) : resultsCount === 0 ? (
            <Card className="p-4">
              <div className="text-sm font-semibold text-deep-navy">No camps found</div>
              <div className="text-xs text-slate-600 mt-1">
                Try clearing State first (data may store state inconsistently), or broaden dates/divisions.
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    setFilters({ sport: "", state: "", divisions: [], positions: [], startDate: "", endDate: "" })
                  }
                >
                  Clear all filters
                </Button>
                <Button onClick={() => setSheetOpen(true)}>Edit filters</Button>
              </div>
            </Card>
          ) : (
            filtered.slice(0, 200).map((r) => {
              const campId = String(r.camp_id);

              const status = String(r?.intent_status || "").toLowerCase();
              const paidFav = ["favorite", "planned", "considering"].includes(status);
              const paidReg = status === "registered";

              const demoFav = demoFavIds.includes(campId);
              const demoReg = isDemoRegistered(demoProfileId, campId);

              const isFavorite = isDemo ? demoFav : paidFav;
              const isRegistered = isDemo ? demoReg : paidReg;

              return (
                <Card key={campId} className="p-4 border-slate-200 bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {r.school_division && (
                          <Badge className="bg-slate-900 text-white text-xs">{r.school_division}</Badge>
                        )}
                        {r.sport_name && <span className="text-xs text-slate-500 font-medium">{r.sport_name}</span>}
                        {isDemo && <Badge variant="outline" className="text-xs">Demo</Badge>}
                        {isRegistered && <Badge className="bg-emerald-600 text-white text-xs">Registered</Badge>}
                      </div>

                      <div className="text-lg font-semibold text-deep-navy truncate">
                        {r.school_name || "Unknown School"}
                      </div>
                      <div className="text-sm text-slate-600 truncate">{r.camp_name || "Camp"}</div>

                      <div className="mt-2 text-xs text-slate-500">
                        {(r.start_date || "TBD")}{r.city || r.state ? ` · ${[r.city, r.state].filter(Boolean).join(", ")}` : ""}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        type="button"
                        variant={isFavorite ? "default" : "outline"}
                        onClick={() => onToggleFavorite(campId)}
                      >
                        {isFavorite ? "Favorited" : "Favorite"}
                      </Button>

                      <Button
                        type="button"
                        variant={isRegistered ? "default" : "outline"}
                        onClick={() => onToggleRegistered(campId)}
                      >
                        {isRegistered ? "Registered" : "Register"}
                      </Button>
                    </div>
                  </div>

                  {Array.isArray(r.position_codes) && r.position_codes.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.position_codes.slice(0, 6).map((code) => (
                        <Badge key={code} variant="secondary" className="bg-slate-100 text-slate-700">
                          {code}
                        </Badge>
                      ))}
                      {r.position_codes.length > 6 && (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                          +{r.position_codes.length - 6}
                        </Badge>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Filter sheet */}
      <FilterSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        sports={sports}
        positions={positions}
        onClear={() => {
          setFilters({ sport: "", state: "", divisions: [], positions: [], startDate: "", endDate: "" });
          setSheetOpen(false);
          trackEvent({ event_name: "discover_filters_cleared", mode: isDemo ? "demo" : "paid", season_year: seasonYear });
        }}
        onApply={() => {
          setSheetOpen(false);
          trackEvent({
            event_name: "discover_filters_applied",
            mode: isDemo ? "demo" : "paid",
            season_year: seasonYear,
            sport: filters.sport || null,
            state: filters.state || null,
            divisions_count: Array.isArray(filters.divisions) ? filters.divisions.length : 0,
            positions_count: Array.isArray(filters.positions) ? filters.positions.length : 0,
            startDate: filters.startDate || null,
            endDate: filters.endDate || null,
          });
        }}
      />

      {/* Bottom nav */}
      <BottomNavInline />
    </div>
  );
}
