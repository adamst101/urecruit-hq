// src/components/auth/useIdentity.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { base44 } from "../../api/base44Client";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";

/**
 * useIdentity (best-practice hardened)
 *
 * Central identity resolver aligned to your architecture:
 * - Auth user (base44.auth.me)
 * - Subscription status (from useSeasonAccess: mode/entitlement)
 * - "Children" == AthleteProfiles for the signed-in account
 * - Active child stored in localStorage (per account)
 *
 * Conventions:
 * - All imports use .jsx where applicable
 * - Avoid cache nukes; invalidate only dependent queries
 */

export function useIdentity() {
  const queryClient = useQueryClient();

  // Canonical access model (demo vs paid) + account id
  const { isLoading: accessLoading, mode, accountId, entitlement } = useSeasonAccess();

  // 1) Auth user (shared key across app; same behavior as useSeasonAccess)
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

  const user = meQuery.data || null;

  // Subscription modeled consistently with the rest of your app
  const subscription = useMemo(() => {
    if (!accountId) return { status: "inactive", entitlement: null };
    if (mode === "paid") return { status: "active", entitlement: entitlement || null };
    return { status: "inactive", entitlement: null };
  }, [accountId, mode, entitlement]);

  // 2) Children == athlete profiles for account (active only)
  const childrenQuery = useQuery({
    queryKey: ["athleteProfiles", accountId],
    enabled: !!accountId && !accessLoading,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      try {
        const rows = await base44.entities.AthleteProfile.filter({
          account_id: accountId,
          active: true
        });
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  const children = childrenQuery.data || [];

  // Local storage key for active child (scoped by account)
  const activeChildKey = useMemo(() => {
    const uid = accountId || "anon";
    return `activeChildId:${uid}`;
  }, [accountId]);

  const [activeChildId, setActiveChildId] = useState(null);

  // Resolve active child whenever children changes
  useEffect(() => {
    if (!accountId) {
      setActiveChildId(null);
      return;
    }

    const kids = Array.isArray(children) ? children : [];
    if (kids.length === 0) {
      setActiveChildId(null);
      try {
        window.localStorage.removeItem(activeChildKey);
      } catch {}
      return;
    }

    let saved = null;
    try {
      saved = window.localStorage.getItem(activeChildKey);
    } catch {}

    const savedValid = saved && kids.some((k) => String(k?.id) === String(saved));
    const fallback = kids[0]?.id ?? null;
    const resolved = savedValid ? saved : fallback;

    setActiveChildId(resolved ? String(resolved) : null);

    try {
      if (resolved) window.localStorage.setItem(activeChildKey, String(resolved));
    } catch {}
  }, [accountId, children, activeChildKey]);

  const isAuthed = !!accountId;
  const isSubscribed = subscription?.status === "active";
  const hasChild = (children || []).length > 0;

  const setActiveChild = useCallback(
    (id) => {
      const next = id ? String(id) : null;
      setActiveChildId(next);

      try {
        if (next) window.localStorage.setItem(activeChildKey, next);
        else window.localStorage.removeItem(activeChildKey);
      } catch {}

      // Invalidate only the queries realistically dependent on "active child"
      try {
        queryClient.invalidateQueries({ queryKey: ["athleteIdentity"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"], exact: false });
      } catch {}
    },
    [activeChildKey, queryClient]
  );

  const loading =
    accessLoading ||
    meQuery.isLoading ||
    (isAuthed && childrenQuery.isLoading);

  const error = meQuery.error || childrenQuery.error || null;

  return {
    loading,
    error,

    user,
    subscription,

    isAuthed,
    isSubscribed,

    children,
    hasChild,

    activeChildId,
    setActiveChild
  };
}
