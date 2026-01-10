// src/components/hooks/demoMode.js
const RM_MODE_KEY = "rm_mode";
const RM_DEMO_SEASON_KEY = "rm_demo_season";

export function getDemoDefaults() {
  const y = new Date().getFullYear();
  return { demoSeasonYear: y - 1 };
}

export function setDemoMode(seasonYear) {
  try {
    localStorage.setItem(RM_MODE_KEY, "demo");
    localStorage.setItem(RM_DEMO_SEASON_KEY, String(seasonYear));
  } catch {}
}

export function clearDemoMode() {
  try {
    localStorage.removeItem(RM_MODE_KEY);
    localStorage.removeItem(RM_DEMO_SEASON_KEY);
  } catch {}
}

export function readDemoMode() {
  try {
    const mode = localStorage.getItem(RM_MODE_KEY);
    const season = localStorage.getItem(RM_DEMO_SEASON_KEY);
    if (mode !== "demo") return { mode: null, seasonYear: null };
    const seasonYear = season ? Number(season) : null;
    return {
      mode: "demo",
      seasonYear: Number.isFinite(seasonYear) ? seasonYear : null,
    };
  } catch {
    return { mode: null, seasonYear: null };
  }
}
