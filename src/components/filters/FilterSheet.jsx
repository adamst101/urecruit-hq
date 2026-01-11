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
import { Separator } from "@/components/ui/separator";
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

  const hasAnyFilters =
    !!safeFilters.sport ||
    !!safeFilters.state ||
    (selectedDivisions && selectedDivisions.length > 0) ||
    (selectedPositions && selectedPositions.length > 0) ||
    !!startDate ||
    !!endDate;

  return (
    <Sheet open={!!isOpen} onOpenChange={(open) => (!open ? onClose?.() : null)}>
      <SheetContent side="bottom" className="h-[88vh] overflow-y-auto">
        <SheetHeader className="pb-2">
          <SheetTitle>Filter Camps</SheetTitle>
          <div className="text-xs text-slate-500">
            Narrow the list. If you get zero results, clear filters and re-apply one at a time.
          </div>
        </SheetHeader>

        <div className="space-y-6 py-5">
          {/* Sport */}
          {sportsList.length > 1 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Sport</Label>
                {safeFilters.sport ? (
                  <button
                    type="button"
                    className="text-xs text-slate-600 underline"
                    onClick={() => setFilters({ ...safeFilters, sport: "" })}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
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
            </section>
          )}

          <Separator />

          {/* Location */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Location</Label>
              {safeFilters.state ? (
                <button
                  type="button"
                  className="text-xs text-slate-600 underline"
                  onClick={() => setFilters({ ...safeFilters, state: "" })}
                >
                  Clear
                </button>
              ) : null}
            </div>

            <Label className="text-xs text-slate-500">State</Label>
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

            <div className="text-[11px] text-slate-500 leading-snug">
              Note: State matching is normalized (e.g., “TX” vs “Texas”) on Discover/Calendar.
            </div>
          </section>

          <Separator />

          {/* Division */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Division</Label>
              {selectedDivisions.length ? (
                <button
                  type="button"
                  className="text-xs text-slate-600 underline"
                  onClick={() => setFilters({ ...safeFilters, divisions: [] })}
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {DIVISIONS.map((div) => (
                <label
                  key={div}
                  htmlFor={`div-${div}`}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 cursor-pointer"
                >
                  <Checkbox
                    id={`div-${div}`}
                    checked={selectedDivisions.includes(div)}
                    onCheckedChange={() => toggleDivision(div)}
                  />
                  <span className="text-sm text-slate-800">{div}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Positions */}
          {positionsList.length > 0 && (
            <>
              <Separator />
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Position</Label>
                  {selectedPositions.length ? (
                    <button
                      type="button"
                      className="text-xs text-slate-600 underline"
                      onClick={() => setFilters({ ...safeFilters, positions: [] })}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {positionsList.map((pos) => (
                    <label
                      key={pos.id}
                      htmlFor={`pos-${pos.id}`}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 cursor-pointer"
                    >
                      <Checkbox
                        id={`pos-${pos.id}`}
                        checked={selectedPositions.includes(String(pos.id))}
                        onCheckedChange={() => togglePosition(pos.id)}
                      />
                      <span className="text-sm text-slate-800">{pos.position_code}</span>
                    </label>
                  ))}
                </div>
              </section>
            </>
          )}

          <Separator />

          {/* Date Range */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Date Range</Label>
              {(startDate || endDate) ? (
                <button
                  type="button"
                  className="text-xs text-slate-600 underline"
                  onClick={() => setFilters({ ...safeFilters, startDate: "", endDate: "" })}
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Start</Label>
                <Input
                  type="date"
                  className="h-11"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                />
              </div>

              <div className="space-y-1">
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
              <div className="text-xs text-rose-600">
                End date can’t be earlier than start date.
              </div>
            )}
          </section>
        </div>

        <SheetFooter className="gap-2 pb-3">
          <Button
            variant="outline"
            onClick={onClear}
            className="flex-1 h-11"
          >
            Clear All
          </Button>

          {/* ✅ Fix text visibility: do NOT use custom bg classes that can conflict with Button text */}
          <Button
            onClick={onApply}
            className="flex-1 h-11"
          >
            Apply Filters
          </Button>
        </SheetFooter>

        {hasAnyFilters ? (
          <div className="pb-6 text-center text-xs text-slate-500">
            Tip: If you get zero results, clear filters and add them back one at a time.
          </div>
        ) : (
          <div className="pb-6" />
        )}
      </SheetContent>
    </Sheet>
  );
}
