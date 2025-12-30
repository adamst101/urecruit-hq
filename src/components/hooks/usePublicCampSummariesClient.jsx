import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * usePublicCampSummariesClient
 * Demo-mode single source of truth for public camp summaries.
 *
 * Query key MUST remain stable:
 * ["publicCampSummaries_demo", seasonYear, sportId, state, division, positionKey]
 *
 * Notes:
 * - Uses CampDemo as the system of record for demo browsing.
 * - Composes a joined summary client-side (School/Sport/Position).
 * - No writes. No CampIntent.
 */
export function usePublicCampSummariesClient({
  seasonYear,
  sportId = null,
  state = null,
  division = null,
  positionIds = [],
  limit = 500,
  enabled = true
}) {
  const clean = (v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === "string" && v.trim() === "") return null;
    return v;
  };

  const y = clean(seasonYear);
  const sId = clean(sportId);
  const st = clean(state);
  const div = clean(division);

  const posIds = Array.isArray(positionIds) ? positionIds.filter(Boolean) : [];
  const positionKey = posIds.length ? posIds.slice().sort().join(",") : "none";

  return useQuery({
    queryKey: ["publicCampSummaries_demo", y, sId, st, div, positionKey],
    enabled: !!enabled && !!y,
    retry: false,
    queryFn: async () => {
      // -----------------------------
      // 1) Fetch CampDemo (server-side filters when possible)
      // -----------------------------
      const campQuery = { season_year: y };

      if (sId) campQuery.sport_id = sId;
      if (st) campQuery.state = st;

      // Note: division is on School, not CampDemo -> filter after join
      const camps = await base44.entities.CampDemo.filter(
        campQuery,
        "-start_date",
        limit || 500
      );

      const campList = Array.isArray(camps) ? camps : [];
      if (campList.length === 0) return [];

      // -----------------------------
      // 2) Join School / Sport / Position
      // -----------------------------
      const schoolIds = [...new Set(campList.map((c) => c.school_id).filter(Boolean))];
      const sportIds = [...new Set(campList.map((c) => c.sport_id).filter(Boolean))];

      const [schools, sports, positions] = await Promise.all([
        schoolIds.length
          ? base44.entities.School.filter({ id: { $in: schoolIds } })
          : Promise.resolve([]),
        sportIds.length
          ? base44.entities.Sport.filter({ id: { $in: sportIds } })
          : Promise.resolve([]),
        base44.entities.Position.list()
      ]);

      const schoolMap = Object.fromEntries((schools || []).map((s) => [s.id, s]));
      const sportMap = Object.fromEntries((sports || []).map((s) => [s.id, s]));
      const positionMap = Object.fromEntries((positions || []).map((p) => [p.id, p]));

      // -----------------------------
      // 3) Apply client-side filters requiring joins
      // -----------------------------
      const filtered = campList.filter((camp) => {
        // division filter (School)
        if (div) {
          const school = schoolMap[camp.school_id];
          if (!school || school.division !== div) return false;
        }

        // position filter (intersection)
        if (posIds.length > 0) {
          const campPos = Array.isArray(camp.position_ids) ? camp.position_ids : [];
          const hasOverlap = campPos.some((pid) => posIds.includes(pid));
          if (!hasOverlap) return false;
        }

        return true;
      });

      // -----------------------------
      // 4) Build summary shape (aligned to paid summary where possible)
      // -----------------------------
      return filtered.map((camp) => {
        const school = schoolMap[camp.school_id];
        const sport = sportMap[camp.sport_id];

        const campPositions = (camp.position_ids || [])
          .map((pid) => positionMap[pid])
          .filter(Boolean);

        return {
          // Camp
          camp_id: camp.id,
          camp_name: camp.camp_name,
          start_date: camp.start_date,
          end_date: camp.end_date,
          price: camp.price,
          link_url: camp.link_url,
          notes: camp.notes,
          city: camp.city,
          state: camp.state,
          position_ids: camp.position_ids || [],
          position_codes: campPositions.map((p) => p.position_code),

          // School
          school_id: school?.id,
          school_name: school?.school_name,
          school_division: school?.division,
          school_logo_url: school?.logo_url,
          school_city: school?.city,
          school_state: school?.state,
          school_conference: school?.conference,

          // Sport
          sport_id: sport?.id,
          sport_name: sport?.sport_name,

          // Demo only: no intent
          intent_status: null,
          intent_priority: null,

          // Demo only: targeting unknown
          is_target_school: false
        };
      });
    }
  });
}
