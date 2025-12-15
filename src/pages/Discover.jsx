import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal, Loader2 } from 'lucide-react';
import CampCard from '@/components/camps/CampCard';
import FilterSheet from '@/components/camps/FilterSheet';
import BottomNav from '@/components/navigation/BottomNav';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Discover() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);

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

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: () => base44.entities.Position.list()
  });

  const { data: favorites = [] } = useQuery({
    queryKey: ['favorites'],
    queryFn: () => base44.entities.Favorite.list()
  });

  const { data: registrations = [] } = useQuery({
    queryKey: ['registrations'],
    queryFn: () => base44.entities.Registration.list()
  });

  // Check if onboarding needed
  useEffect(() => {
    if (user && !user.athlete_name) {
      navigate(createPageUrl('Onboarding'));
    }
  }, [user, navigate]);

  // Default sport filter to user's sport
  useEffect(() => {
    if (user?.sport_id && !filters.sport) {
      setFilters(prev => ({ ...prev, sport: user.sport_id }));
    }
  }, [user]);

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (campId) => {
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

  const filteredCamps = useMemo(() => {
    let result = [...camps];

    // Sport filter
    if (filters.sport) {
      result = result.filter(c => c.sport_id === filters.sport);
    }

    // Division filter
    if (filters.divisions?.length > 0) {
      result = result.filter(c => {
        const school = schools.find(s => s.id === c.school_id);
        return school && filters.divisions.includes(school.division);
      });
    }

    // Position filter
    if (filters.positions?.length > 0) {
      result = result.filter(c => {
        return filters.positions.some(fp => c.position_ids?.includes(fp));
      });
    }

    // State filter
    if (filters.state) {
      result = result.filter(c => c.state === filters.state);
    }

    // Date range filter
    if (filters.startDate) {
      result = result.filter(c => new Date(c.end_date || c.start_date) >= new Date(filters.startDate));
    }
    if (filters.endDate) {
      result = result.filter(c => new Date(c.start_date) <= new Date(filters.endDate));
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c => {
        const school = schools.find(s => s.id === c.school_id);
        return (
          c.camp_name?.toLowerCase().includes(query) ||
          school?.school_name?.toLowerCase().includes(query)
        );
      });
    }

    // Sort by date
    result.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

    return result;
  }, [camps, schools, filters, searchQuery]);

  const availablePositions = useMemo(() => {
    const sportId = filters.sport || user?.sport_id;
    return positions.filter(p => p.sport_id === sportId);
  }, [positions, filters.sport, user]);

  const getCampData = (camp) => {
    const school = schools.find(s => s.id === camp.school_id);
    const sport = sports.find(s => s.id === camp.sport_id);
    const campPositions = positions.filter(p => camp.position_ids?.includes(p.id));
    const isFavorite = favorites.some(f => f.camp_id === camp.id);
    const isRegistered = registrations.some(r => r.camp_id === camp.id);

    return { school, sport, campPositions, isFavorite, isRegistered };
  };

  const handleClearFilters = () => {
    setFilters({ sport: user?.sport_id });
  };

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
          <h1 className="text-2xl font-bold text-deep-navy mb-4">Discover Camps</h1>
          
          {/* Search Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Search camps or schools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowFilters(true)}
              className="shrink-0"
            >
              <SlidersHorizontal className="w-5 h-5" />
            </Button>
          </div>

          {/* Active Filters */}
          {(filters.divisions?.length > 0 || filters.positions?.length > 0 || filters.state) && (
            <div className="flex items-center gap-2 mt-3 text-sm">
              <span className="text-slate-500">Filters:</span>
              {filters.divisions?.map(d => (
                <span key={d} className="px-2 py-1 bg-electric-blue/10 text-electric-blue rounded-full text-xs font-medium">
                  {d}
                </span>
              ))}
              {filters.positions?.length > 0 && (
                <span className="px-2 py-1 bg-electric-blue/10 text-electric-blue rounded-full text-xs font-medium">
                  {filters.positions.length} position{filters.positions.length > 1 ? 's' : ''}
                </span>
              )}
              {filters.state && (
                <span className="px-2 py-1 bg-electric-blue/10 text-electric-blue rounded-full text-xs font-medium">
                  {filters.state}
                </span>
              )}
              <button
                onClick={handleClearFilters}
                className="text-electric-blue hover:underline text-xs font-medium"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Camp List */}
      <div className="max-w-md mx-auto p-4">
        {campsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : filteredCamps.length === 0 ? (
          <div className="text-center py-20">
            <Search className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-deep-navy">No camps found</h3>
            <p className="text-gray-dark">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCamps.map(camp => {
              const { school, sport, campPositions, isFavorite, isRegistered } = getCampData(camp);
              return (
                <CampCard
                  key={camp.id}
                  camp={camp}
                  school={school}
                  sport={sport}
                  positions={campPositions}
                  isFavorite={isFavorite}
                  isRegistered={isRegistered}
                  onFavoriteToggle={() => toggleFavoriteMutation.mutate(camp.id)}
                  onClick={() => navigate(createPageUrl(`CampDetail?id=${camp.id}`))}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Filter Sheet */}
      <FilterSheet
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        filters={filters}
        onFilterChange={setFilters}
        positions={availablePositions}
        sports={sports}
        onApply={() => setShowFilters(false)}
        onClear={handleClearFilters}
      />

      <BottomNav />
    </div>
  );
}