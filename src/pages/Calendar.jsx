// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";

import { createPageUrl } from "../utils";

// ✅ IMPORTANT: all your files are .jsx
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

// Paid summaries (athlete-scoped)
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";

// Public/demo summaries (year-scoped)
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

// ✅ FilterSheet is in src/components/filters/FilterSheet.jsx
import FilterSheet from "../components/filters/FilterSheet.jsx";

import BottomNav from "../components/navigation/BottomNav.jsx";
import CampCard from "../components/camps/CampCard.jsx";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { base44 } from "../api/base44Client";

/**
 * Calendar
 *
 * Best-practice intent:
 * - Demo mode: no auth/profile dependency; use public summaries
 * - Paid mode: requires auth + profile; use athlete summaries
 * - Never import .js paths when files are .jsx
 * - Centralize FilterSheet path correctly
 */

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

export default function Calendar() {
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const isPaid = season?.mode === "paid";
  const athleteId = isPaid ? (normId(athleteProfile) || athleteProfile?.id || null) : null;

  // UI state
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // --- Lookup lists for filters (optional, safe) ---
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sp = await base44.entities.Sport.list();
        if (mounted) setSports(asArray(sp));
      } catch {
        if (mounted) setSports([]);
      }
      try {
        const pos = await base44.entities.Position.list();
        if (mounted) setPositions(asArray(pos));
      } catch {
        if (mounted) setPositions([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Determine effective sport filter
  const sportId = useMemo(() => {
    const s = filters?.sport ? String(filters.sport) : "";
    return s || null;
  }, [filters?.sport]);

  // ---- Data: paid vs demo ----
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId,
    limit: 2000,
    enabled: Boolean(isPaid && athleteId)
  });

  const publicQuery = usePublicCampSummariesClient({
    seasonYear: season?.seasonYear,
    sportId,
    state: filters?.state || "",
    division: "", // division handled below after join in FilterSheet; keep simple here
    positionIds: asArray(filters?.positions).map(String),
    limit: 2000,
    enabled: Boolean(!isPaid && season?.seasonYear)
  });

  const rawRows = isPaid ? (paidQuery.data || []) : (publicQuery.data || []);

  // ---- Client-side filtering common to both shapes ----
  const rows = useMemo(() => {
    const divs = asArray(filters?.divisions);
    const pos = asArray(filters?.positions).map(String).filter(Boolean);
    const st = (filters?.state || "").trim();
    const start = (filters?.startDate || "").trim();
    const end = (filters?.endDate || "").trim();

    return (rawRows || []).filter((r) => {
      // state
      if (st && String(r?.state || "") !== st) return false;

      // division (only works if school_division present in summary)
      if (divs.length > 0) {
        const d = String(r?.school_division || "");
        if (!divs.includes(d)) return false;
      }

      // position filter: any overlap
      if (pos.length > 0) {
        const rPos = asArray(r?.position_ids).map(String);
        const hit = pos.some((p) => rPos.includes(p));
        if (!hit) return false;
      }

      // date range (string compare safe for YYYY-MM-DD)
      if (start) {
        const d = String(r?.start_date || "");
        if (!d || d < start) return false;
      }
      if (end) {
        const d = String(r?.start_date || "");
        if (!d || d > end) return false;
      }

      return true;
    });
  }, [rawRows, filters]);

  const loading = isPaid ? paidQuery.isLoading : publicQuery.isLoading;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-deep-navy">Calendar</h1>
            <p className="text-sm text-slate-600">
              {isPaid ? "Your season workspace" : "Demo calendar view"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isPaid && <Badge variant="outline">Demo</Badge>}
            <Button variant="outline" onClick={() => setFiltersOpen(true)}>
              Filters
            </Button>
          </div>
        </div>

        {loading ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-slate-600">Loading camps…</div>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-slate-600">No camps match your filters.</div>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" onClick={() => setFilters({ sport: "", state: "", divisions: [], positions: [], startDate: "", endDate: "" })}>
                Clear filters
              </Button>
              <Button onClick={() => window.location.assign(createPageUrl("Discover"))}>
                Go to Discover
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <CampCard
                key={String(r.camp_id)}
                camp={{
                  camp_name: r.camp_name,
                  start_date: r.start_date,
                  end_date: r.end_date,
                  price: r.price,
                  link_url: r.link_url,
                  notes: r.notes,
                  city: r.city,
                  state: r.state
                }}
                school={{
                  school_name: r.school_name,
                  division: r.school_division
                }}
                sport={{
                  name: r.sport_name
                }}
                positions={(r.position_codes || []).map((code) => ({ position_code: code }))}
                mode={isPaid ? "paid" : "demo"}
                disabledFavorite={!isPaid} // calendar doesn't write in demo
                isFavorite={false}
                isRegistered={r.intent_status === "registered"}
                onFavoriteToggle={() => {}}
                onClick={() => {
                  // If you have CampDetail, route there; otherwise Discover.
                  window.location.assign(createPageUrl("Discover"));
                }}
              />
            ))}
          </div>
        )}
      </div>

      <FilterSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onFilterChange={setFilters}
        positions={positions}
        sports={sports}
        onApply={() => setFiltersOpen(false)}
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
