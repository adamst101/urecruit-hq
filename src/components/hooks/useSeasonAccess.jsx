// src/components/hooks/useSeasonAccess.jsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * useSeasonAccess (hardened)
 *
 * Goals:
 * - Never break routing if auth/entitlement calls fail (degrade to demo)
 * - Detect paid access across common Base44 data patterns
 * - Use UTC year for season to avoid timezone edge cases
 *
 * Paid signals (checked in order):
 * 1) auth.me() includes a paid/subscription indicator
 * 2) Entitlement entity (multiple field-name variants + in-memory match)
 * 3) Subscription-like entity fallback (Subscription / Purchase / AccessPass)
 */

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeLower(x) {
  return String(x || "").trim().toLowerCase();
}

function pickSeasonYear(row) {
  if (!row) return null;
  const y =
    row.season_year ??
    row.seasonYear ??
    row.season ??
    row.year ??
    row.season_yr ??
    null;
  if (y == null) return null;
  const n = Number(y);
  return Number.isFinite(n) ? n : null;
}

function isActiveLike(row) {
  if (!row) return false;

  // explicit booleans
  if (row.active === true) return true;
  if (row.is_active === true) return true;
  if (row.isActive === true) return true;

  // status strings
  const s = safeLower(row.status || row.state || row.subscription_status);
  if (["active", "paid", "current", "enabled"].includes(s)) return true;

  // date windows (best-effort)
  const now = Date.now();
  const start = row.start_date || row.startDate || row.begins_at || row.beginsAt;
  const end = row.end_date || row.endDate || row.expires_at || row.expiresAt;

  const startMs = start ? Date.parse(String(start)) : null;
  const endMs = end ? Date.parse(String(end)) : null;

  if (startMs && now < startMs) return false;
  if (endMs && now > endMs) return false;

  // if dates exist and we’re within the window, treat as active
  if ((startMs || endMs) && (endMs == null || now <= endMs)) return true;

  return false;
}

function meIndicatesPaid(me, currentYear) {
  if (!me) return false;

  // common direct flags
  if (me.paid === true) return true;
  if (me.is_paid === true) return true;
  if (me.isPaid === true) return true;

  // common status strings
  const s = safeLower(me.subscription_status || me.status || me.plan_status);
  if (["active", "paid", "current"].includes(s)) return true;

  // if auth payload carries entitlement/season info
  const ent = me.entitlement || me.entitlements || me.subscription || null;
  const entList = asArray(ent);
  if (entList.length) {
    const hit = entList.find((e) => isActiveLike(e) && (pickSeasonYear(e) === currentYear || pickSeasonYear(e) == null));
    if (hit) return true;
  }

  // if auth payload includes a plan name
  const plan = safeLower(me.plan || me.plan_name || me.tier);
  if (plan && plan !== "free" && plan !== "demo") return true;

  return false;
}

async function tryFilter(entity, obj) {
  if (!entity?.filter) return null;
  try {
    const rows = await entity.filter(obj);
    return rows;
  } catch {
    return null;
  }
}

async function tryList(entity) {
  if (!entity?.list) return null;
  try {
    const rows = await entity.list();
    return rows;
  } catch {
    return null;
  }
}

export function useSeasonAccess() {
  const { currentYear, demoYear } = useMemo(() => {
    const now = new Date();
    const y = now.getUTCFullYear();
    return { currentYear: y, demoYear: y - 1 };
  }, []);

  // --- Auth resolver (treat errors as logged out) ---
  const meQuery = useQuery({
    queryKey: ["auth_me"],
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      try {
        return await base44.auth.me();
      } catch {
        return null;
      }
    }
  });

  const me = meQuery.data || null;
  const accountId = me?.id || null;

  // --- Entitlement / subscription resolver (only when authed) ---
  const canCheck = !!accountId && !meQuery.isLoading;

  const accessQuery = useQuery({
    queryKey: ["access_paid", accountId, currentYear],
    enabled: canCheck,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      // 0) If auth payload already indicates paid, short-circuit
      if (meIndicatesPaid(me, currentYear)) {
        return { source: "auth_me", row: me };
      }

      // 1) Entitlement entity (multiple schema variants)
      const E = base44.entities?.Entitlement;
      if (E) {
        // strict variants
        const attempts = [
          { account_id: accountId, season_year: currentYear, status: "active" },
          { account_id: accountId, seasonYear: currentYear, status: "active" },
          { account_id: accountId, season: currentYear, status: "active" },
          { account_id: accountId, year: currentYear, status: "active" },

          { account_id: accountId, season_year: String(currentYear), status: "active" },
          { account_id: accountId, seasonYear: String(currentYear), status: "active" },
          { account_id: accountId, season: String(currentYear), status: "active" },
          { account_id: accountId, year: String(currentYear), status: "active" }
        ];

        for (const obj of attempts) {
          const rows = await tryFilter(E, obj);
          const list = asArray(rows);
          if (list[0]) return { source: "entitlement_strict", row: list[0] };
        }

        // fallback: all for account, match in memory
        const rowsAll =
          (await tryFilter(E, { account_id: accountId, status: "active" })) ??
          (await tryFilter(E, { account_id: accountId })) ??
          null;

        const listAll = asArray(rowsAll);
        const hit = listAll.find((r) => {
          if (!isActiveLike(r)) return false;
          const y = pickSeasonYear(r);
          return y == null ? true : String(y) === String(currentYear);
        });
        if (hit) return { source: "entitlement_fallback", row: hit };
      }

      // 2) Subscription-like fallbacks (common names)
      const candidates = [
        base44.entities?.Subscription,
        base44.entities?.AccessPass,
        base44.entities?.Purchase,
        base44.entities?.Order,
        base44.entities?.Plan
      ].filter(Boolean);

      for (const ent of candidates) {
        // try filtered first
        const rows =
          (await tryFilter(ent, { account_id: accountId, status: "active" })) ??
          (await tryFilter(ent, { account_id: accountId })) ??
          null;

        const list = asArray(rows);
        const hit = list.find((r) => isActiveLike(r));
        if (hit) return { source: "subscription_like", row: hit };
      }

      // 3) last resort: if no structured entitlement found, treat as demo
      return null;
    }
  });

  const loading = meQuery.isLoading || (canCheck && accessQuery.isLoading);

  const hasPaidAccess = !!accessQuery.data;
  const mode = accountId && hasPaidAccess ? "paid" : "demo";

  const seasonYear = mode === "paid" ? currentYear : demoYear;

  return {
    // canonical loading flags
    loading,
    isLoading: loading,

    // canonical access model
    mode, // "paid" | "demo"
    hasAccess: mode === "paid",

    // seasons
    currentYear,
    demoYear,
    seasonYear,
    season: seasonYear, // legacy alias

    // identity
    accountId,
    entitlement: accessQuery.data?.row || null,

    // flags
    isAuthenticated: !!accountId
  };
}
