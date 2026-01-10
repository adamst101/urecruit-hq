// src/components/useAthleteIdentity.jsx
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "./hooks/useSeasonAccess.jsx";

/**
 * useAthleteIdentity
 *
 * Best-practice goals:
 * - If logged out -> athleteProfile=null immediately (no stale leak)
 * - Scope cache by accountId
 * - Only fetch when authenticated
 * - Prefer active profile if present
 * - Resilient to Base44 id field variations (id/_id/uuid)
 */

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

export function useAthleteIdentity() {
  const queryClient = useQueryClient();
  const { accountId } = useSeasonAccess();
  const isAuthed = !!accountId;

  // When accountId goes null, purge cached identity so nothing stale leaks into UI.
  useEffect(() => {
    if (isAuthed) return;

    try {
      queryClient.removeQueries({ queryKey: ["athleteIdentity"], exact: false });
      queryClient.removeQueries({ queryKey: ["athleteProfile"], exact: false });
      queryClient.removeQueries({ queryKey: ["getAthleteProfile"], exact: false });
    } catch {}
  }, [isAuthed, queryClient]);

  const query = useQuery({
    queryKey: ["athleteIdentity", accountId],
    enabled: isAuthed,
    retry: false,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Pull profiles for this account
      const profiles = await base44.entities.AthleteProfile.filter({
        account_id: accountId
      });

      const list = Array.isArray(profiles) ? profiles : [];

      // Prefer active if present
      const active = list.find((p) => p?.active === true) || null;
      const first = list[0] || null;
      const chosen = active || first || null;

      if (!chosen) return null;

      return {
        ...chosen,
        id: normId(chosen) || null
      };
    }
  });

  // Stable response shape
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
