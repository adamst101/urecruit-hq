// src/components/auth/useIdentity.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { base44 } from "../../api/base44Client";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";

/**
 * useIdentity
 *
 * Best-practice goals:
 * - Single, stable identity contract for pages/components
 * - Reuse react-query cache keys (shares results with useSeasonAccess)
 * - Children == AthleteProfiles for signed-in account
 * - Active child stored per-account in localStorage
 * - No .js import extensions anywhere (this repo is .jsx)
 */

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

export function useIdentity() {
  const queryClient = useQueryClient();

  // Canonical access model (demo vs paid)
  const { isLoading: accessLoading, mode, accountId, entitlement } = useSeasonAccess();

  // 1) Auth user (best-effort). Uses SAME key as useSeasonAccess => shared cache.
  const meQuery = useQuery({
    queryKey: ["auth_me"],
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      try {
        return await base44.auth.me?.();
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

  // 2) Children == athlete profiles for account
  const childrenQuery = useQuery({
    queryKey: ["athleteProfiles", accountId],
    enabled: !!accountId && !accessLoading,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      try {
        const rows = await base44.entities.AthleteProfile.filter({
          account_id: accountId
        });
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [];
      }
    }
  });

  const children = Array.isArray(childrenQuery.data) ? childrenQuery.data : [];

  // Local storage active child (scoped per account)
  const activeChildKey = useMemo(() => {
    const uid = accountId || "anon";
    return `activeChildId:${uid}`;
  }, [accountId]);

  const [activeChildId, setActiveChildId] = useState(null);

  // Resolve active child when children change
  useEffect(() => {
    if (!accountId) {
      setActiveChildId(null);
      return;
    }

    if (!children.length) {
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

    const savedValid =
      saved && children.some((k) => String(normId(k)) === String(saved));

    const fallback = normId(children[0]) || children[0]?.id || null;
    const resolved = savedValid ? saved : fallback;

    setActiveChildId(resolved ? String(resolved) : null);

    try {
      if (resolved) window.localStorage.setItem(activeChildKey, String(resolved));
    } catch {}
  }, [accountId, children, activeChildKey]);

  const isAuthed = !!accountId;
  const isSubscribed = subscription?.status === "active";
  const hasChild = children.length > 0;

  const setActiveChild = useCallback(
    (id) => {
      const next = id ? String(id) : null;
      setActiveChildId(next);

      try {
        if (next) window.localStorage.setItem(activeChildKey, next);
        else window.localStorage.removeItem(activeChildKey);
      } catch {}

      // Invalidate only dependent read models
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
