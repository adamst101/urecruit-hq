// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

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

function formatDayLabel(yyyyMmDd) {
  try {
    if (!yyyyMmDd) return "TBD";
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return yyyyMmDd || "TBD";
  }
}

// Paid intent upsert (Base44-safe)
async function upsertCampIntent({ athleteId, campId, patch }) {
  if (!athleteId || !campId) return null;

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

export default function Calendar() {
  const nav = useNavigate();

  const season = useSeasonAccess();
  const isDemo = season.mode !== "paid";

  const { athleteProfile } = useAthleteIdentity();
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  const gate = useWriteGate();

  // Demo identity for local keys
  const { demoProfileId, loaded: demoLoaded } = useDemoProfile();

  const [filterOpen, setFilterOpen] = useState(false);

  // Calendar filters
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // Reference data for FilterSheet + positions rendering
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

  // Demo/public summaries (browse data)
  const publicQuery = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division: null, // multi-division handled client-side
    positionIds: asArray(filters.positions),
    limit: 1000,
    enabled: isDemo && !!season.seasonYear
  });

  // Paid summaries (has intent_status)
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || null,
    limit: 1000,
    enabled: !isDemo && !!athleteId
  });

  const loading =
    (isDemo ? publicQuery.isLoading : paidQuery.isLoading) || (isDemo ? !demoLoaded : false);

  const error = isDemo ? publicQuery.isError : paidQuery.isError;

  const rawRows = useMemo(() => {
    if (isDemo) return Array.isArray(publicQuery.data) ? publicQuery.data : [];
    return Array.isArray(paidQuery.data) ? paidQuery.data : [];
  }, [isDemo, publicQuery.data, paidQuery.data]);

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

        intent_status: r?.intent_status || null
      }))
      .filter((r) => !!r.camp_id);
  }, [rawRows]);

  // Demo-local states
  const demoFavs = useMemo(() => {
    if (!isDemo) return [];
    return getDemoFavorites(demoProfileId, season.seasonYear);
  }, [isDemo, demoProfileId, season.seasonYear]);

  // Calendar should show "your camps":
  // - demo: local favorites OR registered
  // - paid: intent_status favorite OR registered
  const myRows = useMemo(() => {
    const start = filters.startDate ? safeDateStr(filters.startDate) : "";
    const end = filters.endDate ? safeDateStr(filters.endDate) : "";

    const base = rows
      .filter((r) => sportMatch(r.sport_id, filters.sport))
      .filter((r) => stateMatch(r.state, filters.state))
      .filter((r) => divisionMatch(r.school_division, filters.divisions))
      .filter((r) => positionMatch(r.position_ids, filters.positions))
      .filter((r) => {
        if (!start && !end) return true;
        return withinRange(r.start_date, start, end);
      });

    if (isDemo) {
      return base.filter((r) => {
        const cid = String(r.camp_id);
        const fav = demoFavs.includes(cid);
        const reg = isDemoRegistered(demoProfileId, cid);
        return fav || reg;
      });
    }

    // Paid
    return base.filter((r) => r.intent_status === "favorite" || r.intent_status === "registered");
  }, [rows, filters, isDemo, demoFavs, demoProfileId]);

  // Group by start_date
  const grouped = useMemo(() => {
    const m = new Map();
    for (const r of myRows) {
      const key = safeDateStr(r.start_date) || "TBD";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(r);
    }
    const keys = Array.from(m.keys()).sort((a, b) => String(a).localeCompare(String(b)));
    return keys.map((k) => ({
      key: k,
      label: k === "TBD" ? "TBD" : formatDayLabel(k),
      items: m.get(k).sort((a, b) => String(a.camp_name).localeCompare(String(b.camp_name)))
    }));
  }, [myRows]);

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
    nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(campId))}`);
  };

  const onToggleFavorite = async (campId) => {
    const cid = String(campId || "");
    if (!cid) return;

    await gate.write({
      demo: async () => {
        toggleDemoFavorite(demoProfileId, cid, season.seasonYear);
        setFilters((f) => ({ ...f }));
      },
      paid: async () => {
        if (!athleteId) {
          gate.requirePaid({ next: createPageUrl("Calendar"), source: "calendar_favorite" });
          return;
        }

        const row = rows.find((r) => String(r.camp_id) === cid);
        const currentlyFav = row?.intent_status === "favorite";

        await upsertCampIntent({
          athleteId,
          campId: cid,
          patch: { status: currentlyFav ? null : "favorite" }
        });

        setFilters((f) => ({ ...f }));
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
          gate.requirePaid({ next: createPageUrl("Calendar"), source: "calendar_registered" });
          return;
        }

        const row = rows.find((r) => String(r.camp_id) === cid);
        const currentlyReg = row?.intent_status === "registered";

        await upsertCampIntent({
          athleteId,
          campId: cid,
          patch: { status: currentlyReg ? null : "registered" }
        });

        setFilters((f) => ({ ...f }));
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-md mx-auto px-4 pt-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold text-deep-navy">Calendar</div>
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
            <div className="text-sm text-rose-700 font-medium">Couldn’t load calendar camps.</div>
            <div className="text-xs text-rose-600 mt-1">Refresh first; if it persists, we’ll tighten the Base44 queries.</div>
          </Card>
        )}

        {loading ? (
          <div className="mt-6 text-sm text-slate-500">Loading…</div>
        ) : grouped.length === 0 ? (
          <Card className="mt-4 p-5 border-slate-200">
            <div className="text-sm font-medium text-slate-900">No camps on your calendar yet.</div>
            <div className="text-xs text-slate-500 mt-1">
              {isDemo
                ? "In demo mode, favorite or mark a camp as registered to see it here."
                : "Favorite or register camps in Discover to see them here."}
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
              <Button onClick={() => nav(createPageUrl("Discover"))}>
                Go to Discover
              </Button>
            </div>
          </Card>
        ) : (
          <div className="mt-5 space-y-5">
            {grouped.map((g) => (
              <div key={g.key}>
                <div className="sticky top-0 z-10 bg-slate-50 py-2">
                  <div className="text-xs font-semibold text-slate-600">{g.label}</div>
                </div>

                <div className="space-y-3">
                  {g.items.map((r) => {
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
                      <div key={r.camp_id} className="space-y-2">
                        <CampCard
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

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => onToggleFavorite(r.camp_id)}
                          >
                            {isFav ? "Unfavorite" : "Favorite"}
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => onToggleRegistered(r.camp_id)}
                          >
                            {isReg ? "Unregister" : "Registered"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
