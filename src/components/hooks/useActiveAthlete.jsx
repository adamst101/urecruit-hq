// src/components/hooks/useActiveAthlete.jsx
//
// Module-level state for the currently selected athlete.
// Uses a subscriber pattern (same as useSeasonAccess) so that any component
// calling useActiveAthleteId() re-renders when the selection changes — without
// needing a Context Provider in App.jsx.
//
// Usage:
//   const [activeAthleteId, setActiveAthleteId] = useActiveAthleteId();
//   const { activeAthlete, isLoading } = useActiveAthlete();
//   setActiveAthleteId(id); // callable from anywhere, even non-hook code

import { useEffect, useState } from "react";
import { useAthleteIdentity } from "../useAthleteIdentity.jsx";

// ── Module-level store ──────────────────────────────────────────────────────
let _activeId = null;
try { _activeId = sessionStorage.getItem("activeAthleteId") || null; } catch {}

const _subscribers = new Set();

function _notify() {
  _subscribers.forEach(fn => {
    try { fn(_activeId); } catch {}
  });
}

/** Set the active athlete ID globally. Persists to sessionStorage and triggers
 *  re-renders in all components using useActiveAthleteId(). */
export function setActiveAthleteId(id) {
  const normalized = id || null;
  if (normalized === _activeId) return; // no-op if unchanged
  _activeId = normalized;
  try {
    if (normalized) sessionStorage.setItem("activeAthleteId", normalized);
    else sessionStorage.removeItem("activeAthleteId");
  } catch {}
  _notify();
}

/** Non-hook getter — safe to call outside React. */
export function getActiveAthleteId() {
  return _activeId;
}

/** Clear the active selection (e.g. on logout). */
export function clearActiveAthlete() {
  _activeId = null;
  try { sessionStorage.removeItem("activeAthleteId"); } catch {}
  _notify();
}

// ── Hook: just the ID ────────────────────────────────────────────────────────
/** Returns [activeAthleteId, setActiveAthleteId].
 *  Re-renders whenever the athlete selection changes anywhere in the app. */
export function useActiveAthleteId() {
  const [id, setId] = useState(_activeId);

  useEffect(() => {
    // Sync immediately in case state changed between render and effect
    setId(_activeId);

    const handler = (newId) => setId(newId);
    _subscribers.add(handler);
    return () => _subscribers.delete(handler);
  }, []);

  return [id, setActiveAthleteId];
}

// ── Hook: ID + profile ────────────────────────────────────────────────────────
/** Returns { activeAthleteId, setActiveAthleteId, activeAthlete, isLoading }.
 *  Wraps useAthleteIdentity with the currently selected athlete. */
export function useActiveAthlete() {
  const [activeAthleteId] = useActiveAthleteId();
  const { athleteProfile, isLoading } = useAthleteIdentity({
    athleteId: activeAthleteId || undefined,
  });

  return {
    activeAthleteId,
    setActiveAthleteId,
    activeAthlete: athleteProfile,
    isLoading,
  };
}
