import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Star, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from "@/lib/utils";

const divisionColors = {
  "FBS": "bg-amber-500 text-white",
  "FCS": "bg-orange-500 text-white",
  "D2": "bg-blue-600 text-white",
  "D3": "bg-emerald-600 text-white",
  "NAIA": "bg-purple-600 text-white",
  "Other": "bg-slate-600 text-white"
};

export default function CampCard({ 
  camp, 
  school, 
  sport, 
  positions = [], 
  isFavorite, 
  isRegistered,
  onFavoriteToggle, 
  onClick 
}) {
  const handleFavoriteClick = (e) => {
    e.stopPropagation();
    onFavoriteToggle();
  };

  return (
    <Card 
      className={cn(
        "relative overflow-hidden cursor-pointer transition-all duration-200",
        "hover:shadow-lg active:scale-98",
        isRegistered && "ring-2 ring-emerald-500"
      )}
      onClick={onClick}
    >
      {/* Top accent */}
      <div className={cn("h-1", school?.division ? divisionColors[school.division]?.replace('text-white', '') : 'bg-slate-400')} />
      
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {school?.division && (
                <Badge className={cn("text-xs", divisionColors[school.division])}>
                  {school.division}
                </Badge>
              )}
              {sport && (
                <span className="text-xs text-slate-500 font-medium">{sport.sport_name}</span>
              )}
              {isRegistered && (
                <Badge className="bg-emerald-100 text-emerald-700 text-xs">✓</Badge>
              )}
            </div>
            <h3 className="font-bold text-base text-deep-navy truncate">
              {school?.school_name || 'Unknown School'}
            </h3>
            <p className="text-sm text-slate-500 truncate">{camp.camp_name}</p>
          </div>
          
          <button
            onClick={handleFavoriteClick}
            className={cn(
              "p-2 rounded-full transition-all -mt-1",
              isFavorite 
                ? "bg-rose-50 text-rose-500" 
                : "bg-slate-50 text-slate-400 active:bg-rose-50 active:text-rose-400"
            )}
          >
            <Star className={cn("w-4 h-4", isFavorite && "fill-current")} />
          </button>
        </div>

        {/* Details */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>
              {format(new Date(camp.start_date), 'MMM d')}
              {camp.end_date && camp.end_date !== camp.start_date && (
                <> - {format(new Date(camp.end_date), 'MMM d, yyyy')}</>
              )}
              {(!camp.end_date || camp.end_date === camp.start_date) && (
                <>, {format(new Date(camp.start_date), 'yyyy')}</>
              )}
            </span>
          </div>
          
          {(camp.city || camp.state) && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span>{[camp.city, camp.state].filter(Boolean).join(', ')}</span>
            </div>
          )}
          
          {camp.price && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <DollarSign className="w-4 h-4 text-slate-400" />
              <span className="font-medium">${camp.price}</span>
            </div>
          )}
        </div>

        {/* Positions */}
        {positions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {positions.slice(0, 4).map((pos, idx) => (
              <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                {pos.position_code}
              </span>
            ))}
            {positions.length > 4 && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">
                +{positions.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}