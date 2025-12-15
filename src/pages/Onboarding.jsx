import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Trophy, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const divisions = ["FBS", "FCS", "D2", "D3", "NAIA", "Other"];

export default function Onboarding() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    athlete_name: '',
    sport_id: '',
    grad_year: new Date().getFullYear() + 1,
    primary_position_id: '',
    secondary_position_ids: [],
    home_zip: '',
    radius_miles: 100,
    division_preferences: []
  });

  const { data: sports = [] } = useQuery({
    queryKey: ['sports'],
    queryFn: () => base44.entities.Sport.list()
  });

  const { data: allPositions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: () => base44.entities.Position.list()
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      navigate(createPageUrl('Discover'));
    }
  });

  // Default to Football
  useEffect(() => {
    if (sports.length > 0 && !formData.sport_id) {
      const football = sports.find(s => s.sport_name === 'Football');
      if (football) {
        setFormData(prev => ({ ...prev, sport_id: football.id }));
      }
    }
  }, [sports]);

  const filteredPositions = allPositions.filter(p => p.sport_id === formData.sport_id);

  const handleDivisionToggle = (div) => {
    const updated = formData.division_preferences.includes(div)
      ? formData.division_preferences.filter(d => d !== div)
      : [...formData.division_preferences, div];
    setFormData({ ...formData, division_preferences: updated });
  };

  const handleSecondaryPositionToggle = (posId) => {
    const updated = formData.secondary_position_ids.includes(posId)
      ? formData.secondary_position_ids.filter(p => p !== posId)
      : [...formData.secondary_position_ids, posId];
    setFormData({ ...formData, secondary_position_ids: updated });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  const isValid = formData.athlete_name && formData.sport_id && formData.primary_position_id;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4 pb-20">
      <div className="max-w-md mx-auto pt-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-electric-blue rounded-2xl mb-4">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome to RecruitMe</h1>
          <p className="text-slate-600">Let's set up your athlete profile</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-2xl p-6 shadow-sm">
          {/* Athlete Name */}
          <div>
            <Label htmlFor="athlete_name">Athlete Name *</Label>
            <Input
              id="athlete_name"
              value={formData.athlete_name}
              onChange={(e) => setFormData({ ...formData, athlete_name: e.target.value })}
              placeholder="Enter athlete's name"
              className="mt-1"
            />
          </div>

          {/* Sport */}
          <div>
            <Label htmlFor="sport">Sport *</Label>
            <Select
              value={formData.sport_id}
              onValueChange={(value) => setFormData({ 
                ...formData, 
                sport_id: value, 
                primary_position_id: '', 
                secondary_position_ids: [] 
              })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select sport" />
              </SelectTrigger>
              <SelectContent>
                {sports.map(sport => (
                  <SelectItem key={sport.id} value={sport.id}>{sport.sport_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Grad Year */}
          <div>
            <Label htmlFor="grad_year">Graduation Year *</Label>
            <Input
              id="grad_year"
              type="number"
              value={formData.grad_year}
              onChange={(e) => setFormData({ ...formData, grad_year: parseInt(e.target.value) })}
              className="mt-1"
            />
          </div>

          {/* Primary Position */}
          {filteredPositions.length > 0 && (
            <div>
              <Label htmlFor="primary_position">Primary Position *</Label>
              <Select
                value={formData.primary_position_id}
                onValueChange={(value) => setFormData({ ...formData, primary_position_id: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  {filteredPositions.map(pos => (
                    <SelectItem key={pos.id} value={pos.id}>
                      {pos.position_code} - {pos.position_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Secondary Positions */}
          {filteredPositions.length > 0 && (
            <div>
              <Label className="mb-2 block">Secondary Positions</Label>
              <div className="grid grid-cols-2 gap-2">
                {filteredPositions.filter(p => p.id !== formData.primary_position_id).map(pos => (
                  <div key={pos.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`sec-${pos.id}`}
                      checked={formData.secondary_position_ids.includes(pos.id)}
                      onCheckedChange={() => handleSecondaryPositionToggle(pos.id)}
                    />
                    <Label htmlFor={`sec-${pos.id}`} className="text-sm cursor-pointer">
                      {pos.position_code}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Home ZIP */}
          <div>
            <Label htmlFor="home_zip">Home ZIP Code</Label>
            <Input
              id="home_zip"
              value={formData.home_zip}
              onChange={(e) => setFormData({ ...formData, home_zip: e.target.value })}
              placeholder="12345"
              className="mt-1"
            />
          </div>

          {/* Radius */}
          <div>
            <Label htmlFor="radius_miles">Search Radius (miles)</Label>
            <Input
              id="radius_miles"
              type="number"
              value={formData.radius_miles}
              onChange={(e) => setFormData({ ...formData, radius_miles: parseInt(e.target.value) })}
              className="mt-1"
            />
          </div>

          {/* Division Preferences */}
          <div>
            <Label className="mb-2 block">Division Preferences</Label>
            <div className="grid grid-cols-3 gap-2">
              {divisions.map(div => (
                <div key={div} className="flex items-center space-x-2">
                  <Checkbox
                    id={`div-${div}`}
                    checked={formData.division_preferences.includes(div)}
                    onCheckedChange={() => handleDivisionToggle(div)}
                  />
                  <Label htmlFor={`div-${div}`} className="text-sm cursor-pointer">
                    {div}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={!isValid || updateProfileMutation.isPending}
            className="w-full bg-electric-blue hover:bg-deep-navy"
          >
            {updateProfileMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Get Started'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}