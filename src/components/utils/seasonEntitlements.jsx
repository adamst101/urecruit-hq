// src/utils/seasonEntitlements.jsx

/** Feb 1 rollover: Season YYYY runs Feb 1 YYYY → Jan 31 YYYY+1 */
export function getSeasonYearForDate(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0=Jan, 1=Feb, ...
  return month >= 1 ? year : year - 1; // Feb(1)+ => current year, Jan => previous year
}

/** Free users only see last season */
export function getFreeSeasonYear(date = new Date()) {
  return getSeasonYearForDate(date) - 1;
}

/** True if user owns that season */
export function hasSeasonEntitlement(entitledSeasons = [], seasonYear) {
  const y = Number(seasonYear);
  return Array.isArray(entitledSeasons) && entitledSeasons.map(Number).includes(y);
}

/**
 * Determine if user can access a given season.
 * - Demo: force demo to free season (recommended)
 * - Authed + owns season: allowed
 * - Free/anon: only last season allowed
 */
export function canAccessSeason({
  seasonYear,
  entitledSeasons,
  isAuthenticated,
  isDemo,
  now = new Date(),
}) {
  const requested = Number(seasonYear);
  const freeSeason = getFreeSeasonYear(now);

  if (isDemo) return requested === freeSeason;
  if (!isAuthenticated) return requested === freeSeason;

  if (hasSeasonEntitlement(entitledSeasons, requested)) return true;

  // Optional: allow authenticated-but-not-entitled users to see last season
  return requested === freeSeason;
}

/** Standard subscribe URL builder for a specific season */
export function buildSubscribeUrl({ seasonYear, nextPath, source = "season_gate" }) {
  const y = Number(seasonYear);
  const next = nextPath?.startsWith("/")
    ? nextPath
    : `/${String(nextPath || "").replace(/^\/+/, "")}`;

  return (
    `/Subscribe?source=${encodeURIComponent(source)}` +
    `&season=${encodeURIComponent(y)}` +
    `&next=${encodeURIComponent(next)}`
  );
}
