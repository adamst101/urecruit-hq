// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import BottomNav from "../components/navigation/BottomNav.jsx";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx";
import CampCard from "../components/camps/CampCard.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useWriteGate } from "../components/hooks/useWriteGate.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

import { useDemoProfile } from "../components/hooks/useDemoProfile.jsx";
import { getDemoFavorites, toggleDemoFavorite } from "../components/hooks/demoFavorites.jsx";
import { isDemoRegistered, toggleDemoRegistered } from "../components/hooks/demoRegistered.jsx";

// ---------------- helpers ----------------
function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function safeDateStr(d) {
  if (!d) return "";
  const s = String(d);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}

function withinRange(d, start, end) {
  const ds = safeDateStr(d);
  if (!ds) return false;
  if (start && ds < start) return false;
  if (end && ds > end) return false;
  return true;
}

function divisionMatch(schoolDivision, selectedDivisions) {
  const divs = asArray(selectedDivisions).filter(Boolean);
  if (!divs.length) return true;
  return divs.includes(String(schoolDivision || ""));
}

function positionMatch(campPositionIds, selectedPositionIds) {
  const sel = asArray(selectedPositionIds).map(String).filter(Boolean);
  if (!sel.length) return true;
  const camp = asArray(campPositionIds).map(String).filter(Boolean);
  return sel.some((p) => camp.includes(p));
}

function stateMatch(state, selectedState) {
  if (!selectedState) return true;
  return String(state || "") === String(selectedState);
}

function sportMatch(sportId, selectedSport) {
  if (!selectedSport) return true;
  return String(sportId || "") === String(selectedSport);
}

// Paid intent upsert (Base44-safe, no assumptions about functions.*)
async function upsertCampIntent({ athleteId, campId, patch }) {
  if (!athleteId || !campId) return null;

  // Try: find existing intent
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

  // Create or update
  try {
    if (existing?.id) {
      return await base44.entities.CampIntent.update(existing.id, {
        ...patch,
        athlete_id: athleteId,
        camp_id: campId
      });
    }
  } catch {
    // fall through to create
  }

  try {
    return await base44.entities.CampIntent.create({
      athlete_id: athleteId,
      camp_id: campId,
      ...patch
    });
  } catch {
    return null;
  }
}

export default function Discover() {
  const nav = useNavigate();

  const season = useSeasonAccess();
  const isDemo = season.mode !== "paid";

  const { athleteProfile } = useAthleteIdentity();
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  const gate = useWriteGate();

  // Demo profile (for local favorites/registered keys)
  const { demoProfileId, loaded: demoLoaded } = useDemoProfile();

  const [filterOpen, setFilterOpen] = useState(false);

  // FilterSheet contract
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // Reference data for filters + position label rendering
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);
  const [posMap, setPosMap] = useState(new Map());

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const s = await base44.entities.Sport.list();
        if (mounted) setSports(Array.isArray(s) ? s : []);
      } catch {
        if (mounted) setSports([]);
      }

      try {
        const p = await base44.entities.Position.list();
        const arr = Array.isArray(p) ? p : [];
        if (mounted) {
          setPositions(arr);
          const m = new Map();
          arr.forEach((row) => {
            const id = normId(row);
            if (id) m.set(String(id), row);
          });
          setPosMap(m);
        }
      } catch {
        if (mounted) {
          setPositions([]);
          setPosMap(new Map());
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Demo/public summaries
  const publicQuery = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: null, // multi-division applied client-side
    positionIds: asArray(filters.positions),
    limit: 500,
    enabled: isDemo && !!season.seasonYear
  });

  // Paid summaries (includes intent_status)
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || null,
    limit: 500,
    enabled: !isDemo && !!athleteId
  });

  // If paid but no profile yet, fall back to public read model (browse-only)
  const paidFallbackPublicQuery = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: null,
    positionIds: asArray(filters.positions),
    limit: 500,
    enabled: !isDemo && !athleteId && !!season.seasonYear
  });

  const loading =
    (isDemo ? publicQuery.isLoading : athleteId ? paidQuery.isLoading : paidFallbackPublicQuery.isLoading) ||
    (isDemo ? !demoLoaded : false);

  const error =
    isDemo
      ? publicQuery.isError
      : athleteId
        ? paidQuery.isError
        : paidFallbackPublicQuery.isError;

  const rawRows = useMemo(() => {
    if (isDemo) return Array.isArray(publicQuery.data) ? publicQuery.data : [];
    if (athleteId) return Array.isArray(paidQuery.data) ? paidQuery.data : [];
    return Array.isArray(paidFallbackPublicQuery.data) ? paidFallbackPublicQuery.data : [];
  }, [isDemo, athleteId, publicQuery.data, paidQuery.data, paidFallbackPublicQuery.data]);

  // normalize rows
  const rows = useMemo(() => {
    return rawRows
      .map((r) => ({
        camp_id: String(r?.camp_id || normId(r) || ""),
        camp_name: r?.camp_name || "Camp",
        start_date: r?.start_date || null,
        end_date: r?.end_date || null,
        city: r?.city || null,
        state: r?.state || null,
        price: typeof r?.price === "number" ? r.price : null,
        link_url: r?.link_url || null,
        notes: r?.notes || null,

        position_ids: asArray(r?.position_ids),

        sport_id: r?.sport_id ? String(r.sport_id) : null,
        sport_name: r?.sport_name || null,

        school_id: r?.school_id ? String(r.school_id) : null,
        school_name: r?.school_name || null,
        school_division: r?.school_division || null,

        // paid-only (may be null in demo/public)
        intent_status: r?.intent_status || null
      }))
      .filter((r) => !!r.camp_id);
  }, [rawRows]);

  // client-side filters (consistent for demo + paid)
  const filteredRows = useMemo(() => {
    const start = filters.startDate ? safeDateStr(filters.startDate) : "";
    const end = filters.endDate ? safeDateStr(filters.endDate) : "";

    return rows
      .filter((r) => sportMatch(r.sport_id, filters.sport))
      .filter((r) => stateMatch(r.state, filters.state))
      .filter((r) => divisionMatch(r.school_division, filters.divisions))
      .filter((r) => positionMatch(r.position_ids, filters.positions))
      .filter((r) => {
        if (!start && !end) return true;
        return withinRange(r.start_date, start, end);
      });
  }, [rows, filters]);

  // demo-local favorites snapshot
  const demoFavs = useMemo(() => {
    if (!isDemo) return [];
    return getDemoFavorites(demoProfileId, season.seasonYear);
  }, [isDemo, demoProfileId, season.seasonYear]);

  const clearFilters = () => {
    setFilters({
      sport: "",
      state: "",
      divisions: [],
      positions: [],
      startDate: "",
      endDate: ""
    });
  };

  const onOpenCamp = (campId) => {
    // If you have CampDetail implemented, this will work.
    // If not, it will still compile; you can add CampDetail later.
    nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(campId))}`);
  };

  const onToggleFavorite = async (campId) => {
    const cid = String(campId || "");
    if (!cid) return;

    await gate.write({
      demo: async () => {
        toggleDemoFavorite(demoProfileId, cid, season.seasonYear);
        // force rerender without extra state
        setFilters((f) => ({ ...f }));
      },
      paid: async () => {
        // Require athlete context for writes
        if (!athleteId) {
          gate.requirePaid({ next: createPageUrl("Discover"), source: "discover_favorite" });
          return;
        }

        // Determine next status: toggle favorite on/off
        const row = filteredRows.find((r) => String(r.camp_id) === cid);
        const currentlyFav = row?.intent_status === "favorite";

        await upsertCampIntent({
          athleteId,
          campId: cid,
          patch: { status: currentlyFav ? null : "favorite" }
        });

        // Refresh paid read model
        try {
          await base44.entities.Event?.create?.({
            event_name: "discover_favorite_toggled",
            camp_id: cid,
            ts: new Date().toISOString()
          });
        } catch {}

        // simplest: react-query will refetch on invalidate (if your app already does);
        // but we won’t assume queryClient access here. user can refresh if needed.
      }
    });
  };

  const onToggleRegistered = async (campId) => {
    const cid = String(campId || "");
    if (!cid) return;

    await gate.write({
      demo: async () => {
        toggleDemoRegistered(demoProfileId, cid);
        setFilters((f) => ({ ...f }));
      },
      paid: async () => {
        if (!athleteId) {
          gate.requirePaid({ next: createPageUrl("Discover"), source: "discover_registered" });
          return;
        }

        const row = filteredRows.find((r) => String(r.camp_id) === cid);
        const currentlyReg = row?.intent_status === "registered";

        await upsertCampIntent({
          athleteId,
          campId: cid,
          patch: { status: currentlyReg ? null : "registered" }
        });

        try {
          await base44.entities.Event?.create?.({
            event_name: "discover_registered_toggled",
            camp_id: cid,
            ts: new Date().toISOString()
          });
        } catch {}
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-md mx-auto px-4 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold text-deep-navy">Discover</div>
            <div className="text-xs text-slate-500 mt-1">
              {isDemo ? (
                <>
                  Demo season <Badge variant="outline">{season.seasonYear}</Badge>
                </>
              ) : (
                <>
                  Season <Badge variant="outline">{season.seasonYear}</Badge>
                </>
              )}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {error && (
          <Card className="mt-4 p-4 border-rose-200 bg-rose-50">
            <div className="text-sm text-rose-700 font-medium">Couldn’t load camps.</div>
            <div className="text-xs text-rose-600 mt-1">
              This is usually a Base44 entity/filter mismatch. Refresh first; then we’ll tighten query shapes if needed.
            </div>
          </Card>
        )}

        {!loading && filteredRows.length === 0 && (
          <Card className="mt-4 p-5 border-slate-200">
            <div className="text-sm font-medium text-slate-900">No camps match your filters.</div>
            <div className="text-xs text-slate-500 mt-1">Try clearing filters.</div>
            <div className="mt-3">
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </Card>
        )}

        {loading ? (
          <div className="mt-6 text-sm text-slate-500">Loading…</div>
        ) : (
          <div className="mt-5 space-y-3">
            {filteredRows.map((r) => {
              const isFav = isDemo
                ? demoFavs.includes(String(r.camp_id))
                : r.intent_status === "favorite";

              const isReg = isDemo
                ? isDemoRegistered(demoProfileId, r.camp_id)
                : r.intent_status === "registered";

              const school = {
                id: r.school_id,
                school_name: r.school_name,
                division: r.school_division
              };

              const sport = {
                id: r.sport_id,
                sport_name: r.sport_name
              };

              const camp = {
                id: r.camp_id,
                camp_name: r.camp_name,
                start_date: r.start_date,
                end_date: r.end_date,
                city: r.city,
                state: r.state,
                price: r.price,
                link_url: r.link_url,
                notes: r.notes,
                position_ids: r.position_ids
              };

              const posObjs = asArray(r.position_ids)
                .map((pid) => posMap.get(String(pid)))
                .filter(Boolean);

              return (
                <CampCard
                  key={r.camp_id}
                  camp={camp}
                  school={school}
                  sport={sport}
                  positions={posObjs}
                  isFavorite={!!isFav}
                  isRegistered={!!isReg}
                  onFavoriteToggle={() => onToggleFavorite(r.camp_id)}
                  onClick={() => onOpenCamp(r.camp_id)}
                  mode={isDemo ? "demo" : "paid"}
                />
              );
            })}
          </div>
        )}
      </div>

      <FilterSheet
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        positions={positions}
        sports={sports}
        onApply={() => setFilterOpen(false)}
        onClear={clearFilters}
      />

      <BottomNav />
    </div>
  );
}
