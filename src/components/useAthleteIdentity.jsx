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
 * - Resilient to Base44 id field variations (id/_id/uuid)
 *
 * Profile resolution:
 * - getMyAthleteProfiles (server function, asServiceRole) returns only profiles
 *   where account_id === caller's auth ID. That set is authoritative — no
 *   name-prefix heuristics needed. claimSlot() is responsible for writing the
 *   correct account_id at link time (via claimSlotProfiles server function).
 */

// ---------- helpers ----------

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

/**
 * Pick the best profile from a list returned by getMyAthleteProfiles.
 * All profiles already belong to the caller (account_id ownership enforced server-side).
 * Returns { chosen, resolutionMode, diagnostics }.
 */
function resolveBestProfile(list, requestedAthleteId) {
  const total = list.length;

  if (requestedAthleteId) {
    const match = list.find((p) => normId(p) === requestedAthleteId) || null;
    return {
      chosen: match,
      resolutionMode: match ? "direct" : "unresolved",
      diagnostics: {
        profilesFound: total,
        finalProfileId: match ? (normId(match) || null) : null,
        reason: match
          ? `Matched requested athleteId ${requestedAthleteId}`
          : `No profile matched requested athleteId ${requestedAthleteId}`,
      },
    };
  }

  if (total === 0) {
    return {
      chosen: null,
      resolutionMode: "unresolved",
      diagnostics: {
        profilesFound: 0,
        finalProfileId: null,
        reason: "No profiles returned",
      },
    };
  }

  // Standard precedence: primary → active → first
  const chosen =
    list.find((p) => p?.is_primary === true && p?.active !== false) ||
    list.find((p) => p?.active === true) ||
    list[0] ||
    null;

  return {
    chosen,
    resolutionMode: chosen ? "direct" : "unresolved",
    diagnostics: {
      profilesFound: total,
      finalProfileId: chosen ? (normId(chosen) || null) : null,
      reason: chosen
        ? `Profile selected (primary/active/first of ${total})`
        : "No profile found after standard precedence",
    },
  };
}

// ---------- hook ----------

export function useAthleteIdentity({ athleteId } = {}) {
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
    queryKey: ["athleteIdentity", accountId, athleteId || "primary"],
    enabled: isAuthed,
    retry: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Pull all profiles for this account via server-side function.
      // base44.entities.AthleteProfile.filter() (client-side) returns [] for records
      // created via asServiceRole (stripeWebhook, linkStripePayment, activateFreeAccess).
      const res = await base44.functions.invoke("getMyAthleteProfiles", { accountId });
      const list = Array.isArray(res?.data?.profiles) ? res.data.profiles : [];
      const serverMeta = res?.data?._meta || null;

      const { chosen, resolutionMode, diagnostics } = resolveBestProfile(list, athleteId || null);

      const fullDiagnostics = {
        authAccountId: accountId,
        ...diagnostics,
        fetchMethod: serverMeta?.method || "unknown",
        listTotal: serverMeta?.listTotal ?? null,
        directAthleteIds: serverMeta?.directAthleteIds ?? [],
        schoolPrefAthleteId: serverMeta?.schoolPrefAthleteId ?? null,
        directVsLinkedMatch: serverMeta?.directVsLinkedMatch ?? null,
        multiplePrefWarning: serverMeta?.multiplePrefWarning ?? false,
        missingProfileWarning: serverMeta?.missingProfileWarning ?? false,
        serverErrors: serverMeta?.errors ?? [],
      };

      // Debug logging
      if (typeof window !== "undefined" && localStorage.getItem("__DEBUG_ATHLETE_IDENTITY__") === "1") {
        console.log("[AthleteIdentity]", fullDiagnostics);
        if (serverMeta) console.log("[AthleteIdentity] server _meta:", serverMeta);
      }

      if (!chosen) {
        return { _resolved: null, _resolutionMode: resolutionMode, _diagnostics: fullDiagnostics };
      }

      return {
        ...chosen,
        id: normId(chosen) || null,
        _resolutionMode: resolutionMode,
        _diagnostics: fullDiagnostics,
      };
    },
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
      home_city: ap.home_city ?? null,
      home_state: ap.home_state ?? null,
      home_lat: ap.home_lat ?? null,
      home_lng: ap.home_lng ?? null,
      player_email: ap.player_email ?? null,
      x_handle: ap.x_handle ?? null,
      parent_first_name: ap.parent_first_name ?? null,
      parent_last_name: ap.parent_last_name ?? null,
      parent_phone: ap.parent_phone ?? null,
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
        resolutionMode: "unresolved",
        diagnostics: null,
        loading: false,
        isLoading: false,
        isError: false,
        error: null,
        saveIdentity,
      };
    }

    // Strip internal _resolved sentinel if chosen was null
    const rawData = query.data;
    const profileData = rawData?._resolved === null ? null : rawData || null;
    const resolutionMode = rawData?._resolutionMode || (profileData ? "direct" : "unresolved");
    const diagnostics = rawData?._diagnostics || null;

    return {
      identity: profileData,
      athleteProfile: profileData,
      resolutionMode,
      diagnostics,
      loading: query.isLoading,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error,
      saveIdentity,
    };
  }, [isAuthed, query.data, query.isLoading, query.isError, query.error, accountId, queryClient]);
}
