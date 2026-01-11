// src/pages/Calendar.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Filter, Lock, Compass } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { readDemoMode, getDemoDefaults, setDemoMode } from "../components/hooks/demoMode.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites } from "../components/hooks/demoFavorites.jsx";
import { isDemoRegistered } from "../components/hooks/demoRegistered.jsx";

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
  if (/^[A-Z]{2}$/.test(s)) return s;

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

  return map[s] || "";
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

function toMonthKey(dateStr) {
  if (!dateStr) return "TBD";
  const s = String(dateStr);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "TBD";
  return s.slice(0, 7); // YYYY-MM
}

function monthLabel(yyyyMm) {
  if (!/^\d{4}-\d{2}$/.test(yyyyMm)) return "TBD";
  const [y, m] = yyyyMm.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

export default function Calendar() {
  const nav = useNavigate();
  const loc = useLocation();
  const queryClient = useQueryClient();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();
  const writeGate = useWriteGate();

  // -------- resolve effective mode + seasonYear (URL > local demo > entitlement) --------
  const { effectiveMode, seasonYear } = useMemo(() => {
    let urlMode = null;
    let urlSeason = null;

    try {
      const sp = new URLSearchParams(loc.search || "");
      urlMode = sp.get("mode");
      urlSeason = sp.get("season");
    } catch {}

    const local = readDemoMode();
    const defaults = getDemoDefaults();

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

    return { effectiveMode: effMode, seasonYear: effSeasonYear };
  }, [loc.search, season.mode, season.currentYear, season.demoYear]);

  useEffect(() => {
    if (effectiveMode !== "demo") return;
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

  // -------- demo profile + local status --------
  const { loaded: demoLoaded, demoProfileId } = useDemoProfile();
  const demoFavIds = useMemo(() => {
    if (!isDemo) return [];
    if (!demoLoaded) return [];
    return getDemoFavorites(demoProfileId, seasonYear);
  }, [isDemo, demoLoaded, demoProfileId, seasonYear]);

  // -------- data source --------
  const publicQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: null, // state is handled client-side
    division: null,
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    limit: 5000,
    enabled: isDemo || !hasProfile,
  });

  const personalQuery = useCampSummariesClient({
    athleteId: hasProfile ? String(athleteProfile.id) : null,
    sportId: filters.sport || null,
    limit: 5000,
    enabled: !isDemo && hasProfile,
  });

  const loading = isDemo ? publicQuery.isLoading : hasProfile ? personalQuery.isLoading : publicQuery.isLoading;
  const rawRows = useMemo(() => {
    if (isDemo) return publicQuery.data || [];
    if (hasProfile) return personalQuery.data || [];
    return publicQuery.data || [];
  }, [isDemo, hasProfile, publicQuery.data, personalQuery.data]);

  // -------- client-side filtering (robust) --------
  const filtered = useMemo(() => {
    const rows = Array.isArray(rawRows) ? rawRows : [];

    const selectedState = normStateCode(filters.state);
    const selectedDivisions = Array.isArray(filters.divisions) ? filters.divisions : [];
    const selectedPositions = Array.isArray(filters.positions) ? filters.positions.map(String) : [];

    const startDate = normStr(filters.startDate);
    const endDate = normStr(filters.endDate);

    return rows
      .filter((r) => dateInSeason(r?.start_date, seasonYear))
      .filter((r) => {
        if (!selectedState) return true;
        const campState = normStateCode(r?.state);
        return campState === selectedState;
      })
      .filter((r) => {
        if (!selectedDivisions.length) return true;
        const div = normStr(r?.school_division);
        return selectedDivisions.includes(div);
      })
      .filter((r) => {
        if (!selectedPositions.length) return true;
        const ids = Array.isArray(r?.position_ids) ? r.position_ids.map(String) : [];
        return selectedPositions.some((p) => ids.includes(p));
      })
      .filter((r) => withinDateRange(r, startDate, endDate))
      .sort((a, b) => String(a?.start_date || "").localeCompare(String(b?.start_date || "")));
  }, [rawRows, filters, seasonYear]);

  // -------- group by month for a simple calendar-like view --------
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const key = toMonthKey(r?.start_date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    // preserve chronological order
    const keys = Array.from(map.keys()).sort((a, b) => String(a).localeCompare(String(b)));
    return keys.map((k) => ({ key: k, label: k === "TBD" ? "Date TBD" : monthLabel(k), rows: map.get(k) }));
  }, [filtered]);

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

  // -------- bottom nav --------
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
              `?source=bottom_nav_upgrade&next=${encodeURIComponent(pageUrl("Calendar"))}`,
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

  // -------- view tracking --------
  useEffect(() => {
    const key = `evt_calendar_viewed_${isDemo ? "demo" : "paid"}_${seasonYear}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "calendar_view",
      mode: isDemo ? "demo" : "paid",
      season_year: seasonYear,
      authed: season.accountId ? 1 : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo, seasonYear]);

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
                      `?source=demo_banner_calendar&next=${encodeURIComponent(pageUrl("Calendar"))}`
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
            <div className="text-xl font-extrabold text-deep-navy">Calendar</div>
            <div className="text-xs text-slate-500">
              {isDemo ? `Demo season ${seasonYear}` : `Season ${seasonYear}`} · {filtered.length} camps
            </div>
          </div>

          <Button variant="outline" onClick={() => setSheetOpen(true)} className="shrink-0">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Active filter pills */}
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

        {/* Body */}
        <div className="mt-4 space-y-4">
          {loading ? (
            <Card className="p-4 text-sm text-slate-600">Loading calendar…</Card>
          ) : filtered.length === 0 ? (
            <Card className="p-4">
              <div className="text-sm font-semibold text-deep-navy">No camps found</div>
              <div className="text-xs text-slate-600 mt-1">
                State is normalized (TX vs Texas). If you still get zero, clear State and try again.
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
            grouped.map((bucket) => (
              <div key={bucket.key}>
                <div className="text-sm font-bold text-deep-navy mb-2">{bucket.label}</div>
                <div className="space-y-3">
                  {bucket.rows.map((r) => {
                    const campId = String(r.camp_id);
                    const status = String(r?.intent_status || "").toLowerCase();
                    const isFav = isDemo ? demoFavIds.includes(campId) : ["favorite", "planned", "considering"].includes(status);
                    const isReg = isDemo ? isDemoRegistered(demoProfileId, campId) : status === "registered";

                    return (
                      <Card key={campId} className="p-4 border-slate-200 bg-white">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {r.school_division && (
                                <Badge className="bg-slate-900 text-white text-xs">{r.school_division}</Badge>
                              )}
                              {r.sport_name && (
                                <span className="text-xs text-slate-500 font-medium">{r.sport_name}</span>
                              )}
                              {isDemo && (
                                <Badge variant="outline" className="text-xs">
                                  Demo
                                </Badge>
                              )}
                              {isReg && <Badge className="bg-emerald-600 text-white text-xs">Registered</Badge>}
                              {isFav && !isReg && (
                                <Badge variant="secondary" className="text-xs">
                                  Favorited
                                </Badge>
                              )}
                            </div>

                            <div className="text-lg font-semibold text-deep-navy truncate">
                              {r.school_name || "Unknown School"}
                            </div>
                            <div className="text-sm text-slate-600 truncate">{r.camp_name || "Camp"}</div>

                            <div className="mt-2 text-xs text-slate-500">
                              {(r.start_date || "TBD")}
                              {r.city || r.state
                                ? ` · ${[r.city, r.state].filter(Boolean).join(", ")}`
                                : ""}
                            </div>
                          </div>

                          <div className="shrink-0">
                            <Button
                              variant="outline"
                              onClick={() => nav(pageUrl("Discover"))}
                              title="Go to Discover to manage favorites/registered"
                            >
                              View
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))
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
          trackEvent({ event_name: "calendar_filters_cleared", mode: isDemo ? "demo" : "paid", season_year: seasonYear });
        }}
        onApply={() => {
          setSheetOpen(false);
          trackEvent({
            event_name: "calendar_filters_applied",
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
