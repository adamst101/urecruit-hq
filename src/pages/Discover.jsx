// src/pages/Discover.jsx
import React, { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Compass, Filter, Search } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import RouteGuard from "../components/auth/RouteGuard.jsx";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";

import FilterSheet from "../components/filters/FilterSheet.jsx";
import CampCard from "../components/camps/CampCard.jsx";

// IMPORTANT: your repo is .jsx — do not import .js
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

// --------------------
// Demo-only local state (inline, avoids extension/path drift)
// --------------------
function demoFavKey(profileId, seasonYear) {
  return `demo:favorites:${profileId || "default"}:${seasonYear || "na"}`;
}
function getDemoFavorites(profileId, seasonYear) {
  try {
    const raw = localStorage.getItem(demoFavKey(profileId, seasonYear));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}
function toggleDemoFavorite(profileId, seasonYear, campId) {
  const id = campId ? String(campId) : null;
  if (!id) return getDemoFavorites(profileId, seasonYear);

  const existing = getDemoFavorites(profileId, seasonYear);
  const next = existing.includes(id) ? existing.filter((x) => x !== id) : [...existing, id];

  try {
    localStorage.setItem(demoFavKey(profileId, seasonYear), JSON.stringify(next));
  } catch {}
  return next;
}

function demoRegKey(profileId, seasonYear) {
  return `demo:registered:${profileId || "default"}:${seasonYear || "na"}`;
}
function getDemoRegisteredMap(profileId, seasonYear) {
  try {
    const raw = localStorage.getItem(demoRegKey(profileId, seasonYear));
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
function toggleDemoRegistered(profileId, seasonYear, campId) {
  const id = campId ? String(campId) : null;
  if (!id) return getDemoRegisteredMap(profileId, seasonYear);

  const map = getDemoRegisteredMap(profileId, seasonYear);
  const next = { ...map };
  if (next[id]) delete next[id];
  else next[id] = 1;

  try {
    localStorage.setItem(demoRegKey(profileId, seasonYear), JSON.stringify(next));
  } catch {}
  return next;
}

// --------------------
// Paid intent upsert (best-effort; safe if schema differs)
// --------------------
async function upsertCampIntent({ athleteId, campId, nextStatus }) {
  if (!athleteId || !campId) return;

  // 1) find existing intent
  let existing = null;
  try {
    const rows = await base44.entities.CampIntent.filter({
      athlete_id: athleteId,
      camp_id: campId
    });
    if (Array.isArray(rows) && rows[0]) existing = rows[0];
  } catch {
    existing = null;
  }

  // 2) update or create
  try {
    if (existing?.id) {
      await base44.entities.CampIntent.update(existing.id, {
        status: nextStatus
      });
      return;
    }
  } catch {}

  try {
    await base44.entities.CampIntent.create({
      athlete_id: athleteId,
      camp_id: campId,
      status: nextStatus
    });
  } catch {}
}

function safeStr(x) {
  return x == null ? "" : String(x);
}

export default function Discover() {
  const nav = useNavigate();
  const season = useSeasonAccess();
  const { athleteProfile, isLoading: athleteLoading } = useAthleteIdentity();

  const isPaid = season.mode === "paid";
  const athleteId = isPaid ? athleteProfile?.id || null : null;

  // A stable demo profile id for scoping local favorites/registered
  const demoProfileId = useMemo(() => {
    try {
      const raw = localStorage.getItem("demo:profile:v1");
      const p = raw ? JSON.parse(raw) : null;
      return p?.id ? String(p.id) : "default";
    } catch {
      return "default";
    }
  }, []);

  // Filters (shared contract with FilterSheet)
  const [filters, setFilters] = useState({
    sport: "",
    divisions: [],
    positions: [],
    state: "",
    startDate: "",
    endDate: ""
  });

  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  // Sports/Positions for FilterSheet
  const sportsQuery = useQuery({
    queryKey: ["sports_list"],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const rows = await base44.entities.Sport.list?.();
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  const positionsQuery = useQuery({
    queryKey: ["positions_list"],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const rows = await base44.entities.Position.list?.();
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  // Paid dataset (includes intent + targeting fields)
  const paidSummaries = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || undefined,
    enabled: isPaid && !!athleteId
  });

  // Demo/public dataset
  const demoSummaries = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: filters.sport || undefined,
    state: filters.state || undefined,
    division: (filters.divisions || [])[0] || undefined,
    positionIds: filters.positions || [],
    enabled: !isPaid
  });

  const source = isPaid ? paidSummaries : demoSummaries;

  const loading =
    season.isLoading ||
    (isPaid && athleteLoading) ||
    source.isLoading;

  // Demo favorites + registered state (client-only)
  const [demoFavs, setDemoFavs] = useState(() =>
    getDemoFavorites(demoProfileId, season.seasonYear)
  );
  const [demoRegs, setDemoRegs] = useState(() =>
    getDemoRegisteredMap(demoProfileId, season.seasonYear)
  );

  // Keep demo state season-scoped
  React.useEffect(() => {
    if (isPaid) return;
    setDemoFavs(getDemoFavorites(demoProfileId, season.seasonYear));
    setDemoRegs(getDemoRegisteredMap(demoProfileId, season.seasonYear));
  }, [isPaid, demoProfileId, season.seasonYear]);

  const rows = useMemo(() => {
    const data = Array.isArray(source.data) ? source.data : [];

    // Normalize both sources into a common row model
    const normalized = data.map((r) => {
      const campId = safeStr(r.camp_id);
      const schoolId = r.school_id ? safeStr(r.school_id) : null;

      // paid-only fields (may be null in demo)
      const intentStatus = r.intent_status || null;

      return {
        campId,
        schoolId,

        camp_name: r.camp_name || "Camp",
        start_date: r.start_date || null,
        end_date: r.end_date || null,
        city: r.city || null,
        state: r.state || null,
        price: typeof r.price === "number" ? r.price : null,
        link_url: r.link_url || null,
        notes: r.notes || null,

        school_name: r.school_name || "Unknown School",
        school_division: r.school_division || null,

        sport_id: r.sport_id ? safeStr(r.sport_id) : null,
        sport_name: r.sport_name || null,

        position_ids: Array.isArray(r.position_ids) ? r.position_ids.map(String) : [],

        intent_status: intentStatus
      };
    });

    // Client-side filters (date range + search)
    const needle = search.trim().toLowerCase();
    const start = filters.startDate || "";
    const end = filters.endDate || "";

    const filtered = normalized.filter((x) => {
      // date filter
      if (start && x.start_date && x.start_date < start) return false;
      if (end && x.start_date && x.start_date > end) return false;

      // division filter (if chosen)
      if ((filters.divisions || []).length > 0) {
        if (!filters.divisions.includes(x.school_division)) return false;
      }

      // search filter
      if (needle) {
        const hay = `${x.school_name} ${x.camp_name} ${x.sport_name || ""} ${x.state || ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }

      return true;
    });

    // sort: upcoming first
    filtered.sort((a, b) => safeStr(a.start_date).localeCompare(safeStr(b.start_date)));
    return filtered;
  }, [source.data, search, filters.divisions, filters.startDate, filters.endDate]);

  const headerSubtitle = useMemo(() => {
    if (season.isLoading) return "";
    const label = isPaid ? "Paid Season Workspace" : "Demo Season Preview";
    return `${label} • Season ${season.seasonYear}`;
  }, [season.isLoading, season.seasonYear, isPaid]);

  const onToggleFavorite = useCallback(
    async (campId) => {
      if (!campId) return;

      // Demo: local toggle
      if (!isPaid) {
        const next = toggleDemoFavorite(demoProfileId, season.seasonYear, campId);
        setDemoFavs(next);
        return;
      }

      // Paid: requires athlete profile
      if (!athleteId) {
        nav(createPageUrl("Profile") + `?next=${encodeURIComponent(createPageUrl("Discover"))}`);
        return;
      }

      // Determine next status based on current known state (best effort)
      // If already favorite -> clear (null). Else set "favorite".
      const current = (rows || []).find((r) => r.campId === String(campId));
      const isFavNow = current?.intent_status === "favorite";

      await upsertCampIntent({
        athleteId,
        campId: String(campId),
        nextStatus: isFavNow ? null : "favorite"
      });

      // Refresh react-query source
      try {
        await base44; // no-op for lint
      } finally {
        paidSummaries.refetch?.();
      }
    },
    [isPaid, demoProfileId, season.seasonYear, athleteId, nav, rows, paidSummaries]
  );

  const onToggleRegistered = useCallback(
    async (campId) => {
      if (!campId) return;

      // Demo: local toggle
      if (!isPaid) {
        const next = toggleDemoRegistered(demoProfileId, season.seasonYear, campId);
        setDemoRegs(next);
        return;
      }

      // Paid: requires athlete profile
      if (!athleteId) {
        nav(createPageUrl("Profile") + `?next=${encodeURIComponent(createPageUrl("Discover"))}`);
        return;
      }

      const current = (rows || []).find((r) => r.campId === String(campId));
      const isRegNow = current?.intent_status === "registered";

      await upsertCampIntent({
        athleteId,
        campId: String(campId),
        nextStatus: isRegNow ? null : "registered"
      });

      paidSummaries.refetch?.();
    },
    [isPaid, demoProfileId, season.seasonYear, athleteId, nav, rows, paidSummaries]
  );

  return (
    <RouteGuard requireAuth={false} requirePaid={false} requireProfile={false}>
      <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
        <div className="max-w-md mx-auto p-4 space-y-4">
          {/* Header */}
          <Card className="p-4 border-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Compass className="w-5 h-5 text-slate-600" />
                  <h1 className="text-xl font-bold text-deep-navy">Discover</h1>
                </div>
                <div className="text-sm text-slate-600 mt-1">{headerSubtitle}</div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setFilterOpen(true)}
                className="shrink-0"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
            </div>

            {/* Search */}
            <div className="mt-4 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search schools, camps, state…"
                  className="pl-9"
                />
              </div>
              {search ? (
                <Button variant="ghost" onClick={() => setSearch("")}>
                  Clear
                </Button>
              ) : null}
            </div>

            {/* Paid but missing profile */}
            {isPaid && !season.isLoading && !athleteLoading && !athleteProfile && (
              <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                <div className="font-semibold">Complete your athlete profile to personalize Discover</div>
                <div className="mt-1 text-amber-800">
                  Paid mode uses your athlete context for favorites, registered status, and targeting.
                </div>
                <Button
                  className="mt-3 w-full"
                  onClick={() =>
                    nav(createPageUrl("Profile") + `?next=${encodeURIComponent(createPageUrl("Discover"))}`)
                  }
                >
                  Go to Profile
                </Button>
              </div>
            )}
          </Card>

          {/* Body */}
          {loading ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-600">Loading camps…</div>
            </Card>
          ) : rows.length === 0 ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-600">No camps match your filters.</div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setFilterOpen(true)}>
                  Adjust Filters
                </Button>
                <Button
                  className="flex-1"
                  onClick={() =>
                    setFilters({
                      sport: "",
                      divisions: [],
                      positions: [],
                      state: "",
                      startDate: "",
                      endDate: ""
                    })
                  }
                >
                  Clear
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => {
                const isDemo = !isPaid;

                const isFavorite = isDemo
                  ? demoFavs.includes(String(r.campId))
                  : r.intent_status === "favorite";

                const isRegistered = isDemo
                  ? !!demoRegs?.[String(r.campId)]
                  : r.intent_status === "registered";

                // Shape CampCard props
                const camp = {
                  id: r.campId,
                  camp_name: r.camp_name,
                  start_date: r.start_date,
                  end_date: r.end_date,
                  price: r.price,
                  link_url: r.link_url,
                  notes: r.notes,
                  city: r.city,
                  state: r.state
                };
                const school = {
                  id: r.schoolId,
                  school_name: r.school_name,
                  division: r.school_division,
                  school_division: r.school_division
                };
                const sport = {
                  id: r.sport_id,
                  sport_name: r.sport_name
                };

                return (
                  <div key={r.campId} className="space-y-2">
                    <CampCard
                      camp={camp}
                      school={school}
                      sport={sport}
                      positions={[]}
                      isFavorite={isFavorite}
                      isRegistered={isRegistered}
                      mode={isDemo ? "demo" : "paid"}
                      onFavoriteToggle={() => onToggleFavorite(r.campId)}
                      onClick={() => nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(r.campId))}`)}
                    />

                    {/* Optional quick action row (register toggle) */}
                    <div className="flex gap-2">
                      <Button
                        variant={isRegistered ? "outline" : "default"}
                        className="flex-1"
                        onClick={() => onToggleRegistered(r.campId)}
                      >
                        {isRegistered ? "Unmark Registered" : "Mark Registered"}
                      </Button>

                      {r.link_url ? (
                        <Button
                          variant="outline"
                          onClick={() => window.open(r.link_url, "_blank", "noopener,noreferrer")}
                        >
                          View
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Filters */}
        <FilterSheet
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onFilterChange={setFilters}
          positions={positionsQuery.data || []}
          sports={sportsQuery.data || []}
          onApply={() => setFilterOpen(false)}
          onClear={() => {
            setFilters({
              sport: "",
              divisions: [],
              positions: [],
              state: "",
              startDate: "",
              endDate: ""
            });
            setFilterOpen(false);
          }}
        />
      </div>
    </RouteGuard>
  );
}
