// src/components/hooks/useCampSummariesClient.jsx
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * useCampSummariesClient
 * Client-composed camp summary read model for PAID (athlete-scoped) views.
 *
 * Query key must be stable:
 *   ["myCampsSummaries_client", athleteId, sportId]
 *
 * Base44 entity.filter signature in this app:
 *   entity.filter(where, sort, limit)
 */

// ---------- helpers ----------
function clean(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function uniq(arr) {
  return Array.from(new Set((arr || []).map(normId).filter(Boolean).map(String)));
}

/**
 * Base44-safe bulk fetch:
 * - Try { id: { in: [...] } }
 * - Fallback to per-id lookups (id / _id)
 */
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

  // fallback per-id
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = [];
    for (const id of cleanIds) {
      try {
        const one = await base44.entities[entityName].filter({ id });
        if (Array.isArray(one) && one[0]) rows.push(one[0]);
      } catch {}
      if (!rows.find((r) => String(normId(r)) === String(id))) {
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

/**
 * Named export REQUIRED (do not change)
 */
export function useCampSummariesClient({
  athleteId,
  sportId,
  limit = 500,
  enabled = true
}) {
  const aId = clean(athleteId);
  const sId = clean(sportId);

  return useQuery({
    queryKey: ["myCampsSummaries_client", aId ? String(aId) : null, sId ? String(sId) : null],
    enabled: Boolean(enabled) && Boolean(aId),
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      // 1) Camps (optionally by sport)
      const campWhere = {};
      if (sId) campWhere.sport_id = String(sId);

      const campsRaw = await base44.entities.Camp.filter(
        campWhere,
        "-start_date",
        Number(limit) || 500
      );

      const camps = Array.isArray(campsRaw) ? campsRaw : [];
      if (camps.length === 0) return [];

      // normalize camp ids + reference ids
      const campsNorm = camps
        .map((c) => {
          const camp_id = normId(c);
          if (!camp_id) return null;

          const school_id = normId(c?.school_id) || c?.school_id || null;
          const sport_id = normId(c?.sport_id) || c?.sport_id || null;

          const position_ids = Array.isArray(c?.position_ids)
            ? c.position_ids.map(normId).filter(Boolean).map(String)
            : [];

          return {
            ...c,
            _camp_id: String(camp_id),
            _school_id: school_id ? String(school_id) : null,
            _sport_id: sport_id ? String(sport_id) : null,
            _position_ids: position_ids
          };
        })
        .filter(Boolean);

      // 2) Batch join: School / Sport / Position
      const schoolIds = uniq(campsNorm.map((c) => c._school_id));
      const sportIds = uniq(campsNorm.map((c) => c._sport_id));
      const positionIds = uniq(campsNorm.flatMap((c) => c._position_ids));

      const [schoolMap, sportMap, positionMap] = await Promise.all([
        fetchEntityMap("School", schoolIds),
        fetchEntityMap("Sport", sportIds),
        fetchEntityMap("Position", positionIds)
      ]);

      // 3) Athlete-specific: CampIntent + TargetSchool
      const [intentsRaw, targetsRaw] = await Promise.all([
        base44.entities.CampIntent.filter({ athlete_id: String(aId) }),
        base44.entities.TargetSchool.filter({ athlete_id: String(aId) })
      ]);

      const intents = Array.isArray(intentsRaw) ? intentsRaw : [];
      const targets = Array.isArray(targetsRaw) ? targetsRaw : [];

      // Map intents by camp_id (not by intent record id)
      const intentMap = new Map();
      for (const i of intents) {
        const campKey = normId(i?.camp_id) || i?.camp_id;
        if (campKey) intentMap.set(String(campKey), i);
      }

      const targetSchoolIds = new Set(
        targets
          .map((t) => normId(t?.school_id) || t?.school_id)
          .filter(Boolean)
          .map(String)
      );

      // 4) Compose summaries
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
          // Camp
          camp_id: campId,
          camp_name: camp?.camp_name || null,
          start_date: camp?.start_date || null,
          end_date: camp?.end_date || null,
          price: typeof camp?.price === "number" ? camp.price : null,
          link_url: camp?.link_url || null,
          notes: camp?.notes || null,
          city: camp?.city || null,
          state: camp?.state || null,

          position_ids: camp._position_ids,
          position_codes: campPositions.map((p) => p?.position_code).filter(Boolean),

          // School
          school_id: schoolId,
          school_name: school?.school_name || school?.name || null,
          school_division: school?.division || school?.school_division || null,
          school_logo_url: school?.logo_url || school?.school_logo_url || null,
          school_city: school?.city || null,
          school_state: school?.state || null,
          school_conference: school?.conference || null,

          // Sport
          sport_id: sportId2,
          sport_name: sport?.sport_name || sport?.name || null,

          // Intent
          intent_status: intent?.status || null,
          intent_priority: intent?.priority || null,

          // Targeting
          is_target_school: !!(schoolId && targetSchoolIds.has(schoolId))
        };
      });
    }
  });
}
