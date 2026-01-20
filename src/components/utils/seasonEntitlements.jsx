// src/utils/seasonEntitlements.jsx
// IMPORTANT: no imports here (prevents circular dependency in Base44 utils barrel)

export function getSeasonYearForDate(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0=Jan, 1=Feb, ...
  return month >= 1 ? year : year - 1; // Feb(1)+ => current year, Jan => previous year
}

export function getFreeSeasonYear(date = new Date()) {
  return getSeasonYearForDate(date) - 1;
}

export function hasSeasonEntitlement(entitledSeasons = [], seasonYear) {
  const y = Number(seasonYear);
  return Array.isArray(entitledSeasons) && entitledSeasons.map(Number).includes(y);
}

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

  // Optional: allow authed users to still view last season
  return requested === freeSeason;
}

export function buildSubscribeUrl({ seasonYear, nextPath, source = "season_gate" }) {
  const y = Number(seasonYear);

  const next = String(nextPath || "/Discover").startsWith("/")
    ? String(nextPath || "/Discover")
    : `/${String(nextPath || "Discover").replace(/^\/+/, "")}`;

  return (
    `/Subscribe?source=${encodeURIComponent(source)}` +
    `&season=${encodeURIComponent(y)}` +
    `&next=${encodeURIComponent(next)}`
  );
}
