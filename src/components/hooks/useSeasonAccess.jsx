// src/components/hooks/useSeasonAccess.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "../../api/base44Client";

import { footballCurrentSeasonYear } from "../utils/seasonEntitlements.jsx";

/**
 * useSeasonAccess()
 *
 * Purpose:
 * - Single source of truth for "am I authenticated?" and "do I have paid access for the current season?"
 * - Demo year is ALWAYS previous season (derived from current season)
 *
 * Contract (returned shape):
 * {
 *   loading, isLoading,
 *   mode: "paid" | "demo",
 *   hasAccess: boolean,
 *   currentYear: number,
 *   demoYear: number,
 *   seasonYear: number,      // the year the UI should browse by default (paid -> current, demo -> previous)
 *   season: number,          // alias for seasonYear (legacy compatibility)
 *   accountId: string|null,
 *   entitlement: object|null,
 *   isAuthenticated: boolean
 * }
 */

function nowISO() {
  return new Date().toISOString();
}

function isExpired(ent) {
  try {
    const ends = ent?.ends_at;
    if (!ends) return false;
    const endMs = new Date(String(ends)).getTime();
    if (Number.isNaN(endMs)) return false;
    return Date.now() >= endMs; // ends_at treated as exclusive boundary
  } catch {
    return false;
  }
}

async function safeMe() {
  try {
    // Base44 typically supports base44.auth.me()
    const me = await base44.auth.me();
    return me || null;
  } catch {
    return null;
  }
}

async function fetchEntitlement({ accountId, seasonYear }) {
  try {
    const rows = await base44.entities.Entitlement.filter({
      account_id: accountId,
      season_year: seasonYear,
      status: "active"
    });

    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return null;

    // pick first active, non-expired if ends_at is present
    const firstValid = list.find((x) => !isExpired(x)) || null;
    return firstValid;
  } catch {
    return null;
  }
}

export function useSeasonAccess() {
  // ✅ Derived years (football rule, Feb 1 rollover)
  const currentYear = useMemo(() => footballCurrentSeasonYear(), []);
  const demoYear = useMemo(() => (typeof currentYear === "number" ? currentYear - 1 : null), [currentYear]);

  const [state, setState] = useState(() => ({
    isLoading: true,
    loading: true,

    currentYear: currentYear || null,
    demoYear: demoYear || null,

    mode: "demo",
    hasAccess: false,

    seasonYear: demoYear || currentYear || null,
    season: demoYear || currentYear || null,

    accountId: null,
    entitlement: null,
    isAuthenticated: false,

    lastCheckedAt: null
  }));

  const inflightRef = useRef(false);

  const refresh = async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;

    setState((p) => ({
      ...p,
      isLoading: true,
      loading: true,
      currentYear: currentYear || p.currentYear,
      demoYear: demoYear || p.demoYear
    }));

    try {
      const me = await safeMe();
      const accountId = me?.id || null;
      const isAuthenticated = !!accountId;

      // Not signed in -> demo
      if (!accountId) {
        setState((p) => ({
          ...p,
          isLoading: false,
          loading: false,

          currentYear: currentYear || p.currentYear,
          demoYear: demoYear || p.demoYear,

          mode: "demo",
          hasAccess: false,

          seasonYear: demoYear || p.demoYear || p.seasonYear,
          season: demoYear || p.demoYear || p.season,

          accountId: null,
          entitlement: null,
          isAuthenticated: false,

          lastCheckedAt: nowISO()
        }));
        return;
      }

      // Signed in -> check entitlement for CURRENT season (sell year)
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

          // Paid workspace defaults to current season (or entitlement season_year)
          seasonYear: Number(ent?.season_year) || currentYear || p.seasonYear,
          season: Number(ent?.season_year) || currentYear || p.season,

          accountId,
          entitlement: ent,
          isAuthenticated: true,

          lastCheckedAt: nowISO()
        }));
      } else {
        // Signed in but NOT entitled -> still demo (previous season)
        setState((p) => ({
          ...p,
          isLoading: false,
          loading: false,

          currentYear: currentYear || p.currentYear,
          demoYear: demoYear || p.demoYear,

          mode: "demo",
          hasAccess: false,

          seasonYear: demoYear || p.demoYear || p.seasonYear,
          season: demoYear || p.demoYear || p.season,

          accountId,
          entitlement: null,
          isAuthenticated: true,

          lastCheckedAt: nowISO()
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
    refresh
  };
}

export default useSeasonAccess;
