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
import { Badge } from "@/components/ui/badge";
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
function countActive(f) {
  if (!f) return 0;
  let n = 0;
  if (f.sport) n += 1;
  if (f.state) n += 1;
  if (asArray(f.divisions).length) n += 1;
  if (asArray(f.positions).length) n += 1;
  if (f.startDate) n += 1;
  if (f.endDate) n += 1;
  return n;
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

  // Lists
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

  // Selected values
  const selectedDivisions = asArray(safeFilters.divisions);
  const selectedPositions = asArray(safeFilters.positions);

  const selectedSport = safeFilters.sport ? String(safeFilters.sport) : "all";
  const selectedState = safeFilters.state ? String(safeFilters.state) : "all";

  const startDate = sanitizeDateStr(safeFilters.startDate);
  const endDate = sanitizeDateStr(safeFilters.endDate);

  const activeCount = countActive({
    sport: selectedSport !== "all" ? selectedSport : "",
    state: selectedState !== "all" ? selectedState : "",
    divisions: selectedDivisions,
    positions: selectedPositions,
    startDate,
    endDate,
  });

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
    // NOTE: store as 2-letter code (uppercase)
    setFilters({ ...safeFilters, state: value === "all" ? "" : String(value).toUpperCase() });
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
      <SheetContent side="bottom" className="h-[88vh] overflow-y-auto">
        <SheetHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>Filter Camps</SheetTitle>
            {activeCount > 0 && (
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                {activeCount} active
              </Badge>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Tip: Start with Sport + State, then narrow by Position and Dates.
          </div>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Sport */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <Label className="text-sm font-semibold mb-2 block">Sport</Label>
            <Select value={selectedSport} onValueChange={onSportChange}>
              <SelectTrigger className="h-11">
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

          {/* State */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <Label className="text-sm font-semibold mb-2 block">State</Label>
            <Select value={selectedState} onValueChange={onStateChange}>
              <SelectTrigger className="h-11">
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
            <div className="text-xs text-slate-500 mt-2">
              Uses the camp’s state code (e.g., TX).
            </div>
          </div>

          {/* Positions */}
          {positionsList.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold block">Position</Label>
                {selectedPositions.length > 0 && (
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    {selectedPositions.length} selected
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
                {positionsList.map((pos) => (
                  <label
                    key={pos.id}
                    htmlFor={`pos-${pos.id}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                  >
                    <Checkbox
                      id={`pos-${pos.id}`}
                      checked={selectedPositions.includes(String(pos.id))}
                      onCheckedChange={() => togglePosition(pos.id)}
                    />
                    <span className="text-sm text-slate-700">{pos.position_code}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Divisions */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold block">Division</Label>
              {selectedDivisions.length > 0 && (
                <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                  {selectedDivisions.length} selected
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              {DIVISIONS.map((div) => (
                <label
                  key={div}
                  htmlFor={`div-${div}`}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                >
                  <Checkbox
                    id={`div-${div}`}
                    checked={selectedDivisions.includes(div)}
                    onCheckedChange={() => toggleDivision(div)}
                  />
                  <span className="text-sm text-slate-700">{div}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <Label className="text-sm font-semibold block">Date Range</Label>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <Label className="text-xs text-slate-500">Start</Label>
                <Input
                  type="date"
                  className="h-11"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs text-slate-500">End</Label>
                <Input
                  type="date"
                  className="h-11"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => onEndDateChange(e.target.value)}
                />
              </div>
            </div>

            {startDate && endDate && endDate < startDate && (
              <div className="text-xs text-rose-600 mt-2">
                End date can’t be earlier than start date.
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={onClear} className="flex-1 h-11">
            Clear
          </Button>

          {/* Fix: ensure text is visible regardless of theme tokens */}
          <Button
            onClick={onApply}
            className="flex-1 h-11 bg-electric-blue text-white hover:bg-deep-navy"
          >
            Apply Filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
