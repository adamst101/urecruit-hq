// src/components/hooks/useDemoCampSummaries.jsx
// Fetches DemoCamp records for a given season year and enriches them
// with school/sport data + demo favorite/registered status.

import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";
import { getDemoFavorites } from "./demoFavorites.jsx";
import { isDemoRegistered } from "./demoRegistered.jsx";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function pickSchoolName(s) {
  return s?.school_name || s?.name || s?.title || "Unknown School";
}
function pickSchoolDivision(s) {
  return s?.division || s?.school_division || s?.division_code || null;
}
function pickSportName(sp) {
  return sp?.sport_name || sp?.name || sp?.title || null;
}

async function fetchByIds(entity, ids) {
  const clean = uniq(ids.map(normId).filter(Boolean).map(String));
  if (!entity?.filter || clean.length === 0) return [];
  const tries = [
    { id: { $in: clean } },
    { id: { in: clean } },
  ];
  for (const q of tries) {
    try {
      const rows = await entity.filter(q);
      if (Array.isArray(rows) && rows.length) return rows;
    } catch { /* next */ }
  }
  return [];
}

async function fetchDemoCampSummaries({ seasonYear, demoProfileId }) {
  const y = Number(seasonYear);
  if (!y) return [];

  let rows = [];
  try {
    rows = await base44.entities.DemoCamp.filter({ demo_season_year: y }, "-start_date", 2000);
  } catch {
    try {
      rows = await base44.entities.DemoCamp.filter({ demo_season_year: String(y) }, "-start_date", 2000);
    } catch { return []; }
  }

  const camps = Array.isArray(rows) ? rows : [];
  const schoolIds = uniq(camps.map((c) => normId(c?.school_id)).filter(Boolean));
  const sportIds = uniq(camps.map((c) => normId(c?.sport_id)).filter(Boolean));

  const [schools, sports] = await Promise.all([
    fetchByIds(base44.entities.School, schoolIds),
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

  const favSet = new Set(getDemoFavorites(demoProfileId, y).map(String));

  return camps.map((c) => {
    const campId = String(c?.id ?? c?._id ?? "");
    const sch = schoolById[String(normId(c?.school_id) || "")] || null;
    const sp = sportById[String(normId(c?.sport_id) || "")] || null;

    const reg = isDemoRegistered(demoProfileId, campId);
    const fav = favSet.has(campId);
    const intent = reg ? "registered" : fav ? "favorite" : "";

    return {
      camp_id: campId,
      id: campId,
      camp_name: c?.camp_name || c?.name || "Camp",
      start_date: c?.start_date || null,
      end_date: c?.end_date || null,
      city: c?.city || sch?.city || null,
      state: c?.state || sch?.state || null,
      price: typeof c?.price === "number" ? c.price : null,
      link_url: c?.link_url || c?.source_url || null,
      notes: c?.notes || null,
      position_ids: Array.isArray(c?.position_ids) ? c.position_ids : [],
      school_id: normId(c?.school_id) || null,
      sport_id: normId(c?.sport_id) || null,
      school_name: pickSchoolName(sch),
      school_division: pickSchoolDivision(sch),
      subdivision: sch?.subdivision || null,
      school_subdivision: sch?.subdivision || null,
      school_logo_url: sch?.athletic_logo_url || sch?.logo_url || null,
      school_city: sch?.city || null,
      school_state: sch?.state || null,
      school_conference: sch?.conference || null,
      sport_name: pickSportName(sp),
      division: pickSchoolDivision(sch),
      intent_status: intent,
      active: c?.active !== false,
    };
  });
}

export function useDemoCampSummaries({ seasonYear, demoProfileId, enabled = true } = {}) {
  return useQuery({
    queryKey: ["demoCampSummaries", Number(seasonYear) || null, demoProfileId || "default"],
    enabled: Boolean(enabled) && !!seasonYear,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min cache
    queryFn: () => fetchDemoCampSummaries({ seasonYear, demoProfileId }),
  });
}

export default useDemoCampSummaries;