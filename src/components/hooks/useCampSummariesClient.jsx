import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * useCampSummariesClient
 * Single source of truth for the client-composed camp summary read model.
 *
 * Query key MUST remain stable across the app:
 *   ["myCampsSummaries_client", athleteId, sportId]
 *
 * Backend entities remain the system of record.
 * Frontend is the system of composition.
 */
export function useCampSummariesClient({
  athleteId,
  sportId,
  limit = 500,
  enabled = true
}) {
  const clean = (v) => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === "string" && v.trim() === "") return undefined;
    return v;
  };

  const aId = clean(athleteId);
  const sId = clean(sportId);

  return useQuery({
    queryKey: ["myCampsSummaries_client", aId, sId],
    enabled: Boolean(aId) && enabled,
    retry: false,
    queryFn: async () => {
      const payload = {
        athlete_id: aId,
        sport_id: sId,
        limit
      };

      // Camps (optionally by sport)
      const campQuery = {};
      if (payload.sport_id) campQuery.sport_id = payload.sport_id;

      const camps = await base44.entities.Camp.filter(
        campQuery,
        "-start_date",
        payload.limit || 500
      );

      // Fast exit
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

      // Athlete-specific: CampIntent + TargetSchool
      const [intents, targets] = await Promise.all([
        base44.entities.CampIntent.filter({ athlete_id: payload.athlete_id }),
        base44.entities.TargetSchool.filter({ athlete_id: payload.athlete_id })
      ]);

      const intentMap = Object.fromEntries((intents || []).map((i) => [i.camp_id, i]));
      const targetSchoolIds = new Set((targets || []).map((t) => t.school_id));

      // Summaries
      return camps.map((camp) => {
        const school = schoolMap[camp.school_id];
        const sport = sportMap[camp.sport_id];
        const intent = intentMap[camp.id] || null;

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

          // Intent
          intent_status: intent?.status || null,
          intent_priority: intent?.priority || null,

          // Targeting
          is_target_school: targetSchoolIds.has(camp.school_id)
        };
      });
    }
  });
}