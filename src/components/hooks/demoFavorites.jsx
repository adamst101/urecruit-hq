// src/components/hooks/demoFavorites.js

/**
 * Demo favorites are intentionally client-only.
 * Scope by demoProfileId AND seasonYear to avoid cross-season bleed.
 */

function normId(x) {
  if (x == null) return null;
  return String(x);
}

function keyFor(demoProfileId, seasonYear) {
  const pid = demoProfileId || "default";
  const yr = seasonYear || "na";
  return `demo:favorites:${pid}:${yr}`;
}

export function getDemoFavorites(demoProfileId, seasonYear) {
  try {
    const raw = localStorage.getItem(keyFor(demoProfileId, seasonYear));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(normId).filter(Boolean) : [];
  } catch {
    // corrupted or blocked storage → fail safe
    return [];
  }
}

export function toggleDemoFavorite(demoProfileId, campId, seasonYear) {
  const id = normId(campId);
  if (!id) return getDemoFavorites(demoProfileId, seasonYear);

  const existing = getDemoFavorites(demoProfileId, seasonYear);
  const next = existing.includes(id)
    ? existing.filter((x) => x !== id)
    : [...existing, id];

  try {
    localStorage.setItem(
      keyFor(demoProfileId, seasonYear),
      JSON.stringify(next)
    );
  } catch {
    // ignore quota / private mode errors
  }

  return next;
}

export function isDemoFavorite(demoProfileId, campId, seasonYear) {
  const id = normId(campId);
  if (!id) return false;
  return getDemoFavorites(demoProfileId, seasonYear).includes(id);
}
