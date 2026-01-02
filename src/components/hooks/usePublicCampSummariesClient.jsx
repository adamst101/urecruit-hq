import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

const yStart = (y) => `${Number(y)}-01-01`;
const yNext = (y) => `${Number(y) + 1}-01-01`;

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
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
 * Try different filter syntaxes for date range until one works.
 * Returns { rows, used } where used is a string indicating which syntax succeeded.
 */
async function filterCampsByYear(whereBase, year, limit) {
  const start = yStart(year);
  const next = yNext(year);

  // Candidate syntaxes (Base44 variants)
  const candidates = [
    {
      used: "object_ops_gte_lt",
      where: { ...whereBase, start_date: { gte: start, lt: next } }
    },
    {
      used: "suffix_ops__gte__lt",
      where: { ...whereBase, start_date__gte: start, start_date__lt: next }
    },
    {
      used: "suffix_ops_gte_lt",
      where: { ...whereBase, start_date_gte: start, start_date_lt: next }
    },
    {
      used: "prefix_ops_gte_lt",
      where: { ...whereBase, gte_start_date: start, lt_start_date: next }
    }
  ];

  // Try each candidate
  for (const c of candidates) {
    try {
      const rows = await base44.entities.Camp.filter(
        c.where,
        limit ? { limit } : undefined
      );
      if (Array.isArray(rows)) return { rows, used: c.used };
    } catch {
      // try next
    }
  }

  // Fallback: pull a wider set (with sport/state if present) and client-filter by year.
  // Not ideal, but it prevents "blank app" when operators differ.
  const rows = await base44.entities.Camp.filter(
    whereBase,
    limit ? { limit } : undefined
  );

  const arr = Array.isArray(rows) ? rows : [];
  const startStr = start;
  const nextStr = next;

  const filtered = arr.filter((c) => {
    const d = c?.start_date;
    return typeof d === "string" && d >= startStr && d < nextStr;
  });

  return { rows: filtered, used: "client_side_fallback" };
}

async function fetchEntityMap(entityName, ids) {
  const map = new Map();
  if (!ids?.length) return map;

  // Try "in" first; fallback to per-id
  let rows = [];
  try {
    rows = await base44.entities[entityName].filter({ id: { in: ids } });
  } catch {
    rows = [];
    for (const id of ids) {
      try {
        const one = await base44.entities[entityName].filter({ id }, { limit: 1 });
        if (Array.isArray(one) && one[0]) rows.push(one[0]);
      } catch {}
    }
  }

  (rows || []).forEach((r) => map.set(r.id, r));
  return map;
}

/**
 * Returns summaries shaped for Discover:
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
  positionIds
}) {
  if (!seasonYear) return [];

  // Build base where (no year range yet)
  const whereBase = {};
  if (sportId) whereBase.sport_id = sportId;
  if (state) whereBase.state = state;

  // Pull camps for the year using adaptive operators
  const { rows: campsRaw, used } = await filterCampsByYear(whereBase, seasonYear);

  // Helpful one-time debug
  // eslint-disable-next-line no-console
  console.log("[Demo Camp Query]", { seasonYear, used, count: campsRaw?.length || 0 });

  let camps = Array.isArray(campsRaw) ? campsRaw : [];

  // Optional: positions filter (client-side)
  const pos = Array.isArray(positionIds) ? positionIds.filter(Boolean) : [];
  if (pos.length) {
    camps = camps.filter((c) => {
      const cpos = Array.isArray(c?.position_ids) ? c.position_ids : [];
      return pos.some((p) => cpos.includes(p));
    });
  }

  // Join School + Sport for display fields
  const schoolIds = uniq(camps.map((c) => c.school_id));
  const sportIds = uniq(camps.map((c) => c.sport_id));

  const [schoolMap, sportMap] = await Promise.all([
    fetchEntityMap("School", schoolIds),
    fetchEntityMap("Sport", sportIds)
  ]);

  // Optional: division filter (needs school join)
  if (division) {
    camps = camps.filter((c) => {
      const sch = schoolMap.get(c.school_id);
      return pickSchoolDivision(sch) === division;
    });
  }

  // Map to summary shape
  return camps.map((c) => {
    const sch = schoolMap.get(c.school_id);
    const sp = sportMap.get(c.sport_id);

    return {
      camp_id: c.id,
      school_id: c.school_id,
      sport_id: c.sport_id,

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

      sport_name: pickSportName(sp)
    };
  });
}

export function usePublicCampSummariesClient({
  seasonYear,
  sportId,
  state,
  division,
  positionIds,
  enabled
}) {
  return useQuery({
    queryKey: [
      "publicCampSummaries",
      seasonYear,
      sportId || null,
      state || null,
      division || null,
      Array.isArray(positionIds) ? positionIds.join(",") : ""
    ],
    enabled: !!enabled && !!seasonYear,
    queryFn: () =>
      fetchPublicCampSummaries({
        seasonYear,
        sportId,
        state,
        division,
        positionIds
      })
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
