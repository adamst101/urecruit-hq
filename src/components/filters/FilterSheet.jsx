// src/components/filters/FilterSheet.jsx
import React, { useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DIVISIONS = ["D1 (FBS)", "D1 (FCS)", "D2", "D3", "NAIA", "JUCO"];
const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function sanitizeDateStr(v) {
  if (!v) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export default function FilterSheet({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  positions = [],
  sports = [],
  onApply,
  onClear,
}) {
  const safeFilters = filters || {};

  const sportsList = useMemo(() => {
    const list = asArray(sports)
      .map((s) => ({
        id: normId(s),
        sport_name: s?.sport_name || s?.name || "Sport",
      }))
      .filter((s) => s.id);

    list.sort((a, b) => String(a.sport_name).localeCompare(String(b.sport_name)));
    return list;
  }, [sports]);

  const positionsList = useMemo(() => {
    const list = asArray(positions)
      .map((p) => ({
        id: normId(p),
        position_code: p?.position_code || p?.code || p?.position_name || "POS",
      }))
      .filter((p) => p.id);

    list.sort((a, b) => String(a.position_code).localeCompare(String(b.position_code)));
    return list;
  }, [positions]);

  const selectedDivisions = asArray(safeFilters.divisions);
  const selectedPositions = asArray(safeFilters.positions);

  const selectedSport = safeFilters.sport ? String(safeFilters.sport) : "all";
  const selectedState = safeFilters.state ? String(safeFilters.state) : "all";

  const startDate = sanitizeDateStr(safeFilters.startDate);
  const endDate = sanitizeDateStr(safeFilters.endDate);

  const setFilters = (next) => onFilterChange?.(next);

  const toggleDivision = (div) => {
    const next = selectedDivisions.includes(div)
      ? selectedDivisions.filter((d) => d !== div)
      : [...selectedDivisions, div];
    setFilters({ ...safeFilters, divisions: next });
  };

  const togglePosition = (posId) => {
    const id = String(posId);
    const next = selectedPositions.includes(id)
      ? selectedPositions.filter((p) => p !== id)
      : [...selectedPositions, id];
    setFilters({ ...safeFilters, positions: next });
  };

  const onSportChange = (value) => {
    setFilters({ ...safeFilters, sport: value === "all" ? "" : value });
  };

  const onStateChange = (value) => {
    setFilters({ ...safeFilters, state: value === "all" ? "" : value });
  };

  const onStartDateChange = (value) => {
    const v = sanitizeDateStr(value);
    const nextEnd = endDate && v && endDate < v ? "" : endDate;
    setFilters({ ...safeFilters, startDate: v, endDate: nextEnd });
  };

  const onEndDateChange = (value) => {
    const v = sanitizeDateStr(value);
    if (startDate && v && v < startDate) {
      setFilters({ ...safeFilters, endDate: "" });
      return;
    }
    setFilters({ ...safeFilters, endDate: v });
  };

  return (
    <Sheet open={!!isOpen} onOpenChange={(open) => (!open ? onClose?.() : null)}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filter Camps</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Sport */}
          {sportsList.length > 1 && (
            <div>
              <Label className="text-sm font-semibold mb-2 block">Sport</Label>
              <Select value={selectedSport} onValueChange={onSportChange}>
                <SelectTrigger>
                  <SelectValue placeholder="All Sports" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sports</SelectItem>
                  {sportsList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.sport_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Divisions */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Division</Label>
            <div className="grid grid-cols-3 gap-2">
              {DIVISIONS.map((div) => (
                <div key={div} className="flex items-center space-x-2">
                  <Checkbox
                    id={`div-${div}`}
                    checked={selectedDivisions.includes(div)}
                    onCheckedChange={() => toggleDivision(div)}
                  />
                  <Label htmlFor={`div-${div}`} className="text-sm cursor-pointer">
                    {div}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Positions */}
          {positionsList.length > 0 && (
            <div>
              <Label className="text-sm font-semibold mb-2 block">Position</Label>
              <div className="grid grid-cols-2 gap-2">
                {positionsList.map((pos) => (
                  <div key={pos.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`pos-${pos.id}`}
                      checked={selectedPositions.includes(String(pos.id))}
                      onCheckedChange={() => togglePosition(pos.id)}
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
            <Select value={selectedState} onValueChange={onStateChange}>
              <SelectTrigger>
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {STATES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
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
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs text-slate-500">End Date</Label>
              <Input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => onEndDateChange(e.target.value)}
              />
            </div>

            {startDate && endDate && endDate < startDate && (
              <div className="text-xs text-rose-600">
                End date can’t be earlier than start date.
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={onClear} className="flex-1">
            Clear All
          </Button>
          <Button
            onClick={onApply}
            className="flex-1 bg-electric-blue hover:bg-deep-navy"
          >
            Apply Filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
