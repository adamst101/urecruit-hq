// src/components/hooks/useSeasonAccess.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "../../api/base44Client";

import { footballCurrentSeasonYear } from "../utils/seasonEntitlements.jsx";
import { readDemoMode } from "./demoMode.jsx";

/**
 * useSeasonAccess()
 *
 * Purpose:
 * - Single source of truth for "am I authenticated?" and "do I have paid access for the current season?"
 * - Demo year defaults to previous season (football rule, Feb 1 rollover)
 * - If demo mode is set in sessionStorage (demoMode_v1), use that seasonYear while in demo
 *
 * Contract (returned shape):
 * {
 *   loading, isLoading,
 *   mode: "paid" | "demo",
 *   hasAccess: boolean,
 *   currentYear: number,
 *   demoYear: number,
 *   seasonYear: number,
 *   season: number,          // alias for seasonYear (legacy compatibility)
 *   accountId: string|null,
 *   entitlement: object|null,
 *   isAuthenticated: boolean
 * }
 */

function nowISO() {
  return new Date().toISOString();
}

/**
 * Only treat an entitlement as valid if it's active "right now" in its time window.
 * - starts_at blank => OK
 * - ends_at blank => OK
 * - else enforce starts_at <= now < ends_at
 */
function isActiveInWindow(ent, now = new Date()) {
  try {
    const nowMs = now.getTime();

    const starts = ent?.starts_at ? new Date(String(ent.starts_at)).getTime() : null;
    const ends = ent?.ends_at ? new Date(String(ent.ends_at)).getTime() : null;

    if (starts != null && !Number.isNaN(starts) && nowMs < starts) return false;
    if (ends != null && !Number.isNaN(ends) && nowMs >= ends) return false;

    return true;
  } catch {
    return false;
  }
}

async function safeMe() {
  try {
    const me = await base44.auth.me();
    return me || null;
  } catch {
    return null;
  }
}

/**
 * Hardened fetch:
 * - Query only active entitlements for (accountId, seasonYear)
 * - Only accept the entitlement if it is active in its starts/ends window
 */
async function fetchEntitlement({ accountId, seasonYear }) {
  try {
    const rows = await base44.entities.Entitlement.filter({
      account_id: accountId,
      season_year: seasonYear,
      status: "active",
    });

    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return null;

    const valid = list.find((x) => isActiveInWindow(x)) || null;
    return valid;
  } catch {
    return null;
  }
}

function readDemoSeasonOverride({ fallbackDemoYear }) {
  try {
    const dm = readDemoMode(); // reads KEY "demoMode_v1"
    const y = Number(dm?.seasonYear);
    if (dm?.mode === "demo" && Number.isFinite(y)) return y;
  } catch {}
  return typeof fallbackDemoYear === "number" ? fallbackDemoYear : null;
}

export function useSeasonAccess() {
  // Derived years (football rule, Feb 1 rollover)
  const currentYear = useMemo(() => footballCurrentSeasonYear(), []);
  const demoYear = useMemo(
    () => (typeof currentYear === "number" ? currentYear - 1 : null),
    [currentYear]
  );

  // Demo override from session (set by Home "Access Demo")
  const initialDemoSeason = useMemo(
    () => readDemoSeasonOverride({ fallbackDemoYear: demoYear }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demoYear]
  );

  const [state, setState] = useState(() => ({
    isLoading: true,
    loading: true,

    currentYear: currentYear || null,
    demoYear: demoYear || null,

    mode: "demo",
    hasAccess: false,

    // default browse year for demo uses session override if present
    seasonYear: initialDemoSeason || demoYear || currentYear || null,
    season: initialDemoSeason || demoYear || currentYear || null,

    accountId: null,
    entitlement: null,
    isAuthenticated: false,

    lastCheckedAt: null,
  }));

  const inflightRef = useRef(false);

  const refresh = async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;

    const demoSeason = readDemoSeasonOverride({ fallbackDemoYear: demoYear });

    setState((p) => ({
      ...p,
      isLoading: true,
      loading: true,
      currentYear: currentYear || p.currentYear,
      demoYear: demoYear || p.demoYear,
      // keep demo selection sticky while loading (only matters for demo users)
      seasonYear: demoSeason || p.seasonYear,
      season: demoSeason || p.season,
    }));

    try {
      const me = await safeMe();
      const accountId = me?.id || null;
      const isAuthenticated = !!accountId;

      // Not signed in -> demo (use demo mode seasonYear if set)
      if (!accountId) {
        setState((p) => ({
          ...p,
          isLoading: false,
          loading: false,

          currentYear: currentYear || p.currentYear,
          demoYear: demoYear || p.demoYear,

          mode: "demo",
          hasAccess: false,

          seasonYear: demoSeason || demoYear || p.demoYear || p.seasonYear,
          season: demoSeason || demoYear || p.demoYear || p.season,

          accountId: null,
          entitlement: null,
          isAuthenticated: false,

          lastCheckedAt: nowISO(),
        }));
        return;
      }

      /**
       * Guard: Only evaluate entitlement for the CURRENT football season year.
       * Prevents "future season wins early" even if a row exists for future years.
       */
      const ent = await fetchEntitlement({ accountId, seasonYear: currentYear });

      if (ent) {
        setState((p) => ({
          ...p,
          isLoading: false,
          loading: false,

          currentYear: currentYear || p.currentYear,
          demoYear: demoYear || p.demoYear,

          mode: "paid",
          hasAccess: true,

          // Paid workspace defaults to current season (or entitlement season_year if present)
          seasonYear: Number(ent?.season_year) || currentYear || p.seasonYear,
          season: Number(ent?.season_year) || currentYear || p.season,

          accountId,
          entitlement: ent,
          isAuthenticated: true,

          lastCheckedAt: nowISO(),
        }));
      } else {
        // Signed in but NOT entitled -> demo (use demo mode seasonYear if set)
        setState((p) => ({
          ...p,
          isLoading: false,
          loading: false,

          currentYear: currentYear || p.currentYear,
          demoYear: demoYear || p.demoYear,

          mode: "demo",
          hasAccess: false,

          seasonYear: demoSeason || demoYear || p.demoYear || p.seasonYear,
          season: demoSeason || demoYear || p.demoYear || p.season,

          accountId,
          entitlement: null,
          isAuthenticated: true,

          lastCheckedAt: nowISO(),
        }));
      }
    } finally {
      inflightRef.current = false;
    }
  };

  // Run once on mount, and also re-evaluate if currentYear/demoYear changes (rare)
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, demoYear]);

  return {
    ...state,
    // keep both flags for backward compatibility
    isLoading: !!state.isLoading,
    loading: !!state.isLoading,
    refresh,
  };
}

export default useSeasonAccess;
