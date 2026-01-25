// src/components/hooks/useSeasonAccess.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "../../api/base44Client";

import { footballCurrentSeasonYear } from "../utils/seasonEntitlements.jsx";

/**
 * useSeasonAccess()
 *
 * Purpose:
 * - Single source of truth for "am I authenticated?" and "do I have paid access?"
 * - Demo year defaults to previous season (derived from current season)
 *
 * Key rule (MVP):
 * - If the user has ANY active, non-expired entitlement (even for a future season),
 *   treat them as paid and set seasonYear to that entitlement season_year.
 */

function nowISO() {
  return new Date().toISOString();
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function isExpired(ent) {
  try {
    const ends = ent?.ends_at;
    if (!ends) return false; // no end date => treat as not expired
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

/**
 * Fetch an active entitlement for a specific season year.
 */
async function fetchEntitlementForSeason({ accountId, seasonYear }) {
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

/**
 * MVP fallback: If user has ANY active entitlement (often future season pre-Feb1),
 * treat them as paid. Prefer the highest season_year.
 */
async function fetchAnyActiveEntitlement({ accountId }) {
  try {
    const rows = await base44.entities.Entitlement.filter({
      account_id: accountId,
      status: "active"
    });

    const list = Array.isArray(rows) ? rows : [];
    const valid = list.filter((x) => !isExpired(x));
    if (!valid.length) return null;

    // Prefer highest season_year; tie-breaker: later ends_at (if present)
    valid.sort((a, b) => {
      const ay = safeNumber(a?.season_year) || 0;
      const by = safeNumber(b?.season_year) || 0;
      if (by !== ay) return by - ay;

      const aEnd = a?.ends_at ? new Date(String(a.ends_at)).getTime() : 0;
      const bEnd = b?.ends_at ? new Date(String(b.ends_at)).getTime() : 0;
      return (bEnd || 0) - (aEnd || 0);
    });

    return valid[0] || null;
  } catch {
    return null;
  }
}

export function useSeasonAccess() {
  // Football-derived current season (Feb 1 rollover)
  const currentYear = useMemo(() => footballCurrentSeasonYear(), []);
  const demoYear = useMemo(
    () => (typeof currentYear === "number" ? currentYear - 1 : null),
    [currentYear]
  );

  const [state, setState] = useState(() => ({
    isLoading: true,
    loading: true,

    currentYear: currentYear || null,
    demoYear: demoYear || null,

    mode: "demo",
    hasAccess: false,

    // default browsing year
    seasonYear: demoYear || currentYear || null,
    season: demoYear || currentYear || null,

    accountId: null,
    entitlement: null,
    isAuthenticated: false,

    // handy for debug banners
    entitlementSeason: null,

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
          entitlementSeason: null,
          isAuthenticated: false,

          lastCheckedAt: nowISO()
        }));
        return;
      }

      // Signed in -> check entitlement for CURRENT season, then fallback to ANY active entitlement
      let ent = await fetchEntitlementForSeason({ accountId, seasonYear: currentYear });
      if (!ent) {
        ent = await fetchAnyActiveEntitlement({ accountId });
      }

      if (ent) {
        const entSeason = safeNumber(ent?.season_year) || currentYear || null;

        setState((p) => ({
          ...p,
          isLoading: false,
          loading: false,

          currentYear: currentYear || p.currentYear,
          demoYear: demoYear || p.demoYear,

          mode: "paid",
          hasAccess: true,

          // Paid workspace defaults to entitlement season_year (may be future season)
          seasonYear: entSeason || p.seasonYear,
          season: entSeason || p.season,

          accountId,
          entitlement: ent,
          entitlementSeason: entSeason,
          isAuthenticated: true,

          lastCheckedAt: nowISO()
        }));
      } else {
        // Signed in but NOT entitled -> demo (previous season)
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
          entitlementSeason: null,
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
