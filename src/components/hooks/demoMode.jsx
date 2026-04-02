// src/components/hooks/demoMode.jsx

import { footballDemoSeasonYear } from "../utils/seasonEntitlements.jsx";

/**
 * Demo Mode (session-persisted)
 *
 * Contract:
 * - Demo defaults to "previous season" (football rule, Feb 1 rollover)
 * - Home "Try Free Demo" → /DemoStory (sets demo mode + seasonYear here before navigating)
 * - Pages read this to preserve demo context across the journey until logout/clear
 */

const KEY = "demoMode_v1";

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getDemoDefaults() {
  const demoSeasonYear = footballDemoSeasonYear();
  return { demoSeasonYear };
}

/**
 * Persist demo mode for the session.
 * @param {number} seasonYear
 */
export function setDemoMode(seasonYear) {
  const y = Number(seasonYear);
  const { demoSeasonYear } = getDemoDefaults();

  const payload = {
    mode: "demo",
    // if caller didn't pass a valid year, fall back to default previous season
    seasonYear: Number.isFinite(y) ? y : demoSeasonYear,
    setAt: new Date().toISOString(),
  };

  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {}
  return payload;
}

/**
 * Read demo mode from session storage.
 * Returns null when not set.
 */
export function readDemoMode() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const obj = safeParse(raw);
    if (!obj || obj.mode !== "demo") return null;

    const y = Number(obj.seasonYear);
    return {
      mode: "demo",
      seasonYear: Number.isFinite(y) ? y : null,
      setAt: obj.setAt || null,
    };
  } catch {
    return null;
  }
}

/**
 * Clear demo mode (session)
 */
export function clearDemoMode() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
