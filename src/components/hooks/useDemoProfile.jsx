import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * useDemoProfile
 *
 * Demo personalization stored in localStorage.
 * - Provides a stable demoProfile.id (required for demo-local favorites keys)
 * - Exposes: { loaded, demoProfile, setDemoProfile, resetDemoProfile, refresh }
 *
 * Storage keys:
 * - demo:profile:v1   => profile object
 */
const STORAGE_KEY = "demo:profile:v1";

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function makeId() {
  // Stable enough for local demo identity; avoids crypto dependency.
  return `dp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultProfile(existingId) {
  return {
    id: existingId || makeId(),
    // Demo filters (null means "no filter")
    sport_id: null,
    state: null,
    division: null,
    position_ids: []
  };
}

function normalizeProfile(raw) {
  // Ensures shape is consistent and safe
  const base = defaultProfile(raw?.id);

  return {
    id: raw?.id || base.id,
    sport_id: raw?.sport_id ?? base.sport_id,
    state: raw?.state ?? base.state,
    division: raw?.division ?? base.division,
    position_ids: Array.isArray(raw?.position_ids) ? raw.position_ids : base.position_ids
  };
}

export function useDemoProfile() {
  const [loaded, setLoaded] = useState(false);
  const [demoProfile, setDemoProfileState] = useState(() => defaultProfile());

  // Load from localStorage once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? safeParse(raw) : null;
      const normalized = normalizeProfile(parsed);
      setDemoProfileState(normalized);

      // Persist back to ensure we always have an id + correct shape
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // If localStorage fails (privacy mode), fall back to in-memory profile
      setDemoProfileState((prev) => normalizeProfile(prev));
    } finally {
      setLoaded(true);
    }
  }, []);

  // Write-through setter (merges patches, normalizes, persists)
  const setDemoProfile = useCallback((patchOrUpdater) => {
    setDemoProfileState((prev) => {
      const patch =
        typeof patchOrUpdater === "function" ? patchOrUpdater(prev) : patchOrUpdater;

      const merged = normalizeProfile({ ...prev, ...(patch || {}) });

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {}

      return merged;
    });
  }, []);

  // Hard refresh from localStorage (useful if something else updates storage)
  const refresh = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? safeParse(raw) : null;
      const normalized = normalizeProfile(parsed);
      setDemoProfileState(normalized);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  const resetDemoProfile = useCallback(() => {
    setDemoProfileState((prev) => {
      const next = defaultProfile(prev?.id); // keep same id so favorites stay tied
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Convenience: stable id for favorites keys, always present after loaded
  const demoProfileId = useMemo(() => demoProfile?.id || "default", [demoProfile?.id]);

  return {
    loaded,
    demoProfile,
    demoProfileId,
    setDemoProfile,
    resetDemoProfile,
    refresh
  };
}
