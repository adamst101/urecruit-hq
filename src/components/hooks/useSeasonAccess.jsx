// src/components/hooks/useSeasonAccess.jsx
import { useEffect, useMemo, useState } from "react";
import { base44 } from "../../api/base44Client";

import { footballCurrentSeasonYear } from "../utils/seasonEntitlements.jsx";
import { getCurrentSoldSeason, getCurrentActiveSeason } from "../utils/seasonUtils";
import { readDemoMode, clearDemoMode } from "./demoMode.jsx";
import { isAdminEmail } from "../auth/adminEmails.jsx";

/**
 * useSeasonAccess()
 *
 * Single source of truth for auth + season entitlement state.
 *
 * Uses a MODULE-LEVEL cache so the result persists across all hook
 * instances and page navigations. Only one async fetch ever runs at
 * a time — all concurrent callers share the same promise.
 *
 * Call clearSeasonAccessCache() on logout to reset.
 */

// ─── Module-level session cache ───────────────────────
// Persists across all hook instances and page navigations.
let _cachedResult = null;   // null = not yet fetched
let _fetchPromise = null;   // shared in-flight promise
let _lastDemoCheck = null;  // { accountId, checkedAt } — negative cache for entitled check

export function clearSeasonAccessCache() {
  _cachedResult = null;
  _fetchPromise = null;
  _lastDemoCheck = null;
}

// ─── Helpers (unchanged) ──────────────────────────────

function nowISO() {
  return new Date().toISOString();
}

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

async function fetchEntitlement({ accountId, seasonYear }) {
  try {
    const rows = await base44.entities.Entitlement.filter({
      account_id: accountId,
      season_year: seasonYear,
      status: "active",
    });
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return null;
    return list.find((x) => isActiveInWindow(x)) || null;
  } catch {
    return null;
  }
}

function readDemoSeasonOverride({ fallbackDemoYear }) {
  try {
    const dm = readDemoMode();
    const y = Number(dm?.seasonYear);
    if (dm?.mode === "demo" && Number.isFinite(y)) return y;
  } catch {}
  return typeof fallbackDemoYear === "number" ? fallbackDemoYear : null;
}

// ─── Core async resolver (returns result object, no setState) ───

async function doRefresh({ currentYear, demoYear, activeSeason, soldSeason }) {
  const demoSeason = readDemoSeasonOverride({ fallbackDemoYear: demoYear });

  const me = await safeMe();
  const accountId = me?.id || null;
  // Treat as admin if base44 role is "admin" OR if email is in the hardcoded admin list
  const role = (me?.role === "admin" || isAdminEmail(me?.email)) ? "admin" : (me?.role || null);

  // Not signed in → demo
  if (!accountId) {
    return {
      currentYear: currentYear || null,
      demoYear: demoYear || null,
      mode: "demo",
      hasAccess: false,
      seasonYear: demoSeason || demoYear || currentYear || null,
      season: demoSeason || demoYear || currentYear || null,
      accountId: null,
      entitlement: null,
      role: null,
      isAuthenticated: false,
      lastCheckedAt: nowISO(),
    };
  }

  // Admin users get full access without needing an entitlement or athlete profile
  if (role === "admin") {
    return {
      currentYear: currentYear || null,
      demoYear: demoYear || null,
      mode: "paid",
      hasAccess: true,
      seasonYear: activeSeason || currentYear || null,
      season: activeSeason || currentYear || null,
      accountId,
      entitlement: null,
      role,
      isAuthenticated: true,
      lastCheckedAt: nowISO(),
    };
  }

  // Negative cache: skip entitlement API if we recently confirmed no entitlement
  if (_lastDemoCheck?.accountId === accountId) {
    const age = Date.now() - new Date(_lastDemoCheck.checkedAt).getTime();
    if (age < 2 * 60 * 1000) {
      return {
        currentYear: currentYear || null,
        demoYear: demoYear || null,
        mode: "demo",
        hasAccess: false,
        seasonYear: demoSeason || demoYear || currentYear || null,
        season: demoSeason || demoYear || currentYear || null,
        accountId,
        entitlement: null,
        role,
        isAuthenticated: true,
        lastCheckedAt: nowISO(),
      };
    }
  }

  // Check entitlement for active season, then sold season (early-bird)
  let ent = await fetchEntitlement({ accountId, seasonYear: activeSeason });
  if (!ent && soldSeason !== activeSeason) {
    ent = await fetchEntitlement({ accountId, seasonYear: soldSeason });
  }

  if (ent) {
    try { sessionStorage.removeItem("demoMode_v1"); } catch {}
    return {
      currentYear: currentYear || null,
      demoYear: demoYear || null,
      mode: "paid",
      hasAccess: true,
      seasonYear: activeSeason || currentYear || null,
      season: activeSeason || currentYear || null,
      accountId,
      entitlement: ent,
      role,
      isAuthenticated: true,
      lastCheckedAt: nowISO(),
    };
  }

  // Signed in but NOT entitled → demo; record negative cache
  _lastDemoCheck = { accountId, checkedAt: nowISO() };
  return {
    currentYear: currentYear || null,
    demoYear: demoYear || null,
    mode: "demo",
    hasAccess: false,
    seasonYear: demoSeason || demoYear || currentYear || null,
    season: demoSeason || demoYear || currentYear || null,
    accountId,
    entitlement: null,
    role,
    isAuthenticated: true,
    lastCheckedAt: nowISO(),
  };
}

// ─── Hook ─────────────────────────────────────────────

export function useSeasonAccess() {
  const currentYear = useMemo(() => footballCurrentSeasonYear(), []);
  const soldSeason = useMemo(() => getCurrentSoldSeason(), []);
  const activeSeason = useMemo(() => getCurrentActiveSeason(), []);
  const demoYear = useMemo(
    () => (typeof activeSeason === "number" ? activeSeason - 1 : null),
    [activeSeason]
  );

  const initialDemoSeason = useMemo(
    () => readDemoSeasonOverride({ fallbackDemoYear: demoYear }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demoYear]
  );

  // If we already have a cached result, initialise from it (instant)
  const [state, setState] = useState(() => {
    if (_cachedResult) {
      return { ..._cachedResult, isLoading: false, loading: false };
    }
    return {
      isLoading: true,
      loading: true,
      currentYear: currentYear || null,
      demoYear: demoYear || null,
      mode: "loading",
      hasAccess: false,
      seasonYear: initialDemoSeason || demoYear || currentYear || null,
      season: initialDemoSeason || demoYear || currentYear || null,
      accountId: null,
      entitlement: null,
      isAuthenticated: false,
      lastCheckedAt: null,
    };
  });

  const refresh = async () => {
    // 1. Cached paid result → clear any stale sessionStorage demo flags, use instantly, skip network
    if (_cachedResult?.hasAccess === true) {
      clearDemoMode();
      setState((p) => ({ ...p, ..._cachedResult, isLoading: false, loading: false }));
      return;
    }

    // 2. Another instance already fetching → share its promise
    if (_fetchPromise) {
      try {
        const result = await _fetchPromise;
        setState((p) => ({ ...p, ...result, isLoading: false, loading: false }));
      } catch {}
      return;
    }

    // 3. Start a new fetch, share via _fetchPromise
    setState((p) => ({ ...p, isLoading: true, loading: true }));

    _fetchPromise = doRefresh({ currentYear, demoYear, activeSeason, soldSeason });

    try {
      const result = await _fetchPromise;

      // Cache ONLY paid results
      if (result?.hasAccess === true) {
        _cachedResult = result;
      }

      setState((p) => ({ ...p, ...result, isLoading: false, loading: false }));
    } catch {
      // On error, fall through to demo gracefully
      setState((p) => ({
        ...p,
        isLoading: false,
        loading: false,
        mode: p.mode === "loading" ? "demo" : p.mode,
      }));
    } finally {
      _fetchPromise = null;
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, demoYear]);

  return {
    ...state,
    isLoading: !!state.isLoading,
    loading: !!state.isLoading,
    soldSeason,
    activeSeason,
    refresh,
  };
}

export default useSeasonAccess;