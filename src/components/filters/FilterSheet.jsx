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

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
      </div>
      {children}
    </div>
  );
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
      <SheetContent side="bottom" className="h-[85vh] p-0">
        <div className="h-full flex flex-col">
          <SheetHeader className="border-b border-slate-200 bg-white px-4 py-4">
            <div className="max-w-3xl mx-auto w-full">
              <SheetTitle>Filter Camps</SheetTitle>
              <div className="mt-1 text-xs text-slate-500">
                Narrow results by sport, division, position, state, and date range.
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-5">
            <div className="max-w-3xl mx-auto w-full space-y-4">
              {sportsList.length > 1 && (
                <Section title="Sport">
                  <Select value={selectedSport} onValueChange={onSportChange}>
                    <SelectTrigger className="w-full bg-white">
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
                </Section>
              )}

              <Section title="Division">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {DIVISIONS.map((div) => (
                    <label
                      key={div}
                      htmlFor={`div-${div}`}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50 cursor-pointer"
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
              </Section>

              {positionsList.length > 0 && (
                <Section title="Position">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {positionsList.map((pos) => (
                      <label
                        key={pos.id}
                        htmlFor={`pos-${pos.id}`}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50 cursor-pointer"
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
                </Section>
              )}

              <Section title="State">
                <Select value={selectedState} onValueChange={onStateChange}>
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue placeholder="All States" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">All States</SelectItem>
                    {STATES.map((st) => (
                      <SelectItem key={st} value={st}>
                        {st}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Section>

              <Section title="Date Range">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-slate-600">Start Date</Label>
                    <Input
                      type="date"
                      className="mt-1 bg-white"
                      value={startDate}
                      onChange={(e) => onStartDateChange(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-600">End Date</Label>
                    <Input
                      type="date"
                      className="mt-1 bg-white"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(e) => onEndDateChange(e.target.value)}
                    />
                  </div>
                </div>

                {startDate && endDate && endDate < startDate && (
                  <div className="mt-3 text-xs text-rose-600">
                    End date can’t be earlier than start date.
                  </div>
                )}
              </Section>
            </div>
          </div>

          <SheetFooter className="border-t border-slate-200 bg-white px-4 py-3">
            <div className="max-w-3xl mx-auto w-full flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={onClear}
                className="w-full sm:w-1/2"
              >
                Clear All
              </Button>

              <Button
                onClick={onApply}
                className="w-full sm:w-1/2 bg-electric-blue hover:bg-deep-navy text-white hover:text-white"
              >
                Apply Filters
              </Button>
            </div>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
