// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Filter } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

import BottomNav from "../components/navigation/BottomNav";
import FilterSheet from "../components/filters/FilterSheet";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

import CampCard from "../components/camps/CampCard";

// -------------------- demo local helpers (no external imports = no path issues) --------------------
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
function toggleDemoReg(seasonYear, campId) {
  const id = campId ? String(campId) : null;
  if (!id) return readDemoRegs(seasonYear);

  const cur = readDemoRegs(seasonYear);
  const next = { ...(cur || {}) };
  if (next[id]) delete next[id];
  else next[id] = 1;

  try {
    localStorage.setItem(demoRegKey(seasonYear), JSON.stringify(next));
  } catch {}

  return next;
}

// -------------------- small utils --------------------
function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function cleanStr(x) {
  if (x == null) return "";
  const s = String(x).trim();
  return s;
}
function isDateStr(x) {
  return typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x);
}

export default function Calendar() {
  const qc = useQueryClient();

  // Access model
  const season = useSeasonAccess();
  const { mode, seasonYear } = season; // mode: "paid" | "demo"
  const isPaid = mode === "paid";

  // Athlete (paid mode needs it)
  const { athleteProfile } = useAthleteIdentity();
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // Filters (single source for both paid + demo)
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [filters, setFilters] = useState({
    sport: "", // sport_id
    divisions: [], // list of strings (division labels)
    positions: [], // list of position ids (strings)
    state: "", // "TX"
    startDate: "", // "YYYY-MM-DD"
    endDate: "", // "YYYY-MM-DD"
  });

  // Draft filters for the sheet UX
  const [draftFilters, setDraftFilters] = useState(filters);
  useEffect(() => {
    if (filtersOpen) setDraftFilters(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersOpen]);

  // Lookup lists for FilterSheet (best effort)
  const sportsQuery = useQuery({
    queryKey: ["sports_list"],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        // Some Base44 SDKs support list(); fall back to filter({})
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

  // Data sources:
  // - Paid: athlete-specific composed summaries
  // - Demo: public summaries for seasonYear
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: cleanStr(filters.sport) || null,
    enabled: isPaid && !!athleteId,
    limit: 1000,
  });

  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: cleanStr(filters.sport) || null,
    state: cleanStr(filters.state) || null,
    // division: FilterSheet returns single division string, but filters.divisions can be multi
    // we do division post-join client-side to support multi-select
    division: null,
    positionIds: asArray(filters.positions),
    enabled: !isPaid, // demo only
    limit: 1000,
  });

  // Demo local state for favorites/registered badges
  const [demoFavs, setDemoFavs] = useState(() => readDemoFavs(seasonYear));
  const [demoRegs, setDemoRegs] = useState(() => readDemoRegs(seasonYear));

  useEffect(() => {
    if (!isPaid) {
      setDemoFavs(readDemoFavs(seasonYear));
      setDemoRegs(readDemoRegs(seasonYear));
    }
  }, [isPaid, seasonYear]);

  const rawSummaries = useMemo(() => {
    if (isPaid) return asArray(paidQuery.data);
    return asArray(demoQuery.data);
  }, [isPaid, paidQuery.data, demoQuery.data]);

  // Apply remaining filters client-side (date range + multi-division)
  const summaries = useMemo(() => {
    const divs = asArray(filters.divisions).map(String);
    const st = cleanStr(filters.state);
    const start = cleanStr(filters.startDate);
    const end = cleanStr(filters.endDate);

    let out = asArray(rawSummaries);

    if (st) {
      out = out.filter((x) => String(x?.state || "") === st);
    }

    if (divs.length) {
      out = out.filter((x) => divs.includes(String(x?.school_division || "")));
    }

    if (start && isDateStr(start)) {
      out = out.filter((x) => isDateStr(x?.start_date) && String(x.start_date) >= start);
    }

    if (end && isDateStr(end)) {
      out = out.filter((x) => isDateStr(x?.start_date) && String(x.start_date) <= end);
    }

    // Sort ascending by start_date for calendar-like reading
    out.sort((a, b) => String(a?.start_date || "").localeCompare(String(b?.start_date || "")));

    return out;
  }, [rawSummaries, filters.divisions, filters.state, filters.startDate, filters.endDate]);

  const loading = paidQuery.isLoading || demoQuery.isLoading || season.isLoading;

  // Favorite/registered derivation
  const isFavorite = useCallback(
    (s) => {
      if (!s?.camp_id) return false;
      if (isPaid) return String(s?.intent_status || "").toLowerCase() === "favorite";
      return demoFavs.includes(String(s.camp_id));
    },
    [isPaid, demoFavs]
  );

  const isRegistered = useCallback(
    (s) => {
      if (!s?.camp_id) return false;
      if (isPaid) return String(s?.intent_status || "").toLowerCase() === "registered";
      return !!demoRegs?.[String(s.camp_id)];
    },
    [isPaid, demoRegs]
  );

  // Toggle favorite (best effort)
  const toggleFavorite = useCallback(
    async (summary) => {
      const campId = summary?.camp_id ? String(summary.camp_id) : null;
      if (!campId) return;

      if (!isPaid) {
        const next = toggleDemoFav(seasonYear, campId);
        setDemoFavs(next);
        return;
      }

      // Paid: update CampIntent (best effort; schema may vary)
      try {
        if (!athleteId) return;

        const existing = await base44.entities.CampIntent.filter({
          athlete_id: athleteId,
          camp_id: campId,
        });

        const row = Array.isArray(existing) ? existing[0] : null;
        const cur = String(row?.status || "").toLowerCase();
        const nextStatus = cur === "favorite" ? null : "favorite";

        if (row && row.id) {
          // update if possible, else delete-like behavior by setting null
          if (typeof base44.entities.CampIntent.update === "function") {
            await base44.entities.CampIntent.update(row.id, {
              status: nextStatus,
            });
          } else if (typeof base44.entities.CampIntent.patch === "function") {
            await base44.entities.CampIntent.patch(row.id, {
              status: nextStatus,
            });
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

      // Refresh summaries
      try {
        qc.invalidateQueries({ queryKey: ["myCampsSummaries_client"], exact: false });
      } catch {}
    },
    [isPaid, seasonYear, athleteId, qc]
  );

  // Toggle registered (demo only; paid can be added later when you decide the workflow)
  const toggleRegistered = useCallback(
    async (summary) => {
      const campId = summary?.camp_id ? String(summary.camp_id) : null;
      if (!campId) return;

      if (!isPaid) {
        const next = toggleDemoReg(seasonYear, campId);
        setDemoRegs(next);
      }
    },
    [isPaid, seasonYear]
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
            <CalendarDays className="w-5 h-5 text-slate-700" />
            <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
          </div>

          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Mode hint */}
        <div className="text-xs text-slate-500">
          {isPaid ? "Paid workspace" : `Demo view • Season ${seasonYear}`}
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
                  onFavoriteToggle={() => toggleFavorite(s)}
                  onClick={() => {
                    // If you have a CampDetail page, wire it here:
                    // nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(s.camp_id))}`)
                    // For now, demo register toggle is available via long-press pattern later; keep click as no-op.
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
