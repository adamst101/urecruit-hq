import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
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
} from 'date-fns';
import { cn } from "@/lib/utils";
import BottomNav from '@/components/navigation/BottomNav';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

/**
 * IMPORTANT:
 * Update these import paths to EXACTLY match MyCamps.
 * Calendar must use the same hooks + read model as MyCamps.
 */
import { useAthleteIdentity } from '@/hooks/useAthleteIdentity';
import { useCampIntents } from '@/hooks/useCampIntents';
import { useCamps } from '@/hooks/useCamps';
import { useSchools } from '@/hooks/useSchools';
import { useSports } from '@/hooks/useSports';

type CampSummary = {
  camp_id: string;
  camp_name?: string;
  start_date?: string | null;
  end_date?: string | null;
  intent_status?: string;
  school_name?: string;
  sport_id?: string;
  sport_name?: string;
};

export default function Calendar() {
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [sportFilter, setSportFilter] = useState<string>('all');

  // Single source of truth for identity (same as MyCamps)
  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError
  } = useAthleteIdentity();

  // Entity data (same composition model as MyCamps)
  const { campIntents = [] } = useCampIntents(athleteProfile?.id);
  const { camps = [] } = useCamps();
  const { schools = [] } = useSchools();
  const { sports = [] } = useSports();

  // Client-side summary composition (CampIntent + Camp + School + Sport)
  const campSummaries: CampSummary[] = useMemo(() => {
    if (!athleteProfile) return [];

    return (campIntents || [])
      .map((intent: any) => {
        const camp = (camps || []).find((c: any) => c.id === intent.camp_id);
        if (!camp) return null;

        const school = (schools || []).find((s: any) => s.id === camp.school_id);
        const sport = (sports || []).find((s: any) => s.id === camp.sport_id);

        return {
          camp_id: camp.id,
          camp_name: camp.name ?? camp.camp_name ?? camp.title ?? '',
          start_date: camp.start_date ?? camp.startDate ?? null,
          end_date: camp.end_date ?? camp.endDate ?? null,
          intent_status: intent.status ?? intent.intent_status ?? '',
          school_name: school?.name ?? school?.school_name ?? '',
          sport_id: sport?.id ?? camp.sport_id,
          sport_name: sport?.sport_name ?? sport?.name ?? ''
        } as CampSummary;
      })
      .filter(Boolean) as CampSummary[];
  }, [athleteProfile, campIntents, camps, schools, sports]);

  // Loading/guard rails (no hook-order risk)
  if (identityLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (identityError || !athleteProfile) {
    return null;
  }

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const { registeredCamps, favoriteCamps } = useMemo(() => {
    let registered = campSummaries.filter(
      s => s.intent_status === 'registered' || s.intent_status === 'completed'
    );
    let favorite = campSummaries.filter(s => s.intent_status === 'favorite');

    if (sportFilter !== 'all') {
      registered = registered.filter(s => s.sport_id === sportFilter);
      favorite = favorite.filter(s => s.sport_id === sportFilter);
    }

    return { registeredCamps: registered, favoriteCamps: favorite };
  }, [campSummaries, sportFilter]);

  const getCampsForDay = (date: Date) => {
    const registered = registeredCamps.filter(summary => {
      if (!summary.start_date) return false;
      const start = new Date(summary.start_date);
      const end = summary.end_date ? new Date(summary.end_date) : start;
      return date >= start && date <= end;
    });

    const favorite = favoriteCamps.filter(summary => {
      if (!summary.start_date) return false;
      const start = new Date(summary.start_date);
      const end = summary.end_date ? new Date(summary.end_date) : start;
      return date >= start && date <= end;
    });

    const hasConflict = registered.length > 1;

    return { registered, favorite, hasConflict };
  };

  const handleDateClick = (date: Date) => {
    const { registered, favorite } = getCampsForDay(date);
    if (registered.length > 0 || favorite.length > 0) {
      setSelectedDate(date);
    }
  };

  const selectedDateCamps = selectedDate ? getCampsForDay(selectedDate) : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <h1 className="text-2xl font-bold text-deep-navy mb-4">Camp Calendar</h1>

          {/* Sport Filter */}
          <Select value={sportFilter} onValueChange={setSportFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Sports" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sports</SelectItem>
              {sports.map((sport: any) => (
                <SelectItem key={sport.id} value={sport.id}>
                  {sport.sport_name ?? sport.name}
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
              {format(currentDate, 'MMMM yyyy')}
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
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
              <div key={idx} className="p-2 text-center text-xs font-semibold text-slate-500">
                {day}
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
                    {format(day, 'd')}
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
      </div>

      {/* Date Detail Sheet */}
      <Sheet open={!!selectedDate} onOpenChange={() => setSelectedDate(null)}>
        <SheetContent side="bottom" className="h-[60vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedDate && format(selectedDate, 'MMMM d, yyyy')}</SheetTitle>
          </SheetHeader>

          {selectedDateCamps && (
            <div className="space-y-4 py-6">
              {selectedDateCamps.hasConflict && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-700">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    Schedule Conflict - Multiple camps on this date
                  </span>
                </div>
              )}

              {selectedDateCamps.registered.map(summary => (
                <button
                  key={summary.camp_id}
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

              {selectedDateCamps.favorite.map(summary => (
                <button
                  key={summary.camp_id}
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
