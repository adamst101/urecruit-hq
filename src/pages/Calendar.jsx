// src/pages/Calendar.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Filter } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import RouteGuard from "../components/auth/RouteGuard.jsx";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import FilterSheet from "../components/filters/FilterSheet.jsx";

// IMPORTANT: your repo is .jsx — never import .js here
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient.jsx";

function safeStr(x) {
  return x == null ? "" : String(x);
}

function inDateRange(d, start, end) {
  if (!d) return false;
  const s = safeStr(start);
  const e = safeStr(end);
  // Dates in your data are "YYYY-MM-DD" strings => string compare works.
  if (s && d < s) return false;
  if (e && d > e) return false;
  return true;
}

export default function Calendar() {
  const nav = useNavigate();
  const season = useSeasonAccess();
  const { athleteProfile, isLoading: athleteLoading } = useAthleteIdentity();

  const isPaid = season.mode === "paid";
  const athleteId = isPaid ? athleteProfile?.id || null : null;

  // Filters (shape matches FilterSheet)
  const [filters, setFilters] = useState({
    sport: "",
    divisions: [],
    positions: [],
    state: "",
    startDate: "",
    endDate: ""
  });

  const [filterOpen, setFilterOpen] = useState(false);

  // Load Sports/Positions for FilterSheet (best-effort; safe if entities don’t exist)
  const sportsQuery = useQuery({
    queryKey: ["sports_list"],
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const rows = await base44.entities.Sport.list?.();
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
        const rows = await base44.entities.Position.list?.();
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  // Paid calendar dataset (athlete-specific)
  const paidSummaries = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || undefined,
    enabled: isPaid && !!athleteId
  });

  // Demo/public calendar dataset (season-wide)
  const demoSummaries = usePublicCampSummariesClient({
    seasonYear: season.seasonYear,
    sportId: filters.sport || undefined,
    state: filters.state || undefined,
    division: (filters.divisions || [])[0] || undefined, // Calendar uses first division if multiple selected
    positionIds: filters.positions || [],
    enabled: !isPaid
  });

  // Choose source
  const source = isPaid ? paidSummaries : demoSummaries;
  const loading = season.isLoading || (isPaid && athleteLoading) || source.isLoading;

  const rows = useMemo(() => {
    const data = Array.isArray(source.data) ? source.data : [];

    // Normalize both sources into common fields
    const normalized = data.map((r) => ({
      camp_id: safeStr(r.camp_id),
      camp_name: r.camp_name || "Camp",
      start_date: r.start_date || null,
      end_date: r.end_date || null,
      city: r.city || null,
      state: r.state || null,
      price: typeof r.price === "number" ? r.price : null,
      link_url: r.link_url || null,

      school_name: r.school_name || "Unknown School",
      school_division: r.school_division || null,

      sport_name: r.sport_name || null
    }));

    // Apply date range client-side (both modes)
    const start = filters.startDate || "";
    const end = filters.endDate || "";

    const filtered = normalized.filter((x) => {
      if (start || end) {
        // include if start_date in range
        if (!inDateRange(x.start_date, start, end)) return false;
      }
      return true;
    });

    // Sort ascending by start_date
    filtered.sort((a, b) => safeStr(a.start_date).localeCompare(safeStr(b.start_date)));
    return filtered;
  }, [source.data, filters.startDate, filters.endDate]);

  const headerSubtitle = useMemo(() => {
    if (season.isLoading) return "";
    const label = isPaid ? "Paid Season Workspace" : "Demo Season Preview";
    return `${label} • Season ${season.seasonYear}`;
  }, [season.isLoading, season.seasonYear, isPaid]);

  return (
    <RouteGuard requireAuth={false} requirePaid={false} requireProfile={false}>
      <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 pb-24">
        <div className="max-w-md mx-auto p-4 space-y-4">
          {/* Header */}
          <Card className="p-4 border-slate-200">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-slate-600" />
                  <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
                </div>
                <div className="text-sm text-slate-600 mt-1">{headerSubtitle}</div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => setFilterOpen(true)}
                className="shrink-0"
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
              </Button>
            </div>

            {/* Paid but missing profile */}
            {isPaid && !season.isLoading && !athleteLoading && !athleteProfile && (
              <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                <div className="font-semibold">Complete your athlete profile to use Calendar</div>
                <div className="mt-1 text-amber-800">
                  Calendar uses your athlete context (sport/positions/targets).
                </div>
                <Button
                  className="mt-3 w-full"
                  onClick={() => nav(createPageUrl("Profile") + `?next=${encodeURIComponent(createPageUrl("Calendar"))}`)}
                >
                  Go to Profile
                </Button>
              </div>
            )}
          </Card>

          {/* Content */}
          {loading ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-600">Loading camps…</div>
            </Card>
          ) : rows.length === 0 ? (
            <Card className="p-4 border-slate-200">
              <div className="text-sm text-slate-600">No camps match your current filters.</div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setFilterOpen(true)}>
                  Adjust Filters
                </Button>
                <Button
                  className="flex-1"
                  onClick={() =>
                    setFilters({
                      sport: "",
                      divisions: [],
                      positions: [],
                      state: "",
                      startDate: "",
                      endDate: ""
                    })
                  }
                >
                  Clear
                </Button>
              </div>
            </Card>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <Card
                  key={r.camp_id}
                  className="p-4 border-slate-200 bg-white hover:shadow-sm transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {r.school_division && (
                          <Badge className="bg-slate-900 text-white text-xs">
                            {r.school_division}
                          </Badge>
                        )}
                        {r.sport_name && (
                          <span className="text-xs text-slate-500 font-medium">
                            {r.sport_name}
                          </span>
                        )}
                        {!isPaid && (
                          <Badge variant="outline" className="text-xs">
                            Demo
                          </Badge>
                        )}
                      </div>

                      <div className="text-lg font-semibold text-deep-navy truncate mt-1">
                        {r.school_name}
                      </div>
                      <div className="text-sm text-slate-600 truncate">{r.camp_name}</div>

                      <div className="text-sm text-slate-600 mt-2">
                        <span className="font-medium">{r.start_date || "TBD"}</span>
                        {r.end_date && r.end_date !== r.start_date ? ` – ${r.end_date}` : ""}
                        {(r.city || r.state) ? (
                          <span className="ml-2 text-slate-500">
                            • {[r.city, r.state].filter(Boolean).join(", ")}
                          </span>
                        ) : null}
                      </div>

                      {typeof r.price === "number" && (
                        <div className="text-sm text-slate-600 mt-1">
                          Price: {r.price > 0 ? `$${r.price}` : "Free"}
                        </div>
                      )}
                    </div>

                    {r.link_url ? (
                      <Button
                        variant="outline"
                        onClick={() => window.open(r.link_url, "_blank", "noopener,noreferrer")}
                        className="shrink-0"
                      >
                        View
                      </Button>
                    ) : null}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Filter Sheet */}
        <FilterSheet
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onFilterChange={setFilters}
          positions={positionsQuery.data || []}
          sports={sportsQuery.data || []}
          onApply={() => setFilterOpen(false)}
          onClear={() => {
            setFilters({
              sport: "",
              divisions: [],
              positions: [],
              state: "",
              startDate: "",
              endDate: ""
            });
            setFilterOpen(false);
          }}
        />
      </div>
    </RouteGuard>
  );
}
