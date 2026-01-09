// src/components/hooks/useCampSummariesClient.js
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

function clean(v) {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function uniq(arr) {
  return Array.from(new Set((arr || []).map(normId).filter(Boolean)));
}

async function fetchEntityMap(entityName, ids) {
  const map = new Map();
  const cleanIds = uniq(ids);
  if (!cleanIds.length) return map;

  let rows = [];
  try {
    rows = await base44.entities[entityName].filter({ id: { in: cleanIds } });
  } catch {
    rows = [];
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    rows = [];
    for (const id of cleanIds) {
      try {
        const one = await base44.entities[entityName].filter({ id });
        if (Array.isArray(one) && one[0]) rows.push(one[0]);
      } catch {}
      if (!rows.find((r) => normId(r) === id)) {
        try {
          const one2 = await base44.entities[entityName].filter({ _id: id });
          if (Array.isArray(one2) && one2[0]) rows.push(one2[0]);
        } catch {}
      }
    }
  }

  (rows || []).forEach((r) => {
    const key = normId(r);
    if (key) map.set(String(key), r);
  });

  return map;
}

export function useCampSummariesClient({ athleteId, sportId, limit = 500, enabled = true }) {
  const aId = clean(athleteId);
  const sId = clean(sportId);

  return useQuery({
    queryKey: ["myCampsSummaries_client", aId, sId],
    enabled: Boolean(aId) && enabled,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const campWhere = {};
      if (sId) campWhere.sport_id = sId;

      const campsRaw = await base44.entities.Camp.filter(campWhere, "-start_date", limit || 500);
      const camps = Array.isArray(campsRaw) ? campsRaw : [];
      if (camps.length === 0) return [];

      const campsNorm = camps
        .map((c) => ({
          ...c,
          _camp_id: normId(c),
          _school_id: normId(c.school_id) || c.school_id || null,
          _sport_id: normId(c.sport_id) || c.sport_id || null,
          _position_ids: Array.isArray(c.position_ids) ? c.position_ids.map(normId).filter(Boolean) : [],
        }))
        .filter((c) => c._camp_id);

      const schoolIds = uniq(campsNorm.map((c) => c._school_id));
      const sportIds = uniq(campsNorm.map((c) => c._sport_id));
      const positionIds = uniq(campsNorm.flatMap((c) => c._position_ids));

      const [schoolMap, sportMap, positionMap] = await Promise.all([
        fetchEntityMap("School", schoolIds),
        fetchEntityMap("Sport", sportIds),
        fetchEntityMap("Position", positionIds),
      ]);

      const [intentsRaw, targetsRaw] = await Promise.all([
        base44.entities.CampIntent.filter({ athlete_id: aId }),
        base44.entities.TargetSchool.filter({ athlete_id: aId }),
      ]);

      const intents = Array.isArray(intentsRaw) ? intentsRaw : [];
      const targets = Array.isArray(targetsRaw) ? targetsRaw : [];

      const intentMap = new Map();
      for (const i of intents) {
        const campKey = normId(i.camp_id) || i.camp_id;
        if (campKey) intentMap.set(String(campKey), i);
      }

      const targetSchoolIds = new Set(
        targets.map((t) => String(normId(t.school_id) || t.school_id)).filter(Boolean)
      );

      return campsNorm.map((camp) => {
        const campId = String(camp._camp_id);
        const schoolId = camp._school_id ? String(camp._school_id) : null;
        const sportId2 = camp._sport_id ? String(camp._sport_id) : null;

        const school = schoolId ? schoolMap.get(schoolId) : null;
        const sport = sportId2 ? sportMap.get(sportId2) : null;
        const intent = intentMap.get(campId) || null;

        const campPositions = (camp._position_ids || [])
          .map((pid) => positionMap.get(String(pid)))
          .filter(Boolean);

        return {
          camp_id: campId,
          camp_name: camp.camp_name,
          start_date: camp.start_date,
          end_date: camp.end_date || null,
          price: typeof camp.price === "number" ? camp.price : null,
          link_url: camp.link_url || null,
          notes: camp.notes || null,
          city: camp.city || null,
          state: camp.state || null,
          position_ids: camp._position_ids,
          position_codes: campPositions.map((p) => p.position_code).filter(Boolean),

          school_id: schoolId,
          school_name: school?.school_name || school?.name || null,
          school_division: school?.division || school?.school_division || null,
          school_logo_url: school?.logo_url || school?.school_logo_url || null,
          school_city: school?.city || null,
          school_state: school?.state || null,
          school_conference: school?.conference || null,

          sport_id: sportId2,
          sport_name: sport?.sport_name || sport?.name || null,

          intent_status: intent?.status || null,
          intent_priority: intent?.priority || null,

          is_target_school: !!(schoolId && targetSchoolIds.has(schoolId)),
        };
      });
    },
  });
}
