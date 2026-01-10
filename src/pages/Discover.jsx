// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Filter, Search, Loader2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";
import CampCard from "../components/camps/CampCard.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

// ---------------- helpers ----------------
function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function safeStr(x) {
  if (x === null || x === undefined) return "";
  return String(x);
}

// Demo-local favorites/registered (inlined to avoid importing any .js files)
function demoFavKey(profileId, seasonYear) {
  const pid = profileId || "default";
  const yr = seasonYear || "na";
  return `demo:favorites:${pid}:${yr}`;
}
function getDemoFavorites(profileId, seasonYear) {
  try {
    const raw = localStorage.getItem(demoFavKey(profileId, seasonYear));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map((v) => String(v)).filter(Boolean) : [];
  } catch {
    return [];
  }
}
function setDemoFavorites(profileId, seasonYear, ids) {
  try {
    localStorage.setItem(demoFavKey(profileId, seasonYear), JSON.stringify(ids || []));
  } catch {}
}
function toggleDemoFavorite(profileId, seasonYear, campId) {
  const id = campId ? String(campId) : null;
  if (!id) return getDemoFavorites(profileId, seasonYear);
  const existing = getDemoFavorites(profileId, seasonYear);
  const next = existing.includes(id) ? existing.filter((x) => x !== id) : [...existing, id];
  setDemoFavorites(profileId, seasonYear, next);
  return next;
}

function demoRegKey(profileId) {
  return `rm_demo_registered_${profileId || "default"}`;
}
function isDemoRegistered(profileId, campId) {
  try {
    const raw = localStorage.getItem(demoRegKey(profileId));
    if (!raw) return false;
    const obj = JSON.parse(raw);
    return !!obj?.[String(campId)];
  } catch {
    return false;
  }
}
function toggleDemoRegistered(profileId, campId) {
  try {
    const key = demoRegKey(profileId);
    const raw = localStorage.getItem(key);
    const obj = raw ? JSON.parse(raw) : {};
    const cid = String(campId);
    if (obj?.[cid]) delete obj[cid];
    else obj[cid] = 1;
    localStorage.setItem(key, JSON.stringify(obj));
  } catch {}
}

// Paid intent upsert (favorite/registered)
async function getExistingIntent(athleteId, campId) {
  try {
    const rows = await base44.entities.CampIntent.filter({
      athlete_id: athleteId,
      camp_id: campId,
    });
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

async function setIntentStatus({ athleteId, campId, nextStatus }) {
  const existing = await getExistingIntent(athleteId, campId);

  // If clearing, try delete first; if delete not supported, fall back to update(null)
  if (!nextStatus) {
    if (existing) {
      const id = normId(existing);
      try {
        if (id && typeof base44.entities.CampIntent.delete === "function") {
          await base44.entities.CampIntent.delete(id);
          return;
        }
      } catch {}
      try {
        if (id && typeof base44.entities.CampIntent.update === "function") {
          await base44.entities.CampIntent.update(id, { status: null });
          return;
        }
      } catch {}
    }
    return;
  }

  // Create or update
  if (existing) {
    const id = normId(existing);
    try {
      if (id && typeof base44.entities.CampIntent.update === "function") {
        await base44.entities.CampIntent.update(id, { status: nextStatus });
        return;
      }
    } catch {}
  }

  try {
    if (typeof base44.entities.CampIntent.create === "function") {
      await base44.entities.CampIntent.create({
        athlete_id: athleteId,
        camp_id: campId,
        status: nextStatus,
      });
    }
  } catch {}
}

// ---------------- page ----------------
export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();
  const queryClient = useQueryClient();

  // URL override: ?mode=demo must win
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc.search]);

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const effectiveMode = forceDemo ? "demo" : season.mode; // "demo" | "paid"
  const seasonYear = forceDemo ? season.demoYear : season.seasonYear;

  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // FilterSheet contract
  const [filters, setFilters] = useState({
    sport: "",
    divisions: [],
    positions: [],
    state: "",
    startDate: "",
    endDate: "",
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  // Search box (client-side)
  const [q, setQ] = useState("");

  // Lists for FilterSheet
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const s = await base44.entities.Sport.list?.();
        if (mounted) setSports(Array.isArray(s) ? s : []);
      } catch {
        if (mounted) setSports([]);
      }

      try {
        const p = await base44.entities.Position.list?.();
        if (mounted) setPositions(Array.isArray(p) ? p : []);
      } catch {
        if (mounted) setPositions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Paid data
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || null,
    enabled: effectiveMode === "paid" && !!athleteId,
    limit: 500,
  });

  // Demo/public data
  const demoQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || null,
    state: filters.state || null,
    division:
      Array.isArray(filters.divisions) && filters.divisions.length
        ? filters.divisions[0]
        : null,
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    enabled: effectiveMode !== "paid" && !!seasonYear,
    limit: 500,
  });

  const loading =
    season.isLoading ||
    (effectiveMode === "paid" ? paidQuery.isLoading : demoQuery.isLoading);

  const rawRows = effectiveMode === "paid" ? (paidQuery.data || []) : (demoQuery.data || []);

  // Demo-local UI state so toggles re-render immediately
  const demoProfileId = "default"; // stable and deterministic
  const [demoFavorites, setDemoFavoritesState] = useState(() =>
    getDemoFavorites(demoProfileId, seasonYear)
  );
  const [demoRegTick, setDemoRegTick] = useState(0); // force re-render on register toggle

  useEffect(() => {
    if (effectiveMode === "paid") return;
    setDemoFavoritesState(getDemoFavorites(demoProfileId, seasonYear));
  }, [effectiveMode, seasonYear]);

  const rows = useMemo(() => {
    const needle = safeStr(q).trim().toLowerCase();

    const startDate = safeStr(filters.startDate).trim();
    const endDate = safeStr(filters.endDate).trim();

    return (rawRows || [])
      .map((r) => ({
        camp_id: safeStr(r?.camp_id || r?.id),
        camp_name: r?.camp_name || "Camp",
        start_date: r?.start_date || null,
        end_date: r?.end_date || null,
        city: r?.city || null,
        state: r?.state || null,
        price: typeof r?.price === "number" ? r.price : null,
        link_url: r?.link_url || null,
        notes: r?.notes || null,

        school_id: r?.school_id ? String(r.school_id) : null,
        school_name: r?.school_name || "Unknown School",
        school_division: r?.school_division || null,

        sport_id: r?.sport_id ? String(r.sport_id) : null,
        sport_name: r?.sport_name || null,

        intent_status: r?.intent_status || null,
        is_target_school: !!r?.is_target_school,

        // demo reg tick included so memo recalcs on demo register toggle
        _demoRegTick: demoRegTick,
      }))
      .filter((r) => !!r.camp_id)
      .filter((r) => {
        // Date range filter (client-side; reliable)
        const d = safeStr(r.start_date);
        if (startDate && d && d < startDate) return false;
        if (endDate && d && d > endDate) return false;
        return true;
      })
      .filter((r) => {
        if (!needle) return true;
        const hay = `${r.school_name} ${r.camp_name} ${r.state || ""} ${r.city || ""}`.toLowerCase();
        return hay.includes(needle);
      });
  }, [rawRows, q, filters.startDate, filters.endDate, demoRegTick]);

  const isFavorite = useCallback(
    (row) => {
      if (effectiveMode === "paid") {
        return String(row.intent_status || "").toLowerCase() === "favorite";
      }
      return demoFavorites.includes(String(row.camp_id));
    },
    [effectiveMode, demoFavorites]
  );

  const isRegistered = useCallback(
    (row) => {
      if (effectiveMode === "paid") {
        return String(row.intent_status || "").toLowerCase() === "registered";
      }
      return isDemoRegistered(demoProfileId, row.camp_id);
    },
    [effectiveMode]
  );

  const refreshPaid = useCallback(() => {
    try {
      queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"], exact: false });
    } catch {}
  }, [queryClient]);

  const onToggleFavorite = useCallback(
    async (row) => {
      const campId = String(row.camp_id);

      if (effectiveMode !== "paid") {
        const next = toggleDemoFavorite(demoProfileId, seasonYear, campId);
        setDemoFavoritesState(next);
        return;
      }

      // paid mode requires athlete
      if (!athleteId) {
        nav(createPageUrl("Profile") + `?next=${encodeURIComponent(createPageUrl("Discover"))}`);
        return;
      }

      const currentlyFav = String(row.intent_status || "").toLowerCase() === "favorite";
      await setIntentStatus({
        athleteId,
        campId,
        nextStatus: currentlyFav ? null : "favorite",
      });
      refreshPaid();
    },
    [effectiveMode, athleteId, nav, seasonYear, refreshPaid]
  );

  const onToggleRegistered = useCallback(
    async (row) => {
      const campId = String(row.camp_id);

      if (effectiveMode !== "paid") {
        toggleDemoRegistered(demoProfileId, campId);
        setDemoRegTick((x) => x + 1);
        return;
      }

      if (!athleteId) {
        nav(createPageUrl("Profile") + `?next=${encodeURIComponent(createPageUrl("Discover"))}`);
        return;
      }

      const currentlyReg = String(row.intent_status || "").toLowerCase() === "registered";
      await setIntentStatus({
        athleteId,
        campId,
        nextStatus: currentlyReg ? null : "registered",
      });
      refreshPaid();
    },
    [effectiveMode, athleteId, nav, refreshPaid]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-20">
      <div className="max-w-md mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-2xl font-bold text-deep-navy">Discover</div>
            <div className="text-sm text-slate-600">
              {effectiveMode === "paid" ? "Paid season workspace" : "Demo discover"} • {seasonYear}
            </div>
          </div>

          <Button variant="outline" onClick={() => setSheetOpen(true)}>
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
        </div>

        {/* Search */}
        <div className="mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search school, camp, city, state…"
              className="pl-9"
            />
          </div>
        </div>

        {/* Summary line */}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <span className="font-semibold text-slate-700">{rows.length}</span> camps
          </div>
          {filters.state || (filters.positions || []).length || (filters.divisions || []).length || filters.sport ? (
            <button
              type="button"
              className="underline"
              onClick={() =>
                setFilters({
                  sport: "",
                  divisions: [],
                  positions: [],
                  state: "",
                  startDate: "",
                  endDate: "",
                })
              }
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {/* List */}
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : rows.length === 0 ? (
            <Card className="p-6 border-slate-200">
              <div className="text-deep-navy font-semibold">No camps found</div>
              <div className="text-sm text-slate-600 mt-1">
                Adjust filters or broaden your search.
              </div>
            </Card>
          ) : (
            rows.map((r) => {
              const fav = isFavorite(r);
              const reg = isRegistered(r);

              // Construct objects expected by CampCard (keeps component reusable)
              const camp = {
                id: r.camp_id,
                camp_name: r.camp_name,
                start_date: r.start_date,
                end_date: r.end_date,
                price: r.price,
                city: r.city,
                state: r.state,
                link_url: r.link_url,
                notes: r.notes,
              };
              const school = {
                id: r.school_id,
                school_name: r.school_name,
                division: r.school_division,
                school_division: r.school_division,
              };
              const sport = {
                id: r.sport_id,
                name: r.sport_name,
                sport_name: r.sport_name,
              };

              return (
                <div key={r.camp_id} className="space-y-2">
                  <CampCard
                    camp={camp}
                    school={school}
                    sport={sport}
                    positions={[]} // public summaries already filter positions; keep UI clean
                    isFavorite={fav}
                    isRegistered={reg}
                    mode={effectiveMode}
                    onFavoriteToggle={() => onToggleFavorite(r)}
                    onClick={() => {
                      // If you have a CampDetail page, route there; otherwise open link if present
                      if (r.link_url) {
                        try {
                          window.open(r.link_url, "_blank", "noopener,noreferrer");
                        } catch {}
                        return;
                      }
                      // fallback: stay in discover
                    }}
                  />

                  {/* Secondary actions (register toggle) */}
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      variant={reg ? "outline" : "default"}
                      onClick={() => onToggleRegistered(r)}
                    >
                      {reg ? "Registered" : "Mark Registered"}
                    </Button>

                    {effectiveMode !== "paid" ? (
                      <Button
                        className="flex-1"
                        variant="outline"
                        onClick={() =>
                          nav(
                            createPageUrl("Subscribe") +
                              `?source=discover_upgrade&next=${encodeURIComponent(
                                createPageUrl("Discover")
                              )}`
                          )
                        }
                      >
                        Upgrade
                      </Button>
                    ) : r.is_target_school ? (
                      <Button className="flex-1" variant="outline" disabled>
                        <Badge className="bg-emerald-600 text-white">Target School</Badge>
                      </Button>
                    ) : (
                      <div className="flex-1" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Filter Sheet */}
      <FilterSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        onFilterChange={(next) => setFilters(next)}
        positions={positions}
        sports={sports}
        onApply={() => setSheetOpen(false)}
        onClear={() => {
          setFilters({
            sport: "",
            divisions: [],
            positions: [],
            state: "",
            startDate: "",
            endDate: "",
          });
          setSheetOpen(false);
        }}
      />

      <BottomNav />
    </div>
  );
}
