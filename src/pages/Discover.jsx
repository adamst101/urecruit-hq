// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Compass, Filter, ChevronRight } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import CampCard from "../components/camps/CampCard.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";
import BottomNav from "../components/navigation/BottomNav.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useWriteGate } from "../components/hooks/useWriteGate.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

// Import WITHOUT extensions so your build works regardless of .js/.jsx filenames
import { useDemoProfile } from "../components/hooks/useDemoProfile";
import { getDemoFavorites, toggleDemoFavorite, isDemoFavorite } from "../components/hooks/demoFavorites";
import { isDemoRegistered } from "../components/hooks/demoRegistered";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function safeStr(x) {
  if (x === undefined || x === null) return "";
  return String(x);
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();
  const gate = useWriteGate();
  const { loaded: demoLoaded, demoProfileId } = useDemoProfile();

  // URL override: ?mode=demo forces demo view even for paid users
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc.search]);

  const effectiveMode = useMemo(() => {
    if (forceDemo) return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [forceDemo, season.mode]);

  const isPaidMode = effectiveMode === "paid";

  // Season year used for listing
  const seasonYear = useMemo(() => {
    return isPaidMode ? season.currentYear : season.demoYear;
  }, [isPaidMode, season.currentYear, season.demoYear]);

  // Athlete context (paid-only)
  const athleteId = normId(athleteProfile) || athleteProfile?.id || null;

  // ----------------------------
  // Filters (shared with FilterSheet)
  // ----------------------------
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });
  const [filterOpen, setFilterOpen] = useState(false);

  // Sports/Positions lists for FilterSheet (best effort)
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const rows = await base44.entities.Sport.list?.();
        if (!mounted) return;
        setSports(Array.isArray(rows) ? rows : []);
      } catch {
        if (mounted) setSports([]);
      }
    })();

    (async () => {
      try {
        const rows = await base44.entities.Position.list?.();
        if (!mounted) return;
        setPositions(Array.isArray(rows) ? rows : []);
      } catch {
        if (mounted) setPositions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ----------------------------
  // Data: public/demo-style summaries for the season year
  // (Used for BOTH demo and paid to keep Discover stable and fast)
  // Paid intent overlays are added separately below.
  // ----------------------------
  const publicQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport ? String(filters.sport) : null,
    state: filters.state ? String(filters.state) : null,
    division:
      Array.isArray(filters.divisions) && filters.divisions.length === 1
        ? String(filters.divisions[0])
        : null,
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    limit: 1000,
    enabled: !season.isLoading && !!seasonYear
  });

  const publicRows = useMemo(() => {
    return Array.isArray(publicQuery.data) ? publicQuery.data : [];
  }, [publicQuery.data]);

  // ----------------------------
  // Paid-only: intent overlay (favorite/registered)
  // ----------------------------
  const intentsQuery = useQuery({
    queryKey: ["campIntents_for_athlete", athleteId],
    enabled: isPaidMode && !!athleteId && !season.isLoading && !identityLoading,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      try {
        const rows = await base44.entities.CampIntent.filter({ athlete_id: athleteId });
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  const intentByCampId = useMemo(() => {
    const map = new Map();
    const rows = Array.isArray(intentsQuery.data) ? intentsQuery.data : [];
    for (const r of rows) {
      const campKey = safeStr(normId(r?.camp_id) || r?.camp_id);
      if (campKey) map.set(campKey, r);
    }
    return map;
  }, [intentsQuery.data]);

  // ----------------------------
  // Compose items into CampCard-friendly shape
  // ----------------------------
  const items = useMemo(() => {
    const start = filters.startDate ? String(filters.startDate) : "";
    const end = filters.endDate ? String(filters.endDate) : "";

    const withinRange = (d) => {
      const dd = String(d || "").slice(0, 10);
      if (!dd) return true;
      if (start && dd < start) return false;
      if (end && dd > end) return false;
      return true;
    };

    return publicRows
      .filter((r) => withinRange(r?.start_date))
      .map((r) => {
        const campId = safeStr(r?.camp_id);
        const intent = isPaidMode ? intentByCampId.get(campId) : null;

        const isFavPaid = String(intent?.status || "").toLowerCase() === "favorite";
        const isRegPaid = String(intent?.status || "").toLowerCase() === "registered";

        const isFavDemo =
          !isPaidMode && demoLoaded
            ? isDemoFavorite(demoProfileId, campId, seasonYear)
            : false;

        const isRegDemo =
          !isPaidMode && demoLoaded
            ? isDemoRegistered(demoProfileId, campId)
            : false;

        const positionsForCard = Array.isArray(r?.position_ids)
          ? r.position_ids.map((pid) => ({
              id: String(pid),
              position_code: String(pid) // fallback if you only have ids
            }))
          : Array.isArray(r?.position_codes)
            ? r.position_codes.map((code, idx) => ({
                id: `${idx}`,
                position_code: String(code)
              }))
            : [];

        return {
          campId,
          camp: {
            id: campId,
            camp_name: r?.camp_name || "Camp",
            start_date: r?.start_date || null,
            end_date: r?.end_date || null,
            price: typeof r?.price === "number" ? r.price : null,
            link_url: r?.link_url || null,
            notes: r?.notes || null,
            city: r?.city || null,
            state: r?.state || null,
            position_ids: Array.isArray(r?.position_ids) ? r.position_ids : []
          },
          school: {
            id: r?.school_id || null,
            school_name: r?.school_name || "Unknown School",
            division: r?.school_division || null
          },
          sport: {
            id: r?.sport_id || null,
            sport_name: r?.sport_name || null
          },
          positions: positionsForCard,
          isFavorite: isPaidMode ? isFavPaid : isFavDemo,
          isRegistered: isPaidMode ? isRegPaid : isRegDemo
        };
      });
  }, [
    publicRows,
    filters.startDate,
    filters.endDate,
    isPaidMode,
    intentByCampId,
    demoLoaded,
    demoProfileId,
    seasonYear
  ]);

  const loading =
    season.isLoading ||
    publicQuery.isLoading ||
    (isPaidMode && (identityLoading || intentsQuery.isLoading));

  // ----------------------------
  // Favorite toggle (demo = localStorage, paid = CampIntent upsert)
  // ----------------------------
  const toggleFavoritePaid = useCallback(
    async (campId) => {
      if (!athleteId) return;

      // Find existing intent for this camp
      let existing = null;
      try {
        const rows = await base44.entities.CampIntent.filter({
          athlete_id: athleteId,
          camp_id: campId
        });
        existing = Array.isArray(rows) && rows[0] ? rows[0] : null;
      } catch {
        existing = null;
      }

      const currentStatus = String(existing?.status || "").toLowerCase();
      const nextStatus = currentStatus === "favorite" ? null : "favorite";

      // Update or create (best effort; uses update if available)
      try {
        if (existing && (base44.entities.CampIntent.update || base44.entities.CampIntent.patch)) {
          const fn = base44.entities.CampIntent.update || base44.entities.CampIntent.patch;
          await fn(existing.id, { status: nextStatus });
        } else if (existing && base44.entities.CampIntent.create) {
          // fallback: create a new record only if update isn't available
          await base44.entities.CampIntent.create({
            athlete_id: athleteId,
            camp_id: campId,
            status: nextStatus
          });
        } else if (base44.entities.CampIntent.create) {
          await base44.entities.CampIntent.create({
            athlete_id: athleteId,
            camp_id: campId,
            status: "favorite"
          });
        }
      } catch {
        // ignore; UI will reflect after refetch if it succeeded
      }

      try {
        qc.invalidateQueries({ queryKey: ["campIntents_for_athlete", athleteId] });
      } catch {}
    },
    [athleteId, qc]
  );

  const toggleFavoriteDemo = useCallback(
    async (campId) => {
      // localStorage-only
      toggleDemoFavorite(demoProfileId, campId, seasonYear);
      // no react-query key to invalidate; force a tiny state change by invalidating public query
      try {
        qc.invalidateQueries({ queryKey: ["publicCampSummaries"] , exact: false });
      } catch {}
    },
    [demoProfileId, seasonYear, qc]
  );

  const onFavoriteToggle = useCallback(
    async (campId) => {
      await gate.write({
        demo: async () => toggleFavoriteDemo(campId),
        paid: async () => toggleFavoritePaid(campId),
        blocked: async () => {
          // defaultBlocked behavior inside gate handles routing
          return;
        },
        next: createPageUrl("Discover")
      });
    },
    [gate, toggleFavoriteDemo, toggleFavoritePaid]
  );

  // Disable favorites if paid-mode but missing profile (blocked writes)
  const disableFavorite =
    isPaidMode && (!season.accountId || identityLoading || !athleteId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 max-w-md mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-slate-700" />
            <h1 className="text-xl font-bold text-deep-navy">Discover</h1>
          </div>

          <div className="flex items-center gap-2">
            {effectiveMode === "demo" ? (
              <Badge variant="outline">Demo</Badge>
            ) : (
              <Badge className="bg-emerald-600 text-white">Paid</Badge>
            )}

            <Button variant="outline" size="sm" onClick={() => setFilterOpen(true)}>
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>

        <div className="mt-2 text-sm text-slate-600">
          {effectiveMode === "demo"
            ? `Showing sample season (${seasonYear}).`
            : `Showing season (${seasonYear}). Favorites sync to your profile.`}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-4 max-w-md mx-auto space-y-3">
        {loading ? (
          <div className="text-sm text-slate-600">Loading camps…</div>
        ) : items.length === 0 ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-slate-700 font-medium">No camps match your filters.</div>
            <div className="text-sm text-slate-500 mt-1">
              Try clearing filters or widening date range.
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setFilters({
                    sport: "",
                    state: "",
                    divisions: [],
                    positions: [],
                    startDate: "",
                    endDate: ""
                  })
                }
              >
                Clear filters
              </Button>
              <Button onClick={() => setFilterOpen(true)}>Edit filters</Button>
            </div>
          </Card>
        ) : (
          items.map((it) => (
            <CampCard
              key={it.campId}
              camp={it.camp}
              school={it.school}
              sport={it.sport}
              positions={it.positions}
              isFavorite={it.isFavorite}
              isRegistered={it.isRegistered}
              mode={effectiveMode}
              disabledFavorite={disableFavorite}
              onFavoriteToggle={() => onFavoriteToggle(it.campId)}
              onClick={() => {
                // Go to CampDetail if present; otherwise safe fallback to Calendar
                try {
                  nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(it.campId)}`);
                } catch {
                  nav(createPageUrl("Calendar"));
                }
              }}
            />
          ))
        )}

        {/* Paid-mode nudge if missing profile */}
        {isPaidMode && !loading && season.accountId && !athleteId && (
          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">Complete your athlete profile</div>
                <div className="text-sm text-slate-700 mt-1">
                  Favorites require an athlete profile in paid mode.
                </div>
              </div>
              <Button
                onClick={() => {
                  const next = encodeURIComponent(createPageUrl("Discover"));
                  nav(createPageUrl("Profile") + `?next=${next}`);
                }}
              >
                Profile
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Filters */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        positions={positions}
        sports={sports}
        onApply={() => setFilterOpen(false)}
        onClear={() => {
          setFilters({
            sport: "",
            state: "",
            divisions: [],
            positions: [],
            startDate: "",
            endDate: ""
          });
        }}
      />

      <BottomNav />
    </div>
  );
}
