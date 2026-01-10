// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Filter, Loader2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import FilterSheet from "../components/filters/FilterSheet.jsx";
import CampCard from "../components/camps/CampCard.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

// ---------- helpers ----------
function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function parseISODate(s) {
  // expects YYYY-MM-DD, returns ms or NaN
  if (!s || typeof s !== "string") return NaN;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

export default function Calendar() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  // URL override: ?mode=demo forces demo behavior even if account is paid
  const forceDemo = useMemo(() => {
    try {
      const sp = new URLSearchParams(loc.search || "");
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [loc.search]);

  const effectiveMode = forceDemo ? "demo" : season.mode; // "demo" | "paid"
  const seasonYear = useMemo(() => {
    // Demo = prior year; Paid = current year
    return effectiveMode === "paid" ? season.currentYear : season.demoYear;
  }, [effectiveMode, season.currentYear, season.demoYear]);

  // ---------------- Filters ----------------
  const [filterOpen, setFilterOpen] = useState(false);

  // Keep filter state compatible with FilterSheet contract
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [], // list of division strings
    positions: [], // list of position ids (string)
    startDate: "",
    endDate: ""
  });

  // Load sports + positions for FilterSheet dropdowns/checks
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const s = await base44.entities.Sport.list();
        if (!mounted) return;
        setSports(Array.isArray(s) ? s : []);
      } catch {
        if (mounted) setSports([]);
      }

      try {
        const p = await base44.entities.Position.list();
        if (!mounted) return;
        setPositions(Array.isArray(p) ? p : []);
      } catch {
        if (mounted) setPositions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Normalize filter inputs
  const sportId = useMemo(() => {
    const v = String(filters?.sport || "").trim();
    return v ? v : null;
  }, [filters?.sport]);

  const stateCode = useMemo(() => {
    const v = String(filters?.state || "").trim();
    return v ? v : null;
  }, [filters?.state]);

  const division = useMemo(() => {
    // Calendar supports single division filter; if multiple selected, we apply client-side OR.
    const arr = Array.isArray(filters?.divisions) ? filters.divisions : [];
    return arr.length === 1 ? arr[0] : null;
  }, [filters?.divisions]);

  const positionIds = useMemo(() => {
    const arr = Array.isArray(filters?.positions) ? filters.positions : [];
    return arr.map((x) => String(x)).filter(Boolean);
  }, [filters?.positions]);

  // ---------------- Data ----------------
  const paidEnabled = effectiveMode === "paid" && !!normId(athleteProfile);

  // Paid summaries (includes intent + target-school fields)
  const paidQuery = useCampSummariesClient({
    athleteId: paidEnabled ? String(normId(athleteProfile)) : null,
    sportId: sportId || null,
    enabled: paidEnabled
  });

  // Public summaries (demo-style)
  const publicQuery = usePublicCampSummariesClient({
    seasonYear,
    sportId: sportId || null,
    state: stateCode || null,
    division: division || null,
    positionIds: positionIds.length ? positionIds : [],
    enabled: true
  });

  const loading = season.isLoading || (paidEnabled ? paidQuery.isLoading : publicQuery.isLoading);

  // Choose dataset by mode
  const rawRows = useMemo(() => {
    const rows = paidEnabled ? paidQuery.data : publicQuery.data;
    return Array.isArray(rows) ? rows : [];
  }, [paidEnabled, paidQuery.data, publicQuery.data]);

  // Client-side filter hardening (because paid hook doesn’t apply all filters server-side)
  const filteredRows = useMemo(() => {
    let rows = rawRows;

    // Paid-mode state filter (public hook already handles state)
    if (paidEnabled && stateCode) {
      rows = rows.filter((r) => String(r?.state || "").toUpperCase() === String(stateCode).toUpperCase());
    }

    // Division filter:
    // - public hook applies single division server-side
    // - if multiple divisions selected, apply OR locally
    const divs = Array.isArray(filters?.divisions) ? filters.divisions : [];
    if (divs.length > 0) {
      rows = rows.filter((r) => divs.includes(r?.school_division));
    }

    // Positions filter:
    // - public hook applies positions
    // - paid mode apply locally using position_ids if present
    if (paidEnabled && positionIds.length) {
      rows = rows.filter((r) => {
        const ids = Array.isArray(r?.position_ids) ? r.position_ids.map(String) : [];
        return positionIds.some((p) => ids.includes(String(p)));
      });
    }

    // Date range filter (both modes)
    const start = filters?.startDate ? parseISODate(filters.startDate) : NaN;
    const end = filters?.endDate ? parseISODate(filters.endDate) : NaN;

    if (Number.isFinite(start)) {
      rows = rows.filter((r) => {
        const t = parseISODate(r?.start_date);
        return Number.isFinite(t) ? t >= start : false;
      });
    }
    if (Number.isFinite(end)) {
      rows = rows.filter((r) => {
        const t = parseISODate(r?.start_date);
        return Number.isFinite(t) ? t <= end : false;
      });
    }

    return rows;
  }, [rawRows, paidEnabled, stateCode, filters, positionIds]);

  // ---------------- UI ----------------
  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="max-w-md mx-auto px-4 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Calendar</div>
            <div className="text-sm text-slate-600">
              {effectiveMode === "demo" ? `Demo season ${seasonYear}` : `Season ${seasonYear}`}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            No camps found for your current filters.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {filteredRows.map((row) => {
              // CampCard expects { camp, school, sport, positions }
              const camp = {
                id: row?.camp_id,
                camp_name: row?.camp_name,
                start_date: row?.start_date,
                end_date: row?.end_date,
                price: row?.price,
                link_url: row?.link_url,
                notes: row?.notes,
                city: row?.city,
                state: row?.state,
                position_ids: row?.position_ids
              };

              const school = {
                id: row?.school_id,
                school_name: row?.school_name,
                division: row?.school_division,
                school_division: row?.school_division,
                logo_url: row?.school_logo_url
              };

              const sport = {
                id: row?.sport_id,
                sport_name: row?.sport_name
              };

              return (
                <CampCard
                  key={String(row?.camp_id)}
                  camp={camp}
                  school={school}
                  sport={sport}
                  positions={[]} // optional; your summary includes position_codes, but CampCard expects objects—safe empty for now
                  isFavorite={false}
                  isRegistered={row?.intent_status === "registered"}
                  mode={effectiveMode}
                  disabledFavorite={effectiveMode === "demo"} // demo favorite actions should be wired separately (demoFavorites hook)
                  onFavoriteToggle={() => {}}
                  onClick={() => {
                    // If you have CampDetail, go there; otherwise open the camp link.
                    try {
                      const detail = createPageUrl("CampDetail");
                      nav(detail + `?id=${encodeURIComponent(String(row?.camp_id))}` + (forceDemo ? "&mode=demo" : ""));
                    } catch {
                      if (row?.link_url) window.open(row.link_url, "_blank", "noopener,noreferrer");
                    }
                  }}
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
    </div>
  );
}
