import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Star, CheckCircle, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from "@/lib/utils";
import BottomNav from '@/components/navigation/BottomNav';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function MyCamps() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('registered');

  const { data: athleteProfile } = useQuery({
    queryKey: ['athleteProfile'],
    queryFn: () => base44.functions.getAthleteProfile()
  });

  const { data: campSummaries = [], isLoading: campsLoading } = useQuery({
    queryKey: ['campSummaries', athleteProfile?.id],
    queryFn: () => base44.functions.getCampSummaries({
      athlete_id: athleteProfile?.id
    }),
    enabled: !!athleteProfile
  });

  const registerMutation = useMutation({
    mutationFn: async (campId) => {
      if (!athleteProfile) return;
      
      const intents = await base44.entities.CampIntent.filter({
        athlete_id: athleteProfile.id,
        camp_id: campId
      });
      
      if (intents.length > 0) {
        await base44.entities.CampIntent.update(intents[0].id, { 
          status: 'registered',
          registration_confirmed: true
        });
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
      queryClient.invalidateQueries({ queryKey: ['campSummaries'] });
    }
  });

  const registeredCamps = useMemo(() => {
    return campSummaries
      .filter(s => s.intent_status === 'registered' || s.intent_status === 'completed')
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  }, [campSummaries]);

  const favoriteCamps = useMemo(() => {
    return campSummaries
      .filter(s => s.intent_status === 'favorite')
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  }, [campSummaries]);

  const groupByMonth = (campsList) => {
    const grouped = {};
    campsList.forEach(summary => {
      const monthKey = format(parseISO(summary.start_date), 'MMMM yyyy');
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(summary);
    });
    return grouped;
  };

  const renderCampCard = (summary, isRegistered = false) => {
    return (
      <button
        key={summary.camp_id}
        onClick={() => navigate(createPageUrl(`CampDetail?id=${summary.camp_id}`))}
        className="w-full text-left bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all active:scale-98"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isRegistered ? (
                <Badge className="bg-emerald-600 text-white text-xs">
                  {summary.intent_status === 'completed' ? 'Completed' : 'Registered'}
                </Badge>
              ) : (
                <Badge className="bg-rose-100 text-rose-700 text-xs">Favorite</Badge>
              )}
              <span className="text-xs text-slate-500">{summary.sport_name}</span>
            </div>
            <h3 className="font-bold text-deep-navy truncate">
              {summary.school_name || 'Unknown School'}
            </h3>
            <p className="text-sm text-slate-600 truncate">{summary.camp_name}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>
              {format(parseISO(summary.start_date), 'MMM d')}
              {summary.end_date && summary.end_date !== summary.start_date && (
                <> - {format(parseISO(summary.end_date), 'MMM d, yyyy')}</>
              )}
              {(!summary.end_date || summary.end_date === summary.start_date) && (
                <>, {format(parseISO(summary.start_date), 'yyyy')}</>
              )}
            </span>
          </div>
          
          {(summary.city || summary.state) && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span>{[summary.city, summary.state].filter(Boolean).join(', ')}</span>
            </div>
          )}
        </div>

        {!isRegistered && (
          <Button
            size="sm"
            className="w-full mt-3 bg-electric-blue hover:bg-deep-navy"
            onClick={(e) => {
              e.stopPropagation();
              registerMutation.mutate(summary.camp_id);
            }}
            disabled={registerMutation.isPending}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Mark as Registered
          </Button>
        )}
      </button>
    );
  };

  if (!athleteProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const groupedRegistered = groupByMonth(registeredCamps);
  const groupedFavorites = groupByMonth(favoriteCamps);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <h1 className="text-2xl font-bold text-deep-navy mb-4">My Camps</h1>
          
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 bg-slate-100">
              <TabsTrigger 
                value="registered"
                className="data-[state=active]:bg-white"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Registered ({registeredCamps.length})
              </TabsTrigger>
              <TabsTrigger 
                value="favorites"
                className="data-[state=active]:bg-white"
              >
                <Star className="w-4 h-4 mr-2" />
                Favorites ({favoriteCamps.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto p-4">
        <Tabs value={activeTab}>
          {/* Registered Tab */}
          <TabsContent value="registered">
            {campsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : registeredCamps.length === 0 ? (
              <div className="text-center py-20">
                <CheckCircle className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-semibold text-deep-navy">No registered camps</h3>
                <p className="text-gray-dark mb-4">Start exploring camps to register</p>
                <Button onClick={() => navigate(createPageUrl('Discover'))}>
                  Discover Camps
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedRegistered).map(([month, campsList]) => (
                  <div key={month}>
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                      {month}
                    </h3>
                    <div className="space-y-3">
                      {campsList.map(camp => renderCampCard(camp, true))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Favorites Tab */}
          <TabsContent value="favorites">
            {campsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : favoriteCamps.length === 0 ? (
              <div className="text-center py-20">
                <Star className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-semibold text-deep-navy">No favorite camps</h3>
                <p className="text-gray-dark mb-4">Tap the star icon to save camps</p>
                <Button onClick={() => navigate(createPageUrl('Discover'))}>
                  Discover Camps
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedFavorites).map(([month, campsList]) => (
                  <div key={month}>
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
                      {month}
                    </h3>
                    <div className="space-y-3">
                      {campsList.map(camp => renderCampCard(camp, false))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />
    </div>
  );
}