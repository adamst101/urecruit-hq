import { useCallback, useEffect, useMemo, useState } from "react";

const KEY = "recruitme_demo_profile_v1";

const defaultProfile = {
  sport_id: null,
  position_ids: [],
  state: null,
  division: null,
  grad_year: null
};

function safeParse(json) {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export function useDemoProfile() {
  const [profile, setProfile] = useState(defaultProfile);
  const [loaded, setLoaded] = useState(false);

  // Load once
  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? safeParse(raw) : null;
    setProfile({ ...defaultProfile, ...(parsed || {}) });
    setLoaded(true);
  }, []);

  const persist = useCallback((next) => {
    setProfile(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }, []);

  const update = useCallback(
    (patch) => {
      const next = { ...profile, ...(patch || {}) };
      persist(next);
    },
    [profile, persist]
  );

  const clear = useCallback(() => {
    localStorage.removeItem(KEY);
    setProfile(defaultProfile);
  }, []);

  const isComplete = useMemo(() => {
    // Keep this minimal so demo is easy to start
    return !!profile.sport_id || !!profile.state || !!profile.division || (profile.position_ids?.length || 0) > 0;
  }, [profile]);

  return {
    loaded,
    demoProfile: profile,
    setDemoProfile: persist,
    updateDemoProfile: update,
    clearDemoProfile: clear,
    isComplete
  };
}