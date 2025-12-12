import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, MapPin, DollarSign, ExternalLink, Heart, 
  Users, Clock, CheckCircle 
} from 'lucide-react';
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

export default function CampDetailModal({ 
  camp, 
  userCamp, 
  isOpen, 
  onClose, 
  onFavorite, 
  onRegister 
}) {
  if (!camp) return null;

  const isFavorite = userCamp?.status === 'favorite';
  const isRegistered = userCamp?.status === 'registered';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <Badge className={cn("mb-2", divisionColors[camp.division])}>
                {camp.division}
              </Badge>
              <DialogTitle className="text-2xl font-bold text-slate-900">
                {camp.school}
              </DialogTitle>
              <p className="text-slate-500 mt-1">{camp.name}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Key Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
              <Calendar className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Date</p>
                <p className="font-medium text-slate-900">
                  {format(new Date(camp.start_date), 'MMM d, yyyy')}
                  {camp.end_date && camp.end_date !== camp.start_date && (
                    <><br />to {format(new Date(camp.end_date), 'MMM d, yyyy')}</>
                  )}
                </p>
              </div>
            </div>

            {(camp.city || camp.state) && (
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Location</p>
                  <p className="font-medium text-slate-900">
                    {camp.city && <>{camp.city}<br /></>}
                    {camp.state}
                  </p>
                </div>
              </div>
            )}

            {camp.price && (
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                <DollarSign className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Cost</p>
                  <p className="font-medium text-slate-900">${camp.price}</p>
                </div>
              </div>
            )}

            {camp.age_groups && (
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                <Users className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Ages</p>
                  <p className="font-medium text-slate-900">{camp.age_groups}</p>
                </div>
              </div>
            )}
          </div>

          {/* Positions */}
          {camp.positions && camp.positions.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Positions</p>
              <div className="flex flex-wrap gap-2">
                {camp.positions.map((pos, idx) => (
                  <Badge key={idx} variant="secondary" className="bg-slate-100">
                    {pos}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {camp.description && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">About</p>
              <p className="text-slate-700 leading-relaxed">{camp.description}</p>
            </div>
          )}

          {/* Status Badge */}
          {isRegistered && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl text-emerald-700">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">You're registered for this camp!</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className={cn(
                "flex-1",
                isFavorite && "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
              )}
              onClick={() => onFavorite(camp)}
            >
              <Heart className={cn("w-4 h-4 mr-2", isFavorite && "fill-current")} />
              {isFavorite ? 'Favorited' : 'Add to Favorites'}
            </Button>
            
            <Button
              className={cn(
                "flex-1",
                isRegistered 
                  ? "bg-emerald-600 hover:bg-emerald-700" 
                  : "bg-slate-900 hover:bg-slate-800"
              )}
              onClick={() => onRegister(camp)}
            >
              {isRegistered ? 'Registered ✓' : 'Mark as Registered'}
            </Button>
          </div>

          {camp.registration_url && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(camp.registration_url, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to Registration Page
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}