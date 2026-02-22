// src/components/hooks/useCampSummariesClient.jsx
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/* -------------------------
   Helpers
------------------------- */
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
  return Array.from(new Set((arr || []).map((x) => String(x)).filter(Boolean)));
}

function chunk(arr, size) {
  const out = [];
  const a = Array.isArray(arr) ? arr : [];
  const n = Math.max(1, Number(size) || 50);
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

function isRateLimitError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("rate limited") || msg.includes("429") || msg.includes("too many");
}

async function safeFilter(entity, where, sort, limit, { retries = 2, baseDelayMs = 250 } = {}) {
  if (!entity?.filter) return [];
  let last = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const rows = await entity.filter(where || {}, sort, limit);
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      last = e;
      if (!isRateLimitError(e) || attempt === retries) break;
      await sleep(baseDelayMs * Math.pow(2, attempt));
    }
  }

  throw last;
}

async function batchFetchByIds(entity, ids) {
  const cleanIds = uniq(ids);
  if (!entity?.filter || cleanIds.length === 0) return [];

  const out = [];
  for (const part of chunk(cleanIds, 60)) {
    const tries = [{ id: { in: part } }, { id: { $in: part } }, { _id: { in: part } }, { _id: { $in: part } }];
    let rows = [];
    for (const w of tries) {
      try {
        rows = await safeFilter(entity, w, undefined, undefined, { retries: 2, baseDelayMs: 200 });
        if (rows.length) break;
      } catch {
        // keep trying other operator forms
      }
    }
    out.push(...rows);
  }

  // de-dupe by id
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

async function batchFetchByEventKey(CampEntity, keys) {
  const cleanKeys = uniq(keys);
  if (!CampEntity?.filter || cleanKeys.length === 0) return [];

  // First try bulk operator forms
  const out = [];
  for (const part of chunk(cleanKeys, 60)) {
    const tries = [{ event_key: { in: part } }, { event_key: { $in: part } }];
    let rows = [];
    for (const w of tries) {
      try {
        rows = await safeFilter(CampEntity, w, undefined, undefined, { retries: 2, baseDelayMs: 200 });
        if (rows.length) break;
      } catch {
        // keep trying
      }
    }
    out.push(...rows);
  }

  // If bulk returned nothing, fall back to sequential lookups (safe for small lists)
  if (out.length === 0 && cleanKeys.length <= 25) {
    for (const k of cleanKeys) {
      try {
        const one = await safeFilter(CampEntity, { event_key: k }, undefined, 1, { retries: 2, baseDelayMs: 250 });
        if (one?.[0]) out.push(one[0]);
      } catch {
        // ignore individual failures
      }
      await sleep(40);
    }
  }

  // de-dupe by camp id
  const seen = new Set();
  const deduped = [];
  for (const r of out) {
    const id = normId(r);
    if (!id) continue;
    const key = String(id);
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

  let rows = [];
  try {
    rows = await batchFetchByIds(entity, cleanIds);
  } catch {
    rows = [];
  }

  (rows || []).forEach((r) => {
    const key = normId(r);
    if (key) map.set(String(key), r);
  });

  return map;
}

/* -------------------------
   Hook
------------------------- */
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

    retry: (count, err) => {
      if (isRateLimitError(err)) return count < 2;
      return false;
    },
    retryDelay: (attempt) => Math.min(2000, 400 * Math.max(1, attempt)),
    staleTime: 10_000,

    queryFn: async () => {
      const CampEntity = base44.entities?.Camp;
      const IntentEntity = base44.entities?.CampIntent;
      const TargetEntity = base44.entities?.TargetSchool;

      if (!CampEntity?.filter || !IntentEntity?.filter) return [];

      // 1) Load intents + targets
      const [intentsRaw, targetsRaw] = await Promise.allSettled([
        safeFilter(IntentEntity, { athlete_id: String(aId) }, undefined, undefined, { retries: 2, baseDelayMs: 250 }),
        TargetEntity?.filter
          ? safeFilter(TargetEntity, { athlete_id: String(aId) }, undefined, undefined, { retries: 2, baseDelayMs: 250 })
          : Promise.resolve([]),
      ]);

      const intents = intentsRaw.status === "fulfilled" && Array.isArray(intentsRaw.value) ? intentsRaw.value : [];
      const targets = targetsRaw.status === "fulfilled" && Array.isArray(targetsRaw.value) ? targetsRaw.value : [];

      const intentByKey = new Map();
      const interestedKeys = [];
      for (const i of intents) {
        const rawKey = i?.camp_id;
        if (!rawKey) continue;
        const key = String(rawKey);
        intentByKey.set(key, i);

        const st = String(i?.status || "").toLowerCase();
        if (st === "favorite" || st === "registered" || st === "completed") interestedKeys.push(key);
      }

      if (!includeAllCampsForSport && interestedKeys.length === 0) return [];

      // 2) Fetch camps. IMPORTANT: do not let one strategy failure zero the results.
      let camps = [];

      if (includeAllCampsForSport) {
        const where = {};
        if (sId) where.sport_id = String(sId);
        try {
          camps = await safeFilter(CampEntity, where, "-start_date", Number(limit) || 500, { retries: 2, baseDelayMs: 300 });
        } catch {
          camps = [];
        }
      } else {
        const [byIdRes, byKeyRes] = await Promise.allSettled([
          batchFetchByIds(CampEntity, interestedKeys),
          batchFetchByEventKey(CampEntity, interestedKeys),
        ]);

        const byId = byIdRes.status === "fulfilled" ? byIdRes.value : [];
        const byKey = byKeyRes.status === "fulfilled" ? byKeyRes.value : [];

        // Merge both sets
        const seen = new Set();
        const merged = [];
        for (const r of [...(byId || []), ...(byKey || [])]) {
          const id = normId(r);
          if (!id) continue;
          const k = String(id);
          if (seen.has(k)) continue;
          seen.add(k);
          merged.push(r);
        }
        camps = merged;

        // sport guard (optional)
        if (sId) {
          camps = camps.filter((c) => String(normId(c?.sport_id) || c?.sport_id || "") === String(sId));
        }
      }

      if (!camps.length) return [];

      // 3) Normalize + join
      const campsNorm = camps
        .map((c) => ({
          ...c,
          _camp_id: normId(c),
          _event_key: c?.event_key ? String(c.event_key) : "",
          _school_id: normId(c?.school_id) || c?.school_id || null,
          _sport_id: normId(c?.sport_id) || c?.sport_id || null,
          _position_ids: Array.isArray(c?.position_ids) ? c.position_ids.map(normId).filter(Boolean) : [],
        }))
        .filter((c) => c._camp_id);

      const schoolIds = uniq(campsNorm.map((c) => c._school_id));
      const sportIds = uniq(campsNorm.map((c) => c._sport_id));
      const positionIds = uniq(campsNorm.flatMap((c) => c._position_ids));

      const [schoolMap, sportMap, positionMap] = await Promise.allSettled([
        fetchEntityMap("School", schoolIds),
        fetchEntityMap("Sport", sportIds),
        fetchEntityMap("Position", positionIds),
      ]);

      const schools = schoolMap.status === "fulfilled" ? schoolMap.value : new Map();
      const sports = sportMap.status === "fulfilled" ? sportMap.value : new Map();
      const positions = positionMap.status === "fulfilled" ? positionMap.value : new Map();

      const targetSchoolIds = new Set(
        targets.map((t) => String(normId(t?.school_id) || t?.school_id)).filter(Boolean)
      );

      return campsNorm.map((camp) => {
        const campId = String(camp._camp_id);
        const eventKey = camp._event_key;
        const schoolId = camp._school_id ? String(camp._school_id) : null;
        const sportId2 = camp._sport_id ? String(camp._sport_id) : null;

        const school = schoolId ? schools.get(schoolId) : null;
        const sport = sportId2 ? sports.get(sportId2) : null;

        // Intent can be stored by Camp.id OR event_key
        const intent = intentByKey.get(campId) || (eventKey ? intentByKey.get(eventKey) : null) || null;

        const campPositions = (camp._position_ids || [])
          .map((pid) => positions.get(String(pid)))
          .filter(Boolean);

        return {
          camp_id: campId,
          event_key: eventKey || null,

          camp_name: camp.camp_name,
          start_date: camp.start_date,
          end_date: camp.end_date || null,
          price: typeof camp.price === "number" ? camp.price : null,
          price_max: typeof camp.price_max === "number" ? camp.price_max : null,
          link_url: camp.link_url || null,
          city: camp.city || null,
          state: camp.state || null,

          school_id: schoolId,
          school_name: school?.school_name || school?.name || null,
          school_division: school?.division || school?.school_division || null,
          school_logo_url: school?.logo_url || school?.school_logo_url || null,

          sport_id: sportId2,
          sport_name: sport?.sport_name || sport?.name || null,

          intent_status: intent?.status || null,
          intent_priority: intent?.priority || null,

          is_target_school: !!(schoolId && targetSchoolIds.has(schoolId)),
          position_ids: camp._position_ids,
          position_codes: campPositions.map((p) => p?.position_code).filter(Boolean),
        };
      });
    },
  });
}