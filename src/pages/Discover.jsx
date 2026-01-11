// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Filter, Compass, CalendarDays, Lock, Search } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";

import CampCard from "../components/camps/CampCard.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { readDemoMode, getDemoDefaults, setDemoMode } from "../components/hooks/demoMode.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites, toggleDemoFavorite } from "../components/hooks/demoFavorites.jsx";
import { isDemoRegistered } from "../components/hooks/demoRegistered.jsx";

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

function withinDateRange(summary, startDate, endDate) {
  const sd = summary?.start_date ? String(summary.start_date) : "";
  if (!sd) return true;
  if (startDate && sd < startDate) return false;
  if (endDate && sd > endDate) return false;
  return true;
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  // -------- resolve effective mode + seasonYear --------
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

  // -------- URL builder that preserves demo params --------
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

  // -------- sports/positions for FilterSheet --------
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

  // -------- filters + search --------
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: "",
  });
  const [query, setQuery] = useState("");

  // demo profile + favorites
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
    state: null, // state client-side (data inconsistency)
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

  // -------- apply filters client-side (including State) --------
  const filtered = useMemo(() => {
    const rows = Array.isArray(rawRows) ? rawRows : [];

    const selectedState = normStateCode(filters.state);
    const selectedDivisions = Array.isArray(filters.divisions) ? filters.divisions : [];
    const selectedPositions = Array.isArray(filters.positions) ? filters.positions.map(String) : [];

    const startDate = normStr(filters.startDate);
    const endDate = normStr(filters.endDate);

    const q = normStr(query).toLowerCase();

    return rows
      .filter((r) => {
        if (!q) return true;
        const hay = [
          r?.camp_name,
          r?.school_name,
          r?.sport_name,
          r?.city,
          r?.state,
          r?.school_division,
        ]
          .filter(Boolean)
          .map(String)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
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
  }, [rawRows, filters, query]);

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

  // -------- bottom nav (inline, stable) --------
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

  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="max-w-md mx-auto px-4 pt-5">
        {/* Demo banner */}
        {isDemo && (
          <Card className="mb-3 p-3 border-amber-200 bg-amber-50">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-amber-900">Demo Mode</div>
                <div className="text-xs text-amber-800">Prior-season data ({seasonYear})</div>
              </div>
              <Button
                className="shrink-0"
                onClick={() =>
                  nav(
                    createPageUrl("Subscribe") +
                      `?source=demo_banner_discover&next=${encodeURIComponent(pageUrl("Discover"))}`
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
            <div className="text-xs text-slate-500">{filtered.length} camps match</div>
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search camps, schools, cities…"
              className="pl-9"
            />
          </div>
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

        {/* List */}
        <div className="mt-4 space-y-3">
          {loading ? (
            <Card className="p-4 text-sm text-slate-600">Loading camps…</Card>
          ) : filtered.length === 0 ? (
            <Card className="p-4">
              <div className="text-sm font-semibold text-deep-navy">No camps found</div>
              <div className="text-xs text-slate-600 mt-1">Clear filters or widen your search.</div>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setFilters({ sport: "", state: "", divisions: [], positions: [], startDate: "", endDate: "" });
                  }}
                >
                  Clear
                </Button>
                <Button onClick={() => setSheetOpen(true)}>Edit filters</Button>
              </div>
            </Card>
          ) : (
            filtered.slice(0, 200).map((r) => {
              const campId = String(r.camp_id);

              const camp = {
                id: r.camp_id,
                camp_name: r.camp_name,
                start_date: r.start_date,
                end_date: r.end_date,
                price: r.price ?? null,
                link_url: r.link_url || null,
                notes: r.notes || null,
                city: r.city || null,
                state: r.state || null,
                position_ids: Array.isArray(r.position_ids) ? r.position_ids : [],
              };

              const school = {
                id: r.school_id,
                school_name: r.school_name,
                division: r.school_division,
                school_division: r.school_division,
              };

              const sport = {
                id: r.sport_id,
                sport_name: r.sport_name,
                name: r.sport_name,
              };

              const status = String(r?.intent_status || "").toLowerCase();

              const isFavorite = isDemo
                ? demoFavIds.includes(campId)
                : ["favorite", "planned", "considering"].includes(status);

              const isRegistered = isDemo ? isDemoRegistered(demoProfileId, campId) : status === "registered";

              return (
                <CampCard
                  key={campId}
                  camp={camp}
                  school={school}
                  sport={sport}
                  positions={[]}
                  isFavorite={isFavorite}
                  isRegistered={isRegistered}
                  mode={isDemo ? "demo" : "paid"}
                  onClick={() => {
                    const base = createPageUrl("CampDetail");
                    const to = isDemo
                      ? `${base}?id=${encodeURIComponent(campId)}&mode=demo&season=${encodeURIComponent(
                          String(seasonYear)
                        )}`
                      : `${base}?id=${encodeURIComponent(campId)}`;
                    nav(to);
                  }}
                  onFavoriteToggle={() => {
                    if (isDemo) {
                      toggleDemoFavorite(demoProfileId, campId, seasonYear);
                      trackEvent({
                        event_name: "demo_favorite_toggled_discover",
                        camp_id: campId,
                        season_year: seasonYear,
                      });
                      // force rerender
                      setFilters((f) => ({ ...f }));
                      return;
                    }
                    trackEvent({ event_name: "paid_favorite_click_discover", camp_id: campId });
                    nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(campId)}`);
                  }}
                />
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
        onFilterChange={(next) => {
          const state = normStateCode(next?.state || "");
          setFilters({ ...next, state });
        }}
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
