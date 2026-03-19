// src/components/hooks/useAllAthletesCamps.jsx
//
// Fetches favorited/registered camps for ALL athletes under the account in
// parallel. Used by conflict detection to surface cross-athlete scheduling
// conflicts (two athletes booked on the same date).
//
// Returns: { allCamps, athletes, isLoading }
// Each camp in allCamps has: { id, camp_name, start_date, city, state, athleteId, athleteName }

import { useQuery, useQueries } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";
import { useSeasonAccess } from "./useSeasonAccess.jsx";

const ACTIVE_STATUSES = new Set(["favorite", "registered", "completed"]);

async function fetchCampsForAthlete(aId, aName) {
  const CampIntent = base44.entities?.CampIntent;
  const Camp = base44.entities?.Camp;
  if (!CampIntent?.filter || !Camp?.filter) return [];

  // 1. Get active intents for this athlete
  const intents = await CampIntent.filter({ athlete_id: aId }).catch(() => []);
  const active = (Array.isArray(intents) ? intents : []).filter(
    (i) => ACTIVE_STATUSES.has(String(i?.status || "").toLowerCase())
  );
  if (active.length === 0) return [];

  // 2. Fetch camp records (bulk attempt first, individual fallback)
  const campIds = [...new Set(active.map((i) => String(i.camp_id || "")).filter(Boolean))];
  const campMap = new Map();

  // Try bulk operator forms
  for (const op of [{ id: { in: campIds } }, { id: { $in: campIds } }]) {
    try {
      const rows = await Camp.filter(op).catch(() => []);
      if (Array.isArray(rows) && rows.length > 0) {
        rows.forEach((c) => {
          const id = String(c.id || c._id || "");
          if (id) campMap.set(id, c);
        });
        break;
      }
    } catch {}
  }

  // Individual fallback for any still missing
  for (const id of campIds) {
    if (campMap.has(id)) continue;
    try {
      const rows = await Camp.filter({ id }, undefined, 1).catch(() => []);
      if (rows?.[0]) campMap.set(id, rows[0]);
    } catch {}
  }

  // 3. Join intents → camp data
  return active
    .map((intent) => {
      const campId = String(intent.camp_id || "");
      const camp = campMap.get(campId);
      if (!camp?.start_date) return null;
      return {
        id: campId,
        camp_name: camp.camp_name || "",
        start_date: camp.start_date,
        city: camp.city || null,
        state: camp.state || null,
        athleteId: aId,
        athleteName: aName,
      };
    })
    .filter(Boolean);
}

export function useAllAthletesCamps({ enabled = true } = {}) {
  const { accountId, mode } = useSeasonAccess();
  const isPaid = mode === "paid";

  // Step 1 — fetch all athlete profiles for this account
  const athletesQuery = useQuery({
    queryKey: ["allAthletes_conflict", accountId],
    enabled: !!accountId && isPaid && enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const rows = await base44.entities.AthleteProfile.filter({ account_id: accountId }).catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
  });

  const athletes = athletesQuery.data || [];

  // Step 2 — for each athlete, fetch their active camps in parallel
  const campQueries = useQueries({
    queries: athletes.map((a) => {
      const aId = String(a.id || a._id || "");
      const aName = a.first_name || a.athlete_name || "Athlete";
      return {
        queryKey: ["crossAthleteConflict", aId],
        enabled: !!aId,
        staleTime: 5 * 60 * 1000,
        queryFn: () => fetchCampsForAthlete(aId, aName),
      };
    }),
  });

  const allCamps = campQueries.flatMap((q) => (Array.isArray(q.data) ? q.data : []));
  const isLoading = athletesQuery.isLoading || campQueries.some((q) => q.isLoading);

  return { allCamps, athletes, isLoading };
}
