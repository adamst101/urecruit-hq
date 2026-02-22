// src/components/hooks/useCampSummariesClient.jsx
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * useCampSummariesClient
 * Single source of truth for the PAID (athlete-scoped) client-composed camp summary read model.
 *
 * Query key MUST remain stable across the app:
 *   ["myCampsSummaries_client", athleteId, sportId]
 *
 * Goal:
 * - MyCamps MUST NOT load the entire Camp table (rate limit risk).
 * - Default behavior: fetch athlete CampIntent -> fetch only referenced Camp rows.
 * - Optional escape hatch: includeAllCampsForSport=true keeps legacy behavior.
 */

// ---------- helpers ----------
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

function chunk(arr, size) {
  const out = [];
  const a = Array.isArray(arr) ? arr : [];
  const n = Math.max(1, Number(size) || 50);
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

async function tryFilter(entity, where, sort, limit) {
  try {
    const rows = await entity.filter(where || {}, sort, limit);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * Base44-safe bulk fetch by ids.
 * We try common "in" patterns and chunk to reduce payload size.
 * Last-resort fallback is capped (prevents rate-limiting storms).
 */
async function batchFetchByIds(entity, ids) {
  const cleanIds = uniq(ids);
  if (!entity?.filter || cleanIds.length === 0) return [];

  const out = [];
  const idChunks = chunk(cleanIds, 60);

  for (const part of idChunks) {
    const tries = [
      { id: { in: part } },
      { id: { $in: part } },
      { _id: { in: part } },
      { _id: { $in: part } },
    ];

    let rows = [];
    for (const w of tries) {
      rows = await tryFilter(entity, w);
      if (rows.length) break;
    }

    if (rows.length === 0) {
      // Hard cap: never do more than 10 per-id reads per chunk.
      const cap = Math.min(part.length, 10);
      for (let i = 0; i < cap; i++) {
        const id = part[i];
        const one = await tryFilter(entity, { id });
        if (one[0]) out.push(one[0]);
        const one2 = await tryFilter(entity, { _id: id });
        if (one2[0]) out.push(one2[0]);
      }
      continue;
    }

    out.push(...rows);
  }

  // de-dupe by normalized id
  const seen = new Set();
  const deduped = [];
  for (const r of out) {
    const k = normId(r);
    if (!k) continue;
    const key = String(k);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped;
}

async function fetchEntityMap(entityName, ids) {
  const map = new Map();
  const cleanIds = uniq(ids);
  if (!cleanIds.length) return map;

  const entity = base44.entities?.[entityName];
  if (!entity?.filter) return map;

  const rows = await batchFetchByIds(entity, cleanIds);
  (rows || []).forEach((r) => {
    const key = normId(r);
    if (key) map.set(String(key), r);
  });

  return map;
}

export function useCampSummariesClient({
  athleteId,
  sportId,
  limit = 500,
  includeAllCampsForSport = false,
  enabled = true,
} = {}) {
  const aId = clean(athleteId);
  const sId = clean(sportId);

  return useQuery({
    queryKey: ["myCampsSummaries_client", aId || null, sId || null],
    enabled: Boolean(aId) && Boolean(enabled),

    // Rate limit resilience: allow retries with simple backoff
    retry: (count, err) => {
      const msg = String(err?.message || err || "").toLowerCase();
      const isRate = msg.includes("rate") || msg.includes("429") || msg.includes("too many");
      if (isRate) return count < 2;
      return false;
    },
    retryDelay: (attempt) => Math.min(2000, 400 * Math.max(1, attempt)),
    staleTime: 10_000,

    queryFn: async () => {
      const CampEntity = base44.entities?.Camp;
      const IntentEntity = base44.entities?.CampIntent;
      const TargetEntity = base44.entities?.TargetSchool;

      if (!CampEntity?.filter || !IntentEntity?.filter) return [];

      // 1) Athlete-specific: intents + targets
      const [intentsRaw, targetsRaw] = await Promise.all([
        IntentEntity.filter({ athlete_id: aId }),
        TargetEntity?.filter ? TargetEntity.filter({ athlete_id: aId }) : Promise.resolve([]),
      ]);

      const intents = Array.isArray(intentsRaw) ? intentsRaw : [];
      const targets = Array.isArray(targetsRaw) ? targetsRaw : [];

      // Map intents by camp_id (normalized)
      const intentMap = new Map();
      const interestedCampIds = [];
      for (const i of intents) {
        const campKey = normId(i?.camp_id) || i?.camp_id;
        if (!campKey) continue;
        const k = String(campKey);
        intentMap.set(k, i);
        const st = String(i?.status || "").toLowerCase();
        if (st === "favorite" || st === "registered" || st === "completed") {
          interestedCampIds.push(k);
        }
      }

      if (!includeAllCampsForSport && interestedCampIds.length === 0) return [];

      // 2) Camps
      let camps = [];
      if (includeAllCampsForSport) {
        const campWhere = {};
        if (sId) campWhere.sport_id = sId;
        const campsRaw = await tryFilter(CampEntity, campWhere, "-start_date", Number(limit) || 500);
        camps = Array.isArray(campsRaw) ? campsRaw : [];
      } else {
        camps = await batchFetchByIds(CampEntity, interestedCampIds);

        // Optional sport filter for safety if user has multiple sports
        if (sId) {
          camps = camps.filter((c) => String(normId(c?.sport_id) || c?.sport_id || "") === String(sId));
        }
      }

      if (!camps.length) return [];

      // normalize camp ids + reference ids
      const campsNorm = camps
        .map((c) => ({
          ...c,
          _camp_id: normId(c),
          _school_id: normId(c?.school_id) || c?.school_id || null,
          _sport_id: normId(c?.sport_id) || c?.sport_id || null,
          _position_ids: Array.isArray(c?.position_ids) ? c.position_ids.map(normId).filter(Boolean) : [],
        }))
        .filter((c) => c._camp_id);

      // 3) Batch join: School / Sport / Position
      const schoolIds = uniq(campsNorm.map((c) => c._school_id));
      const sportIds = uniq(campsNorm.map((c) => c._sport_id));
      const positionIds = uniq(campsNorm.flatMap((c) => c._position_ids));

      const [schoolMap, sportMap, positionMap] = await Promise.all([
        fetchEntityMap("School", schoolIds),
        fetchEntityMap("Sport", sportIds),
        fetchEntityMap("Position", positionIds),
      ]);

      const targetSchoolIds = new Set(
        targets.map((t) => String(normId(t?.school_id) || t?.school_id)).filter(Boolean)
      );

      // 4) Summaries
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
          camp_name: camp.camp_name,
          start_date: camp.start_date,
          end_date: camp.end_date || null,
          price: typeof camp.price === "number" ? camp.price : null,
          link_url: camp.link_url || null,
          notes: camp.notes || null,
          city: camp.city || null,
          state: camp.state || null,
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
          is_target_school: !!(schoolId && targetSchoolIds.has(schoolId)),
        };
      });
    },
  });
}