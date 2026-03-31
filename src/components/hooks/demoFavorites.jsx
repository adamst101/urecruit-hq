// src/components/hooks/demoFavorites.js
//
// Demo camp favorites — stored in sessionStorage so each browser tab
// is an isolated sandbox. State resets to the canonical Marcus baseline
// whenever a new tab/session starts; it never leaks across visitors.
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
    const raw = sessionStorage.getItem(keyFor(demoProfileId, seasonYear));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(normId).filter(Boolean) : [];
  } catch {
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
    sessionStorage.setItem(keyFor(demoProfileId, seasonYear), JSON.stringify(next));
  } catch {}

  return next;
}

export function isDemoFavorite(demoProfileId, campId, seasonYear) {
  const id = normId(campId);
  if (!id) return false;
  return getDemoFavorites(demoProfileId, seasonYear).includes(id);
}

/** Clear favorites for this session — used by resetDemoSession. */
export function clearDemoFavorites(demoProfileId, seasonYear) {
  try {
    sessionStorage.removeItem(keyFor(demoProfileId, seasonYear));
  } catch {}
}
