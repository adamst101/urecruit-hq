import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * usePublicCampSummariesClient
 * Public/demo read model built from CampDemo (no identity required).
 *
 * Query key:
 *   ["publicCampSummaries_client", seasonYear, sportId]
 *
 * Note:
 * - No CampIntent
 * - No TargetSchool
 * - Joins only: School / Sport / Position
 */
export function usePublicCampSummariesClient({
  seasonYear,
  sportId,
  limit = 500,
  enabled = true
}) {
  const clean = (v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "string" && v.trim() === "") return undefined;
    return v;
  };

  const y = clean(seasonYear);
  const sId = clean(sportId);

  return useQuery({
    queryKey: ["publicCampSummaries_client", y, sId],
    enabled: Boolean(enabled) && Boolean(y),
    retry: false,
    queryFn: async () => {
      const query = { season_year: y };
      if (sId) query.sport_id = sId;

      // Pull demo camps
      const camps = await base44.entities.CampDemo.filter(
        query,
        "-start_date",
        limit || 500
      );

      if (!camps?.length) return [];

      // Batch join: School / Sport / Position
      const schoolIds = [...new Set(camps.map((c) => c.school_id).filter(Boolean))];
      const sportIds = [...new Set(camps.map((c) => c.sport_id).filter(Boolean))];

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

      // Summaries (same shape as paid as much as possible)
      return camps.map((camp) => {
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

          // Intent (demo users have none)
          intent_status: null,
          intent_priority: null,

          // Targeting (demo users have none)
          is_target_school: false,

          // Extra
          season_year: camp.season_year
        };
      });
    }
  });
}