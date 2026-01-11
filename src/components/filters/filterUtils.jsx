// src/components/filters/filterUtils.jsx

export function normalizeState(value) {
  if (!value) return null;

  // Handle common messy inputs: "TX ", "Texas", "Texas (TX)", "TX-OK", etc.
  const raw = String(value).trim();
  if (!raw) return null;

  // If it contains parentheses like "Texas (TX)" prefer the token inside
  const paren = raw.match(/\(([A-Za-z]{2})\)/);
  if (paren?.[1]) return paren[1].toUpperCase();

  // If it begins with a 2-letter code, accept it
  const first2 = raw.slice(0, 2);
  if (/^[A-Za-z]{2}$/.test(first2) && (raw.length === 2 || /[^A-Za-z]/.test(raw[2] || ""))) {
    return first2.toUpperCase();
  }

  // Pure 2-letter code
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

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const v of asArray(arr)) {
    const s = String(v || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * normalizeFilters
 *
 * IMPORTANT:
 * - Keeps divisions as an ARRAY (multi-select)
 * - Keeps backward-compat `division` (first selection) so existing pages don't explode
 */
export function normalizeFilters(raw) {
  const f = raw || {};

  const sportId = f.sport ? String(f.sport).trim() : "";
  const state = normalizeState(f.state);

  const divisions = uniqStrings(f.divisions);
  const positions = uniqStrings(asArray(f.positions).map(String));

  const startDate = sanitizeDateStr(f.startDate);
  const endDate = sanitizeDateStr(f.endDate);

  return {
    sportId: sportId || null,
    state: state || null,

    // ✅ multi-select, canonical
    divisions,

    // ✅ backward compat for any callers that still expect a single division
    division: divisions[0] ? String(divisions[0]) : null,

    positionIds: positions,
    startDate,
    endDate,
  };
}

/**
 * withinDateRange
 *
 * Backward compatible + improved:
 * - Old usage: withinDateRange(campStart, filterStart, filterEnd)
 * - New usage: withinDateRange(campStart, filterStart, filterEnd, campEnd)
 *
 * Logic = "overlaps" (handles multi-day camps correctly).
 * Dates must be "YYYY-MM-DD" (string compare works).
 */
export function withinDateRange(campStartStr, filterStart, filterEnd, campEndStr) {
  const fs = sanitizeDateStr(filterStart);
  const fe = sanitizeDateStr(filterEnd);

  if (!fs && !fe) return true;

  if (!campStartStr) return false;

  const cs = String(campStartStr).slice(0, 10);
  const ce = String(campEndStr || campStartStr).slice(0, 10);

  // If filterStart exists, camp must end on/after filterStart
  if (fs && ce < fs) return false;

  // If filterEnd exists, camp must start on/before filterEnd
  if (fe && cs > fe) return false;

  return true;
}
