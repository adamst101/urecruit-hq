// src/components/utils/seasonEntitlements.jsx

/**
 * Season helpers
 *
 * Football season rule (global for now):
 * - "Season YYYY" starts Feb 1 (UTC) of YYYY and runs until Feb 1 (UTC) of YYYY+1.
 *
 * Examples:
 * - Jan 31, 2026 -> seasonYear = 2025
 * - Feb 1, 2026  -> seasonYear = 2026
 *
 * NOTE: We use UTC to avoid user-timezone edge cases around midnight.
 */

export function footballSeasonYearForDate(date = new Date()) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;

    const y = d.getUTCFullYear();
    const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0)); // Feb 1, 00:00:00 UTC
    return d >= feb1 ? y : y - 1;
  } catch {
    return null;
  }
}

/** Current football season year based on "now" */
export function footballCurrentSeasonYear() {
  return footballSeasonYearForDate(new Date());
}

/** Demo season is always the previous season */
export function footballDemoSeasonYear() {
  const cur = footballCurrentSeasonYear();
  return typeof cur === "number" ? cur - 1 : null;
}

/** Convenience: season start boundary (Feb 1 UTC) for a given seasonYear */
export function footballSeasonStartsAtUtc(seasonYear) {
  try {
    const y = Number(seasonYear);
    if (!Number.isFinite(y)) return null;
    return new Date(Date.UTC(y, 1, 1, 0, 0, 0)).toISOString();
  } catch {
    return null;
  }
}

/** Convenience: season end boundary (Feb 1 UTC next year) for a given seasonYear */
export function footballSeasonEndsAtUtc(seasonYear) {
  try {
    const y = Number(seasonYear);
    if (!Number.isFinite(y)) return null;
    return new Date(Date.UTC(y + 1, 1, 1, 0, 0, 0)).toISOString();
  } catch {
    return null;
  }
}
