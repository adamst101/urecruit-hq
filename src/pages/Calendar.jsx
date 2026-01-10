// src/pages/Calendar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, Filter, Lock } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";

// ✅ Always import hooks/components using .jsx in this repo
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useWriteGate } from "../components/hooks/useWriteGate.jsx";

// ✅ Your canonical paid summary hook (athlete-scoped)
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient.jsx";

// ✅ Your existing FilterSheet file (as you showed)
import FilterSheet from "../components/filters/FilterSheet.jsx";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

function safeStr(x) {
  if (x == null) return "";
  return String(x);
}

function toKey(d) {
  // YYYY-MM-DD
  try {
    const s = safeStr(d);
    if (!s) return "";
    return s.slice(0, 10);
  } catch {
    return "";
  }
}

export default function Calendar() {
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const season = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();
  const writeGate = useWriteGate();

  const forceDemo = useMemo(() => {
    try {
      return sp.get("mode") === "demo";
    } catch {
      return false;
    }
  }, [sp]);

  const mode = forceDemo ? "demo" : season.mode; // "demo" | "paid"

  // Calendar is viewable in demo, but paid data only exists when authed+profile.
  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // Filters (client-side)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filters, setFilters] = useState({
    sport: "",
    state: "",
    divisions: [],
    positions: [],
    startDate: "",
    endDate: ""
  });

  // If you have sports/positions entities, we can load them; keep resilient if not.
  const [sports, setSports] = useState([]);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await base44.entities.Sport?.list?.();
        if (mounted) setSports(Array.isArray(s) ? s : []);
      } catch {
        if (mounted) setSports([]);
      }
    })();
    (async () => {
      try {
        const p = await base44.entities.Position?.list?.();
        if (mounted) setPositions(Array.isArray(p) ? p : []);
      } catch {
        if (mounted) setPositions([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Paid summaries (if athleteId exists). In demo mode with no auth, this stays off.
  const { data: paidSummaries, isLoading: paidLoading } = useCampSummariesClient({
    athleteId,
    sportId: filters.sport || undefined,
    limit: 2000,
    enabled: !!athleteId && mode === "paid"
  });

  // Demo: calendar still renders, but without paid summaries.
  const rows = useMemo(() => {
    const src = Array.isArray(paidSummaries) ? paidSummaries : [];

    // Apply date filters client-side
    const sd = toKey(filters.startDate);
    const ed = toKey(filters.endDate);

    return src.filter((r) => {
      // state
      if (filters.state && safeStr(r.state) !== safeStr(filters.state)) return false;

      // division
      if (Array.isArray(filters.divisions) && filters.divisions.length > 0) {
        if (!filters.divisions.includes(safeStr(r.school_division))) return false;
      }

      // positions (any match)
      if (Array.isArray(filters.positions) && filters.positions.length > 0) {
        const ids = Array.isArray(r.position_ids) ? r.position_ids.map(String) : [];
        const want = filters.positions.map(String);
        if (!want.some((x) => ids.includes(x))) return false;
      }

      // date range (by start_date)
      const d = toKey(r.start_date);
      if (sd && d && d < sd) return false;
      if (ed && d && d > ed) return false;

      return true;
    });
  }, [paidSummaries, filters]);

  // Group by date for a simple “agenda” view
  const grouped = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const k = toKey(r.start_date) || "TBD";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    // Sort keys descending (latest first)
    const keys = Array.from(m.keys()).sort((a, b) => String(b).localeCompare(String(a)));
    return keys.map((k) => ({ dateKey: k, items: m.get(k) || [] }));
  }, [rows]);

  const headerRight = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setSheetOpen(true)}
        className="gap-2"
      >
        <Filter className="w-4 h-4" />
        Filters
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-md mx-auto px-4 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-slate-700" />
              <h1 className="text-xl font-bold text-deep-navy">Calendar</h1>
              {mode === "demo" && <Badge variant="outline">Demo</Badge>}
              {mode === "paid" && <Badge className="bg-emerald-600 text-white">Paid</Badge>}
            </div>
            <p className="text-sm text-slate-600 mt-1">
              View camps by date. Use filters to narrow down.
            </p>
          </div>
          {headerRight}
        </div>

        {/* Demo gating message (don’t break navigation; just explain) */}
        {mode === "demo" && !athleteId && (
          <Card className="p-4 border-slate-200 bg-white mb-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Lock className="w-5 h-5 text-slate-400" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-deep-navy">
                  Demo Calendar is read-only
                </div>
                <div className="text-sm text-slate-600 mt-1">
                  Sign in and complete an athlete profile to see your saved camps on the calendar.
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => nav(createPageUrl("Home") + `?signin=1&next=${encodeURIComponent(createPageUrl("Calendar"))}`)}
                  >
                    Sign in
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => nav(createPageUrl("Subscribe") + `?next=${encodeURIComponent(createPageUrl("Calendar"))}`)}
                  >
                    Upgrade
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Paid loading */}
        {mode === "paid" && athleteId && paidLoading && (
          <div className="text-sm text-slate-600 py-6">Loading calendar…</div>
        )}

        {/* Agenda list */}
        {mode === "paid" && athleteId && grouped.length === 0 && !paidLoading && (
          <Card className="p-6 border-slate-200 bg-white">
            <div className="text-center">
              <div className="text-lg font-semibold text-deep-navy">No camps found</div>
              <div className="text-sm text-slate-600 mt-1">
                Try clearing filters or adding camps from Discover.
              </div>
              <div className="mt-4 flex justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setFilters({ sport: "", state: "", divisions: [], positions: [], startDate: "", endDate: "" })}
                >
                  Clear filters
                </Button>
                <Button onClick={() => nav(createPageUrl("Discover"))}>Go to Discover</Button>
              </div>
            </div>
          </Card>
        )}

        {mode === "paid" && athleteId && grouped.length > 0 && (
          <div className="space-y-4">
            {grouped.map((g) => (
              <div key={g.dateKey}>
                <div className="text-xs font-semibold text-slate-500 mb-2">
                  {g.dateKey === "TBD" ? "TBD" : g.dateKey}
                </div>
                <div className="space-y-2">
                  {g.items.map((c) => (
                    <Card
                      key={String(c.camp_id)}
                      className="p-4 border-slate-200 bg-white cursor-pointer hover:shadow-sm transition"
                      onClick={() => {
                        trackEvent({
                          event_name: "calendar_camp_clicked",
                          camp_id: c.camp_id,
                          source: "calendar"
                        });
                        nav(createPageUrl("CampDetail") + `?id=${encodeURIComponent(String(c.camp_id))}`);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-deep-navy truncate">
                            {c.school_name || "Unknown School"}
                          </div>
                          <div className="text-sm text-slate-600 truncate">
                            {c.camp_name || "Camp"}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {c.school_division && (
                              <Badge className="bg-slate-900 text-white text-xs">
                                {c.school_division}
                              </Badge>
                            )}
                            {c.sport_name && (
                              <Badge variant="secondary" className="text-xs">
                                {c.sport_name}
                              </Badge>
                            )}
                            {c.state && (
                              <Badge variant="outline" className="text-xs">
                                {c.state}
                              </Badge>
                            )}
                            {c.is_target_school && (
                              <Badge className="bg-amber-500 text-white text-xs">
                                Target
                              </Badge>
                            )}
                          </div>
                        </div>

                        {c.intent_status && (
                          <Badge variant="outline" className="text-xs">
                            {c.intent_status}
                          </Badge>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <FilterSheet
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          filters={filters}
          onFilterChange={setFilters}
          positions={positions}
          sports={sports}
          onApply={() => {
            trackEvent({ event_name: "calendar_filters_applied", source: "calendar" });
            setSheetOpen(false);
          }}
          onClear={() => {
            trackEvent({ event_name: "calendar_filters_cleared", source: "calendar" });
            setFilters({ sport: "", state: "", divisions: [], positions: [], startDate: "", endDate: "" });
          }}
        />
      </div>

      <BottomNav />
    </div>
  );
}
