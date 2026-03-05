// src/components/filters/filterUtils.jsx

/* ----------------------------
   State normalization
---------------------------- */
export function normalizeState(value) {
  if (!value) return null;

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

/* ----------------------------
   Date helpers
---------------------------- */
export function sanitizeDateStr(v) {
  if (!v) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// "overlaps" logic so multi-day camps behave correctly
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

/* ----------------------------
   Array/string helpers
---------------------------- */
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

/* ----------------------------
   Calendar filter normalization
   (Calendar.jsx imports normalizeFilters)
---------------------------- */
export function normalizeFilters(raw) {
  const f = raw && typeof raw === "object" ? raw : {};

  const sportId = f.sport ? String(f.sport).trim() : "";
  const state = normalizeState(f.state);

  const divisions = uniqStrings(f.divisions);
  const positions = uniqStrings(asArray(f.positions).map(String));

  const startDate = sanitizeDateStr(f.startDate);
  const endDate = sanitizeDateStr(f.endDate);

  return {
    sportId: sportId || null,
    state: state || null,

    // multi-select canonical
    divisions,

    // backward compat (server expects single division sometimes)
    division: divisions[0] ? String(divisions[0]) : null,

    positionIds: positions,
    startDate,
    endDate,
  };
}

/* ----------------------------
   Discover matchers
   (Discover.jsx imports these)
---------------------------- */
/**
 * Normalizes a raw division string (from School entity) to a filter-friendly value.
 * School stores: "NCAA Division I", "NCAA Division II", "NCAA Division III", "NAIA", "NJCAA"
 * Filters use:   "D1 (FBS)", "D1 (FCS)", "D2", "D3", "NAIA", "JUCO"
 */
function normalizeDivision(rawDiv, rawSubdiv) {
  const d = String(rawDiv || "").trim().toLowerCase();
  const sub = String(rawSubdiv || "").trim().toUpperCase();

  if (!d) return "";

  // NAIA
  if (d.includes("naia")) return "NAIA";

  // JUCO / NJCAA
  if (d.includes("njcaa") || d.includes("juco")) return "JUCO";

  // NCAA Division III / D3
  if (d.includes("iii") || d === "d3" || d.includes("division 3")) return "D3";

  // NCAA Division II / D2
  if (d.includes("ii") && !d.includes("iii")) return "D2";
  if (d === "d2" || d.includes("division 2")) return "D2";

  // NCAA Division I (need subdivision)
  if (d.includes("division i") || d === "d1" || d.includes("ncaa d1") || d === "d1 (fbs)" || d === "d1 (fcs)") {
    if (sub === "FBS" || d.includes("fbs")) return "D1 (FBS)";
    if (sub === "FCS" || d.includes("fcs")) return "D1 (FCS)";
    return "D1 (FBS)"; // default D1 to FBS if no subdivision
  }

  // Already in filter format
  const upper = String(rawDiv || "").trim();
  if (["D1 (FBS)", "D1 (FCS)", "D2", "D3", "NAIA", "JUCO"].includes(upper)) return upper;

  return upper; // pass through unknown
}

export function matchesDivision(camp, divisions) {
  if (!Array.isArray(divisions) || divisions.length === 0) return true;

  const rawDiv = camp?.division || camp?.school_division || "";
  const rawSub = camp?.subdivision || camp?.school_subdivision || "";
  const normalized = normalizeDivision(rawDiv, rawSub);

  if (!normalized) return false;
  return divisions.some((d) => String(d) === normalized);
}

export function matchesSport(camp, sports) {
  if (!Array.isArray(sports) || sports.length === 0) return true;

  // Be resilient to different Camp schemas:
  // - sport_id may be a string/number id
  // - sportId may be used instead
  // - sport_id may be an object (relationship) with {id} / {_id}
  const raw = camp?.sport_id ?? camp?.sportId ?? camp?.sport;
  const campSport =
    raw && typeof raw === "object"
      ? String(raw?.id ?? raw?._id ?? raw?.uuid ?? "")
      : String(raw ?? "");

  if (!campSport) return false;
  return sports.some((s) => String(s) === campSport);
}

export function matchesPositions(camp, positions) {
  if (!Array.isArray(positions) || positions.length === 0) return true;
  const campPositions = asArray(camp?.position_ids).map(String);
  return positions.some((p) => campPositions.includes(String(p)));
}

export function matchesState(camp, statesOrOne) {
  // supports passing ["TX","OK"] or "TX" or null
  const wanted = asArray(statesOrOne).map((x) => String(x || "").trim()).filter(Boolean);
  if (wanted.length === 0) return true;

  const campState = normalizeState(camp?.state || camp?.camp_state || camp?.school_state);
  if (!campState) return false;

  return wanted.includes(String(campState));
}

export function matchesDateRange(camp, startDate, endDate) {
  return withinDateRange(camp?.start_date, startDate, endDate, camp?.end_date);
}