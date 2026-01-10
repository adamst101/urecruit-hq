// src/components/filters/FilterSheet.jsx
import React, { useMemo } from "react";

const DIVISIONS = ["D1 (FBS)", "D1 (FCS)", "D2", "D3", "NAIA", "JUCO"];
const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"
];

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function sanitizeDateStr(v) {
  if (!v) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/**
 * Lightweight FilterSheet (no dependency on shadcn Sheet components)
 * Props:
 * - isOpen, onClose
 * - filters, onFilterChange
 * - positions, sports (optional lists)
 * - onApply, onClear
 */
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

  const selectedDivisions = asArray(safeFilters.divisions);
  const selectedPositions = asArray(safeFilters.positions);

  const selectedSport = safeFilters.sport ? String(safeFilters.sport) : "";
  const selectedState = safeFilters.state ? String(safeFilters.state) : "";

  const startDate = sanitizeDateStr(safeFilters.startDate);
  const endDate = sanitizeDateStr(safeFilters.endDate);

  const sportsList = useMemo(() => {
    const list = asArray(sports)
      .map((s) => ({
        id: normId(s),
        name: s?.sport_name || s?.name || "Sport",
      }))
      .filter((s) => s.id);
    list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return list;
  }, [sports]);

  const positionsList = useMemo(() => {
    const list = asArray(positions)
      .map((p) => ({
        id: normId(p),
        name: p?.position_code || p?.code || p?.position_name || "POS",
      }))
      .filter((p) => p.id);
    list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return list;
  }, [positions]);

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
    setFilters({ ...safeFilters, sport: value || "" });
  };

  const onStateChange = (value) => {
    setFilters({ ...safeFilters, state: value || "" });
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        onClick={() => onClose?.()}
        aria-label="Close filters"
      />

      {/* Panel */}
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl max-w-md mx-auto">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="font-semibold text-slate-900">Filter Camps</div>
          <button
            type="button"
            className="text-sm text-slate-600 hover:text-slate-900"
            onClick={() => onClose?.()}
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-6 max-h-[70vh] overflow-auto">
          {/* Sport */}
          {sportsList.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-slate-800 mb-2">Sport</div>
              <select
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                value={selectedSport}
                onChange={(e) => onSportChange(e.target.value)}
              >
                <option value="">All Sports</option>
                {sportsList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Divisions */}
          <div>
            <div className="text-sm font-semibold text-slate-800 mb-2">Division</div>
            <div className="grid grid-cols-2 gap-2">
              {DIVISIONS.map((div) => (
                <label key={div} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedDivisions.includes(div)}
                    onChange={() => toggleDivision(div)}
                  />
                  <span>{div}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Positions */}
          {positionsList.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-slate-800 mb-2">Position</div>
              <div className="grid grid-cols-2 gap-2">
                {positionsList.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedPositions.includes(String(p.id))}
                      onChange={() => togglePosition(p.id)}
                    />
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* State */}
          <div>
            <div className="text-sm font-semibold text-slate-800 mb-2">State</div>
            <select
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              value={selectedState}
              onChange={(e) => onStateChange(e.target.value)}
            >
              <option value="">All States</option>
              {STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-800">Date Range</div>

            <div>
              <div className="text-xs text-slate-500 mb-1">Start Date</div>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
              />
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1">End Date</div>
              <input
                type="date"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
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

        <div className="p-4 border-t border-slate-200 flex gap-2">
          <button
            type="button"
            className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
            onClick={() => onClear?.()}
          >
            Clear All
          </button>
          <button
            type="button"
            className="flex-1 bg-deep-navy text-white rounded-md px-3 py-2 text-sm"
            onClick={() => onApply?.()}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
