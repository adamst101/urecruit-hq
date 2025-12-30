import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";

import BottomNav from "../components/navigation/BottomNav";

import { ChevronLeft, ChevronRight, AlertCircle, Loader2 } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek
} from "date-fns";

import { useAthleteIdentity } from "../components/useAthleteIdentity";

export default function Calendar() {
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [sportFilter, setSportFilter] = useState("all");

  // -----------------------------
  // Identity (hook must ALWAYS run)
  // -----------------------------
  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError,
    error: identityErrorObj
  } = useAthleteIdentity();

  const clean = (v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "string" && v.trim() === "") return undefined;
    return v;
  };

  const athleteId = clean(athleteProfile?.id);
  const athleteSportId = clean(athleteProfile?.sport_id);

  // -----------------------------
  // Client-side summaries adapter (hook must ALWAYS run)
  // Mirrors MyCamps exactly; uses enabled flag to defer until athleteId exists.
  // -----------------------------
  const {
    data: campSummaries = [],
    isLoading: campsLoading,
    isError: campsError,
    error: campsErrorObj
  } = useQuery({
    queryKey: ["myCampsSummaries_client", athleteId, athleteSportId],
    enabled: !!athleteId && !identityLoading && !identityError,
    retry: false,
    queryFn: async () => {
      const payload = {
        athlete_id: athleteId,
        sport_id: athleteSportId,
        limit: 500
      };

      // Camps (optionally by sport)
      const campQuery = {};
      if (payload.sport_id) campQuery.sport_id = payload.sport_id;

      const camps = await base44.entities.Camp.filter(
        campQuery,
        "-start_date",
        payload.limit || 500
      );

      // Batch join: School / Sport / Position
      const schoolIds = [...new Set(camps.map((c) => c.school_id).filter(Boolean))];
      const sportIds = [...new Set(camps.map((c) => c.sport_id).filter(Boolean))];

      const [schools, sports, positions] = await Promise.all([
        schoolIds.length
          ? base44.entities.School.filter({ id: { $in: schoolIds } })
          : Promise.resolve([]),
        sportIds.length
          ? base44.entities.Sport.filter({ id: { $in: sportIds } })
          : Promise.resolve([]),
        base44.entities.Position.list()
      ]);

      const schoolMap = Object.fromEntries(schools.map((s) => [s.id, s]));
      const sportMap = Object.fromEntries(sports.map((s) => [s.id, s]));
      const positionMap = Object.fromEntries(positions.map((p) => [p.id, p]));

      // Athlete-specific: CampIntent + TargetSchool
      const [intents, targets] = await Promise.all([
        base44.entities.CampIntent.filter({ athlete_id: payload.athlete_id }),
        base44.entities.TargetSchool.filter({ athlete_id: payload.athlete_id })
      ]);

      const intentMap = Object.fromEntries(intents.map((i) => [i.camp_id, i]));
      const targetSchoolIds = new Set(targets.map((t) => t.school_id));

      // Summaries
      return camps.map((camp) => {
        const school = schoolMap[camp.school_id];
        const sport = sportMap[camp.sport_id];
        const intent = intentMap[camp.id] || null;
        const campPositions = (camp.position_ids || [])
          .map((pid) => positionMap[pid])
          .filter(Boolean);

        return {
          camp_id: camp.id,
          camp_name: camp.camp_name,
          start_date: camp.start_date,
          end_date: camp.end_date,
          price: camp.price,
          link_url: camp.link_url,
          notes: camp.notes,
          city: camp.city,
          state: camp.state,
          position_ids: camp.position_ids || [],
          position_codes: campPositions.map((p) => p.position_code),

          school_id: school?.id,
          school_name: school?.school_name,
          school_division: school?.division,
          school_logo_url: school?.logo_url,
          school_city: school?.city,
          school_state: school?.state,
          school_conference: school?.conference,

          sport_id: sport?.id,
          sport_name: sport?.sport_name,

          intent_status: intent?.status || null,
          intent_priority: intent?.priority || null,
          is_target_school: targetSchoolIds.has(camp.school_id)
        };
      });
    }
  });

  // -----------------------------
  // Derived lists (hooks must ALWAYS run)
  // -----------------------------
  const sortedSummaries = useMemo(() => {
    const list = Array.isArray(campSummaries) ? [...campSummaries] : [];
    list.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return list;
  }, [campSummaries]);

  const { registeredCamps, favoriteCamps } = useMemo(() => {
    let registered = sortedSummaries.filter(
      (c) => c.intent_status === "registered" || c.intent_status === "completed"
    );
    let favorite = sortedSummaries.filter((c) => c.intent_status === "favorite");

    if (sportFilter !== "all") {
      registered = registered.filter((c) => c.sport_id === sportFilter);
      favorite = favorite.filter((c) => c.sport_id === sportFilter);
    }

    return { registeredCamps: registered, favoriteCamps: favorite };
  }, [sortedSummaries, sportFilter]);

  // -----------------------------
  // Calendar grid
  // -----------------------------
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getCampsForDay = (date) => {
    const registered = registeredCamps.filter((summary) => {
      const start = new Date(summary.start_date);
      const end = summary.end_date ? new Date(summary.end_date) : start;
      return date >= start && date <= end;
    });

    const favorite = favoriteCamps.filter((summary) => {
      const start = new Date(summary.start_date);
      const end = summary.end_date ? new Date(summary.end_date) : start;
      return date >= start && date <= end;
    });

    const hasConflict = registered.length > 1;

    return { registered, favorite, hasConflict };
  };

  const handleDateClick = (date) => {
    const { registered, favorite } = getCampsForDay(date);
    if (registered.length > 0 || favorite.length > 0) {
      setSelectedDate(date);
    }
  };

  const selectedDateCamps = selectedDate ? getCampsForDay(selectedDate) : null;

  // -----------------------------
  // NOW it is safe to guard rendering
  // -----------------------------
  if (identityLoading) return null;

  if (identityError) {
    return (
      <div className="p-6 text-rose-700">
        Failed to load athlete profile: {String(identityErrorObj?.message || identityErrorObj)}
      </div>
    );
  }

  if (!athleteProfile) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <h1 className="text-2xl font-bold text-deep-navy mb-4">Camp Calendar</h1>

          {campsError && (
            <div className="mt-3 bg-white border border-rose-200 text-rose-700 rounded-xl p-3">
              <div className="font-semibold">Failed to load camps</div>
              <div className="text-xs break-words mt-1">
                {String(campsErrorObj?.message || campsErrorObj)}
              </div>
            </div>
          )}

          {/* Sport Filter */}
          <Select value={sportFilter} onValueChange={setSportFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Sports" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sports</SelectItem>
              {(sportFilter === "all"
                ? // if MyCamps filtered by athleteSportId, sports list may be incomplete.
                  // This calendar still uses the summary-derived sport list when needed:
                  [...new Map(sortedSummaries.map((s) => [s.sport_id, { id: s.sport_id, sport_name: s.sport_name }])).values()]
                : [...new Map(sortedSummaries.map((s) => [s.sport_id, { id: s.sport_id, sport_name: s.sport_name }])).values()]
              )
                .filter((s) => s?.id)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.sport_name || "Sport"}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Calendar */}
      <div className="max-w-md mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Month Navigation */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-bold text-deep-navy">
              {format(currentDate, "MMMM yyyy")}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-slate-600">Registered</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full border-2 border-rose-400 bg-white" />
              <span className="text-slate-600">Favorite</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3 text-red-500" />
              <span className="text-slate-600">Conflict</span>
            </div>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 border-b border-slate-100">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
              <div key={idx} className="p-2 text-center text-xs font-semibold text-slate-500">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const { registered, favorite, hasConflict } = getCampsForDay(day);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentDate);
              const hasCamps = registered.length > 0 || favorite.length > 0;

              return (
                <button
                  key={idx}
                  onClick={() => handleDateClick(day)}
                  disabled={!hasCamps}
                  className={cn(
                    "min-h-[60px] p-1.5 border-r border-b border-slate-100 transition-colors",
                    !isCurrentMonth && "bg-slate-50",
                    isToday && "bg-electric-blue/10 ring-1 ring-electric-blue",
                    hasCamps && "hover:bg-slate-100 cursor-pointer",
                    !hasCamps && "cursor-default"
                  )}
                >
                  <div
                    className={cn(
                      "text-sm font-medium mb-1",
                      isToday && "text-electric-blue font-bold",
                      !isCurrentMonth && "text-slate-400",
                      isCurrentMonth && !isToday && "text-slate-700"
                    )}
                  >
                    {format(day, "d")}
                  </div>

                  <div className="space-y-0.5">
                    {registered.length > 0 && (
                      <div className="w-full h-1.5 bg-emerald-500 rounded-full" />
                    )}
                    {favorite.length > 0 && (
                      <div className="w-full h-1.5 border-2 border-rose-400 rounded-full" />
                    )}
                    {hasConflict && (
                      <AlertCircle className="w-3 h-3 text-red-500 mx-auto" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional: loading state below the calendar */}
        {campsLoading && (
          <div className="mt-3 flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading camps…
          </div>
        )}
      </div>

      {/* Date Detail Sheet */}
      <Sheet open={!!selectedDate} onOpenChange={() => setSelectedDate(null)}>
        <SheetContent side="bottom" className="h-[60vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedDate && format(selectedDate, "MMMM d, yyyy")}</SheetTitle>
          </SheetHeader>

          {selectedDateCamps && (
            <div className="space-y-4 py-6">
              {selectedDateCamps.hasConflict && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-700">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    Schedule Conflict - Multiple registered camps on this date
                  </span>
                </div>
              )}

              {selectedDateCamps.registered.map((summary) => (
                <button
                  key={`reg-${summary.camp_id}`}
                  onClick={() => {
                    setSelectedDate(null);
                    navigate(createPageUrl(`CampDetail?id=${summary.camp_id}`));
                  }}
                  className="w-full text-left p-4 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="bg-emerald-600 text-white text-xs">Registered</Badge>
                    <span className="text-xs text-slate-500">{summary.sport_name}</span>
                  </div>
                  <h3 className="font-semibold text-deep-navy">{summary.school_name}</h3>
                  <p className="text-sm text-gray-dark">{summary.camp_name}</p>
                </button>
              ))}

              {selectedDateCamps.favorite.map((summary) => (
                <button
                  key={`fav-${summary.camp_id}`}
                  onClick={() => {
                    setSelectedDate(null);
                    navigate(createPageUrl(`CampDetail?id=${summary.camp_id}`));
                  }}
                  className="w-full text-left p-4 bg-white border-2 border-dashed border-rose-300 rounded-xl hover:bg-rose-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-rose-600 border-rose-300 text-xs">
                      Favorite
                    </Badge>
                    <span className="text-xs text-slate-500">{summary.sport_name}</span>
                  </div>
                  <h3 className="font-semibold text-deep-navy">{summary.school_name}</h3>
                  <p className="text-sm text-gray-dark">{summary.camp_name}</p>
                </button>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <BottomNav />
    </div>
  );
}
