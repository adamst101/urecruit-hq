// src/components/hooks/usePublicCampSummariesClient.jsx
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../../api/base44Client";

/**
 * Public/Demo camp summaries (no athlete required).
 * Provides a stable named export:
 *   export function usePublicCampSummariesClient(...)
 *
 * Default behavior:
 * - Reads from Camp (product table) because Discover paid reads Camp.
 * - Filters by season_year when provided.
 * - Optionally filters by sportId when provided.
 * - Hard caps the returned rows to reduce load and rate limiting.
 *
 * NOTE:
 * If your demo experience should read CampDemo instead, flip entityName to "CampDemo"
 * at the call site (or change the default below).
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
 * usePublicCampSummariesClient
 * @param {object} opts
 * @param {number|string} opts.seasonYear - desired season year (optional but recommended)
 * @param {string} opts.sportId - optional sport_id filter
 * @param {number} opts.limit - max rows
 * @param {boolean} opts.enabled - enable query
 * @param {string} opts.entityName - "Camp" (default) or "CampDemo"
 */
export function usePublicCampSummariesClient({
  seasonYear,
  sportId = "",
  limit = 500,
  enabled = true,
  entityName = "Camp",
} = {}) {
  const sy = safeNumber(seasonYear);
  const sp = sportId ? String(sportId) : "";

  return useQuery({
    queryKey: ["publicCampsSummaries_client", entityName, sy || null, sp || null, Number(limit) || 500],
    enabled: Boolean(enabled),

    // Some resilience for transient 429s
    retry: (count, err) => {
      const msg = String(err?.message || err || "").toLowerCase();
      const isRate = msg.includes("rate") || msg.includes("429") || msg.includes("too many");
      return isRate && count < 2;
    },
    retryDelay: (attempt) => Math.min(2000, 400 * Math.max(1, attempt)),
    staleTime: 10_000,

    queryFn: async () => {
      const Entity = base44?.entities?.[entityName];
      if (!Entity?.filter) return [];

      // Prefer server-side filters when possible.
      const where = {};
      if (sp) where.sport_id = sp;
      if (sy != null) where.season_year = sy;

      let rows = [];
      try {
        rows = asArray(await Entity.filter(where, "-start_date", Number(limit) || 500));
      } catch {
        rows = [];
      }

      // Try season_year as string if numeric didn’t match
      if (rows.length === 0 && sy != null) {
        try {
          const where2 = { ...where, season_year: String(sy) };
          rows = asArray(await Entity.filter(where2, "-start_date", Number(limit) || 500));
        } catch {
          // ignore
        }
      }

      // Fallback: fetch unfiltered then derive season client-side (still capped)
      if (rows.length === 0) {
        const all = asArray(await Entity.filter({}, "-start_date", Number(limit) || 500));
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
          .slice(0, Number(limit) || 500);
      }

      // Normalize minimal shape used by list UIs
      return asArray(rows)
        .filter((r) => readActiveFlag(r) === true)
        .slice(0, Number(limit) || 500)
        .map((r) => ({
          ...r,
          id: r?.id ?? r?._id ?? r?.uuid ?? r?.id,
        }));
    },
  });
}