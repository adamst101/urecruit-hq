import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, Calendar, MapPin, ExternalLink, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from "@/lib/utils";

const divisionColors = {
  "D1-FBS": "bg-amber-500 text-white",
  "D1-FCS": "bg-orange-500 text-white",
  "D2": "bg-blue-600 text-white",
  "D3": "bg-emerald-600 text-white",
  "NAIA": "bg-purple-600 text-white",
  "JUCO": "bg-slate-600 text-white"
};

export default function CampCard({ camp, userCamp, onFavorite, onRegister, onClick }) {
  const isFavorite = userCamp?.status === 'favorite';
  const isRegistered = userCamp?.status === 'registered';

  const handleFavoriteClick = (e) => {
    e.stopPropagation();
    onFavorite(camp);
  };

  const handleRegisterClick = (e) => {
    e.stopPropagation();
    onRegister(camp);
  };

  return (
    <Card 
      className={cn(
        "group relative overflow-hidden cursor-pointer transition-all duration-300",
        "hover:shadow-xl hover:-translate-y-1 border-0 bg-white",
        isRegistered && "ring-2 ring-emerald-500"
      )}
      onClick={() => onClick(camp)}
    >
      {/* Top accent bar */}
      <div className={cn("h-1.5", divisionColors[camp.division]?.replace('text-white', ''))} />
      
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={cn("text-xs font-semibold", divisionColors[camp.division])}>
                {camp.division}
              </Badge>
              {isRegistered && (
                <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                  Registered
                </Badge>
              )}
            </div>
            <h3 className="font-bold text-lg text-slate-900 truncate group-hover:text-slate-700 transition-colors">
              {camp.school}
            </h3>
            <p className="text-sm text-slate-500 truncate">{camp.name}</p>
          </div>
          
          <button
            onClick={handleFavoriteClick}
            className={cn(
              "p-2 rounded-full transition-all duration-200",
              isFavorite 
                ? "bg-rose-50 text-rose-500" 
                : "bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-400"
            )}
          >
            <Heart className={cn("w-5 h-5", isFavorite && "fill-current")} />
          </button>
        </div>

        {/* Details */}
        <div className="space-y-2 mb-4">
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
        {camp.positions && camp.positions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {camp.positions.slice(0, 3).map((pos, idx) => (
              <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
                {pos}
              </span>
            ))}
            {camp.positions.length > 3 && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">
                +{camp.positions.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {camp.registration_url && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 group/btn"
              onClick={(e) => {
                e.stopPropagation();
                window.open(camp.registration_url, '_blank');
              }}
            >
              <ExternalLink className="w-4 h-4 mr-1.5 group-hover/btn:translate-x-0.5 transition-transform" />
              Register
            </Button>
          )}
          <Button
            size="sm"
            className={cn(
              "flex-1 transition-all",
              isRegistered 
                ? "bg-emerald-600 hover:bg-emerald-700" 
                : "bg-slate-900 hover:bg-slate-800"
            )}
            onClick={handleRegisterClick}
          >
            {isRegistered ? 'Registered ✓' : 'Mark Registered'}
          </Button>
        </div>
      </div>
    </Card>
  );
}