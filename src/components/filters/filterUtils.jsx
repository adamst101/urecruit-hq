// src/components/filters/filterUtils.jsx

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function uniqStrings(arr) {
  const out = [];
  const seen = new Set();
  for (const v of asArray(arr)) {
    const s = String(v || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export function sanitizeDateStr(v) {
  if (!v) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

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

/**
 * ✅ normalizeFilters (exported)
 * Keeps your app stable even if different pages use different filter shapes.
 * Canonical nf shape for Discover:
 *   { divisions[], sports[], positions[], state, startDate, endDate }
 */
export function normalizeFilters(raw) {
  const r = raw && typeof raw === "object" ? raw : {};

  // support legacy keys if they exist
  const divisions = uniqStrings(r.divisions);
  const sports = uniqStrings(asArray(r.sports).map(String));
  const positions = uniqStrings(asArray(r.positions).map(String));

  const state = typeof r.state === "string" ? r.state : "";
  const startDate = sanitizeDateStr(r.startDate);
  const endDate = sanitizeDateStr(r.endDate);

  return {
    divisions,
    sports,
    positions,
    state,
    startDate,
    endDate,
  };
}

/**
 * ✅ withinDateRange (exported)
 * Calendar imports this directly.
 * Logic = overlap (supports multi-day camps).
 * Dates must be "YYYY-MM-DD".
 */
export function withinDateRange(campStartStr, filterStart, filterEnd, campEndStr) {
  const fs = sanitizeDateStr(filterStart);
  const fe = sanitizeDateStr(filterEnd);

  if (!fs && !fe) return true;
  if (!campStartStr) return false;

  const cs = String(campStartStr).slice(0, 10);
  const ce = String(campEndStr || campStartStr).slice(0, 10);

  // camp must end on/after filterStart
  if (fs && ce < fs) return false;

  // camp must start on/before filterEnd
  if (fe && cs > fe) return false;

  return true;
}

/* ---------------------------
   Discover filter matchers
---------------------------- */
export function matchesDivision(camp, divisions) {
  const ds = asArray(divisions);
  if (ds.length === 0) return true;
  const campDiv = String(camp?.division || camp?.school_division || "").trim();
  return ds.some((d) => String(d).trim() === campDiv);
}

export function matchesSport(camp, sports) {
  const ss = asArray(sports);
  if (ss.length === 0) return true;
  const campSport = String(camp?.sport_id || "").trim();
  return ss.some((s) => String(s).trim() === campSport);
}

export function matchesPositions(camp, positions) {
  const ps = asArray(positions);
  if (ps.length === 0) return true;
  const campPositions = asArray(camp?.position_ids).map((x) => String(x).trim());
  return ps.some((p) => campPositions.includes(String(p).trim()));
}

export function matchesState(camp, state) {
  const target = normalizeState(state);
  if (!target) return true;

  const campState =
    normalizeState(camp?.state) ||
    normalizeState(camp?.school_state) ||
    null;

  return !!campState && campState === target;
}

export function matchesDateRange(camp, startDate, endDate) {
  return withinDateRange(camp?.start_date, startDate, endDate, camp?.end_date);
}
