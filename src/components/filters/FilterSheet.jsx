import React, { useEffect, useMemo } from "react";
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

// Best-effort active flag reader (schema-safe)
function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;

  const st = String(row?.status || "").toLowerCase().trim();
  if (st === "active") return true;
  if (st === "inactive" || st === "in_active" || st === "in active") return false;

  // If no field exists on the entity, treat as active for backwards compatibility
  return true;
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
      .filter((s) => readActiveFlag(s) === true) // ✅ hide inactive completely
      .map((s) => ({
        id: normId(s),
        sport_name: s?.sport_name || s?.name || s?.sportName || "Sport",
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

  // ✅ If a previously-selected sport becomes inactive/missing, clear it.
  useEffect(() => {
    if (!selectedSport || selectedSport === "all") return;
    const exists = sportsList.some((s) => String(s.id) === String(selectedSport));
    if (!exists) {
      setFilters({ ...safeFilters, sport: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportsList]);

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

  const hasActive =
    !!safeFilters.sport ||
    !!safeFilters.state ||
    selectedDivisions.length > 0 ||
    selectedPositions.length > 0 ||
    !!startDate ||
    !!endDate;

  return (
    <Sheet open={!!isOpen} onOpenChange={(open) => (!open ? onClose?.() : null)}>
      <SheetContent side="bottom" className="h-[88vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
          <SheetHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <SheetTitle className="text-left">Filters</SheetTitle>
                <div className="text-xs text-slate-500 mt-1">
                  Narrow camps by division, state, position, and dates.
                </div>
              </div>

              {hasActive ? (
                <Button variant="outline" onClick={onClear} className="shrink-0">
                  Clear
                </Button>
              ) : null}
            </div>
          </SheetHeader>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-6">
          {/* Sport */}
          {sportsList.length > 1 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Sport</Label>
              <Select value={selectedSport || "all"} onValueChange={onSportChange}>
                <SelectTrigger>
                  <SelectValue placeholder="All Sports" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sports</SelectItem>
                  {sportsList.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.sport_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* State */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">State</Label>
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

          {/* Division */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Division</Label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                {DIVISIONS.map((div) => (
                  <label
                    key={div}
                    className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2"
                  >
                    <Checkbox
                      checked={selectedDivisions.includes(div)}
                      onCheckedChange={() => toggleDivision(div)}
                    />
                    <span className="text-sm text-slate-800">{div}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="text-xs text-slate-500">Tip: Select one or more divisions.</div>
          </div>

          {/* Positions */}
          {positionsList.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Position</Label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="grid grid-cols-2 gap-2">
                  {positionsList.map((pos) => (
                    <label
                      key={pos.id}
                      className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2"
                    >
                      <Checkbox
                        checked={selectedPositions.includes(String(pos.id))}
                        onCheckedChange={() => togglePosition(pos.id)}
                      />
                      <span className="text-sm text-slate-800">{pos.position_code}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="text-xs text-slate-500">Tip: Choose multiple if needed.</div>
            </div>
          )}

          {/* Date Range */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Date Range</Label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Start</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                />
              </div>

              <div className="space-y-1">
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
              <div className="text-xs text-rose-600">
                End date can’t be earlier than start date.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <SheetFooter className="sticky bottom-0 z-10 border-t border-slate-200 bg-white px-5 py-4 gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>

          <Button onClick={onApply} className="flex-1">
            Apply Filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
