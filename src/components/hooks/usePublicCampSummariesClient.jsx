// src/components/hooks/usePublicCampSummariesClient.jsx
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";
import { prodBase44 } from "../../api/healthCheckClient";

/**
 * Public/Demo camp summaries (no athlete required).
 *
 * Exports (intentionally redundant to avoid Vite/Base44 rename/HMR mismatches):
 *  - named:   usePublicCampSummariesClient
 *  - named:   usePublicCampSummariesClientLegacy (alias)
 *  - default: usePublicCampSummariesClient
 *  - named:   publicCampYearHasData (helper)
 */

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

async function filterCampsByYear(where, seasonYear, limit) {
  const y = Number(seasonYear);
  const start = yStart(y);
  const next = yNext(y);

  // Prefer season_year server-side when possible
  let rows = [];
  try {
    rows = await base44.entities.Camp.filter(
      { ...(where || {}), season_year: y },
      "-start_date",
      Number(limit) || 500
    );
  } catch {
    rows = [];
  }

  if (Array.isArray(rows) && rows.length > 0) return { rows };

  // Try string season_year
  try {
    rows = await base44.entities.Camp.filter(
      { ...(where || {}), season_year: String(y) },
      "-start_date",
      Number(limit) || 500
    );
  } catch {
    rows = [];
  }

  if (Array.isArray(rows) && rows.length > 0) return { rows };

  // Fallback: start_date range
  rows = await base44.entities.Camp.filter(
    { ...(where || {}), start_date: { gte: start, lt: next } },
    "-start_date",
    Number(limit) || 500
  );
  return { rows: Array.isArray(rows) ? rows : [] };
}

async function fetchByIds(entity, ids) {
  const clean = uniq((ids || []).map(normId).filter(Boolean).map(String));
  if (!entity?.filter || clean.length === 0) return [];

  const tries = [
    { id: { $in: clean } },
    { id: { in: clean } },
  ];

  for (const q of tries) {
    try {
      const rows = await entity.filter(q);
      if (Array.isArray(rows) && rows.length) return rows;
    } catch {
      // try next
    }
  }
  return [];
}

async function fetchPublicCampSummaries({
  seasonYear,
  sportId,
  state,
  division,
  positionIds,
  limit = 500,
}) {
  const where = {};

  if (sportId) where.sport_id = normId(sportId) || sportId;
  if (state) where.state = String(state).toUpperCase();
  if (division) where.division = division;

  // NOTE: positionIds filtering is intentionally client-side for safety,
  // because Base44 schema varies (position_ids may be null/missing).
  const { rows } = await filterCampsByYear(where, seasonYear, limit);

  const camps = Array.isArray(rows) ? rows : [];
  const filtered = Array.isArray(positionIds) && positionIds.length
    ? camps.filter((c) => {
        const pid = (c?.position_ids || []).map(normId).filter(Boolean).map(String);
        const want = positionIds.map(normId).filter(Boolean).map(String);
        return want.some((w) => pid.includes(w));
      })
    : camps;

  const schoolIds = uniq(filtered.map((c) => normId(c?.school_id)).filter(Boolean));
  const sportIds = uniq(filtered.map((c) => normId(c?.sport_id)).filter(Boolean));

  const [schools, sports] = await Promise.all([
    fetchByIds(prodBase44.entities.School, schoolIds),
    fetchByIds(base44.entities.Sport, sportIds),
  ]);

  const schoolById = {};
  for (const s of Array.isArray(schools) ? schools : []) {
    const id = String(normId(s) || "");
    if (id) schoolById[id] = s;
  }

  const sportById = {};
  for (const sp of Array.isArray(sports) ? sports : []) {
    const id = String(normId(sp) || "");
    if (id) sportById[id] = sp;
  }

  return filtered.map((c) => {
    const sch = schoolById[String(normId(c?.school_id) || "")] || null;
    const sp = sportById[String(normId(c?.sport_id) || "")] || null;

    return {
      camp_id: String(c?.id ?? c?._id ?? ""),
      event_key: c?.event_key ? String(c.event_key) : null,

      camp_name: c?.camp_name || c?.name || "Camp",
      start_date: c?.start_date || null,
      end_date: c?.end_date || null,

      city: c?.city || sch?.city || null,
      state: c?.state || sch?.state || null,

      price: typeof c?.price === "number" ? c.price : null,
      price_max: typeof c?.price_max === "number" ? c.price_max : null,

      link_url: c?.link_url || c?.source_url || c?.url || null,
      notes: c?.notes || null,

      school_name: pickSchoolName(sch),
      school_division: pickSchoolDivision(sch),
      school_logo_url: sch?.athletic_logo_url || sch?.logo_url || sch?.school_logo_url || null,

      sport_name: pickSportName(sp),

      // parity with other summary shapes
      intent_status: null,
    };
  });
}

/** ✅ REQUIRED named export (what Calendar imports) */
export function usePublicCampSummariesClient({
  seasonYear,
  sportId,
  state,
  division,
  positionIds,
  limit = 500,
  enabled = true,
} = {}) {
  return useQuery({
    queryKey: [
      "publicCampSummaries",
      Number(seasonYear) || null,
      normId(sportId) || (sportId ? String(sportId) : null),
      state || null,
      division || null,
      Array.isArray(positionIds)
        ? positionIds.map(normId).filter(Boolean).join(",")
        : "",
      Number(limit) || 500,
    ],
    enabled: Boolean(enabled) && !!seasonYear,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min cache
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

/** ✅ Legacy alias named export (covers older imports if any) */
export const usePublicCampSummariesClientLegacy = usePublicCampSummariesClient;

/** ✅ Default export (covers default-style imports if any) */
export default usePublicCampSummariesClient;

/**
 * Used by Calendar/Discover year resolver.
 * Checks if ANY camps exist in the year using the same hardened logic.
 */
export async function publicCampYearHasData(year) {
  const { rows } = await filterCampsByYear({}, year, 25);
  return Array.isArray(rows) && rows.length > 0;
}