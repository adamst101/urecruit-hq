// src/components/hooks/demoRegistered.js
//
// Demo camp registrations — stored in sessionStorage so each browser tab
// is an isolated sandbox. State resets to the canonical Marcus baseline
// whenever a new tab/session starts; it never leaks across visitors.
const keyFor = (profileId) => `rm_demo_registered_${profileId || "default"}`;

export function isDemoRegistered(profileId, campId) {
  try {
    const raw = sessionStorage.getItem(keyFor(profileId));
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
    const raw = sessionStorage.getItem(key);
    const obj = raw ? JSON.parse(raw) : {};
    const cid = String(campId);

    if (obj?.[cid]) delete obj[cid];
    else obj[cid] = 1;

    sessionStorage.setItem(key, JSON.stringify(obj));
  } catch {}
}

/** Clear registrations for this session — used by resetDemoSession. */
export function clearDemoRegistered(profileId) {
  try {
    sessionStorage.removeItem(keyFor(profileId));
  } catch {}
}
