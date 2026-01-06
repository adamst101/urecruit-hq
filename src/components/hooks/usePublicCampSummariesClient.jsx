// src/components/hooks/usePublicCampSummariesClient.js
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

const yStart = (y) => `${Number(y)}-01-01`;
const yNext = (y) => `${Number(y) + 1}-01-01`;

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function pickSchoolName(s) {
  return s?.school_name || s?.name || s?.title || "Unknown School";
}
function pickSchoolDivision(s) {
  return (
    s?.division ||
    s?.school_division ||
    s?.division_code ||
    s?.division_level ||
    null
  );
}
function pickSportName(sp) {
  return sp?.sport_name || sp?.name || sp?.title || null;
}

/**
 * Base44 filter signature in this app:
 *   entity.filter(where, sort, limit)
 */
async function filterCamps(where, limit) {
  const lim = Number.isFinite(Number(limit)) ? Number(limit) : undefined;
  return await base44.entities.Camp.filter(where || {}, "-start_date", lim || 500);
}

/**
 * Try different filter syntaxes for date range until one works.
 * Returns { rows, used } where used is a string indicating which syntax succeeded.
 */
async function filterCampsByYear(whereBase, year, limit = 500) {
  const start = yStart(year);
  const next = yNext(year);

  // Candidate syntaxes (Base44 variants)
  const candidates = [
    {
      used: "object_ops_gte_lt",
      where: { ...whereBase, start_date: { gte: start, lt: next } },
    },
    {
      used: "suffix_ops__gte__lt",
      where: { ...whereBase, start_date__gte: start, start_date__lt: next },
    },
    {
      used: "suffix_ops_gte_lt",
      where: { ...whereBase, start_date_gte: start, start_date_lt: next },
    },
    {
      used: "prefix_ops_gte_lt",
      where: { ...whereBase, gte_start_date: start, lt_start_date: next },
    },
  ];

  for (const c of candidates) {
    try {
      const rows = await filterCamps(c.where, limit);
      if (Array.isArray(rows)) return { rows, used: c.used };
    } catch {
      // try next
    }
  }

  // Fallback: pull with base filters + client-side year gating.
  // Keep limit a bit larger to reduce false negatives.
  const wider = Math.max(Number(limit) || 500, 2000);

  const rows = await filterCamps(whereBase, wider);
  const arr = Array.isArray(rows) ? rows : [];

  const filtered = arr.filter((c) => {
    const d = c?.start_date;
    return typeof d === "string" && d >= start && d < next;
  });

  return { rows: filtered.slice(0, Number(limit) || 500), used: "client_side_fallback" };
}

/**
 * Base44-safe entity bulk fetch:
 * - Try { id: { in: [...] } }
 * - Fall back to per-id fetch
 */
async function fetchEntityMap(entityName, ids) {
  const map = new Map();

  const cleanIds = uniq((ids || []).map(normId)).filter(Boolean);
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
      try {
        const one2 = await base44.entities[entityName].filter({ _id: id });
        if (Array.isArray(one2) && one2[0]) rows.push(one2[0]);
      } catch {}
    }
  }

  (rows || []).forEach((r) => {
    const key = normId(r) || r?.id;
    if (key) map.set(String(key), r);
  });

  return map;
}

/**
 * Returns summaries shaped for Discover (public/demo-style):
 * {
 *  camp_id, camp_name, start_date, end_date, city, state, price, link_url, notes, position_ids,
 *  school_id, school_name, school_division,
 *  sport_id, sport_name
 * }
 */
async function fetchPublicCampSummaries({
  seasonYear,
  sportId,
  state,
  division,
  positionIds,
  limit = 500,
}) {
  if (!seasonYear) return [];

  const whereBase = {};
  const sId = normId(sportId);
  if (sId) whereBase.sport_id = sId;
  if (state) whereBase.state = state;

  const { rows: campsRaw } = await filterCampsByYear(whereBase, seasonYear, limit);

  let camps = Array.isArray(campsRaw) ? campsRaw : [];

  // normalize camp ids/refs
  camps = camps
    .map((c) => ({
      ...c,
      id: normId(c) || c?.id,
      school_id: normId(c?.school_id) || c?.school_id || null,
      sport_id: normId(c?.sport_id) || c?.sport_id || null,
      position_ids: Array.isArray(c?.position_ids)
        ? c.position_ids.map(normId).filter(Boolean)
        : [],
    }))
    .filter((c) => !!c.id);

  // Optional: positions filter (client-side)
  const pos = Array.isArray(positionIds)
    ? positionIds.map(normId).filter(Boolean)
    : [];
  if (pos.length) {
    camps = camps.filter((c) => pos.some((p) => (c.position_ids || []).includes(p)));
  }

  const schoolIds = uniq(camps.map((c) => c.school_id)).filter(Boolean).map(String);
  const sportIds = uniq(camps.map((c) => c.sport_id)).filter(Boolean).map(String);

  const [schoolMap, sportMap] = await Promise.all([
    fetchEntityMap("School", schoolIds),
    fetchEntityMap("Sport", sportIds),
  ]);

  // Optional: division filter (post-join)
  if (division) {
    camps = camps.filter((c) => {
      const sch = c.school_id ? schoolMap.get(String(c.school_id)) : null;
      return pickSchoolDivision(sch) === division;
    });
  }

  return camps.map((c) => {
    const sch = c.school_id ? schoolMap.get(String(c.school_id)) : null;
    const sp = c.sport_id ? sportMap.get(String(c.sport_id)) : null;

    return {
      camp_id: String(c.id),
      school_id: c.school_id ? String(c.school_id) : null,
      sport_id: c.sport_id ? String(c.sport_id) : null,

      camp_name: c.camp_name,
      start_date: c.start_date,
      end_date: c.end_date || null,
      city: c.city || null,
      state: c.state || null,
      position_ids: Array.isArray(c.position_ids) ? c.position_ids : [],
      price: typeof c.price === "number" ? c.price : null,
      link_url: c.link_url || null,
      notes: c.notes || null,

      school_name: pickSchoolName(sch),
      school_division: pickSchoolDivision(sch),

      sport_name: pickSportName(sp),

      // keep parity with other summary shapes (optional)
      intent_status: null,
    };
  });
}

export function usePublicCampSummariesClient({
  seasonYear,
  sportId,
  state,
  division,
  positionIds,
  limit = 500,
  enabled = true,
}) {
  return useQuery({
    queryKey: [
      "publicCampSummaries",
      seasonYear,
      normId(sportId) || null,
      state || null,
      division || null,
      Array.isArray(positionIds) ? positionIds.map(normId).filter(Boolean).join(",") : "",
      Number(limit) || 500,
    ],
    enabled: Boolean(enabled) && !!seasonYear,
    retry: false,
    staleTime: 0,
    queryFn: () =>
      fetchPublicCampSummaries({
        seasonYear,
        sportId,
        state,
        division,
        positionIds,
        limit,
      }),
  });
}

/**
 * Used by Discover Option A year resolver.
 * Checks if ANY camps exist in the year using the same operator-adaptive logic.
 */
export async function publicCampYearHasData(year) {
  const { rows } = await filterCampsByYear({}, year, 1);
  return Array.isArray(rows) && rows.length > 0;
}

