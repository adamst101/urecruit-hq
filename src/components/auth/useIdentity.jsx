// src/components/auth/useIdentity.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { base44 } from "../../api/base44Client";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";

/**
 * useIdentity (best-practice)
 *
 * Purpose:
 * - Provide a single, stable "identity bundle" your pages can use:
 *   - user (best effort)
 *   - subscription (active/inactive based on season access)
 *   - children (AthleteProfile rows for this account; active-only by default)
 *   - activeChildId persisted per account in localStorage
 *
 * Notes:
 * - Uses the same queryKey ["auth_me"] as useSeasonAccess, so react-query dedupes.
 * - All internal imports explicitly use .jsx to match your repo conventions.
 */

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

export function useIdentity() {
  const queryClient = useQueryClient();

  // Canonical access model (demo vs paid, accountId, entitlement)
  const { isLoading: accessLoading, mode, accountId, entitlement } = useSeasonAccess();

  const isAuthed = !!accountId;

  // 1) Auth user (best effort; shared key with useSeasonAccess => deduped)
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

  // 2) Children == athlete profiles for account (active-only)
  const childrenQuery = useQuery({
    queryKey: ["athleteProfiles", accountId],
    enabled: !!accountId && !accessLoading,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      try {
        // active-only by default (adjust later if you add multi-profile mgmt)
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
  const hasChild = Array.isArray(children) && children.length > 0;

  // Local storage key is per-account (prevents cross-user bleed on shared devices)
  const activeChildKey = useMemo(() => {
    const uid = accountId || "anon";
    return `activeChildId:${uid}`;
  }, [accountId]);

  const [activeChildId, setActiveChildId] = useState(null);

  // Resolve active child when list changes
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

    const savedValid =
      saved && kids.some((k) => String(normId(k)) === String(saved));

    const fallback = normId(kids[0]) || kids[0]?.id || kids[0]?._id || kids[0]?.uuid || null;
    const resolved = savedValid ? saved : fallback;

    setActiveChildId(resolved ? String(resolved) : null);

    try {
      if (resolved) window.localStorage.setItem(activeChildKey, String(resolved));
    } catch {}
  }, [accountId, children, activeChildKey]);

  const setActiveChild = useCallback(
    (id) => {
      const next = id ? String(id) : null;
      setActiveChildId(next);

      try {
        if (next) window.localStorage.setItem(activeChildKey, next);
        else window.localStorage.removeItem(activeChildKey);
      } catch {}

      // Invalidate only things that depend on athlete selection
      try {
        queryClient.invalidateQueries({ queryKey: ["athleteIdentity"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["athleteProfiles"], exact: false });
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
    isSubscribed: subscription?.status === "active",

    children,
    hasChild,

    activeChildId,
    setActiveChild
  };
}
