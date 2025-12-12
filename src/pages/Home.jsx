import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Heart, Calendar, Search, Trophy, Loader2 } from 'lucide-react';
import CampCard from '@/components/camps/CampCard';
import CampFilters from '@/components/camps/CampFilters';
import CampDetailModal from '@/components/camps/CampDetailModal';
import DivisionTabs from '@/components/camps/DivisionTabs';
import CalendarView from '@/components/calendar/CalendarView';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Home() {
  const [filters, setFilters] = useState({});
  const [selectedDivision, setSelectedDivision] = useState('all');
  const [selectedCamp, setSelectedCamp] = useState(null);
  const [activeTab, setActiveTab] = useState('browse');
  const queryClient = useQueryClient();

  const { data: camps = [], isLoading: campsLoading } = useQuery({
    queryKey: ['camps'],
    queryFn: () => base44.entities.Camp.list()
  });

  const { data: userCamps = [], isLoading: userCampsLoading } = useQuery({
    queryKey: ['userCamps'],
    queryFn: () => base44.entities.UserCamp.list()
  });

  const saveCampMutation = useMutation({
    mutationFn: async ({ camp, status }) => {
      const existing = userCamps.find(uc => uc.camp_id === camp.id);
      if (existing) {
        if (existing.status === status) {
          // Remove if already has this status
          await base44.entities.UserCamp.delete(existing.id);
        } else {
          // Update status
          await base44.entities.UserCamp.update(existing.id, { status });
        }
      } else {
        // Create new
        await base44.entities.UserCamp.create({ camp_id: camp.id, status });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userCamps'] });
    }
  });

  const handleFavorite = (camp) => {
    saveCampMutation.mutate({ camp, status: 'favorite' });
  };

  const handleRegister = (camp) => {
    saveCampMutation.mutate({ camp, status: 'registered' });
  };

  const getUserCampStatus = (campId) => {
    return userCamps.find(uc => uc.camp_id === campId);
  };

  // Filter and search camps
  const filteredCamps = useMemo(() => {
    let result = [...camps];

    // Division filter
    if (selectedDivision !== 'all') {
      result = result.filter(camp => camp.division === selectedDivision);
    }

    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(camp => 
        camp.name?.toLowerCase().includes(search) ||
        camp.school?.toLowerCase().includes(search)
      );
    }

    // State filter
    if (filters.state) {
      result = result.filter(camp => camp.state === filters.state);
    }

    // Month filter
    if (filters.month) {
      result = result.filter(camp => {
        const campMonth = new Date(camp.start_date).getMonth() + 1;
        return campMonth === parseInt(filters.month);
      });
    }

    // Sort by date
    result.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

    return result;
  }, [camps, selectedDivision, filters]);

  // Count camps by division
  const campCounts = useMemo(() => {
    const counts = { total: camps.length };
    camps.forEach(camp => {
      counts[camp.division] = (counts[camp.division] || 0) + 1;
    });
    return counts;
  }, [camps]);

  const favoriteCamps = useMemo(() => {
    const favoriteIds = userCamps.filter(uc => uc.status === 'favorite').map(uc => uc.camp_id);
    return camps.filter(camp => favoriteIds.includes(camp.id));
  }, [camps, userCamps]);

  const registeredCamps = useMemo(() => {
    const registeredIds = userCamps.filter(uc => uc.status === 'registered').map(uc => uc.camp_id);
    return camps.filter(camp => registeredIds.includes(camp.id));
  }, [camps, userCamps]);

  const isLoading = campsLoading || userCampsLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-slate-900 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-amber-500 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500 rounded-full blur-3xl" />
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-24">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-amber-500 rounded-2xl">
              <Trophy className="w-8 h-8" />
            </div>
            <span className="text-amber-400 font-semibold text-lg">College Football Camps</span>
          </div>
          
          <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight">
            Find Your Path to<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
              College Football
            </span>
          </h1>
          
          <p className="text-slate-400 text-lg md:text-xl max-w-2xl mb-8">
            Discover and track football camps across all divisions. 
            Compare schedules, save favorites, and manage your recruiting journey.
          </p>

          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full backdrop-blur-sm">
              <Calendar className="w-5 h-5 text-amber-400" />
              <span>{camps.length} Camps Available</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full backdrop-blur-sm">
              <Heart className="w-5 h-5 text-rose-400" />
              <span>{favoriteCamps.length} Favorited</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 rounded-full backdrop-blur-sm">
              <Trophy className="w-5 h-5 text-emerald-400" />
              <span>{registeredCamps.length} Registered</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3 mb-8 p-1 bg-slate-100 rounded-xl">
            <TabsTrigger 
              value="browse" 
              className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Search className="w-4 h-4 mr-2" />
              Browse
            </TabsTrigger>
            <TabsTrigger 
              value="favorites"
              className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Heart className="w-4 h-4 mr-2" />
              Favorites
            </TabsTrigger>
            <TabsTrigger 
              value="calendar"
              className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Calendar
            </TabsTrigger>
          </TabsList>

          {/* Browse Tab */}
          <TabsContent value="browse" className="space-y-6">
            <CampFilters 
              filters={filters} 
              onChange={setFilters} 
              onClear={() => setFilters({})} 
            />
            
            <DivisionTabs 
              selected={selectedDivision} 
              onChange={setSelectedDivision}
              campCounts={campCounts}
            />

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : filteredCamps.length === 0 ? (
              <div className="text-center py-20">
                <Search className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-semibold text-slate-700">No camps found</h3>
                <p className="text-slate-500">Try adjusting your filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCamps.map(camp => (
                  <CampCard
                    key={camp.id}
                    camp={camp}
                    userCamp={getUserCampStatus(camp.id)}
                    onFavorite={handleFavorite}
                    onRegister={handleRegister}
                    onClick={setSelectedCamp}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Favorites Tab */}
          <TabsContent value="favorites" className="space-y-6">
            {favoriteCamps.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
                <Heart className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-semibold text-slate-700">No favorites yet</h3>
                <p className="text-slate-500 mb-4">Start by browsing camps and clicking the heart icon</p>
                <Button onClick={() => setActiveTab('browse')}>
                  Browse Camps
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {favoriteCamps.map(camp => (
                  <CampCard
                    key={camp.id}
                    camp={camp}
                    userCamp={getUserCampStatus(camp.id)}
                    onFavorite={handleFavorite}
                    onRegister={handleRegister}
                    onClick={setSelectedCamp}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Calendar Tab */}
          <TabsContent value="calendar">
            <CalendarView 
              camps={camps}
              userCamps={userCamps}
              onCampClick={setSelectedCamp}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Camp Detail Modal */}
      <CampDetailModal
        camp={selectedCamp}
        userCamp={selectedCamp ? getUserCampStatus(selectedCamp.id) : null}
        isOpen={!!selectedCamp}
        onClose={() => setSelectedCamp(null)}
        onFavorite={handleFavorite}
        onRegister={handleRegister}
      />
    </div>
  );
}