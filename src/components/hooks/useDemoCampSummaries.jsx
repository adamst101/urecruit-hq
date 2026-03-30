// src/components/hooks/useDemoCampSummaries.jsx
// Returns enriched demo camp summaries for MyCamps / Calendar in demo mode.
// Uses the same static dataset as Discover (?demo=coach / ?demo=user) so all
// demo pages stay consistent — no DemoCamp DB entity required.

import { useQuery } from "@tanstack/react-query";
import { loadDemoCamps } from "../../lib/demoCampData";
import { schoolMapGet } from "./useSchoolIdentity.jsx";
import { getDemoFavorites } from "./demoFavorites.jsx";
import { isDemoRegistered } from "./demoRegistered.jsx";

async function fetchDemoCampSummaries({ seasonYear, demoProfileId }) {
  const y = Number(seasonYear);
  if (!y) return [];

  // Load static demo camps (also warms the shared school map)
  let all = [];
  try {
    all = await loadDemoCamps();
  } catch {
    return [];
  }

  // Filter to matching season year
  const camps = all.filter((c) => Number(c?.demo_season_year) === y);

  const favSet = new Set(getDemoFavorites(demoProfileId, y).map(String));

  return camps.map((c) => {
    const campId = String(c?.id ?? "");
    // Enrich from the shared school map (already loaded by loadDemoCamps)
    const sch = c.school_id ? schoolMapGet(c.school_id) : null;

    const reg = isDemoRegistered(demoProfileId, campId);
    const fav = favSet.has(campId);
    const intent = reg ? "registered" : fav ? "favorite" : "";

    return {
      camp_id: campId,
      id: campId,
      camp_name: c?.camp_name || c?.name || "Camp",
      start_date: c?.start_date || null,
      end_date: c?.end_date || null,
      city: c?.city || null,
      state: c?.state || null,
      price: typeof c?.price === "number" ? c.price : null,
      link_url: c?.link_url || null,
      notes: c?.notes || null,
      position_ids: Array.isArray(c?.position_ids) ? c.position_ids : [],
      school_id: c?.school_id || null,
      sport_id: null,
      school_name: sch?.school_name || sch?.name || c?.host_org || "Unknown School",
      school_division: c?.school_division || c?.division || null,
      subdivision: c?.subdivision || null,
      school_subdivision: c?.subdivision || null,
      school_logo_url: sch?.athletic_logo_url || sch?.logo_url || null,
      school_city: c?.city || null,
      school_state: c?.state || null,
      school_conference: sch?.conference || null,
      sport_name: "Football",
      division: c?.division || c?.school_division || null,
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
