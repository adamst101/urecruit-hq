// src/pages/Discover.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Compass, Filter } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

import BottomNav from "../components/navigation/BottomNav";
import FilterSheet from "../components/filters/FilterSheet";
import CampCard from "../components/camps/CampCard";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

// -------------------- demo local helpers (no imports = no path issues) --------------------
function demoFavKey(seasonYear) {
  return `demo:favorites:default:${seasonYear || "na"}`;
}
function readDemoFavs(seasonYear) {
  try {
    const raw = localStorage.getItem(demoFavKey(seasonYear));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}
function toggleDemoFav(seasonYear, campId) {
  const id = campId ? String(campId) : null;
  if (!id) return readDemoFavs(seasonYear);

  const cur = readDemoFavs(seasonYear);
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];

  try {
    localStorage.setItem(demoFavKey(seasonYear), JSON.stringify(next));
  } catch {}

  return next;
}
function demoRegKey(seasonYear) {
  return `demo:registered:default:${seasonYear || "na"}`;
}
function readDemoRegs(seasonYear) {
  try {
    const raw = localStorage.getItem(demoRegKey(seasonYear));
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function cleanStr(x) {
  if (x == null) return "";
  return String(x).trim();
}
function isDateStr(x) {
  return typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x);
}

export default function Discover() {
  const nav = useNavigate();
  const qc = useQueryClient();

  const season = useSeasonAccess();
  const { mode, seasonYear } = season;
  const isPaid = mode === "paid";

  // Athlete identity is optional for Discover (only needed for paid writes / intent badges)
  const { athleteProfile } = useAthleteIdentity();
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    divisions: [],
    positions: [],
    state: "",
    startDate: "",
    endDate: "",
  });
  const [draftFilters, setDraftFilters] = useState(filters);

  useEffect(() => {
    if (filtersOpen) setDraftFilters(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersOpen]);

  // FilterSheet lookup lists (best effort; does not block page if entities missing)
  const sportsQuery = useQuery({
    queryKey: ["sports_list"],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        if (typeof base44.entities?.Sport?.list === "function") {
          const rows = await base44.entities.Sport.list();
          return Array.isArray(rows) ? rows : [];
        }
      } catch {}
      try {
        const rows = await base44.entities.Sport.filter({});
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    },
  });

  const positionsQuery = useQuery({
    queryKey: ["positions_list"],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        if (typeof base44.entities?.Position?.list === "function") {
          const rows = await base44.entities.Position.list();
          return Array.isArray(rows) ? rows : [];
        }
      } catch {}
      try {
        const rows = await base44.entities.Position.filter({});
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    },
  });

  // Base dataset for Discover:
  // Use public summaries for BOTH demo and paid. Paid users get current seasonYear automatically.
  const publicQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: cleanStr(filters.sport) || null,
    state: cleanStr(filters.state) || null,
    division: null, // multi-division handled client-side
    positionIds: asArray(filters.positions),
    enabled: !!seasonYear,
    limit: 1000,
  });

  // Paid intent overlay (optional)
  const intentsQuery = useQuery({
    queryKey: ["camp_intents", athleteId],
    enabled: isPaid && !!athleteId,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      try {
        const rows = await base44.entities.CampIntent.filter({ athlete_id: athleteId });
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    },
  });

  const intentByCampId = useMemo(() => {
    const map = new Map();
    for (const i of asArray(intentsQuery.data)) {
      const campKey = i?.camp_id ? String(i.camp_id) : null;
      if (campKey) map.set(campKey, i);
    }
    return map;
  }, [intentsQuery.data]);

  // Demo local state for favorites/registered badges
  const [demoFavs, setDemoFavs] = useState(() => readDemoFavs(seasonYear));
  const [demoRegs, setDemoRegs] = useState(() => readDemoRegs(seasonYear));
  useEffect(() => {
    if (!isPaid) {
      setDemoFavs(readDemoFavs(seasonYear));
      setDemoRegs(readDemoRegs(seasonYear));
    }
  }, [isPaid, seasonYear]);

  const rawSummaries = useMemo(() => asArray(publicQuery.data), [publicQuery.data]);

  // Apply remaining filters client-side (date range + multi-division)
  const summaries = useMemo(() => {
    const divs = asArray(filters.divisions).map(String);
    const st = cleanStr(filters.state);
    const start = cleanStr(filters.startDate);
    const end = cleanStr(filters.endDate);

    let out = asArray(rawSummaries);

    if (st) out = out.filter((x) => String(x?.state || "") === st);

    if (divs.length) {
      out = out.filter((x) => divs.includes(String(x?.school_division || "")));
    }

    if (start && isDateStr(start)) {
      out = out.filter((x) => isDateStr(x?.start_date) && String(x.start_date) >= start);
    }

    if (end && isDateStr(end)) {
      out = out.filter((x) => isDateStr(x?.start_date) && String(x.start_date) <= end);
    }

    // Sort newest first for Discover
    out.sort((a, b) => String(b?.start_date || "").localeCompare(String(a?.start_date || "")));

    return out;
  }, [rawSummaries, filters.divisions, filters.state, filters.startDate, filters.endDate]);

  const loading = season.isLoading || publicQuery.isLoading;

  const isFavorite = useCallback(
    (s) => {
      const campId = s?.camp_id ? String(s.camp_id) : null;
      if (!campId) return false;

      if (!isPaid) return demoFavs.includes(campId);

      const row = intentByCampId.get(campId);
      return String(row?.status || "").toLowerCase() === "favorite";
    },
    [isPaid, demoFavs, intentByCampId]
  );

  const isRegistered = useCallback(
    (s) => {
      const campId = s?.camp_id ? String(s.camp_id) : null;
      if (!campId) return false;

      if (!isPaid) return !!demoRegs?.[campId];

      const row = intentByCampId.get(campId);
      return String(row?.status || "").toLowerCase() === "registered";
    },
    [isPaid, demoRegs, intentByCampId]
  );

  const toggleFavorite = useCallback(
    async (summary) => {
      const campId = summary?.camp_id ? String(summary.camp_id) : null;
      if (!campId) return;

      // Demo: local only
      if (!isPaid) {
        const next = toggleDemoFav(seasonYear, campId);
        setDemoFavs(next);
        return;
      }

      // Paid requires athlete profile for writes
      if (!athleteId) {
        nav(createPageUrl("Profile") + `?next=${encodeURIComponent(createPageUrl("Discover"))}`);
        return;
      }

      try {
        const existing = await base44.entities.CampIntent.filter({
          athlete_id: athleteId,
          camp_id: campId,
        });
        const row = Array.isArray(existing) ? existing[0] : null;
        const cur = String(row?.status || "").toLowerCase();
        const nextStatus = cur === "favorite" ? null : "favorite";

        if (row && row.id) {
          if (typeof base44.entities.CampIntent.update === "function") {
            await base44.entities.CampIntent.update(row.id, { status: nextStatus });
          } else if (typeof base44.entities.CampIntent.patch === "function") {
            await base44.entities.CampIntent.patch(row.id, { status: nextStatus });
          }
        } else if (nextStatus) {
          if (typeof base44.entities.CampIntent.create === "function") {
            await base44.entities.CampIntent.create({
              athlete_id: athleteId,
              camp_id: campId,
              status: "favorite",
            });
          }
        }
      } catch {}

      // Refresh intents + any composed lists
      try {
        qc.invalidateQueries({ queryKey: ["camp_intents"], exact: false });
        qc.invalidateQueries({ queryKey: ["myCampsSummaries_client"], exact: false });
      } catch {}
    },
    [isPaid, seasonYear, athleteId, nav, qc]
  );

  const clearAll = () => {
    setDraftFilters({
      sport: "",
      divisions: [],
      positions: [],
      state: "",
      startDate: "",
      endDate: "",
    });
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setFiltersOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-20">
      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-slate-700" />
            <h1 className="text-xl font-bold text-deep-navy">Discover</h1>
          </div>

          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Mode hint */}
        <div className="text-xs text-slate-500">
          {isPaid ? `Paid workspace • Season ${seasonYear}` : `Demo view • Season ${seasonYear}`}
        </div>

        {/* List */}
        {loading ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-slate-600">Loading camps…</div>
          </Card>
        ) : summaries.length === 0 ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-slate-600">No camps match your filters.</div>
            <div className="mt-3">
              <Button variant="outline" onClick={() => setFiltersOpen(true)}>
                Adjust filters
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {summaries.map((s) => {
              const camp = {
                camp_name: s.camp_name,
                start_date: s.start_date,
                end_date: s.end_date,
                price: s.price,
                city: s.city,
                state: s.state,
              };

              const school = {
                school_name: s.school_name,
                division: s.school_division,
              };

              const sport = {
                name: s.sport_name,
                sport_name: s.sport_name,
              };

              const positions = asArray(s.position_codes).map((code) => ({
                position_code: code,
              }));

              // In paid mode, if user lacks profile, disable favorites (avoid backend errors)
              const disabledFavorite = isPaid && !athleteId;

              return (
                <CampCard
                  key={String(s.camp_id)}
                  camp={camp}
                  school={school}
                  sport={sport}
                  positions={positions}
                  mode={isPaid ? "paid" : "demo"}
                  isFavorite={isFavorite(s)}
                  isRegistered={isRegistered(s)}
                  disabledFavorite={disabledFavorite}
                  onFavoriteToggle={() => toggleFavorite(s)}
                  onClick={() => {
                    // If you have CampDetail, wire it here later.
                    // For now, keep list interaction stable.
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Filters */}
      <FilterSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={draftFilters}
        onFilterChange={setDraftFilters}
        positions={asArray(positionsQuery.data)}
        sports={asArray(sportsQuery.data)}
        onApply={applyFilters}
        onClear={clearAll}
      />

      <BottomNav />
    </div>
  );
}
