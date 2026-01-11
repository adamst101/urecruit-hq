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

  const activeCount = useMemo(() => {
    let n = 0;
    if (safeFilters.sport) n += 1;
    if (safeFilters.state) n += 1;
    if (asArray(safeFilters.divisions).length) n += 1;
    if (asArray(safeFilters.positions).length) n += 1;
    if (safeFilters.startDate) n += 1;
    if (safeFilters.endDate) n += 1;
    return n;
  }, [safeFilters]);

  return (
    <Sheet open={!!isOpen} onOpenChange={(open) => (!open ? onClose?.() : null)}>
      <SheetContent side="bottom" className="h-[88vh] overflow-y-auto px-4 pb-24 pt-4">
        <SheetHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-lg font-extrabold text-deep-navy">
                Filter Camps
              </SheetTitle>
              <div className="text-xs text-slate-500 mt-1">
                Narrow results by sport, division, position, state, and dates.
              </div>
            </div>

            {activeCount > 0 && (
              <div className="shrink-0 rounded-full bg-slate-900 text-white text-xs px-2 py-1">
                {activeCount} active
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-5">
          {/* Sport */}
          {sportsList.length > 1 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <Label className="text-sm font-semibold mb-2 block text-slate-800">
                Sport
              </Label>
              <Select value={selectedSport} onValueChange={onSportChange}>
                <SelectTrigger className="bg-white">
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

          {/* Division */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Label className="text-sm font-semibold mb-2 block text-slate-800">
              Division
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {DIVISIONS.map((div) => (
                <label
                  key={div}
                  className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 cursor-pointer hover:border-slate-300"
                >
                  <Checkbox
                    checked={selectedDivisions.includes(div)}
                    onCheckedChange={() => toggleDivision(div)}
                  />
                  <span className="text-sm text-slate-700">{div}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Positions */}
          {positionsList.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <Label className="text-sm font-semibold text-slate-800">
                  Position
                </Label>
                <div className="text-xs text-slate-500">
                  {selectedPositions.length} selected
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {positionsList.map((pos) => (
                  <label
                    key={pos.id}
                    className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 cursor-pointer hover:border-slate-300"
                  >
                    <Checkbox
                      checked={selectedPositions.includes(String(pos.id))}
                      onCheckedChange={() => togglePosition(pos.id)}
                    />
                    <span className="text-sm text-slate-700">{pos.position_code}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* State */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Label className="text-sm font-semibold mb-2 block text-slate-800">
              State
            </Label>
            <Select value={selectedState} onValueChange={onStateChange}>
              <SelectTrigger className="bg-white">
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
              Uses 2-letter codes (TX, OK, CA…).
            </div>
          </div>

          {/* Date Range */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Label className="text-sm font-semibold block text-slate-800 mb-3">
              Date Range
            </Label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">Start Date</Label>
                <Input
                  type="date"
                  className="bg-white"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs text-slate-500">End Date</Label>
                <Input
                  type="date"
                  className="bg-white"
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

        {/* Sticky footer */}
        <SheetFooter className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 px-4 py-3">
          <div className="max-w-5xl mx-auto w-full flex gap-2">
            <Button variant="outline" onClick={onClear} className="flex-1">
              Clear All
            </Button>

            {/* FIX: force visible label */}
            <Button
              onClick={onApply}
              className="flex-1 bg-electric-blue text-white hover:bg-deep-navy"
            >
              Apply Filters
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
