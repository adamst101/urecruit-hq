import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const divisions = ["FBS", "FCS", "D2", "D3", "NAIA", "Other"];
const states = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];

export default function FilterSheet({ 
  isOpen, 
  onClose, 
  filters, 
  onFilterChange, 
  positions = [],
  sports = [],
  onApply,
  onClear 
}) {
  const handleDivisionToggle = (div) => {
    const current = filters.divisions || [];
    const updated = current.includes(div)
      ? current.filter(d => d !== div)
      : [...current, div];
    onFilterChange({ ...filters, divisions: updated });
  };

  const handlePositionToggle = (posId) => {
    const current = filters.positions || [];
    const updated = current.includes(posId)
      ? current.filter(p => p !== posId)
      : [...current, posId];
    onFilterChange({ ...filters, positions: updated });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filter Camps</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Sport */}
          {sports.length > 1 && (
            <div>
              <Label className="text-sm font-semibold mb-2 block">Sport</Label>
              <Select
                value={filters.sport || 'all'}
                onValueChange={(value) => onFilterChange({ ...filters, sport: value === 'all' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Sports" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sports</SelectItem>
                  {sports.map(sport => (
                    <SelectItem key={sport.id} value={sport.id}>{sport.sport_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Divisions */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Division</Label>
            <div className="grid grid-cols-3 gap-2">
              {divisions.map(div => (
                <div key={div} className="flex items-center space-x-2">
                  <Checkbox
                    id={`div-${div}`}
                    checked={(filters.divisions || []).includes(div)}
                    onCheckedChange={() => handleDivisionToggle(div)}
                  />
                  <Label htmlFor={`div-${div}`} className="text-sm cursor-pointer">
                    {div}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Positions */}
          {positions.length > 0 && (
            <div>
              <Label className="text-sm font-semibold mb-2 block">Position</Label>
              <div className="grid grid-cols-2 gap-2">
                {positions.map(pos => (
                  <div key={pos.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`pos-${pos.id}`}
                      checked={(filters.positions || []).includes(pos.id)}
                      onCheckedChange={() => handlePositionToggle(pos.id)}
                    />
                    <Label htmlFor={`pos-${pos.id}`} className="text-sm cursor-pointer">
                      {pos.position_code}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* State */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">State</Label>
            <Select
              value={filters.state || 'all'}
              onValueChange={(value) => onFilterChange({ ...filters, state: value === 'all' ? '' : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {states.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold block">Date Range</Label>
            <div>
              <Label className="text-xs text-slate-500">Start Date</Label>
              <Input
                type="date"
                value={filters.startDate || ''}
                onChange={(e) => onFilterChange({ ...filters, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">End Date</Label>
              <Input
                type="date"
                value={filters.endDate || ''}
                onChange={(e) => onFilterChange({ ...filters, endDate: e.target.value })}
              />
            </div>
          </div>
        </div>

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={onClear} className="flex-1">
            Clear All
          </Button>
          <Button onClick={onApply} className="flex-1 bg-electric-blue hover:bg-deep-navy">
            Apply Filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}