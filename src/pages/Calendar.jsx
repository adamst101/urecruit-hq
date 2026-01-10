// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Filter, X } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

// --- constants (kept local so we don't depend on FilterSheet file) ---
const DIVISIONS = ["D1 (FBS)", "D1 (FCS)", "D2", "D3", "NAIA", "JUCO"];
const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

// ---------- helpers ----------
function safeStr(x) {
  if (x === undefined || x === null) return "";
  return String(x);
}
function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}
function toDateKey(d) {
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

  // Local filters (native UI to avoid missing component imports)
  const [filters, setFilters] = useState({
    sport: "",        // sport id
    state: "",        // state code
    division: "",     // single division
    positions: [],    // array of position ids (strings)
    startDate: "",
    endDate: "",
  });

  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  // best-effort lists
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const s = await base44.entities.Sport.list();
        if (!mounted) return;
        const arr = Array.isArray(s) ? s : [];
        arr.sort((a, b) =>
          String(a?.name || a?.sport_name || "").localeCompare(
            String(b?.name || b?.sport_name || "")
          )
        );
        setSports(arr);
      } catch {
        if (mounted) setSports([]);
      }
    })();

    (async () => {
      try {
        const p = await base44.entities.Position.list();
        if (!mounted) return;
        const arr = Array.isArray(p) ? p : [];
        arr.sort((a, b) =>
          String(a?.position_code || a?.code || "").localeCompare(
            String(b?.position_code || b?.code || "")
          )
        );
        setPositions(arr);
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

  // Paid data
  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId: filters.sport ? String(filters.sport) : undefined,
    enabled: isPaid && !!athleteId,
    limit: 2000,
  });

  // Demo/public data
  const demoQuery = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: filters.sport ? String(filters.sport) : null,
    state: filters.state ? String(filters.state) : null,
    division: filters.division ? String(filters.division) : null,
    positionIds: Array.isArray(filters.positions) ? filters.positions : [],
    enabled: !isPaid,
    limit: 2000,
  });

  const loading =
    season.isLoading || (isPaid ? paidQuery.isLoading : demoQuery.isLoading);

  const rawRows = useMemo(() => {
    const rows = isPaid ? paidQuery.data : demoQuery.data;
    return Array.isArray(rows) ? rows : [];
  }, [isPaid, paidQuery.data, demoQuery.data]);

  const rows = useMemo(() => {
    const startDate = safeStr(filters.startDate);
    const endDate = safeStr(filters.endDate);

    const normalized = rawRows.map((r) => {
      const start_key = toDateKey(r.start_date);
      return {
        camp_id: safeStr(r.camp_id || r.id),
        camp_name: r.camp_name || "Camp",
        start_date: r.start_date || null,
        end_date: r.end_date || null,
        start_key,

        city: r.city || null,
        state: r.state || null,

        school_name: r.school_name || "Unknown School",
        school_division: r.school_division || null,

        sport_name: r.sport_name || null,

        intent_status: r.intent_status || null,
        is_target_school: !!r.is_target_school,
      };
    });

    // Date range filter (client-side for both modes)
    const filtered = normalized.filter((r) => {
      if (!startDate && !endDate) return true;
      if (!r.start_key) return false;
      return inRange(r.start_key, startDate, endDate);
    });

    // Sort desc
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
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "TBD") return 1;
      if (b === "TBD") return -1;
      return String(b).localeCompare(String(a));
    });
    return keys.map((k) => ({ dateKey: k, items: map.get(k) || [] }));
  }, [rows]);

  const clearAll = () => {
    setFilters({
      sport: "",
      state: "",
      division: "",
      positions: [],
      startDate: "",
      endDate: "",
    });
  };

  const togglePosition = (id) => {
    const pid = String(id);
    setFilters((prev) => {
      const cur = Array.isArray(prev.positions) ? prev.positions : [];
      const next = cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid];
      return { ...prev, positions: next };
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
              <span className="text-xs text-slate-500">Season {season.seasonYear}</span>
            </div>
          </div>

          <Button variant="outline" onClick={() => setFilterOpen(true)} className="gap-2">
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
                          <div className="text-sm text-slate-600 truncate">{c.camp_name}</div>

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

      {/* Inline filter modal (no external FilterSheet file) */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setFilterOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl border border-slate-200 p-4 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-deep-navy">Filter Camps</div>
              <Button variant="ghost" size="icon" onClick={() => setFilterOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="mt-4 space-y-5">
              {/* Sport */}
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-2">Sport</div>
                <select
                  className="w-full border border-slate-200 rounded-md p-2 text-sm"
                  value={filters.sport || ""}
                  onChange={(e) => setFilters((p) => ({ ...p, sport: e.target.value }))}
                >
                  <option value="">All Sports</option>
                  {sports.map((s) => {
                    const id = normId(s);
                    const name = s?.sport_name || s?.name || "Sport";
                    if (!id) return null;
                    return (
                      <option key={String(id)} value={String(id)}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Division */}
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-2">Division</div>
                <select
                  className="w-full border border-slate-200 rounded-md p-2 text-sm"
                  value={filters.division || ""}
                  onChange={(e) => setFilters((p) => ({ ...p, division: e.target.value }))}
                >
                  <option value="">All Divisions</option>
                  {DIVISIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* State */}
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-2">State</div>
                <select
                  className="w-full border border-slate-200 rounded-md p-2 text-sm"
                  value={filters.state || ""}
                  onChange={(e) => setFilters((p) => ({ ...p, state: e.target.value }))}
                >
                  <option value="">All States</option>
                  {STATES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              {/* Positions */}
              {positions.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-600 mb-2">Positions</div>
                  <div className="grid grid-cols-2 gap-2">
                    {positions.slice(0, 30).map((pos) => {
                      const id = normId(pos);
                      if (!id) return null;
                      const label = pos?.position_code || pos?.code || pos?.position_name || "POS";
                      const checked = (filters.positions || []).includes(String(id));
                      return (
                        <label
                          key={String(id)}
                          className="flex items-center gap-2 text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePosition(id)}
                          />
                          <span className="truncate">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                  {positions.length > 30 && (
                    <div className="text-xs text-slate-500 mt-2">
                      Showing first 30 positions.
                    </div>
                  )}
                </div>
              )}

              {/* Date Range */}
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-2">Date Range</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[11px] text-slate-500 mb-1">Start</div>
                    <input
                      type="date"
                      className="w-full border border-slate-200 rounded-md p-2 text-sm"
                      value={filters.startDate || ""}
                      onChange={(e) => {
                        const v = e.target.value || "";
                        setFilters((p) => {
                          const end = p.endDate && v && p.endDate < v ? "" : p.endDate;
                          return { ...p, startDate: v, endDate: end };
                        });
                      }}
                    />
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 mb-1">End</div>
                    <input
                      type="date"
                      className="w-full border border-slate-200 rounded-md p-2 text-sm"
                      min={filters.startDate || undefined}
                      value={filters.endDate || ""}
                      onChange={(e) => {
                        const v = e.target.value || "";
                        setFilters((p) => {
                          if (p.startDate && v && v < p.startDate) return { ...p, endDate: "" };
                          return { ...p, endDate: v };
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={clearAll}>
                Clear All
              </Button>
              <Button className="flex-1" onClick={() => setFilterOpen(false)}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
