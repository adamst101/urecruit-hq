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
 * - Prefer seed profile over blank direct profile for linked test accounts
 * - Resilient to Base44 id field variations (id/_id/uuid)
 *
 * Seed-profile precedence (for Functional Test linked accounts):
 * - A profile where athlete_name starts with "__hc_ft_" is a SEED profile
 * - A profile with no athlete_name/grad_year and no camp data is a BLANK direct profile
 * - If both exist: prefer seed profile (it has real downstream data)
 * - If only one exists: use it regardless
 */

// ---------- helpers ----------

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function isSeedProfile(profile) {
  return typeof profile?.athlete_name === "string" &&
    profile.athlete_name.startsWith("__hc_ft_");
}

function isBlankProfile(profile) {
  const noName = !profile?.athlete_name || profile.athlete_name.trim() === "";
  const noGradYear = !profile?.grad_year;
  return noName && noGradYear;
}

/**
 * Apply seed-profile precedence across a list of profiles.
 * Returns { chosen, resolutionMode, diagnostics }.
 */
function resolveBestProfile(list, requestedAthleteId) {
  const direct = list.length;

  if (requestedAthleteId) {
    const match = list.find((p) => normId(p) === requestedAthleteId) || null;
    return {
      chosen: match,
      resolutionMode: match ? "direct" : "unresolved",
      diagnostics: {
        directProfilesFound: direct,
        seedProfileFound: false,
        seedProfileId: null,
        finalProfileId: match ? (normId(match) || null) : null,
        reason: match
          ? `Matched requested athleteId ${requestedAthleteId}`
          : `No profile matched requested athleteId ${requestedAthleteId}`,
      },
    };
  }

  if (list.length === 0) {
    return {
      chosen: null,
      resolutionMode: "unresolved",
      diagnostics: {
        directProfilesFound: 0,
        seedProfileFound: false,
        seedProfileId: null,
        finalProfileId: null,
        reason: "No profiles returned",
      },
    };
  }

  const seedProfiles = list.filter(isSeedProfile);
  const hasSeed = seedProfiles.length > 0;
  const seedProfileId = hasSeed ? (normId(seedProfiles[0]) || null) : null;

  // If there is a seed profile, prefer it
  if (hasSeed) {
    const chosen = seedProfiles[0];
    return {
      chosen,
      resolutionMode: "linked_seed",
      diagnostics: {
        directProfilesFound: direct,
        seedProfileFound: true,
        seedProfileId,
        finalProfileId: normId(chosen) || null,
        reason: `Seed profile preferred (${list.length} total profiles found)`,
      },
    };
  }

  // No seed profile — use standard precedence: primary → active → first
  const chosen =
    list.find((p) => p?.is_primary === true && p?.active !== false) ||
    list.find((p) => p?.active === true) ||
    list[0] ||
    null;

  return {
    chosen,
    resolutionMode: chosen ? "direct" : "unresolved",
    diagnostics: {
      directProfilesFound: direct,
      seedProfileFound: false,
      seedProfileId: null,
      finalProfileId: chosen ? (normId(chosen) || null) : null,
      reason: chosen
        ? `Direct profile selected (primary/active/first)`
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

      const { chosen, resolutionMode, diagnostics } = resolveBestProfile(list, athleteId || null);

      const fullDiagnostics = {
        authAccountId: accountId,
        ...diagnostics,
      };

      // Debug logging
      if (typeof window !== "undefined" && window.__DEBUG_ATHLETE_IDENTITY__) {
        console.log("[AthleteIdentity]", fullDiagnostics);
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
