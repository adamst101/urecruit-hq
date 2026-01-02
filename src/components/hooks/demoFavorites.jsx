const keyFor = (demoProfileId) => `demo:favorites:${demoProfileId || "default"}`;

export function getDemoFavorites(demoProfileId) {
  try {
    const raw = localStorage.getItem(keyFor(demoProfileId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function toggleDemoFavorite(demoProfileId, campId) {
  const id = String(campId);
  const existing = getDemoFavorites(demoProfileId);
  const next = existing.includes(id)
    ? existing.filter((x) => x !== id)
    : [...existing, id];

  localStorage.setItem(keyFor(demoProfileId), JSON.stringify(next));
  return next;
}

export function isDemoFavorite(demoProfileId, campId) {
  const id = String(campId);
  return getDemoFavorites(demoProfileId).includes(id);
}