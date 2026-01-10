// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

/**
 * Calendar (stable compile version)
 * - Eliminates dependency on ../components/filters/FilterSheet(.jsx)
 * - Uses public summaries for both demo + paid (safe read-only calendar view)
 * - Inline filter panel (no shadcn Sheet/Select imports)
 */

const DIVISIONS = ["D1 (FBS)", "D1 (FCS)", "D2", "D3", "NAIA", "JUCO"];
const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

function safeStr(x) {
  if (x === undefined || x === null) return "";
  return String(x);
}

function normalizeDateStr(d) {
  // expects YYYY-MM-DD; if not, return ""
  const s = safeStr(d).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function inDateRange(d, start, end) {
  const dd = normalizeDateStr(d);
  if (!dd) return false;
  const s = normalizeDateStr(start);
  const e = normalizeDateStr(end);
  if (s && dd < s) return false;
  if (e && dd > e) return false;
  return true;
}

export default function Calendar() {
  const season = useSeasonAccess();
  const seasonYear = season?.seasonYear;

  const [filtersOpen, setFiltersOpen] = useState(false);

  // Inline filters (no external FilterSheet)
  const [sportId, setSportId] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [division, setDivision] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data, isLoading, isError } = usePublicCampSummariesClient({
    seasonYear,
    sportId: sportId || null,
    state: stateCode || null,
    division: division || null,
    positionIds: [],
    limit: 2000,
    enabled: !!seasonYear
  });

  const rows = Array.isArray(data) ? data : [];

  const filtered = useMemo(() => {
    // Public hook already filters by sport/state/division if passed.
    // Here we do only date-range client filtering for safety.
    const s = normalizeDateStr(startDate);
    const e = normalizeDateStr(endDate);

    if (!s && !e) return rows;

    return rows.filter((r) => inDateRange(r?.start_date, s, e));
  }, [rows, startDate, endDate]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const d = normalizeDateStr(r?.start_date) || "TBD";
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(r);
    }
    // sort by date asc; TBD last
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "TBD") return 1;
      if (b === "TBD") return -1;
      return a.localeCompare(b);
    });

    return keys.map((k) => ({
      date: k,
      items: map.get(k) || []
    }));
  }, [filtered]);

  const clearAll = () => {
    setSportId("");
    setStateCode("");
    setDivision("");
    setStartDate("");
    setEndDate("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 p-4 pb-24">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-deep-navy">Calendar</h1>
            <p className="text-sm text-slate-600 mt-1">
              Season: <span className="font-semibold">{seasonYear || "—"}</span>{" "}
              <span className="ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs">
                {season?.mode === "paid" ? "Paid" : "Demo"}
              </span>
            </p>
          </div>

          <Button variant="outline" onClick={() => setFiltersOpen((v) => !v)}>
            Filters
          </Button>
        </div>

        {/* Inline filter panel */}
        {filtersOpen && (
          <Card className="p-4 border-slate-200 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1">Sport ID</div>
                <Input
                  value={sportId}
                  onChange={(e) => setSportId(e.target.value)}
                  placeholder="(optional)"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1">State</div>
                <select
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={stateCode || ""}
                  onChange={(e) => setStateCode(e.target.value)}
                >
                  <option value="">All</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <div className="text-xs font-semibold text-slate-700 mb-1">Division</div>
                <select
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={division || ""}
                  onChange={(e) => setDivision(e.target.value)}
                >
                  <option value="">All</option>
                  {DIVISIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1">Start Date</div>
                <Input
                  type="date"
                  value={normalizeDateStr(startDate)}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1">End Date</div>
                <Input
                  type="date"
                  value={normalizeDateStr(endDate)}
                  min={normalizeDateStr(startDate) || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={clearAll}>
                Clear
              </Button>
              <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
                Apply
              </Button>
            </div>

            <div className="text-xs text-slate-500">
              Note: “Sport ID” is a temporary field (until SportSelector is wired into Calendar).
            </div>
          </Card>
        )}

        {/* Body */}
        {isLoading ? (
          <Card className="p-6 border-slate-200">
            <div className="text-sm text-slate-600">Loading camps…</div>
          </Card>
        ) : isError ? (
          <Card className="p-6 border-slate-200">
            <div className="text-sm text-rose-600">Failed to load camps.</div>
          </Card>
        ) : grouped.length === 0 ? (
          <Card className="p-6 border-slate-200">
            <div className="text-sm text-slate-600">No camps found for these filters.</div>
          </Card>
        ) : (
          <div className="space-y-3">
            {grouped.map((g) => (
              <Card key={g.date} className="p-4 border-slate-200">
                <div className="text-sm font-semibold text-slate-800 mb-3">
                  {g.date === "TBD" ? "TBD Dates" : g.date}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    ({g.items.length})
                  </span>
                </div>

                <div className="space-y-2">
                  {g.items.map((r) => (
                    <div
                      key={safeStr(r?.camp_id)}
                      className="rounded-md border border-slate-100 bg-white p-3"
                    >
                      <div className="text-sm font-semibold text-deep-navy truncate">
                        {r?.school_name || "Unknown School"}
                      </div>
                      <div className="text-sm text-slate-700 truncate">
                        {r?.camp_name || "Camp"}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {(r?.sport_name && `Sport: ${r.sport_name}`) || ""}
                        {(r?.school_division && ` • ${r.school_division}`) || ""}
                        {(r?.state && ` • ${r.state}`) || ""}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
