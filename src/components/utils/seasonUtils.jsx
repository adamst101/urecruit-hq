// src/components/utils/seasonUtils.js

/**
 * Season determination helpers used throughout the app.
 *
 * getCurrentSoldSeason():
 *   What season are we currently SELLING?
 *   Sep-Dec → next year's season
 *   Jan-Aug → current year's season
 *
 * getCurrentActiveSeason():
 *   What season's CAMP DATA should we show?
 *   Before March → previous year (off-season, show last season's data)
 *   March onward → current year
 */

export function getCurrentSoldSeason() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();

  // Sep-Dec → selling NEXT year's season
  // Jan-Aug → selling CURRENT year's season
  if (month >= 9) {
    return year + 1;
  }
  return year;
}

export function getCurrentActiveSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Before March → previous season is "active"
  // March onward → current year is active season
  if (month < 3) {
    return year - 1;
  }
  return year;
}

/**
 * Is the user buying a future season (early bird)?
 * True when sold season > active season (Sep-Dec purchases).
 */
export function isEarlyBirdPeriod() {
  return getCurrentSoldSeason() > getCurrentActiveSeason();
}