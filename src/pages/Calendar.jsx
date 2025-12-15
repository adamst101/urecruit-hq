import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
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

export default function Calendar() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [sportFilter, setSportFilter] = useState('all');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: camps = [] } = useQuery({
    queryKey: ['camps'],
    queryFn: () => base44.entities.Camp.list()
  });

  const { data: schools = [] } = useQuery({
    queryKey: ['schools'],
    queryFn: () => base44.entities.School.list()
  });

  const { data: sports = [] } = useQuery({
    queryKey: ['sports'],
    queryFn: () => base44.entities.Sport.list()
  });

  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => base44.entities.Favorite.list()
  });

  const { data: registrations = [] } = useQuery({
    queryKey: ['registrations'],
    queryFn: () => base44.entities.Registration.list()
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const { registeredCamps, favoriteCamps } = useMemo(() => {
    const regIds = registrations.map(r => r.camp_id);
    const favIds = favorites.map(f => f.camp_id);

    let registered = camps.filter(c => regIds.includes(c.id));
    let favorite = camps.filter(c => favIds.includes(c.id) && !regIds.includes(c.id));

    if (sportFilter !== 'all') {
      registered = registered.filter(c => c.sport_id === sportFilter);
      favorite = favorite.filter(c => c.sport_id === sportFilter);
    }

    return { registeredCamps: registered, favoriteCamps: favorite };
  }, [camps, registrations, favorites, sportFilter]);

  const getCampsForDay = (date) => {
    const registered = registeredCamps.filter(camp => {
      const start = new Date(camp.start_date);
      const end = camp.end_date ? new Date(camp.end_date) : start;
      return date >= start && date <= end;
    });
    
    const favorite = favoriteCamps.filter(camp => {
      const start = new Date(camp.start_date);
      const end = camp.end_date ? new Date(camp.end_date) : start;
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Camp Calendar</h1>
          
          {/* Sport Filter */}
          <Select value={sportFilter} onValueChange={setSportFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All Sports" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sports</SelectItem>
              {sports.map(sport => (
                <SelectItem key={sport.id} value={sport.id}>{sport.sport_name}</SelectItem>
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
            <h2 className="text-lg font-bold text-slate-900">
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
                    isToday && "bg-blue-50",
                    hasCamps && "hover:bg-slate-100 cursor-pointer",
                    !hasCamps && "cursor-default"
                  )}
                >
                  <div className={cn(
                    "text-sm font-medium mb-1",
                    isToday && "text-blue-600",
                    !isCurrentMonth && "text-slate-400",
                    isCurrentMonth && !isToday && "text-slate-700"
                  )}>
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
            <SheetTitle>
              {selectedDate && format(selectedDate, 'MMMM d, yyyy')}
            </SheetTitle>
          </SheetHeader>

          {selectedDateCamps && (
            <div className="space-y-4 py-6">
              {selectedDateCamps.hasConflict && (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-700">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm font-medium">Schedule Conflict - Multiple camps on this date</span>
                </div>
              )}

              {selectedDateCamps.registered.map(camp => {
                const school = schools.find(s => s.id === camp.school_id);
                const sport = sports.find(s => s.id === camp.sport_id);
                return (
                  <button
                    key={camp.id}
                    onClick={() => {
                      setSelectedDate(null);
                      navigate(createPageUrl(`CampDetail?id=${camp.id}`));
                    }}
                    className="w-full text-left p-4 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-emerald-600 text-white text-xs">Registered</Badge>
                      {sport && (
                        <span className="text-xs text-slate-500">{sport.sport_name}</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900">{school?.school_name}</h3>
                    <p className="text-sm text-slate-600">{camp.camp_name}</p>
                  </button>
                );
              })}

              {selectedDateCamps.favorite.map(camp => {
                const school = schools.find(s => s.id === camp.school_id);
                const sport = sports.find(s => s.id === camp.sport_id);
                return (
                  <button
                    key={camp.id}
                    onClick={() => {
                      setSelectedDate(null);
                      navigate(createPageUrl(`CampDetail?id=${camp.id}`));
                    }}
                    className="w-full text-left p-4 bg-white border-2 border-dashed border-rose-300 rounded-xl hover:bg-rose-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-rose-600 border-rose-300 text-xs">Favorite</Badge>
                      {sport && (
                        <span className="text-xs text-slate-500">{sport.sport_name}</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900">{school?.school_name}</h3>
                    <p className="text-sm text-slate-600">{camp.camp_name}</p>
                  </button>
                );
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <BottomNav />
    </div>
  );
}