// src/components/auth/useIdentity.js
import { useMemo, useCallback, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccessContext } from "../hooks/useAccessContext";

/**
 * useIdentity (final)
 *
 * Backward-compatible return contract for pages/components that expect:
 * - user/subscription/children/activeChildId
 *
 * IMPORTANT:
 * - "children" are AthleteProfiles in paid mode only
 * - In demo mode, this keeps contract stable without forcing profile fetch/gating
 */
export function useIdentity() {
  const queryClient = useQueryClient();
  const access = useAccessContext();

  // "user" object is not reliably available in your current codebase without base44.auth.me usage here.
  // Keep it null to avoid reintroducing competing identity logic.
  const user = null;

  const subscription = useMemo(() => {
    if (!access.accountId) return { status: "inactive" };
    if (access.isPaid) return { status: "active", entitlement: access.entitlement || null };
    return { status: "inactive", entitlement: null };
  }, [access.accountId, access.isPaid, access.entitlement]);

  // Children list compatibility: only meaningful in paid mode
  const children = useMemo(() => {
    if (!access.isPaid) return [];
    return access.athleteProfile ? [access.athleteProfile] : [];
  }, [access.isPaid, access.athleteProfile]);

  const hasChild = (children || []).length > 0;

  // Active child compatibility (single profile environment)
  const [activeChildId, setActiveChildId] = useState(null);

  useEffect(() => {
    if (!access.isPaid || !access.athleteProfile?.id) {
      setActiveChildId(null);
      return;
    }
    setActiveChildId(String(access.athleteProfile.id));
  }, [access.isPaid, access.athleteProfile]);

  const setActiveChild = useCallback(
    (id) => {
      const next = id ? String(id) : null;
      setActiveChildId(next);
      try {
        queryClient.invalidateQueries({ queryKey: ["athleteIdentity"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"], exact: false });
      } catch {}
    },
    [queryClient]
  );

  return {
    loading: access.loading,
    error: access.identityError || null,

    user,
    subscription,

    isAuthed: !!access.accountId,
    isSubscribed: access.isPaid,

    children,
    hasChild,

    activeChildId,
    setActiveChild,
  };
}
