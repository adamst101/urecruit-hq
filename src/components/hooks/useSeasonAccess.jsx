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

// Persist paid result in sessionStorage so module re-initializations
// (hot-reload, soft rebuild) don't drop back to demo mode.
const _PAID_KEY = "seasonAccess_paid_v2";
(function _restorePaidCache() {
  try {
    const raw = sessionStorage.getItem(_PAID_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (obj?.hasAccess !== true) return;
    const age = Date.now() - new Date(obj.lastCheckedAt || 0).getTime();
    if (age < 4 * 60 * 60 * 1000) _cachedResult = obj; // valid for 4 hours
  } catch {}
})();

export function clearSeasonAccessCache() {
  _cachedResult = null;
  _fetchPromise = null;
  try { sessionStorage.removeItem(_PAID_KEY); } catch {}
}

// ─── Helpers ──────────────────────────────────────────

function isRateLimitError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("429") || msg.includes("too many");
}

function nowISO() {
  return new Date().toISOString();
}

function isActiveInWindow(ent, now = new Date()) {
  try {
    const nowMs = now.getTime();
    // Only block if explicitly expired — do NOT block on starts_at being in the
    // future: a user who just purchased should have access immediately regardless
    // of when the season's access window officially "opens".
    const ends = ent?.ends_at ? new Date(String(ent.ends_at)).getTime() : null;
    if (ends != null && !Number.isNaN(ends) && nowMs >= ends) return false;
    return true;
  } catch {
    return true; // default to accessible on error
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
  } catch (e) {
    // Propagate rate-limit errors so the caller can treat them as transient failures
    // rather than "no entitlement found" — prevents false demo-mode on 429.
    if (isRateLimitError(e)) throw e;
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

  // Coach accounts get a dedicated shape — no entitlement required.
  // Use getActiveSeason to get the real configured season year (not calendar math).
  if (role === "coach") {
    let coachSeasonYear = activeSeason || currentYear;
    try {
      const res = await base44.functions.invoke("getActiveSeason", {});
      const yr = Number(res?.data?.season?.season_year);
      if (Number.isFinite(yr)) coachSeasonYear = yr;
    } catch {}
    return {
      currentYear: currentYear || null,
      demoYear: demoYear || null,
      mode: "coach",
      hasAccess: false,
      isCoach: true,
      seasonYear: coachSeasonYear,
      season: coachSeasonYear,
      accountId,
      entitlement: null,
      role,
      isAuthenticated: true,
      lastCheckedAt: nowISO(),
    };
  }

  // Pending coach — submitted but not yet approved by admin
  if (role === "coach_pending") {
    return {
      currentYear: currentYear || null,
      demoYear: demoYear || null,
      mode: "coach_pending",
      hasAccess: false,
      isCoach: false,
      seasonYear: activeSeason || currentYear || null,
      season: activeSeason || currentYear || null,
      accountId,
      entitlement: null,
      role,
      isAuthenticated: true,
      lastCheckedAt: nowISO(),
    };
  }

  // Check entitlement for active season, then sold season (early-bird)
  let ent = await fetchEntitlement({ accountId, seasonYear: activeSeason });
  if (!ent && soldSeason !== activeSeason) {
    ent = await fetchEntitlement({ accountId, seasonYear: soldSeason });
  }

  // Fallback: check for ANY active entitlement regardless of season year
  // Handles cases where the entitlement was created with a different season_year
  if (!ent) {
    try {
      const rows = await base44.entities.Entitlement.filter({
        account_id: accountId,
        status: "active",
      });
      const list = Array.isArray(rows) ? rows : [];
      ent = list.find((x) => isActiveInWindow(x)) || list[0] || null;
    } catch {
      // ignore
    }
  }

  if (ent) {
    try { sessionStorage.removeItem("demoMode_v1"); } catch {}
    const paidResult = {
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
    try { sessionStorage.setItem(_PAID_KEY, JSON.stringify(paidResult)); } catch {}
    return paidResult;
  }

  // Signed in but NOT entitled → demo
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
    // 1. Cached authenticated result → use instantly, no loading flash
    if (_cachedResult) {
      if (_cachedResult.hasAccess === true) clearDemoMode();
      setState((p) => ({ ...p, ..._cachedResult, isLoading: false, loading: false }));
      // Paid results: skip re-fetch entirely (long-lived entitlement)
      if (_cachedResult.hasAccess === true) return;
      // Coach/pending: fall through to re-fetch in background without showing loading state
    }

    // 2. Another instance already fetching → share its promise
    if (_fetchPromise) {
      try {
        const result = await _fetchPromise;
        // Don't downgrade a cached coach to demo if re-fetch fails due to token expiry
        const isDowngrade = result?.mode === "demo" && _cachedResult &&
          (_cachedResult.mode === "coach" || _cachedResult.mode === "coach_pending");
        if (!isDowngrade) setState((p) => ({ ...p, ...result, isLoading: false, loading: false }));
      } catch {}
      return;
    }

    // 3. Start a new fetch (only show loading spinner if we have no cached state at all)
    if (!_cachedResult) setState((p) => ({ ...p, isLoading: true, loading: true }));

    _fetchPromise = doRefresh({ currentYear, demoYear, activeSeason, soldSeason });

    try {
      const result = await _fetchPromise;

      // Cache paid, coach, and coach_pending results for instant display on next navigation
      if (result?.hasAccess === true || result?.mode === "coach" || result?.mode === "coach_pending") {
        _cachedResult = result;
      }

      // Don't downgrade a cached coach to demo (handles token expiry mid-session)
      const isDowngrade = result?.mode === "demo" && _cachedResult &&
        (_cachedResult.mode === "coach" || _cachedResult.mode === "coach_pending");
      if (!isDowngrade) setState((p) => ({ ...p, ...result, isLoading: false, loading: false }));
    } catch {
      // On error, fall through to demo gracefully — but keep coach state if cached
      if (!_cachedResult || (_cachedResult.mode !== "coach" && _cachedResult.mode !== "coach_pending")) {
        setState((p) => ({
          ...p,
          isLoading: false,
          loading: false,
          mode: p.mode === "loading" ? "demo" : p.mode,
        }));
      }
    } finally {
      _fetchPromise = null;
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentYear, demoYear]);

  // Expose to window for browser-console diagnostics
  useEffect(() => {
    try { window.__seasonAccess = { ...state, soldSeason, activeSeason }; } catch {}
  }, [state, soldSeason, activeSeason]);

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