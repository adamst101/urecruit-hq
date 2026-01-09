// src/components/useAthleteIdentity.js
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "./hooks/useSeasonAccess";

/**
 * useAthleteIdentity
 *
 * Goals:
 * - Never leak stale profile across logout
 * - Scope cache by accountId
 * - Only fetch when enabled AND authenticated
 * - Prefer active profile if present
 * - Be resilient to id field variations (id/_id/uuid)
 */
function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

export function useAthleteIdentity(opts = {}) {
  const queryClient = useQueryClient();
  const { accountId } = useSeasonAccess();

  const enabled = opts?.enabled !== undefined ? !!opts.enabled : true;
  const isAuthed = !!accountId;
  const canRun = enabled && isAuthed;

  // Purge cached identity when accountId goes null
  useEffect(() => {
    if (isAuthed) return;

    queryClient.removeQueries({ queryKey: ["athleteIdentity"], exact: false });
    queryClient.removeQueries({ queryKey: ["athleteProfile"], exact: false });
    queryClient.removeQueries({ queryKey: ["getAthleteProfile"], exact: false });
    queryClient.removeQueries({ queryKey: ["auth_me"], exact: false });
  }, [isAuthed, queryClient]);

  const query = useQuery({
    queryKey: ["athleteIdentity", accountId],
    enabled: canRun,
    retry: false,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      let profiles = [];
      try {
        profiles = await base44.entities.AthleteProfile.filter({
          account_id: accountId,
        });
      } catch (e) {
        throw e;
      }

      const list = Array.isArray(profiles) ? profiles : [];
      const active = list.find((p) => p?.active === true) || null;
      const first = list[0] || null;
      const chosen = active || first || null;

      if (!chosen) return null;

      return {
        ...chosen,
        id: normId(chosen) || chosen.id || chosen._id || chosen.uuid || null,
      };
    },
  });

  return useMemo(() => {
    if (!canRun) {
      return { athleteProfile: null, isLoading: false, isError: false, error: null };
    }
    return {
      athleteProfile: query.data || null,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error,
    };
  }, [canRun, query.data, query.isLoading, query.isError, query.error]);
}