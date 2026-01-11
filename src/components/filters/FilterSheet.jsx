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

  // Normalize lists (prevents key warnings + supports id/_id/uuid)
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

  const activeCount =
    (safeFilters.sport ? 1 : 0) +
    (safeFilters.state ? 1 : 0) +
    (selectedDivisions.length ? 1 : 0) +
    (selectedPositions.length ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0);

  return (
    <Sheet open={!!isOpen} onOpenChange={(open) => (!open ? onClose?.() : null)}>
      <SheetContent side="bottom" className="h-[88vh] overflow-y-auto px-4">
        <SheetHeader className="pt-2">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-base font-extrabold text-deep-navy">
              Filter Camps
            </SheetTitle>

            {activeCount > 0 && (
              <div className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                {activeCount} active
              </div>
            )}
          </div>

          <div className="text-xs text-slate-500 mt-1">
            Apply one filter at a time if you’re not seeing results.
          </div>
        </SheetHeader>

        <div className="space-y-4 py-5">
          {/* Sport */}
          {sportsList.length > 1 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <Label className="text-sm font-bold text-deep-navy mb-2 block">Sport</Label>
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

          {/* Division */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-bold text-deep-navy mb-2 block">Division</Label>
              {selectedDivisions.length > 0 && (
                <div className="text-xs text-slate-500">{selectedDivisions.length} selected</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {DIVISIONS.map((div) => (
                <label
                  key={div}
                  htmlFor={`div-${div}`}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 cursor-pointer"
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

          {/* Positions */}
          {positionsList.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold text-deep-navy mb-2 block">Position</Label>
                {selectedPositions.length > 0 && (
                  <div className="text-xs text-slate-500">{selectedPositions.length} selected</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {positionsList.map((pos) => (
                  <label
                    key={pos.id}
                    htmlFor={`pos-${pos.id}`}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 cursor-pointer"
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

          {/* State */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <Label className="text-sm font-bold text-deep-navy mb-2 block">State</Label>
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

            <div className="text-[11px] text-slate-500 mt-2">
              If your data stores full state names (e.g., “Texas”), filters still work via normalization.
            </div>
          </div>

          {/* Date Range */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <Label className="text-sm font-bold text-deep-navy block">Date Range</Label>
            <div className="text-xs text-slate-500 mt-1">Filters match camp start date.</div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">Start</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                />
              </div>

              <div>
                <Label className="text-xs text-slate-500">End</Label>
                <Input
                  type="date"
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

        <SheetFooter className="gap-2 pb-4">
          <Button variant="outline" onClick={onClear} className="flex-1">
            Clear All
          </Button>

          {/* IMPORTANT: Use default Button styling so text is always visible */}
          <Button onClick={onApply} className="flex-1">
            Apply Filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
