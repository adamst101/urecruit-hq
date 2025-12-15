import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { User, Loader2, LogOut } from 'lucide-react';
import BottomNav from '@/components/navigation/BottomNav';
import { toast } from 'sonner';

const divisions = ["FBS", "FCS", "D2", "D3", "NAIA", "Other"];

export default function Profile() {
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

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
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
      toast.success('Profile updated successfully');
    }
  });

  // Load user data into form
  useEffect(() => {
    if (user) {
      setFormData({
        athlete_name: user.athlete_name || '',
        sport_id: user.sport_id || '',
        grad_year: user.grad_year || new Date().getFullYear() + 1,
        primary_position_id: user.primary_position_id || '',
        secondary_position_ids: user.secondary_position_ids || [],
        home_zip: user.home_zip || '',
        radius_miles: user.radius_miles || 100,
        division_preferences: user.division_preferences || []
      });
    }
  }, [user]);

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

  const handleLogout = () => {
    base44.auth.logout();
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-md mx-auto p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-electric-blue/10 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-electric-blue" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-md mx-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-2xl p-6 shadow-sm">
          {/* Athlete Name */}
          <div>
            <Label htmlFor="athlete_name">Athlete Name</Label>
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
            <Label htmlFor="sport">Sport</Label>
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
            <Label htmlFor="grad_year">Graduation Year</Label>
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
              <Label htmlFor="primary_position">Primary Position</Label>
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

          {/* Save Button */}
          <Button
            type="submit"
            disabled={updateProfileMutation.isPending}
            className="w-full bg-electric-blue hover:bg-deep-navy"
          >
            {updateProfileMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Profile'
            )}
          </Button>
        </form>

        {/* Logout Button */}
        <Button
          variant="outline"
          className="w-full mt-4"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Log Out
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}