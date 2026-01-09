// src/components/hooks/demoRegistered.js
const keyFor = (profileId) => `rm_demo_registered_${profileId || "default"}`;

export function isDemoRegistered(profileId, campId) {
  try {
    const raw = localStorage.getItem(keyFor(profileId));
    if (!raw) return false;
    const obj = JSON.parse(raw);
    return !!obj?.[String(campId)];
  } catch {
    return false;
  }
}

export function toggleDemoRegistered(profileId, campId) {
  try {
    const key = keyFor(profileId);
    const raw = localStorage.getItem(key);
    const obj = raw ? JSON.parse(raw) : {};
    const cid = String(campId);

    if (obj?.[cid]) delete obj[cid];
    else obj[cid] = 1;

    localStorage.setItem(key, JSON.stringify(obj));
  } catch {}
}
