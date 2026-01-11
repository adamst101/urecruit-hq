// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Filter, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useWriteGate } from "../components/hooks/useWriteGate.jsx";
import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { isDemoFavorite, toggleDemoFavorite } from "../components/hooks/demoFavorites.jsx";

import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

import CampCard from "../components/camps/CampCard.jsx";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function safeUpper2(x) {
  const s = String(x || "").trim().toUpperCase();
  return s.length === 2 ? s : s; // allow non-2 (some datasets store full)
}

function parseSeasonOverride(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const mode = sp.get("mode");
    const season = sp.get("season");
    const seasonYear = season && Number.isFinite(Number(season)) ? Number(season) : null;
    return { mode: mode ? String(mode).toLowerCase() : null, seasonYear };
  } catch {
    return { mode: null, seasonYear: null };
  }
}

function withinDateRange(startDate, endDate, campStart) {
  if (!startDate && !endDate) return true;
  const d = String(campStart || "").slice(0, 10); // YYYY-MM-DD
  if (!d) return false;
  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();
  const writeGate = useWriteGate();

  const { demoProfileId } = useDemoProfile();

  const { mode: urlMode, seasonYear: urlSeasonYear } = useMemo(
    () => parseSeasonOverride(loc.search),
    [loc.search]
  );

  // Effective mode:
  // - URL ?mode=demo wins for browse behavior
  // - Otherwise season.mode decides
  const effectiveMode = useMemo(() => {
    if (urlMode === "demo") return "demo";
    return season.mode === "paid" ? "paid" : "demo";
  }, [urlMode, season.mode]);

  const isDemo = effectiveMode === "demo";

  // Season year:
  // - if URL specifies season, honor it (demo deep-links)
  // - else use season.seasonYear from canonical access model
  const seasonYear = useMemo(() => {
    return urlSeasonYear || season.seasonYear;
  }, [urlSeasonYear, season.seasonYear]);

  // -----------------------------
  // Filters (draft vs applied)
  // -----------------------------
  const [filterOpen, setFilterOpen] = useState(false);

  const emptyFilters = useMemo(
    () => ({
      sport: "",
      state: "",
      divisions: [],
      positions: [],
      startDate: "",
      endDate: ""
    }),
    []
  );

  const [filters, setFilters] = useState(emptyFilters);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);

  useEffect(() => {
    // keep draft aligned when filters change externally
    setDraftFilters(filters);
  }, [filters]);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.sport) n += 1;
    if (filters.state) n += 1;
    if ((filters.divisions || []).length) n += 1;
    if ((filters.positions || []).length) n += 1;
    if (filters.startDate) n += 1;
    if (filters.endDate) n += 1;
    return n;
  }, [filters]);

  // -----------------------------
  // Supporting lists for FilterSheet
  // -----------------------------
  const sportsQuery = useQuery({
    queryKey: ["sports_list"],
    retry: false,
    queryFn: async () => {
      try {
        const rows = await base44.entities.Sport.list();
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  const positionsQuery = useQuery({
    queryKey: ["positions_list"],
    retry: false,
    queryFn: async () => {
      try {
        const rows = await base44.entities.Position.list();
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  // Create a fast lookup map for position badges
  const positionMap = useMemo(() => {
    const map = new Map();
    for (const p of Array.isArray(positionsQuery.data) ? positionsQuery.data : []) {
      const id = normId(p);
      if (!id) continue;
      map.set(String(id), p);
    }
    return map;
  }, [positionsQuery.data]);

  // -----------------------------
  // Data: camp summaries (public-style, works for demo + paid)
  // -----------------------------
  const divisionSingle = useMemo(() => {
    // Hook supports single division; we’ll apply multi-division client-side
    const arr = Array.isArray(filters.divisions) ? filters.divisions : [];
    return arr.length === 1 ? arr[0] : "";
  }, [filters.divisions]);

  const publicCamps = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: filters.state ? safeUpper2(filters.state) : null,
    division: divisionSingle || null,
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    limit: 800,
    enabled: true
  });

  // -----------------------------
  // Paid-mode intent (favorites/registered indicators)
  // -----------------------------
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  const intentsQuery = useQuery({
    queryKey: ["camp_intents", athleteId],
    enabled: !!athleteId && !isDemo,
    retry: false,
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
      const campKey = String(normId(r?.camp_id) || r?.camp_id || "");
      if (!campKey) continue;
      map.set(campKey, r);
    }
    return map;
  }, [intentsQuery.data]);

  // -----------------------------
  // Search
  // -----------------------------
  const [q, setQ] = useState("");

  const filteredRows = useMemo(() => {
    const rows = Array.isArray(publicCamps.data) ? publicCamps.data : [];

    const needle = q.trim().toLowerCase();
    const divs = Array.isArray(filters.divisions) ? filters.divisions : [];

    return rows
      .filter((r) => {
        // Multi-division enforcement client-side if user selected > 1
        if (divs.length > 1 && r?.school_division && !divs.includes(r.school_division)) return false;

        // Date range (client-side)
        if (!withinDateRange(filters.startDate, filters.endDate, r?.start_date)) return false;

        // Search
        if (!needle) return true;
        const blob = [
          r?.school_name,
          r?.camp_name,
          r?.sport_name,
          r?.state,
          r?.school_division
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(needle);
      })
      .sort((a, b) => String(b?.start_date || "").localeCompare(String(a?.start_date || "")));
  }, [publicCamps.data, q, filters.divisions, filters.startDate, filters.endDate]);

  // -----------------------------
  // Favorite toggle (demo local vs paid backend)
  // -----------------------------
  async function toggleFavorite(summary) {
    const campId = String(summary?.camp_id || "");

    await writeGate.write({
      next: createPageUrl("Discover"),
      demo: async () => {
        toggleDemoFavorite(demoProfileId, campId, seasonYear);
        // force UI refresh (localStorage isn't reactive)
        qc.invalidateQueries({ queryKey: ["publicCampSummaries"], exact: false });
      },
      paid: async () => {
        const aId = athleteId;
        if (!aId) return;

        // 1) find existing intent
        let existing = null;
        try {
          const rows = await base44.entities.CampIntent.filter({
            athlete_id: aId,
            camp_id: campId
          });
          existing = Array.isArray(rows) && rows[0] ? rows[0] : null;
        } catch {
          existing = intentByCampId.get(campId) || null;
        }

        // 2) toggle favorite status
        const currentStatus = String(existing?.status || "").toLowerCase();
        const nextStatus = currentStatus === "favorite" ? null : "favorite";

        try {
          if (!existing) {
            await base44.entities.CampIntent.create({
              athlete_id: aId,
              camp_id: campId,
              status: "favorite"
            });
          } else {
            // If SDK supports delete, prefer delete on un-favorite
            if (!nextStatus && typeof base44.entities.CampIntent.delete === "function") {
              await base44.entities.CampIntent.delete(existing.id || existing._id || existing.uuid);
            } else if (typeof base44.entities.CampIntent.update === "function") {
              await base44.entities.CampIntent.update(existing.id || existing._id || existing.uuid, {
                status: nextStatus
              });
            } else {
              // fallback: overwrite using create (some SDKs upsert)
              await base44.entities.CampIntent.create({
                id: existing.id || existing._id || existing.uuid,
                athlete_id: aId,
                camp_id: campId,
                status: nextStatus
              });
            }
          }
        } catch {}

        qc.invalidateQueries({ queryKey: ["camp_intents"], exact: false });
      },
      blocked: async () => {
        // Let useWriteGate route them appropriately
      }
    });
  }

  function openCamp(summary) {
    const id = String(summary?.camp_id || "");
    if (!id) return;

    // Keep mode=demo when user is browsing demo
    const suffix = isDemo ? `?mode=demo&season=${encodeURIComponent(String(seasonYear))}` : "";
    nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(id)}` + (suffix ? `&${suffix.slice(1)}` : ""));
  }

  const loading =
    season.isLoading ||
    publicCamps.isLoading ||
    sportsQuery.isLoading ||
    positionsQuery.isLoading;

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-5xl mx-auto px-4 pt-5 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-brand">Discover Camps</h1>
              {isDemo && (
                <Badge variant="outline" className="bg-white">
                  Demo · {seasonYear}
                </Badge>
              )}
              {!isDemo && season.mode === "paid" && (
                <Badge className="bg-emerald-600 text-white">Paid</Badge>
              )}
            </div>
            <div className="text-sm text-muted mt-1">
              Filter by sport, state, position, division, and dates to narrow fast.
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => setFilterOpen(true)}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-slate-900 text-white text-xs px-2 py-0.5">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>

        {/* Search */}
        <Card className="p-3 border-slate-200 bg-white mb-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search schools, camps, sport, state…"
              className="h-11"
            />
          </div>
        </Card>

        {/* List */}
        {loading ? (
          <div className="text-sm text-slate-500">Loading camps…</div>
        ) : filteredRows.length === 0 ? (
          <Card className="p-5 border-slate-200 bg-white">
            <div className="text-sm text-slate-700 font-semibold">No camps found.</div>
            <div className="text-sm text-slate-500 mt-1">
              Try clearing filters, removing dates, or widening division/position.
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setFilters(emptyFilters);
                  setDraftFilters(emptyFilters);
                  setQ("");
                }}
              >
                Clear all
              </Button>
              <Button
                className="bg-electric-blue text-white hover:bg-deep-navy"
                onClick={() => setFilterOpen(true)}
              >
                Adjust filters
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredRows.map((s) => {
              const campId = String(s?.camp_id || "");
              const isFav = isDemo
                ? isDemoFavorite(demoProfileId, campId, seasonYear)
                : String(intentByCampId.get(campId)?.status || "").toLowerCase() === "favorite";

              const isRegistered =
                !isDemo &&
                String(intentByCampId.get(campId)?.status || "").toLowerCase() === "registered";

              // Build CampCard-compatible shapes
              const camp = {
                id: campId,
                camp_name: s?.camp_name,
                start_date: s?.start_date,
                end_date: s?.end_date,
                price: s?.price,
                city: s?.city,
                state: s?.state,
                link_url: s?.link_url,
                notes: s?.notes,
                position_ids: Array.isArray(s?.position_ids) ? s.position_ids : []
              };

              const school = {
                id: s?.school_id,
                school_name: s?.school_name,
                division: s?.school_division
              };

              const sport = {
                id: s?.sport_id,
                name: s?.sport_name,
                sport_name: s?.sport_name
              };

              const positions = (Array.isArray(s?.position_ids) ? s.position_ids : [])
                .map((pid) => positionMap.get(String(pid)))
                .filter(Boolean);

              return (
                <CampCard
                  key={campId}
                  camp={camp}
                  school={school}
                  sport={sport}
                  positions={positions}
                  isFavorite={isFav}
                  isRegistered={isRegistered}
                  onFavoriteToggle={() => toggleFavorite(s)}
                  onClick={() => openCamp(s)}
                  mode={isDemo ? "demo" : "paid"}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Filter sheet */}
      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={draftFilters}
        onFilterChange={setDraftFilters}
        sports={sportsQuery.data || []}
        positions={positionsQuery.data || []}
        onClear={() => {
          setDraftFilters(emptyFilters);
          setFilters(emptyFilters);
          setQ("");
          setFilterOpen(false);
        }}
        onApply={() => {
          setFilters(draftFilters);
          setFilterOpen(false);
        }}
      />

      {/* Bottom nav (fixed) */}
      <BottomNav />
    </div>
  );
}
