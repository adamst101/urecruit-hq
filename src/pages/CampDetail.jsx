import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, DollarSign, ExternalLink, Star, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn } from "@/lib/utils";

const divisionColors = {
  "FBS": "bg-amber-500 text-white",
  "FCS": "bg-orange-500 text-white",
  "D2": "bg-blue-600 text-white",
  "D3": "bg-emerald-600 text-white",
  "NAIA": "bg-purple-600 text-white",
  "Other": "bg-slate-600 text-white"
};

export default function CampDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const campId = urlParams.get('id');

  const { data: camp, isLoading: campLoading } = useQuery({
    queryKey: ['camp', campId],
    queryFn: async () => {
      const camps = await base44.entities.Camp.list();
      return camps.find(c => c.id === campId);
    },
    enabled: !!campId
  });

  const { data: school } = useQuery({
    queryKey: ['school', camp?.school_id],
    queryFn: async () => {
      const schools = await base44.entities.School.list();
      return schools.find(s => s.id === camp.school_id);
    },
    enabled: !!camp?.school_id
  });

  const { data: sport } = useQuery({
    queryKey: ['sport', camp?.sport_id],
    queryFn: async () => {
      const sports = await base44.entities.Sport.list();
      return sports.find(s => s.id === camp.sport_id);
    },
    enabled: !!camp?.sport_id
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: () => base44.entities.Position.list()
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => base44.entities.Favorite.list()
  });

  const { data: registrations = [] } = useQuery({
    queryKey: ['registrations'],
    queryFn: () => base44.entities.Registration.list()
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      const existing = favorites.find(f => f.camp_id === campId);
      if (existing) {
        await base44.entities.Favorite.delete(existing.id);
      } else {
        await base44.entities.Favorite.create({ user_id: user.id, camp_id: campId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    }
  });

  const toggleRegistrationMutation = useMutation({
    mutationFn: async () => {
      const existing = registrations.find(r => r.camp_id === campId);
      if (existing) {
        // Toggle between registered and completed, or remove
        if (existing.status === 'registered') {
          await base44.entities.Registration.update(existing.id, { status: 'completed' });
        } else {
          await base44.entities.Registration.delete(existing.id);
        }
      } else {
        await base44.entities.Registration.create({ 
          user_id: user.id, 
          camp_id: campId,
          status: 'registered'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registrations'] });
    }
  });

  if (campLoading || !camp) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const campPositions = positions.filter(p => camp.position_ids?.includes(p.id));
  const isFavorite = favorites.some(f => f.camp_id === campId);
  const registration = registrations.find(r => r.camp_id === campId);
  const isRegistered = !!registration;

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-md mx-auto p-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>

          <div className="flex items-start gap-4">
            {school?.logo_url && (
              <img
                src={school.logo_url}
                alt={school.school_name}
                className="w-16 h-16 rounded-xl object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {school?.division && (
                  <Badge className={cn("text-xs", divisionColors[school.division])}>
                    {school.division}
                  </Badge>
                )}
                {sport && (
                  <span className="text-xs text-slate-500 font-medium">{sport.sport_name}</span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                {school?.school_name || 'Unknown School'}
              </h1>
              <p className="text-slate-600">{camp.camp_name}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Key Details */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4">
            <Calendar className="w-5 h-5 text-slate-400 mb-2" />
            <p className="text-xs text-slate-500 uppercase tracking-wide">Date</p>
            <p className="font-semibold text-slate-900">
              {format(new Date(camp.start_date), 'MMM d, yyyy')}
              {camp.end_date && camp.end_date !== camp.start_date && (
                <><br />to {format(new Date(camp.end_date), 'MMM d, yyyy')}</>
              )}
            </p>
          </div>

          {(camp.city || camp.state) && (
            <div className="bg-white rounded-xl p-4">
              <MapPin className="w-5 h-5 text-slate-400 mb-2" />
              <p className="text-xs text-slate-500 uppercase tracking-wide">Location</p>
              <p className="font-semibold text-slate-900">
                {camp.city && <>{camp.city}<br /></>}
                {camp.state}
              </p>
            </div>
          )}

          {camp.price && (
            <div className="bg-white rounded-xl p-4">
              <DollarSign className="w-5 h-5 text-slate-400 mb-2" />
              <p className="text-xs text-slate-500 uppercase tracking-wide">Cost</p>
              <p className="font-semibold text-slate-900">${camp.price}</p>
            </div>
          )}

          {school?.conference && (
            <div className="bg-white rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Conference</p>
              <p className="font-semibold text-slate-900">{school.conference}</p>
            </div>
          )}
        </div>

        {/* Positions */}
        {campPositions.length > 0 && (
          <div className="bg-white rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Positions</p>
            <div className="flex flex-wrap gap-2">
              {campPositions.map((pos) => (
                <Badge key={pos.id} variant="secondary" className="bg-slate-100">
                  {pos.position_code} - {pos.position_name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {camp.notes && (
          <div className="bg-white rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">About This Camp</p>
            <p className="text-slate-700 leading-relaxed">{camp.notes}</p>
          </div>
        )}

        {/* Status */}
        {isRegistered && (
          <div className="flex items-center gap-2 p-4 bg-emerald-50 rounded-xl text-emerald-700">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">
              You're {registration.status === 'completed' ? 'completed' : 'registered for'} this camp!
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button
            variant="outline"
            className={cn(
              "w-full",
              isFavorite && "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
            )}
            onClick={() => toggleFavoriteMutation.mutate()}
            disabled={toggleFavoriteMutation.isPending}
          >
            <Star className={cn("w-4 h-4 mr-2", isFavorite && "fill-current")} />
            {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
          </Button>
          
          <Button
            className={cn(
              "w-full",
              isRegistered 
                ? "bg-emerald-600 hover:bg-emerald-700" 
                : "bg-blue-600 hover:bg-blue-700"
            )}
            onClick={() => toggleRegistrationMutation.mutate()}
            disabled={toggleRegistrationMutation.isPending}
          >
            {registration?.status === 'completed' ? 'Mark as Incomplete' : isRegistered ? 'Mark as Completed' : 'Mark as Registered'}
          </Button>

          {camp.link_url && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(camp.link_url, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to Registration Site
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}