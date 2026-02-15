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

  async function saveIdentity(payload) {
    if (!payload?.athleteProfile) throw new Error("athleteProfile is required in payload");

    const ap = payload.athleteProfile;
    if (!accountId) throw new Error("No account_id available");

    const athleteName = `${String(ap?.first_name || "").trim()} ${String(ap?.last_name || "").trim()}`.trim();

    const full = {
      account_id: accountId,
      first_name: ap.first_name || null,
      last_name: ap.last_name || null,
      athlete_name: athleteName || null,
      sport_id: ap.sport_id || null,
      grad_year: ap.grad_year || null,
      primary_position_id: ap.primary_position_id || null,
      height_ft: ap.height_ft ?? null,
      height_in: ap.height_in ?? null,
      weight_lbs: ap.weight_lbs ?? null,
      active: true,
    };

    const AthleteProfile = base44?.entities?.AthleteProfile;
    if (!AthleteProfile) throw new Error("AthleteProfile entity not available");

    if (query.data?.id) {
      await AthleteProfile.update(String(query.data.id), full);
    } else {
      await AthleteProfile.create(full);
    }

    await queryClient.invalidateQueries({ queryKey: ["athleteIdentity", accountId] });
  }

  // Stable response shape
  return useMemo(() => {
    if (!isAuthed) {
      return {
        identity: null,
        athleteProfile: null,
        loading: false,
        isLoading: false,
        isError: false,
        error: null,
        saveIdentity
      };
    }

    return {
      identity: query.data || null,
      athleteProfile: query.data || null,
      loading: query.isLoading,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error,
      saveIdentity
    };
  }, [isAuthed, query.data, query.isLoading, query.isError, query.error, accountId, queryClient]);
}