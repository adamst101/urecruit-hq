// src/components/filters/filterUtils.jsx

export function normalizeState(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const paren = raw.match(/\(([A-Za-z]{2})\)/);
  if (paren?.[1]) return paren[1].toUpperCase();

  const first2 = raw.slice(0, 2);
  if (/^[A-Za-z]{2}$/.test(first2) && (raw.length === 2 || /[^A-Za-z]/.test(raw[2] || ""))) {
    return first2.toUpperCase();
  }

  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();

  const map = {
    alabama: "AL",
    alaska: "AK",
    arizona: "AZ",
    arkansas: "AR",
    california: "CA",
    colorado: "CO",
    connecticut: "CT",
    delaware: "DE",
    florida: "FL",
    georgia: "GA",
    hawaii: "HI",
    idaho: "ID",
    illinois: "IL",
    indiana: "IN",
    iowa: "IA",
    kansas: "KS",
    kentucky: "KY",
    louisiana: "LA",
    maine: "ME",
    maryland: "MD",
    massachusetts: "MA",
    michigan: "MI",
    minnesota: "MN",
    mississippi: "MS",
    missouri: "MO",
    montana: "MT",
    nebraska: "NE",
    nevada: "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    ohio: "OH",
    oklahoma: "OK",
    oregon: "OR",
    pennsylvania: "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    tennessee: "TN",
    texas: "TX",
    utah: "UT",
    vermont: "VT",
    virginia: "VA",
    washington: "WA",
    "west virginia": "WV",
    wisconsin: "WI",
    wyoming: "WY",
  };

  const key = raw.toLowerCase().replace(/\s+/g, " ").trim();
  return map[key] || null;
}

export function sanitizeDateStr(v) {
  if (!v) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

/**
 * Overlap logic (handles multi-day camps):
 * A camp matches if it overlaps the filter window.
 */
export function withinDateRange(campStartStr, filterStart, filterEnd, campEndStr) {
  const fs = sanitizeDateStr(filterStart);
  const fe = sanitizeDateStr(filterEnd);

  if (!fs && !fe) return true;
  if (!campStartStr) return false;

  const cs = String(campStartStr).slice(0, 10);
  const ce = String(campEndStr || campStartStr).slice(0, 10);

  if (fs && ce < fs) return false;
  if (fe && cs > fe) return false;

  return true;
}

/* -------------------------
   Matchers used by Discover.jsx
------------------------- */

export function matchesDivision(camp, divisions) {
  if (!Array.isArray(divisions) || divisions.length === 0) return true;
  const campDiv = String(camp?.division || camp?.school_division || "").trim();
  return divisions.some((d) => String(d).trim() === campDiv);
}

export function matchesSport(camp, sports) {
  // sports = array of sport IDs
  if (!Array.isArray(sports) || sports.length === 0) return true;
  const campSport = String(camp?.sport_id || "").trim();
  return sports.some((s) => String(s).trim() === campSport);
}

export function matchesPositions(camp, positions) {
  // positions = array of position IDs
  if (!Array.isArray(positions) || positions.length === 0) return true;
  const campPositions = asArray(camp?.position_ids).map((x) => String(x));
  return positions.some((p) => campPositions.includes(String(p)));
}

export function matchesState(camp, state) {
  // state = "TX" or "" (all)
  const wanted = normalizeState(state);
  if (!wanted) return true;

  const campState =
    normalizeState(camp?.state) ||
    normalizeState(camp?.school_state) ||
    normalizeState(camp?.school?.state) ||
    null;

  if (!campState) return false;
  return campState === wanted;
}

export function matchesDateRange(camp, startDate, endDate) {
  return withinDateRange(camp?.start_date, startDate, endDate, camp?.end_date);
}
