import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * Demo/Public camp summaries client
 * Reads from Camp (not CampDemo) using start_date year bounds.
 * Joins School + Sport to provide a "summary" shape used by Discover/CampCard.
 *
 * NOTE:
 * - If your entity names differ (e.g., Schools vs School), adjust those two calls.
 * - If your school/sport fields differ, the "pick*" helpers below handle common variants.
 */

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

async function fetchEntityMap(entityName, ids) {
  const map = new Map();
  if (!ids?.length) return map;

  // Base44 filter syntax can vary; many support `id: { in: [...] }`.
  // If yours does not, replace this block with a loop per id (slower but works).
  let rows = [];
  try {
    rows = await base44.entities[entityName].filter({ id: { in: ids } });
  } catch {
    // Fallback: N queries (safe)
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
 * Returns "summary rows" shaped like what Discover expects:
 * {
 *   camp_id, camp_name, start_date, end_date, city, state, price, link_url, notes,
 *   position_ids,
 *   school_id, school_name, school_division,
 *   sport_id, sport_name
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

  const where = {
    start_date: { gte: yStart(seasonYear), lt: yNext(seasonYear) }
  };

  if (sportId) where.sport_id = sportId;
  if (state) where.state = state;

  // Pull camps
  let camps = [];
  try {
    camps = await base44.entities.Camp.filter(where);
  } catch (e) {
    // If your Base44 filter doesn’t support {gte/lt}, you MUST adjust this.
    // For now, fail loudly so you know the cause.
    throw new Error(
      `Camp.filter date-range failed. Adjust filter syntax. Details: ${String(
        e?.message || e
      )}`
    );
  }

  camps = Array.isArray(camps) ? camps : [];

  // Optional: position filter (client-side)
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

/**
 * usePublicCampSummariesClient
 */
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
 * Helper for Option A demo-year probing:
 * returns true if any Camp exists in that year (start_date bounds)
 */
export async function publicCampYearHasData(year) {
  const where = {
    start_date: { gte: yStart(year), lt: yNext(year) }
  };
  const rows = await base44.entities.Camp.filter(where, { limit: 1 });
  return Array.isArray(rows) && rows.length > 0;
}
