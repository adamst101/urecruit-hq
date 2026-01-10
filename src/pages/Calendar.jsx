// src/pages/Calendar.jsx
import React, { useMemo, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Filter } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

// ✅ Your repo uses .jsx everywhere
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useWriteGate } from "../components/hooks/useWriteGate.jsx";

// ✅ Data read models
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

// ✅ Correct location (NOT Camps)
import FilterSheet from "../components/filters/FilterSheet.jsx";
import CampCard from "../components/camps/CampCard.jsx";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

// ----------------------
// Demo local storage (inline to avoid path/extension drift)
// ----------------------
function lsKey(kind, demoProfileId, seasonYear) {
  const pid = demoProfileId || "default";
  const yr = seasonYear || "na";
  return `rm_demo:${kind}:${pid}:${yr}`;
}

function getLsArray(kind, demoProfileId, seasonYear) {
  try {
    const raw = localStorage.getItem(lsKey(kind, demoProfileId, seasonYear));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function toggleLsArray(kind, demoProfileId, seasonYear, id) {
  const cid = id ? String(id) : null;
  if (!cid) return getLsArray(kind, demoProfileId, seasonYear);

  const cur = getLsArray(kind, demoProfileId, seasonYear);
  const next = cur.includes(cid) ? cur.filter((x) => x !== cid) : [...cur, cid];

  try {
    localStorage.setItem(lsKey(kind, demoProfileId, seasonYear), JSON.stringify(next));
  } catch {}

  return next;
}

// ----------------------
// Date filter helpers
// ----------------------
function inDateRange(row, startDate, endDate) {
  const d = row?.start_date;
  if (!d || typeof d !== "string") return true;

  if (startDate && d < startDate) return false;
  if (endDate && d > endDate) return false;
  return true;
}

function pickDivision(row) {
  return row?.school_division || row?.division || null;
}

export default function Calendar() {
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();
  const { write, requirePaid } = useWriteGate();

  // URL override: ?mode=demo forces demo behavior even if user is paid
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc.search]);

  const effectiveMode = forceDemo ? "demo" : season.mode; // "demo" | "paid"
  const isPaid = effectiveMode === "paid";
  const seasonYear = forceDemo ? season.demoYear : season.seasonYear;

  // Filters used by FilterSheet.jsx
  const [filters, setFilters] = useState({
    sport: "",
    divisions: [],
    positions: [],
    state: "",
    startDate: "",
    endDate: ""
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  // Load sports/positions for FilterSheet
  const sportsQuery = useQuery({
    queryKey: ["sports_list"],
    retry: false,
    staleTime: 5 * 60 * 1000,
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
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const rows = await base44.entities.Position.list();
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  const selectedDivisionPrimary = useMemo(() => {
    const d = Array.isArray(filters.divisions) ? filters.divisions : [];
    return d[0] || "";
  }, [filters.divisions]);

  const selectedDivisionsAll = useMemo(() => {
    return Array.isArray(filters.divisions) ? filters.divisions : [];
  }, [filters.divisions]);

  const selectedPositions = useMemo(() => {
    return Array.isArray(filters.positions) ? filters.positions.map(String) : [];
  }, [filters.positions]);

  // ----------------------
  // Data: Paid vs Demo
  // ----------------------
  const paidAthleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  const paidSummaries = useCampSummariesClient({
    athleteId: paidAthleteId,
    sportId: filters.sport || "",
    enabled: isPaid && !!paidAthleteId
  });

  const publicSummaries = usePublicCampSummariesClient({
    seasonYear,
    sportId: filters.sport || "",
    state: filters.state || "",
    division: selectedDivisionPrimary || "",
    positionIds: selectedPositions,
    enabled: !isPaid // demo (or forced demo)
  });

  const loading =
    season.isLoading ||
    sportsQuery.isLoading ||
    positionsQuery.isLoading ||
    (isPaid ? paidSummaries.isLoading : publicSummaries.isLoading);

  const rawRows = useMemo(() => {
    const rows = isPaid ? paidSummaries.data : publicSummaries.data;
    return Array.isArray(rows) ? rows : [];
  }, [isPaid, paidSummaries.data, publicSummaries.data]);

  // Apply remaining filters client-side (multi-division + date range)
  const rows = useMemo(() => {
    let out = rawRows;

    // Multi-division support (public hook only supports one division; enforce all selected here)
    if (selectedDivisionsAll.length > 0) {
      out = out.filter((r) => selectedDivisionsAll.includes(pickDivision(r)));
    }

    // Date range
    const sd = filters.startDate || "";
    const ed = filters.endDate || "";
    if (sd || ed) {
      out = out.filter((r) => inDateRange(r, sd, ed));
    }

    return out;
  }, [rawRows, selectedDivisionsAll, filters.startDate, filters.endDate]);

  // Demo identity (stable enough for local storage scoping)
  const demoProfileId = "default";

  // Demo local state mirrors storage so UI reacts immediately
  const [demoFavIds, setDemoFavIds] = useState(() => getLsArray("favorites", demoProfileId, seasonYear));
  const [demoRegIds, setDemoRegIds] = useState(() => getLsArray("registered", demoProfileId, seasonYear));

  // Keep demo arrays in sync if season changes (e.g., Jan 1 / forced demo)
  React.useEffect(() => {
    if (isPaid) return;
    setDemoFavIds(getLsArray("favorites", demoProfileId, seasonYear));
    setDemoRegIds(getLsArray("registered", demoProfileId, seasonYear));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaid, seasonYear]);

  const isFavorite = useCallback(
    (campId, row) => {
      const id = String(campId || row?.camp_id || "");
      if (!id) return false;

      if (!isPaid) return demoFavIds.includes(id);

      const status = row?.intent_status;
      return status === "favorite" || status === "saved";
    },
    [isPaid, demoFavIds]
  );

  const isRegistered = useCallback(
    (campId, row) => {
      const id = String(campId || row?.camp_id || "");
      if (!id) return false;

      if (!isPaid) return demoRegIds.includes(id);

      const status = row?.intent_status;
      return status === "registered";
    },
    [isPaid, demoRegIds]
  );

  const onToggleFavorite = useCallback(
    async (row) => {
      const campId = String(row?.camp_id || "");
      if (!campId) return;

      // Demo: local write only
      if (!isPaid) {
        const next = toggleLsArray("favorites", demoProfileId, seasonYear, campId);
        setDemoFavIds(next);
        return;
      }

      // Paid: backend write (requires paid access)
      if (!requirePaid({ next: createPageUrl("Calendar"), source: "calendar_favorite" })) return;

      await write({
        paid: async () => {
          // Upsert CampIntent: (athlete_id, camp_id)
          const athleteId = paidAthleteId;
          if (!athleteId) return;

          let existing = null;
          try {
            const rows = await base44.entities.CampIntent.filter({
              athlete_id: athleteId,
              camp_id: campId
            });
            existing = Array.isArray(rows) && rows[0] ? rows[0] : null;
          } catch {}

          const currentlyFav = row?.intent_status === "favorite" || row?.intent_status === "saved";
          const nextStatus = currentlyFav ? null : "favorite";

          try {
            if (existing?.id) {
              if (!nextStatus) {
                // if you prefer "clear" instead of delete, switch this to update({status:null})
                await base44.entities.CampIntent.delete(existing.id);
              } else {
                await base44.entities.CampIntent.update(existing.id, { status: nextStatus });
              }
            } else if (nextStatus) {
              await base44.entities.CampIntent.create({
                athlete_id: athleteId,
                camp_id: campId,
                status: nextStatus
              });
            }
          } catch {}

          // refresh composed read models
          try {
            qc.invalidateQueries({ queryKey: ["myCampsSummaries_client"], exact: false });
          } catch {}
        }
      });
    },
    [isPaid, demoProfileId, seasonYear, requirePaid, write, paidAthleteId, qc]
  );

  const onToggleRegistered = useCallback(
    async (row) => {
      const campId = String(row?.camp_id || "");
      if (!campId) return;

      if (!isPaid) {
        const next = toggleLsArray("registered", demoProfileId, seasonYear, campId);
        setDemoRegIds(next);
        return;
      }

      if (!requirePaid({ next: createPageUrl("Calendar"), source: "calendar_registered" })) return;

      await write({
        paid: async () => {
          const athleteId = paidAthleteId;
          if (!athleteId) return;

          let existing = null;
          try {
            const rows = await base44.entities.CampIntent.filter({
              athlete_id: athleteId,
              camp_id: campId
            });
            existing = Array.isArray(rows) && rows[0] ? rows[0] : null;
          } catch {}

          const currentlyReg = row?.intent_status === "registered";
          const nextStatus = currentlyReg ? null : "registered";

          try {
            if (existing?.id) {
              if (!nextStatus) {
                await base44.entities.CampIntent.delete(existing.id);
              } else {
                await base44.entities.CampIntent.update(existing.id, { status: nextStatus });
              }
            } else if (nextStatus) {
              await base44.entities.CampIntent.create({
                athlete_id: athleteId,
                camp_id: campId,
                status: nextStatus
              });
            }
          } catch {}

          try {
            qc.invalidateQueries({ queryKey: ["myCampsSummaries_client"], exact: false });
          } catch {}
        }
      });
    },
    [isPaid, demoProfileId, seasonYear, requirePaid, write, paidAthleteId, qc]
  );

  if (loading) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <Card className="p-4 border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-slate-600" />
              <div>
                <div className="text-lg font-semibold text-deep-navy">Calendar</div>
                <div className="text-xs text-slate-500">
                  {isPaid ? "Paid season workspace" : "Demo workspace"} • Season {String(seasonYear)}
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setSheetOpen(true)}
            >
              <Filter className="w-4 h-4" />
              Filters
            </Button>
          </div>
        </Card>

        {rows.length === 0 ? (
          <Card className="p-6 border-slate-200 text-center text-slate-600">
            No camps match your filters.
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const campId = r?.camp_id;
              const fav = isFavorite(campId, r);
              const reg = isRegistered(campId, r);

              // CampCard expects camp/school/sport/positions objects (it’s flexible)
              const camp = {
                camp_name: r?.camp_name,
                start_date: r?.start_date,
                end_date: r?.end_date,
                price: r?.price,
                city: r?.city,
                state: r?.state
              };

              const school = {
                school_name: r?.school_name,
                division: r?.school_division
              };

              const sport = {
                sport_name: r?.sport_name
              };

              const positions =
                Array.isArray(r?.position_codes) && r.position_codes.length
                  ? r.position_codes.map((code) => ({ position_code: code }))
                  : [];

              return (
                <CampCard
                  key={String(campId)}
                  camp={camp}
                  school={school}
                  sport={sport}
                  positions={positions}
                  isFavorite={fav}
                  isRegistered={reg}
                  mode={effectiveMode}
                  onFavoriteToggle={() => onToggleFavorite(r)}
                  onClick={() => {
                    // If you have CampDetail page, route there; otherwise keep simple
                    try {
                      nav(createPageUrl("Discover") + `?focus=${encodeURIComponent(String(campId))}`);
                    } catch {}
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <FilterSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        sports={sportsQuery.data || []}
        positions={positionsQuery.data || []}
        onApply={() => setSheetOpen(false)}
        onClear={() => {
          setFilters({
            sport: "",
            divisions: [],
            positions: [],
            state: "",
            startDate: "",
            endDate: ""
          });
        }}
      />
    </div>
  );
}
