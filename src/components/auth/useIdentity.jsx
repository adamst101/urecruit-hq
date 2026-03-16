// src/components/auth/useIdentity.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { base44 } from "../../api/base44Client";

// ✅ Explicit .jsx import (your repo standard)
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";

/**
 * useIdentity
 *
 * Contract your pages expect:
 *  - loading, error
 *  - user
 *  - subscription { status: "active"|"inactive", entitlement? }
 *  - isAuthed, isSubscribed
 *  - children (AthleteProfiles), hasChild
 *  - activeChildId, setActiveChild(id)
 *
 * Best practice updates:
 * - All imports use .jsx explicitly
 * - Cache invalidation is scoped (no broad nuking)
 * - Active child stored per account in localStorage
 * - Never blocks demo browsing; paid state determined by useSeasonAccess
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

  // 1) Auth user (best effort)
  const meQuery = useQuery({
    queryKey: ["auth_me"],
    retry: false,
    staleTime: 5 * 60 * 1000,
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

  // 2) Children == athlete profiles for this account (prefer active only)
  const childrenQuery = useQuery({
    queryKey: ["athleteProfiles", accountId],
    enabled: !!accountId && !accessLoading,
    retry: false,
    staleTime: 5 * 60 * 1000,
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

  // Local storage active child (per account)
  const activeChildKey = useMemo(() => {
    const uid = accountId || "anon";
    return `activeChildId:${uid}`;
  }, [accountId]);

  const [activeChildId, setActiveChildId] = useState(null);

  // Resolve active child when children list loads/changes
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

    const savedValid = saved && kids.some((k) => String(normId(k)) === String(saved));
    const fallback = normId(kids[0]) ?? kids[0]?.id ?? kids[0]?._id ?? null;
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

      // Only invalidate queries that depend on active child
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
