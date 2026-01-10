// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.js";
import { useAthleteIdentity } from "../components/useAthleteIdentity.js";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.js";

// ---------- helpers ----------
function safeStr(x) {
  if (x === undefined || x === null) return "";
  return String(x);
}

function toDateKey(d) {
  // Expect "YYYY-MM-DD" or ISO; normalize to "YYYY-MM-DD" if possible
  try {
    if (!d) return "";
    const s = String(d);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) return "";
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

function inRange(dateKey, startDate, endDate) {
  if (!dateKey) return false;
  if (startDate && dateKey < startDate) return false;
  if (endDate && dateKey > endDate) return false;
  return true;
}

export default function Calendar() {
  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const [filterOpen, setFilterOpen] = useState(false);

  // Keep FilterSheet contract stable
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: "",
  });

  // Optional: populate sport/position picklists for FilterSheet (safe best-effort)
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const s = await base44.entities.Sport.list();
        if (mounted) setSports(Array.isArray(s) ? s : []);
      } catch {
        if (mounted) setSports([]);
      }
    })();

    (async () => {
      try {
        const p = await base44.entities.Position.list();
        if (mounted) setPositions(Array.isArray(p) ? p : []);
      } catch {
        if (mounted) setPositions([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const isPaid = season.mode === "paid" && !!season.accountId;
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // Paid data (only meaningful if athlete exists)
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport ? String(filters.sport) : undefined,
    enabled: isPaid && !!athleteId,
    limit: 2000,
  });

  // Public/demo data
  const demoDivision =
    Array.isArray(filters.divisions) && filters.divisions.length > 0
      ? String(filters.divisions[0])
      : "";

  const demoQuery = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: filters.sport ? String(filters.sport) : null,
    state: filters.state ? String(filters.state) : null,
    division: demoDivision || null,
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    enabled: !isPaid, // demo/unauth uses public summaries
    limit: 2000,
  });

  const loading =
    season.isLoading ||
    (isPaid ? paidQuery.isLoading : demoQuery.isLoading);

  const rawRows = useMemo(() => {
    const rows = isPaid ? paidQuery.data : demoQuery.data;
    return Array.isArray(rows) ? rows : [];
  }, [isPaid, paidQuery.data, demoQuery.data]);

  // Normalize to one shape
  const rows = useMemo(() => {
    const startDate = safeStr(filters.startDate);
    const endDate = safeStr(filters.endDate);

    const normalized = rawRows.map((r) => {
      const start_key = toDateKey(r.start_date);
      const end_key = toDateKey(r.end_date);

      return {
        camp_id: safeStr(r.camp_id || r.id),
        camp_name: r.camp_name || "Camp",
        start_date: r.start_date || null,
        end_date: r.end_date || null,
        start_key,
        end_key,

        city: r.city || null,
        state: r.state || null,

        school_id: r.school_id ? safeStr(r.school_id) : null,
        school_name: r.school_name || "Unknown School",
        school_division: r.school_division || null,

        sport_id: r.sport_id ? safeStr(r.sport_id) : null,
        sport_name: r.sport_name || null,

        intent_status: r.intent_status || null,
        is_target_school: !!r.is_target_school,
      };
    });

    // Apply date range filter (client-side, works for both paid/demo)
    const filtered = normalized.filter((r) => {
      if (!startDate && !endDate) return true;
      if (!r.start_key) return false;
      return inRange(r.start_key, startDate, endDate);
    });

    // Sort descending by start date
    filtered.sort((a, b) => String(b.start_key).localeCompare(String(a.start_key)));
    return filtered;
  }, [rawRows, filters.startDate, filters.endDate]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = r.start_key || "TBD";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    // Convert to array sorted desc; keep TBD last
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "TBD") return 1;
      if (b === "TBD") return -1;
      return String(b).localeCompare(String(a));
    });
    return keys.map((k) => ({ dateKey: k, items: map.get(k) || [] }));
  }, [rows]);

  const onApply = () => setFilterOpen(false);
  const onClear = () => {
    setFilters({
      sport: "",
      state: "",
      divisions: [],
      positions: [],
      startDate: "",
      endDate: "",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
      <div className="max-w-md mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {isPaid ? "Paid" : "Demo"}
              </Badge>
              <span className="text-xs text-slate-500">
                Season {season.seasonYear}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => setFilterOpen(true)}
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            Filters
          </Button>
        </div>

        {loading ? (
          <Card className="p-4 border-slate-200">
            <div className="text-sm text-slate-600">Loading camps…</div>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-6 border-slate-200">
            <div className="text-sm text-slate-700 font-medium">No camps found.</div>
            <div className="text-xs text-slate-500 mt-1">
              Try clearing filters or widening your date range.
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.dateKey} className="space-y-2">
                <div className="text-xs font-semibold text-slate-600">
                  {g.dateKey === "TBD" ? "TBD" : g.dateKey}
                </div>

                <div className="space-y-2">
                  {g.items.map((c) => (
                    <Card key={c.camp_id} className="p-4 border-slate-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {c.school_division && (
                              <Badge className="bg-slate-900 text-white text-xs">
                                {c.school_division}
                              </Badge>
                            )}
                            {c.sport_name && (
                              <span className="text-xs text-slate-500 font-medium">
                                {c.sport_name}
                              </span>
                            )}
                            {c.intent_status && (
                              <Badge variant="secondary" className="text-xs">
                                {c.intent_status}
                              </Badge>
                            )}
                            {c.is_target_school && (
                              <Badge variant="outline" className="text-xs">
                                Target
                              </Badge>
                            )}
                          </div>

                          <div className="mt-1 text-base font-semibold text-deep-navy truncate">
                            {c.school_name}
                          </div>
                          <div className="text-sm text-slate-600 truncate">
                            {c.camp_name}
                          </div>

                          {(c.city || c.state) && (
                            <div className="text-xs text-slate-500 mt-1">
                              {[c.city, c.state].filter(Boolean).join(", ")}
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-slate-500 text-right">
                          {c.start_key || "TBD"}
                        </div>
                      </div>
                    </Card>
                  ))}
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
        onApply={onApply}
        onClear={onClear}
      />

      <BottomNav />
    </div>
  );
}
