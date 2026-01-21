import { useEffect, useMemo, useState } from "react";
import { base44 } from "../../api/base44Client";

/**
 * Feb 1 rollover:
 * - On Jan (month 0): seasonYear = year-1
 * - On Feb..Dec: seasonYear = year
 */
function getSeasonYearForDate(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0=Jan, 1=Feb
  return month >= 1 ? year : year - 1;
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function getSeasonFromUrl() {
  try {
    const sp = new URLSearchParams(window.location.search || "");
    return safeNumber(sp.get("season"));
  } catch {
    return null;
  }
}

async function fetchActiveEntitlement(accountId, seasonYear) {
  if (!accountId || !seasonYear) return null;

  // Primary attempt: strict filter with number
  try {
    const rows = await base44.entities.Entitlement.filter({
      account_id: accountId,
      season_year: seasonYear,
      status: "active",
    });
    if (Array.isArray(rows) && rows.length) return rows[0];
  } catch {}

  // Fallback: strict filter with string season_year (defensive)
  try {
    const rows = await base44.entities.Entitlement.filter({
      account_id: accountId,
      season_year: String(seasonYear),
      status: "active",
    });
    if (Array.isArray(rows) && rows.length) return rows[0];
  } catch {}

  // Fallback: pull all active for account then match in memory
  try {
    const rows = await base44.entities.Entitlement.filter({
      account_id: accountId,
      status: "active",
    });
    if (!Array.isArray(rows)) return null;

    const hit = rows.find(
      (r) =>
        String(r?.status || "").toLowerCase() === "active" &&
        String(r?.season_year) === String(seasonYear)
    );
    return hit || null;
  } catch {}

  return null;
}

export function useSeasonAccess() {
  const [state, setState] = useState({
    loading: true,
    isLoading: true,
    mode: "demo",
    hasAccess: false,

    // Year model
    currentYear: null, // "year being sold" (calendar year)
    demoYear: null, // free/demo year
    seasonYear: null, // Feb 1 rollover season year
    season: null,

    // Auth
    accountId: null,
    entitlement: null,
    isAuthenticated: false,
  });

  // Compute your base year values once per mount
  const computed = useMemo(() => {
    const now = new Date();

    const calendarYear = now.getFullYear(); // 2026
    const rolloverSeason = getSeasonYearForDate(now); // Jan 2026 => 2025
    const demoYear = calendarYear - 1; // 2025 (your current pattern)

    return {
      calendarYear,
      rolloverSeason,
      demoYear,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Determine which season we are checking entitlement for:
      // - If a page passes ?season=YYYY, check that season
      // - Else default to "currentYear" (the season you're selling)
      const seasonFromUrl = getSeasonFromUrl();
      const targetPaidYear = seasonFromUrl || computed.calendarYear;

      // Start with a base state (demo by default)
      const base = {
        loading: true,
        isLoading: true,
        currentYear: computed.calendarYear,
        demoYear: computed.demoYear,
        seasonYear: computed.rolloverSeason,
        season: computed.rolloverSeason,
        mode: "demo",
        hasAccess: false,
        accountId: null,
        entitlement: null,
        isAuthenticated: false,
      };

      if (!cancelled) setState(base);

      // 1) Who am I?
      let me = null;
      try {
        me = await base44.auth.me();
      } catch {
        me = null;
      }

      const accountId = me?.id || null;

      // If not authenticated, stay demo
      if (!accountId) {
        if (!cancelled) {
          setState({
            ...base,
            loading: false,
            isLoading: false,
          });
        }
        return;
      }

      // 2) Do I have entitlement for the targetPaidYear?
      const entitlement = await fetchActiveEntitlement(accountId, targetPaidYear);
      const hasAccess = !!entitlement;

      // Mode and season selection:
      // - If entitled: paid + use targetPaidYear
      // - If not: demo + use demoYear
      const mode = hasAccess ? "paid" : "demo";
      const effectiveSeason = hasAccess ? targetPaidYear : computed.demoYear;

      if (!cancelled) {
        setState({
          loading: false,
          isLoading: false,
          currentYear: computed.calendarYear,
          demoYear: computed.demoYear,

          // rollover season is still useful for UI labels/logic
          seasonYear: effectiveSeason,
          season: effectiveSeason,

          mode,
          hasAccess,

          accountId,
          entitlement,
          isAuthenticated: true,
        });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [computed.calendarYear, computed.demoYear, computed.rolloverSeason]);

  return state;
}
