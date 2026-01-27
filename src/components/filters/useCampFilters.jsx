// src/components/filters/useCampFilters.jsx
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Discover filter state (decision: single-select Sport + single-select State in UI,
 * but keep SPORTS as an array to match filterUtils.matchesSport(r, nf.sports)).
 *
 * nf shape (authoritative):
 *   nf.divisions: string[]
 *   nf.sports: string[]        // 0 or 1 sportId(s) typically, but supports multi
 *   nf.positions: string[]
 *   nf.state: string           // "" means all
 *   nf.startDate: "YYYY-MM-DD" | ""
 *   nf.endDate: "YYYY-MM-DD" | ""
 */

const STORAGE_KEY_V2 = "camp_filters_v2";
const STORAGE_KEY_V1 = "camp_filters_v1"; // legacy

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function normDateStr(v) {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function getDefaultFilters() {
  return {
    divisions: [],
    sports: [],
    positions: [],
    state: "",
    startDate: "",
    endDate: "",
  };
}

function normalizeFilters(raw) {
  const r = raw && typeof raw === "object" ? raw : {};

  // ✅ Backwards compatibility:
  // Some earlier FilterSheet versions used `sport` (single string) not `sports` (array)
  const legacySport = String(r.sport ?? "").trim();
  const legacySports = Array.isArray(r.sports) ? r.sports : [];
  const sports =
    legacySport && legacySports.length === 0 ? [legacySport] : uniqStrings(legacySports);

  const startDate = normDateStr(r.startDate);
  const endDate = normDateStr(r.endDate);

  // If date order is invalid, clear endDate
  const safeEnd = startDate && endDate && endDate < startDate ? "" : endDate;

  return {
    divisions: uniqStrings(r.divisions),
    sports: uniqStrings(sports),
    positions: uniqStrings(r.positions),
    state: String(r.state ?? "").trim(), // "" => All
    startDate,
    endDate: safeEnd,
  };
}

function loadPersisted() {
  const defaults = getDefaultFilters();

  // Prefer V2
  try {
    const storedV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (storedV2) return normalizeFilters(safeParse(storedV2));
  } catch {}

  // Migrate V1 -> V2 if present
  try {
    const storedV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (!storedV1) return defaults;

    const migrated = normalizeFilters(safeParse(storedV1));
    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(migrated));
      localStorage.removeItem(STORAGE_KEY_V1);
    } catch {}
    return migrated;
  } catch {
    return defaults;
  }
}

export function useCampFilters() {
  const defaults = useMemo(() => getDefaultFilters(), []);

  const [nf, _setNF] = useState(() => loadPersisted());

  // Persist whenever filters change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(nf));
    } catch {}
  }, [nf]);

  /**
   * setNF supports:
   * - partial object: setNF({ sports: ["id"] })
   * - updater fn: setNF(prev => ({ ...prev, ... }))
   */
  const setNF = useCallback((next) => {
    _setNF((prev) => {
      const candidate = typeof next === "function" ? next(prev) : next;
      const merged = { ...prev, ...(candidate || {}) };
      return normalizeFilters(merged);
    });
  }, []);

  const clearFilters = useCallback(() => {
    _setNF(defaults);
    try {
      localStorage.removeItem(STORAGE_KEY_V2);
      localStorage.removeItem(STORAGE_KEY_V1);
    } catch {}
  }, [defaults]);

  return { nf, setNF, clearFilters };
}

export default useCampFilters;
