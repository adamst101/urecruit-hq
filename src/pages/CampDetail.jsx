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
  "D1 (FBS)": "bg-amber-500 text-white",
  "D1 (FCS)": "bg-orange-500 text-white",
  "D2": "bg-blue-600 text-white",
  "D3": "bg-emerald-600 text-white",
  "NAIA": "bg-purple-600 text-white",
  "JUCO": "bg-slate-600 text-white"
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

  const { data: athleteProfile } = useQuery({
    queryKey: ['athleteProfile'],
    queryFn: async () => {
      const account = await base44.auth.me();
      if (!account?.id) return null;
      const profiles = await base44.entities.AthleteProfile.filter({
        account_id: account.id,
        active: true
      });
      return profiles?.[0] || null;
    }
  });

  const { data: campIntent } = useQuery({
    queryKey: ['campIntent', athleteProfile?.id, campId],
    queryFn: async () => {
      if (!athleteProfile) return null;
      const intents = await base44.entities.CampIntent.filter({
        athlete_id: athleteProfile.id,
        camp_id: campId
      });
      return intents[0] || null;
    },
    enabled: !!athleteProfile && !!campId
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      if (!athleteProfile) return;
      
      if (campIntent) {
        if (campIntent.status === 'favorite') {
          await base44.entities.CampIntent.update(campIntent.id, { status: 'removed' });
        } else {
          await base44.entities.CampIntent.update(campIntent.id, { status: 'favorite' });
        }
      } else {
        await base44.entities.CampIntent.create({
          athlete_id: athleteProfile.id,
          camp_id: campId,
          status: 'favorite'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campIntent'] });
      queryClient.invalidateQueries({ queryKey: ['myCampsSummaries_client'] });
    }
  });

  const toggleRegistrationMutation = useMutation({
    mutationFn: async () => {
      if (!athleteProfile) return;
      
      if (campIntent) {
        if (campIntent.status === 'registered') {
          await base44.entities.CampIntent.update(campIntent.id, { status: 'completed' });
        } else if (campIntent.status === 'completed') {
          await base44.entities.CampIntent.update(campIntent.id, { status: 'removed' });
        } else {
          await base44.entities.CampIntent.update(campIntent.id, { 
            status: 'registered',
            registration_confirmed: true
          });
        }
      } else {
        await base44.entities.CampIntent.create({
          athlete_id: athleteProfile.id,
          camp_id: campId,
          status: 'registered',
          registration_confirmed: true
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campIntent'] });
      queryClient.invalidateQueries({ queryKey: ['myCampsSummaries_client'] });
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
  const isFavorite = campIntent?.status === 'favorite';
  const isRegistered = campIntent?.status === 'registered' || campIntent?.status === 'completed';

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
              <h1 className="text-2xl font-bold text-deep-navy">
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
              You're {campIntent.status === 'completed' ? 'completed' : 'registered for'} this camp!
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
                : "bg-electric-blue hover:bg-deep-navy"
            )}
            onClick={() => toggleRegistrationMutation.mutate()}
            disabled={toggleRegistrationMutation.isPending}
          >
            {campIntent?.status === 'completed' ? 'Mark as Incomplete' : isRegistered ? 'Mark as Completed' : 'Mark as Registered'}
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