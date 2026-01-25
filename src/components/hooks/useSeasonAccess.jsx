// src/components/hooks/useSeasonAccess.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "../../api/base44Client";

import { footballCurrentSeasonYear } from "../utils/seasonEntitlements.jsx";

/**
 * useSeasonAccess({ requestedSeasonYear })
 *
 * Purpose:
 * - Single source of truth for auth + entitlement
 * - Demo year = previous season (derived from current season)
 * - Optional: validate entitlement for a requested season (ex: Discover?season=2026)
 *
 * Contract (returned shape):
 * {
 *   loading, isLoading,
 *   mode: "paid" | "demo",
 *   hasAccess: boolean,
 *   currentYear: number,
 *   demoYear: number,
 *   seasonYear: number,
 *   season: number,
 *   accountId: string|null,
 *   entitlement: object|null,
 *   isAuthenticated: boolean,
 *   refresh: fn
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
    // ends_at treated as exclusive boundary
    return Date.now() >= endMs;
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

async function fetchEntitlement({ accountId, seasonYear }) {
  try {
    const rows = await base44.entities.Entitlement.filter({
      account_id: accountId,
      season_year: seasonYear,
      status: "active"
    });

    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return null;

    return list.find((x) => !isExpired(x)) || null;
  } catch {
    return null;
  }
}

export function useSeasonAccess(opts = {}) {
  const requestedSeasonYear = useMemo(() => {
    const n = Number(opts?.requestedSeasonYear);
    return Number.isFinite(n) ? n : null;
  }, [opts?.requestedSeasonYear]);

  const [state, setState] = useState(() => ({
    isLoading: true,
    loading: true,

    currentYear: null,
    demoYear: null,

    mode: "demo",
    hasAccess: false,

    seasonYear: null,
    season: null,

    accountId: null,
    entitlement: null,
    isAuthenticated: false,

    lastCheckedAt: null
  }));

  const inflightRef = useRef(false);

  const refresh = async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;

    // ✅ Compute season years at refresh time (avoids freezing across Feb 1 rollover)
    const computedCurrentYear = footballCurrentSeasonYear();
    const computedDemoYear =
      typeof computedCurrentYear === "number" ? computedCurrentYear - 1 : null;

    setState((p) => ({
      ...p,
      isLoading: true,
      loading: true,
      currentYear: computedCurrentYear ?? p.currentYear,
      demoYear: computedDemoYear ?? p.demoYear
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

          currentYear: computedCurrentYear ?? p.currentYear,
          demoYear: computedDemoYear ?? p.demoYear,

          mode: "demo",
          hasAccess: false,

          seasonYear: computedDemoYear ?? p.demoYear ?? p.seasonYear,
          season: computedDemoYear ?? p.demoYear ?? p.season,

          accountId: null,
          entitlement: null,
          isAuthenticated: false,

          lastCheckedAt: nowISO()
        }));
        return;
      }

      // ✅ Decide which season to validate:
      // - If caller requested a season (Discover?season=YYYY), validate that
      // - Otherwise validate current season (sell year)
      const validateYear = requestedSeasonYear || computedCurrentYear;

      const ent = validateYear
        ? await fetchEntitlement({ accountId, seasonYear: validateYear })
        : null;

      if (ent) {
        const entitledYear = Number(ent?.season_year) || validateYear || computedCurrentYear;

        setState((p) => ({
          ...p,
          isLoading: false,
          loading: false,

          currentYear: computedCurrentYear ?? p.currentYear,
          demoYear: computedDemoYear ?? p.demoYear,

          mode: "paid",
          hasAccess: true,

          seasonYear: entitledYear,
          season: entitledYear,

          accountId,
          entitlement: ent,
          isAuthenticated: true,

          lastCheckedAt: nowISO()
        }));
      } else {
        // Signed in but NOT entitled -> demo (previous season)
        setState((p) => ({
          ...p,
          isLoading: false,
          loading: false,

          currentYear: computedCurrentYear ?? p.currentYear,
          demoYear: computedDemoYear ?? p.demoYear,

          mode: "demo",
          hasAccess: false,

          seasonYear: computedDemoYear ?? p.demoYear ?? p.seasonYear,
          season: computedDemoYear ?? p.demoYear ?? p.season,

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

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedSeasonYear]);

  return {
    ...state,
    isLoading: !!state.isLoading,
    loading: !!state.isLoading, // keep legacy alias
    refresh
  };
}

export default useSeasonAccess;
