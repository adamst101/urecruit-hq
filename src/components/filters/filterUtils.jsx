// src/components/filters/filterUtils.jsx

export function normalizeState(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();

  const map = {
    alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
    colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
    hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
    kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
    michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
    nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
    oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
    virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  };

  const key = s.toLowerCase();
  return map[key] || null;
}

export function sanitizeDateStr(v) {
  if (!v) return "";
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export function normalizeFilters(raw) {
  const f = raw || {};
  const sportId = f.sport ? String(f.sport) : "";
  const state2 = normalizeState(f.state);
  const divisions = Array.isArray(f.divisions) ? f.divisions : [];
  const positions = Array.isArray(f.positions) ? f.positions.map(String) : [];

  const startDate = sanitizeDateStr(f.startDate);
  const endDate = sanitizeDateStr(f.endDate);

  return {
    sportId: sportId || null,
    state: state2 || null,
    division: divisions[0] ? String(divisions[0]) : null,
    positionIds: positions.filter(Boolean),
    startDate,
    endDate,
  };
}

export function withinDateRange(startDateStr, start, end) {
  if (!start && !end) return true;
  if (!startDateStr) return false;
  const d = String(startDateStr).slice(0, 10);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}