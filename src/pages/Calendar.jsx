// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useDemoProfile } from "../components/hooks/useDemoProfile";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import BottomNav from "../components/navigation/BottomNav";

// ---------- small helpers ----------
function safeStr(x) {
  if (x == null) return "";
  return String(x);
}
function ymd(d) {
  try {
    if (!d) return "";
    return String(d).slice(0, 10);
  } catch {
    return "";
  }
}
function clampDate(v) {
  const s = safeStr(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// ---------- inline filter UI (NO IMPORTS) ----------
function InlineFilterPanel({
  open,
  onClose,
  filters,
  setFilters,
  onApply,
  onClear,
  modeLabel
}) {
  if (!open) return null;

  const DIVISIONS = ["D1 (FBS)", "D1 (FCS)", "D2", "D3", "NAIA", "JUCO"];
  const STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
    "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
    "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
  ];

  const startDate = clampDate(filters?.startDate);
  const endDate = clampDate(filters?.endDate);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-deep-navy">Filters</div>
            <div className="text-xs text-slate-500">{modeLabel}</div>
          </div>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>

        <div className="mt-4 space-y-4">
          {/* State */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-1">State</div>
            <select
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={filters?.state || ""}
              onChange={(e) => setFilters((p) => ({ ...p, state: e.target.value }))}
            >
              <option value="">All States</option>
              {STATES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* Division */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-1">Division</div>
            <select
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={filters?.division || ""}
              onChange={(e) => setFilters((p) => ({ ...p, division: e.target.value }))}
            >
              <option value="">All Divisions</option>
              {DIVISIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm font-medium text-slate-700 mb-1">Start</div>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const v = clampDate(e.target.value);
                  setFilters((p) => {
                    const nextEnd = p?.endDate && v && p.endDate < v ? "" : p.endDate;
                    return { ...p, startDate: v, endDate: nextEnd };
                  });
                }}
              />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700 mb-1">End</div>
              <Input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => {
                  const v = clampDate(e.target.value);
                  setFilters((p) => {
                    if (p?.startDate && v && v < p.startDate) return { ...p, endDate: "" };
                    return { ...p, endDate: v };
                  });
                }}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button className="flex-1" variant="outline" onClick={onClear}>
              Clear
            </Button>
            <Button className="flex-1 bg-electric-blue hover:bg-deep-navy" onClick={onApply}>
              Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Calendar() {
  const season = useSeasonAccess();
  const { loaded: demoLoaded, demoProfile } = useDemoProfile();

  const [filters, setFilters] = useState({
    // These map directly into public summaries hook
    sportId: "",
    state: "",
    division: "",
    positionIds: [],
    startDate: "",
    endDate: ""
  });

  const [filtersOpen, setFiltersOpen] = useState(false);

  // If in demo mode, seed a couple filters from demoProfile (non-destructive)
  const effectiveFilters = useMemo(() => {
    const base = { ...filters };

    // Only apply demo profile hints if user hasn't already set something
    if (season.mode !== "paid" && demoLoaded && demoProfile) {
      if (!base.state && demoProfile.state) base.state = demoProfile.state;
      if (!base.division && demoProfile.division) base.division = demoProfile.division;

      // sport_id in demoProfile is stored as id-like value
      if (!base.sportId && demoProfile.sport_id) base.sportId = String(demoProfile.sport_id);

      if (
        (!Array.isArray(base.positionIds) || base.positionIds.length === 0) &&
        Array.isArray(demoProfile.position_ids) &&
        demoProfile.position_ids.length > 0
      ) {
        base.positionIds = demoProfile.position_ids.map(String);
      }
    }

    return base;
  }, [filters, season.mode, demoLoaded, demoProfile]);

  const { data: rows, isLoading, isError } = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: effectiveFilters.sportId || null,
    state: effectiveFilters.state || null,
    division: effectiveFilters.division || null,
    positionIds: effectiveFilters.positionIds || [],
    limit: 800,
    enabled: true
  });

  // Client-side date range filter (because Base44 date operators vary)
  const visible = useMemo(() => {
    const arr = Array.isArray(rows) ? rows : [];
    const s = clampDate(effectiveFilters.startDate);
    const e = clampDate(effectiveFilters.endDate);
    if (!s && !e) return arr;

    return arr.filter((c) => {
      const d = ymd(c?.start_date);
      if (!d) return false;
      if (s && d < s) return false;
      if (e && d > e) return false;
      return true;
    });
  }, [rows, effectiveFilters.startDate, effectiveFilters.endDate]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of visible) {
      const key = ymd(c?.start_date) || "TBD";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    // Sort keys ascending with TBD last
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "TBD") return 1;
      if (b === "TBD") return -1;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ date: k, camps: map.get(k) || [] }));
  }, [visible]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-20">
      <div className="max-w-md mx-auto p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Calendar</div>
            <div className="text-sm text-slate-600">
              Season {season.seasonYear} •{" "}
              {season.mode === "paid" ? (
                <Badge className="bg-emerald-600 text-white">Paid</Badge>
              ) : (
                <Badge variant="outline">Demo</Badge>
              )}
            </div>
          </div>

          <Button variant="outline" onClick={() => setFiltersOpen(true)}>
            Filters
          </Button>
        </div>

        <InlineFilterPanel
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          filters={effectiveFilters}
          setFilters={setFilters}
          modeLabel={season.mode === "paid" ? "Paid workspace" : "Demo browsing"}
          onApply={() => setFiltersOpen(false)}
          onClear={() => {
            setFilters({
              sportId: "",
              state: "",
              division: "",
              positionIds: [],
              startDate: "",
              endDate: ""
            });
            setFiltersOpen(false);
          }}
        />

        <div className="mt-4">
          {isLoading && (
            <div className="text-sm text-slate-600">Loading camps…</div>
          )}

          {isError && (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-700 font-medium">Couldn’t load camps.</div>
              <div className="text-xs text-slate-500 mt-1">
                This is usually a Base44 filter/operator mismatch. We can harden it next.
              </div>
            </Card>
          )}

          {!isLoading && !isError && grouped.length === 0 && (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-700 font-medium">No camps found.</div>
              <div className="text-xs text-slate-500 mt-1">
                Try clearing filters or expanding the date range.
              </div>
              <div className="mt-3">
                <Button
                  variant="outline"
                  onClick={() =>
                    setFilters({
                      sportId: "",
                      state: "",
                      division: "",
                      positionIds: [],
                      startDate: "",
                      endDate: ""
                    })
                  }
                >
                  Clear Filters
                </Button>
              </div>
            </Card>
          )}

          {!isLoading && !isError && grouped.length > 0 && (
            <div className="space-y-4">
              {grouped.map((g) => (
                <div key={g.date}>
                  <div className="text-sm font-semibold text-slate-700 mb-2">
                    {g.date === "TBD" ? "Date TBD" : g.date}
                  </div>

                  <div className="space-y-2">
                    {g.camps.map((c) => (
                      <Card key={c.camp_id} className="p-3 border-slate-200 bg-white">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-deep-navy truncate">
                              {c.school_name || "Unknown School"}
                            </div>
                            <div className="text-xs text-slate-600 truncate">
                              {c.camp_name || "Camp"}
                            </div>
                            <div className="mt-1 flex items-center gap-2 flex-wrap">
                              {c.school_division && (
                                <Badge className="bg-slate-900 text-white text-xs">
                                  {c.school_division}
                                </Badge>
                              )}
                              {c.sport_name && (
                                <span className="text-xs text-slate-500">{c.sport_name}</span>
                              )}
                              {c.state && (
                                <span className="text-xs text-slate-500">{c.state}</span>
                              )}
                            </div>
                          </div>

                          {season.mode !== "paid" && (
                            <Badge variant="outline" className="text-xs">Demo</Badge>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
