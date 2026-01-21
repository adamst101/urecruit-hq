// src/components/filters/useCampFilters.jsx
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Minimal MVP hook for Discover filters.
 * Matches Discover.jsx expectations:
 *   const { nf, setNF, clearFilters } = useCampFilters();
 *
 * nf shape must align with filterUtils usage:
 *   nf.divisions, nf.sports, nf.positions, nf.startDate, nf.endDate
 */

const STORAGE_KEY = "camp_filters_v1";

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeFilters(raw) {
  const r = raw && typeof raw === "object" ? raw : {};

  return {
    divisions: Array.isArray(r.divisions) ? r.divisions : [],
    sports: Array.isArray(r.sports) ? r.sports : [],
    positions: Array.isArray(r.positions) ? r.positions : [],
    startDate: typeof r.startDate === "string" ? r.startDate : "",
    endDate: typeof r.endDate === "string" ? r.endDate : "",
  };
}

function getDefaultFilters() {
  return {
    divisions: [],
    sports: [],
    positions: [],
    startDate: "",
    endDate: "",
  };
}

export function useCampFilters() {
  const defaults = useMemo(() => getDefaultFilters(), []);

  const [nf, _setNF] = useState(() => {
    // Load persisted filters (optional but helpful)
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return defaults;
      return normalizeFilters(safeParse(stored));
    } catch {
      return defaults;
    }
  });

  // Persist whenever filters change (safe + lightweight)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nf));
    } catch {}
  }, [nf]);

  // Set filters: supports either partial object or updater function.
  const setNF = useCallback((next) => {
    _setNF((prev) => {
      const candidate = typeof next === "function" ? next(prev) : next;
      // Merge partial updates while keeping shape stable
      const merged = { ...prev, ...(candidate || {}) };
      return normalizeFilters(merged);
    });
  }, []);

  const clearFilters = useCallback(() => {
    _setNF(defaults);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [defaults]);

  return { nf, setNF, clearFilters };
}

export default useCampFilters;