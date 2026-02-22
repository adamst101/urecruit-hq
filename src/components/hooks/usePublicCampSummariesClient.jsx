// src/components/hooks/usePublicCampSummariesClient.jsx
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * Public/Demo camp summaries (no athlete required).
 *
 * IMPORTANT:
 * This file intentionally exports BOTH:
 *   - a named export: usePublicCampSummariesClient
 *   - a default export: usePublicCampSummariesClient
 *
 * This prevents module export mismatches during Vite HMR / cache issues
 * and supports either import style:
 *   import { usePublicCampSummariesClient } from "..."
 *   import usePublicCampSummariesClient from "..."
 */

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function toISODate(dateInput) {
  if (!dateInput) return null;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  if (typeof dateInput === "string") {
    const s = dateInput.trim();
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdy) {
      const mm = String(mdy[1]).padStart(2, "0");
      const dd = String(mdy[2]).padStart(2, "0");
      const yyyy = String(mdy[3]);
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function computeSeasonYearFootballFromStart(startDate) {
  const iso = toISODate(startDate);
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
  return d >= feb1 ? y : y - 1;
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;

  const st = String(row?.status || "").toLowerCase().trim();
  if (st === "inactive") return false;
  if (st === "active") return true;
  return true;
}

/**
 * Named export required by existing imports.
 */
export function usePublicCampSummariesClient({
  seasonYear,
  sportId = "",
  limit = 500,
  enabled = true,
  entityName = "Camp", // "Camp" (paid/public) or "CampDemo" (demo/staging) if you prefer
} = {}) {
  const sy = safeNumber(seasonYear);
  const sp = sportId ? String(sportId) : "";
  const lim = Math.max(1, Math.min(2000, Number(limit) || 500));
  const ent = entityName || "Camp";

  return useQuery({
    queryKey: ["publicCampsSummaries_client", ent, sy || null, sp || null, lim],
    enabled: Boolean(enabled),

    retry: (count, err) => {
      const msg = String(err?.message || err || "").toLowerCase();
      const isRate = msg.includes("rate") || msg.includes("429") || msg.includes("too many");
      return isRate && count < 2;
    },
    retryDelay: (attempt) => Math.min(2000, 400 * Math.max(1, attempt)),
    staleTime: 10_000,

    queryFn: async () => {
      const Entity = base44?.entities?.[ent];
      if (!Entity?.filter) return [];

      // Prefer server-side filters when possible
      const where = {};
      if (sp) where.sport_id = sp;
      if (sy != null) where.season_year = sy;

      let rows = [];
      try {
        rows = asArray(await Entity.filter(where, "-start_date", lim));
      } catch {
        rows = [];
      }

      // Try season_year as string if numeric didn’t match
      if (rows.length === 0 && sy != null) {
        try {
          const where2 = { ...where, season_year: String(sy) };
          rows = asArray(await Entity.filter(where2, "-start_date", lim));
        } catch {
          // ignore
        }
      }

      // Fallback: fetch capped and derive season client-side
      if (rows.length === 0) {
        const all = asArray(await Entity.filter({}, "-start_date", lim));
        rows = all
          .filter((r) => readActiveFlag(r) === true)
          .filter((r) => {
            if (sp && String(normId(r?.sport_id) || r?.sport_id || "") !== sp) return false;
            if (sy == null) return true;

            const syNum = safeNumber(r?.season_year ?? r?.seasonYear);
            if (syNum != null) return syNum === sy;
            if (String((r?.season_year ?? r?.seasonYear) || "") === String(sy)) return true;

            const derived = computeSeasonYearFootballFromStart(r?.start_date);
            return derived === sy;
          })
          .slice(0, lim);
      }

      return asArray(rows)
        .filter((r) => readActiveFlag(r) === true)
        .slice(0, lim)
        .map((r) => ({
          ...r,
          id: r?.id ?? r?._id ?? r?.uuid ?? r?.id,
        }));
    },
  });
}

/**
 * Default export for resilience if any file imports default-style.
 */
export default usePublicCampSummariesClient;