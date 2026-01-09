// src/components/hooks/useDemoProfile.js
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * useDemoProfile
 *
 * Demo personalization stored in localStorage.
 * - Provides a stable demoProfile.id (required for demo-local favorites keys)
 * - Backward-compatible API:
 *    { loaded, demoProfile, demoProfileId,
 *      updateDemoProfile, clearDemoProfile, refresh,
 *      setDemoProfile, resetDemoProfile }
 *
 * Storage keys:
 * - demo:profile:v1   => profile object
 */
const STORAGE_KEY = "demo:profile:v1";

// ---------- helpers ----------
function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function safeStringId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function makeId() {
  // stable enough for local demo identity; avoids crypto dependency
  return `dp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultProfile(existingId) {
  return {
    id: existingId || makeId(),
    // Demo filters (null means "no filter")
    sport_id: null,
    state: null,
    division: null,
    position_ids: [],
    // Optional future fields
    grad_year: null,
  };
}

function normalizeProfile(raw) {
  const base = defaultProfile(raw?.id);

  const sport_id = safeStringId(raw?.sport_id) ?? base.sport_id;
  const state = typeof raw?.state === "string" ? raw.state : base.state;
  const division = typeof raw?.division === "string" ? raw.division : base.division;

  const position_ids = Array.isArray(raw?.position_ids)
    ? uniq(raw.position_ids.map(safeStringId)).filter(Boolean)
    : base.position_ids;

  const grad_year =
    raw?.grad_year === null || raw?.grad_year === undefined
      ? base.grad_year
      : Number.isFinite(Number(raw.grad_year))
        ? Number(raw.grad_year)
        : base.grad_year;

  return {
    id: safeStringId(raw?.id) || base.id,
    sport_id,
    state,
    division,
    position_ids,
    grad_year,
  };
}

function readFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? safeParse(raw) : null;
    return normalizeProfile(parsed);
  } catch {
    return null;
  }
}

function writeToStorage(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function useDemoProfile() {
  const [loaded, setLoaded] = useState(false);
  const [demoProfile, setDemoProfileState] = useState(() => defaultProfile());

  // Load once + ensure persisted shape
  useEffect(() => {
    const fromStorage = readFromStorage();
    const next = fromStorage ? fromStorage : normalizeProfile(demoProfile);

    setDemoProfileState(next);
    writeToStorage(next);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync across tabs/windows
  useEffect(() => {
    function onStorage(e) {
      if (!e) return;
      if (e.key !== STORAGE_KEY) return;

      const next = readFromStorage();
      if (!next) return;

      setDemoProfileState((prev) => {
        // Avoid useless rerenders
        const prevStr = JSON.stringify(prev);
        const nextStr = JSON.stringify(next);
        return prevStr === nextStr ? prev : next;
      });
      setLoaded(true);
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Core write-through setter (patch or updater)
  const setDemoProfile = useCallback((patchOrUpdater) => {
    setDemoProfileState((prev) => {
      const patch =
        typeof patchOrUpdater === "function" ? patchOrUpdater(prev) : patchOrUpdater;

      const merged = normalizeProfile({ ...prev, ...(patch || {}) });
      writeToStorage(merged);
      return merged;
    });
  }, []);

  // Back-compat alias used by your pages (DemoSetup etc.)
  const updateDemoProfile = useCallback(
    (patch) => setDemoProfile(patch),
    [setDemoProfile]
  );

  // Hard refresh from localStorage (useful if storage updated outside React)
  const refresh = useCallback(() => {
    const next = readFromStorage();
    if (next) setDemoProfileState(next);
    setLoaded(true);
  }, []);

  // Reset filters but KEEP SAME id (favorites remain tied)
  const resetDemoProfile = useCallback(() => {
    setDemoProfileState((prev) => {
      const next = defaultProfile(prev?.id);
      writeToStorage(next);
      return next;
    });
  }, []);

  // Back-compat alias used by your pages
  const clearDemoProfile = useCallback(() => {
    resetDemoProfile();
  }, [resetDemoProfile]);

  const demoProfileId = useMemo(
    () => (demoProfile?.id ? String(demoProfile.id) : "default"),
    [demoProfile?.id]
  );

  return {
    loaded,
    demoProfile,
    demoProfileId,

    // Preferred API
    setDemoProfile,
    resetDemoProfile,
    refresh,

    // Backward-compatible API for existing callers
    updateDemoProfile,
    clearDemoProfile,
  };
}
