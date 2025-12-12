import React, { useState, useMemo } from 'react';
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
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from "@/lib/utils";

const divisionColors = {
  "D1-FBS": "bg-amber-400",
  "D1-FCS": "bg-orange-400",
  "D2": "bg-blue-500",
  "D3": "bg-emerald-500",
  "NAIA": "bg-purple-500",
  "JUCO": "bg-slate-500"
};

export default function CalendarView({ camps, userCamps, onCampClick }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const registeredCamps = useMemo(() => {
    const registered = userCamps.filter(uc => uc.status === 'registered');
    return camps.filter(camp => registered.some(uc => uc.camp_id === camp.id));
  }, [camps, userCamps]);

  const favoriteCamps = useMemo(() => {
    const favorites = userCamps.filter(uc => uc.status === 'favorite');
    return camps.filter(camp => favorites.some(uc => uc.camp_id === camp.id));
  }, [camps, userCamps]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getCampsForDay = (date) => {
    const registered = registeredCamps.filter(camp => {
      const start = new Date(camp.start_date);
      const end = camp.end_date ? new Date(camp.end_date) : start;
      return date >= start && date <= end;
    });
    
    const favorites = favoriteCamps.filter(camp => {
      const start = new Date(camp.start_date);
      const end = camp.end_date ? new Date(camp.end_date) : start;
      return date >= start && date <= end;
    });

    return { registered, favorites };
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentDate(subMonths(currentDate, 1))}
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl font-bold text-slate-900">
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
      <div className="flex items-center gap-4 px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-sm text-slate-600">Registered</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-400 ring-2 ring-rose-200" />
          <span className="text-sm text-slate-600">Favorites</span>
        </div>
      </div>

      {/* Days of week */}
      <div className="grid grid-cols-7 border-b border-slate-100">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="p-2 text-center text-xs font-semibold text-slate-500 uppercase">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const { registered, favorites } = getCampsForDay(day);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, currentDate);

          return (
            <div
              key={idx}
              className={cn(
                "min-h-[100px] p-1.5 border-b border-r border-slate-100 transition-colors",
                !isCurrentMonth && "bg-slate-50",
                isToday && "bg-blue-50"
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
                {/* Registered camps */}
                {registered.slice(0, 2).map(camp => (
                  <button
                    key={`reg-${camp.id}`}
                    onClick={() => onCampClick(camp)}
                    className={cn(
                      "w-full text-left text-xs px-1.5 py-0.5 rounded truncate",
                      "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
                    )}
                  >
                    {camp.school}
                  </button>
                ))}
                
                {/* Favorite camps overlay */}
                {favorites.slice(0, 2).map(camp => (
                  <button
                    key={`fav-${camp.id}`}
                    onClick={() => onCampClick(camp)}
                    className={cn(
                      "w-full text-left text-xs px-1.5 py-0.5 rounded truncate",
                      "bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors",
                      "border border-dashed border-rose-300"
                    )}
                  >
                    {camp.school}
                  </button>
                ))}

                {/* Overflow indicator */}
                {(registered.length + favorites.length) > 4 && (
                  <div className="text-xs text-slate-400 px-1">
                    +{registered.length + favorites.length - 4} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}