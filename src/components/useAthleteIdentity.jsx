import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "./hooks/useSeasonAccess";

/**
 * useAthleteIdentity
 *
 * HARDENING GOALS:
 * 1) If user is logged out (no accountId), return athleteProfile = null immediately.
 * 2) Prevent stale athleteProfile from a previous session from surviving a render cycle.
 * 3) Scope identity by accountId and only fetch when authenticated.
 * 4) Enforce active profile (active: true) to avoid ghost/disabled profiles.
 *
 * Query key (scoped by account):
 *   ["athleteIdentity", accountId]
 */
export function useAthleteIdentity() {
  const queryClient = useQueryClient();
  const { accountId } = useSeasonAccess();

  const isAuthed = !!accountId;

  // 🔥 Critical: when accountId goes null, purge cached identity data immediately
  useEffect(() => {
    if (isAuthed) return;

    // Remove cached identity queries so nothing stale can leak into UI
    queryClient.removeQueries({ queryKey: ["athleteIdentity"], exact: false });

    // Also remove older legacy keys if they exist from prior iterations
    queryClient.removeQueries({ queryKey: ["athleteProfile"], exact: false });
    queryClient.removeQueries({ queryKey: ["getAthleteProfile"], exact: false });
  }, [isAuthed, queryClient]);

  const query = useQuery({
    queryKey: ["athleteIdentity", accountId],
    enabled: isAuthed, // ✅ do not fetch when logged out
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      // AthleteProfile is linked to auth by account_id per your schema.
      const profiles = await base44.entities.AthleteProfile.filter({
        account_id: accountId,
        active: true
      });

      const profile = Array.isArray(profiles) ? profiles[0] : null;
      return profile || null;
    }
  });

  // ✅ If logged out, force a stable "logged out" identity response
  return useMemo(() => {
    if (!isAuthed) {
      return {
        athleteProfile: null,
        isLoading: false,
        isError: false,
        error: null
      };
    }

    return {
      athleteProfile: query.data || null,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error
    };
  }, [isAuthed, query.data, query.isLoading, query.isError, query.error]);
}
