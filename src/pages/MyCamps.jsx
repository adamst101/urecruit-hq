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

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: camps = [], isLoading: campsLoading } = useQuery({
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

  const registerMutation = useMutation({
    mutationFn: (campId) => base44.entities.Registration.create({ 
      user_id: user.id, 
      camp_id: campId,
      status: 'registered'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registrations'] });
    }
  });

  const registeredCamps = useMemo(() => {
    const regIds = registrations.map(r => r.camp_id);
    return camps
      .filter(c => regIds.includes(c.id))
      .map(c => ({
        ...c,
        registration: registrations.find(r => r.camp_id === c.id)
      }))
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  }, [camps, registrations]);

  const favoriteCamps = useMemo(() => {
    const favIds = favorites.map(f => f.camp_id);
    return camps
      .filter(c => favIds.includes(c.id))
      .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  }, [camps, favorites]);

  const groupByMonth = (campsList) => {
    const grouped = {};
    campsList.forEach(camp => {
      const monthKey = format(parseISO(camp.start_date), 'MMMM yyyy');
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(camp);
    });
    return grouped;
  };

  const renderCampCard = (camp, isRegistered = false) => {
    const school = schools.find(s => s.id === camp.school_id);
    const sport = sports.find(s => s.id === camp.sport_id);

    return (
      <button
        key={camp.id}
        onClick={() => navigate(createPageUrl(`CampDetail?id=${camp.id}`))}
        className="w-full text-left bg-white rounded-xl p-4 shadow-sm border border-slate-100 hover:shadow-md transition-all active:scale-98"
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isRegistered ? (
                <Badge className="bg-emerald-600 text-white text-xs">
                  {camp.registration?.status === 'completed' ? 'Completed' : 'Registered'}
                </Badge>
              ) : (
                <Badge className="bg-rose-100 text-rose-700 text-xs">Favorite</Badge>
              )}
              {sport && (
                <span className="text-xs text-slate-500">{sport.sport_name}</span>
              )}
            </div>
            <h3 className="font-bold text-deep-navy truncate">
              {school?.school_name || 'Unknown School'}
            </h3>
            <p className="text-sm text-slate-600 truncate">{camp.camp_name}</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span>
              {format(parseISO(camp.start_date), 'MMM d')}
              {camp.end_date && camp.end_date !== camp.start_date && (
                <> - {format(parseISO(camp.end_date), 'MMM d, yyyy')}</>
              )}
              {(!camp.end_date || camp.end_date === camp.start_date) && (
                <>, {format(parseISO(camp.start_date), 'yyyy')}</>
              )}
            </span>
          </div>
          
          {(camp.city || camp.state) && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span>{[camp.city, camp.state].filter(Boolean).join(', ')}</span>
            </div>
          )}
        </div>

        {!isRegistered && (
          <Button
            size="sm"
            className="w-full mt-3 bg-electric-blue hover:bg-deep-navy"
            onClick={(e) => {
              e.stopPropagation();
              registerMutation.mutate(camp.id);
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

  if (!user) {
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