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

  const { data: athleteProfile } = useQuery({
    queryKey: ['athleteProfile'],
    queryFn: () => base44.functions.getAthleteProfile()
  });

  const { data: sports = [] } = useQuery({
    queryKey: ['sports'],
    queryFn: () => base44.entities.Sport.list()
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: () => base44.entities.Position.list()
  });

  const { data: campSummaries = [], isLoading: campsLoading } = useQuery({
    queryKey: ['campSummaries', athleteProfile?.id, filters, searchQuery],
    queryFn: () => base44.functions.getCampSummaries({
      athlete_id: athleteProfile?.id,
      sport_id: filters.sport,
      divisions: filters.divisions?.join(','),
      states: filters.state,
      position_ids: filters.positions?.join(','),
      start_date_gte: filters.startDate,
      end_date_lte: filters.endDate,
      search: searchQuery
    }),
    enabled: !!athleteProfile
  });

  // Check if onboarding needed
  useEffect(() => {
    if (athleteProfile === null) {
      navigate(createPageUrl('Onboarding'));
    }
  }, [athleteProfile, navigate]);

  // Default sport filter to athlete's sport
  useEffect(() => {
    if (athleteProfile?.sport_id && !filters.sport) {
      setFilters(prev => ({ ...prev, sport: athleteProfile.sport_id }));
    }
  }, [athleteProfile]);

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (campId) => {
      if (!athleteProfile) return;
      
      const intents = await base44.entities.CampIntent.filter({
        athlete_id: athleteProfile.id,
        camp_id: campId
      });
      
      if (intents.length > 0) {
        const intent = intents[0];
        if (intent.status === 'favorite') {
          await base44.entities.CampIntent.update(intent.id, { status: 'removed' });
        } else {
          await base44.entities.CampIntent.update(intent.id, { status: 'favorite' });
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
      queryClient.invalidateQueries({ queryKey: ['campSummaries'] });
    }
  });

  const availablePositions = useMemo(() => {
    const sportId = filters.sport || athleteProfile?.sport_id;
    return positions.filter(p => p.sport_id === sportId);
  }, [positions, filters.sport, athleteProfile]);

  const handleClearFilters = () => {
    setFilters({ sport: athleteProfile?.sport_id });
  };

  if (!athleteProfile) {
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
        ) : campSummaries.length === 0 ? (
          <div className="text-center py-20">
            <Search className="w-12 h-12 mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-deep-navy">No camps found</h3>
            <p className="text-gray-dark">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {campSummaries.map(summary => (
              <CampCard
                key={summary.camp_id}
                camp={{
                  id: summary.camp_id,
                  camp_name: summary.camp_name,
                  start_date: summary.start_date,
                  end_date: summary.end_date,
                  price: summary.price,
                  city: summary.city,
                  state: summary.state,
                  position_ids: summary.position_ids
                }}
                school={{
                  id: summary.school_id,
                  school_name: summary.school_name,
                  division: summary.school_division,
                  logo_url: summary.school_logo_url,
                  city: summary.school_city,
                  state: summary.school_state
                }}
                sport={{
                  id: summary.sport_id,
                  sport_name: summary.sport_name
                }}
                positions={summary.position_codes.map((code, idx) => ({
                  position_code: code,
                  id: summary.position_ids[idx]
                }))}
                isFavorite={summary.intent_status === 'favorite'}
                isRegistered={summary.intent_status === 'registered' || summary.intent_status === 'completed'}
                onFavoriteToggle={() => toggleFavoriteMutation.mutate(summary.camp_id)}
                onClick={() => navigate(createPageUrl(`CampDetail?id=${summary.camp_id}`))}
              />
            ))}
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