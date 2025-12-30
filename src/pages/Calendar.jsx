import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, ChevronLeft, ChevronRight, Lock } from "lucide-react";
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

import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";

import BottomNav from "../components/navigation/BottomNav";

import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { usePublicCampSummariesClient } from "../components/hooks/usePublicCampSummariesClient";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess";

export default function Calendar() {
  const { mode, seasonYear, currentYear, demoYear, loading: accessLoading } = useSeasonAccess();

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return mode === "paid" ? (
    <CalendarPaid currentYear={currentYear} />
  ) : (
    <CalendarDemo seasonYear={seasonYear} demoYear={demoYear} />
  );
}

/* -----------------------------
   DEMO (no auth, read-only)
----------------------------- */
function CalendarDemo({ seasonYear, demoYear }) {
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [sportFilter, setSportFilter] = useState("all");

  const {
    data: campSummaries = [],
    isLoading: campsLoading,
    isError: campsError,
    error: campsErrorObj
  } = usePublicCampSummariesClient({
    seasonYear,
    sportId: sportFilter === "all" ? undefined : sportFilter,
    enabled: true
  });

  const sortedSummaries = useMemo(() => {
    const list = Array.isArray(campSummaries) ? [...campSummaries] : [];
    list.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return list;
  }, [campSummaries]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getCampsForDay = (date) => {
    const camps = sortedSummaries.filter((summary) => {
      const start = new Date(summary.start_date);
      const end = summary.end_date ? new Date(summary.end_date) : start;
      return date >= start && date <= end;
    });
    return { camps };
  };

  const handleDateClick = (date) => {
    const { camps } = getCampsForDay(date);
    if (camps.length > 0) setSelectedDate(date);
  };

  const selectedDateCamps = selectedDate ? getCampsForDay(selectedDate) : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h1 className="text-2xl font-bold text-deep-navy">Camp Calendar</h1>
            <div className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
              Demo Season: {demoYear}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 mb-4 flex items-start gap-2">
            <Lock className="w-4 h-4 mt-0.5" />
            <div className="text-sm">
              Demo mode is read-only.{" "}
              <button
                className="underline font-medium"
                onClick={() => navigate(createPageUrl("Signup"))}
              >
                Sign up
              </button>{" "}
              to unlock the current season.
            </div>
          </div>

          {campsError && (
            <div className="mt-3 bg-white border border-rose-200 text-rose-700 rounded-xl p-3">
              <div className="font-semibold">Failed to load demo camps</div>
              <div className="text-xs break-words mt-1">
                {String(campsErrorObj?.message || campsErrorObj)}
              </div>
            </div>
          )}

          <Select value={sportFilter} onValueChange={setSportFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Sports" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sports</SelectItem>
              {[...new Map(sortedSummaries.map((s) => [s.sport_id, { id: s.sport_id, sport_name: s.sport_name }])).values()]
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

      <div className="max-w-md mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-bold text-deep-navy">{format(currentDate, "MMMM yyyy")}</h2>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-100">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
              <div key={idx} className="p-2 text-center text-xs font-semibold text-slate-500">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const { camps } = getCampsForDay(day);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentDate);
              const hasCamps = camps.length > 0;

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
                  {hasCamps && <div className="w-full h-1.5 bg-slate-700 rounded-full" />}
                </button>
              );
            })}
          </div>
        </div>

        {campsLoading && (
          <div className="mt-3 flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading demo camps…
          </div>
        )}
      </div>

      <Sheet open={!!selectedDate} onOpenChange={() => setSelectedDate(null)}>
        <SheetContent side="bottom" className="h-[60vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedDate && format(selectedDate, "MMMM d, yyyy")}</SheetTitle>
          </SheetHeader>

          {selectedDateCamps && (
            <div className="space-y-4 py-6">
              {selectedDateCamps.camps.map((summary) => (
                <button
                  key={summary.camp_id}
                  onClick={() => {
                    setSelectedDate(null);
                    if (summary.link_url) window.open(summary.link_url, "_blank");
                  }}
                  className="w-full text-left p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-slate-700 text-xs">
                      Demo
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

/* -----------------------------
   PAID (existing behavior)
----------------------------- */
function CalendarPaid({ currentYear }) {
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [sportFilter, setSportFilter] = useState("all");

  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError,
    error: identityErrorObj
  } = useAthleteIdentity();

  const athleteId = athleteProfile?.id;
  const athleteSportId = athleteProfile?.sport_id;

  const {
    data: campSummaries = [],
    isLoading: campsLoading,
    isError: campsError,
    error: campsErrorObj
  } = useCampSummariesClient({
    athleteId,
    sportId: athleteSportId,
    enabled: !!athleteId && !identityLoading && !identityError
  });

  const sortedSummaries = useMemo(() => {
    const list = Array.isArray(campSummaries) ? [...campSummaries] : [];
    list.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return list;
  }, [campSummaries]);

  const { registeredCamps, favoriteCamps } = useMemo(() => {
    let registered = sortedSummaries.filter((c) => c.intent_status === "registered" || c.intent_status === "completed");
    let favorite = sortedSummaries.filter((c) => c.intent_status === "favorite");

    if (sportFilter !== "all") {
      registered = registered.filter((c) => c.sport_id === sportFilter);
      favorite = favorite.filter((c) => c.sport_id === sportFilter);
    }

    return { registeredCamps: registered, favoriteCamps: favorite };
  }, [sortedSummaries, sportFilter]);

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
    if (registered.length > 0 || favorite.length > 0) setSelectedDate(date);
  };

  const selectedDateCamps = selectedDate ? getCampsForDay(selectedDate) : null;

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
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h1 className="text-2xl font-bold text-deep-navy mb-0">Camp Calendar</h1>
            <div className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
              Current Season: {currentYear}
            </div>
          </div>

          {campsError && (
            <div className="mt-3 bg-white border border-rose-200 text-rose-700 rounded-xl p-3">
              <div className="font-semibold">Failed to load camps</div>
              <div className="text-xs break-words mt-1">
                {String(campsErrorObj?.message || campsErrorObj)}
              </div>
            </div>
          )}

          <Select value={sportFilter} onValueChange={setSportFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Sports" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sports</SelectItem>
              {[...new Map(sortedSummaries.map((s) => [s.sport_id, { id: s.sport_id, sport_name: s.sport_name }])).values()]
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

      <div className="max-w-md mx-auto p-4">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-bold text-deep-navy">{format(currentDate, "MMMM yyyy")}</h2>
            <Button variant="ghost" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-100">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, idx) => (
              <div key={idx} className="p-2 text-center text-xs font-semibold text-slate-500">
                {d}
              </div>
            ))}
          </div>

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
                    {registered.length > 0 && <div className="w-full h-1.5 bg-emerald-500 rounded-full" />}
                    {favorite.length > 0 && <div className="w-full h-1.5 border-2 border-rose-400 rounded-full" />}
                    {hasConflict && <AlertCircle className="w-3 h-3 text-red-500 mx-auto" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {campsLoading && (
          <div className="mt-3 flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading camps…
          </div>
        )}
      </div>

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
