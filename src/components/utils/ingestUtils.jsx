// src/components/utils/ingestUtils.jsx
// Pure helpers only (NO base44 imports)

export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Return YYYY-MM-DD (UTC) or null
export function toISODate(dateInput) {
  if (!dateInput) return null;

  // Already ISO date?
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  // Try parsing M/D/YYYY
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

  // Fallback: Date parse
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Football rollover: Feb 1 (UTC)
export function computeSeasonYearFootball(startDateISO) {
  if (!startDateISO) return null;
  const d = new Date(`${startDateISO}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0)); // Feb 1
  return d >= feb1 ? y : y - 1;
}

// Simple stable hash (MVP-safe; not cryptographic)
export function simpleHash(obj) {
  const str = typeof obj === "string" ? obj : JSON.stringify(obj ?? {});
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return `h${Math.abs(h)}`;
}

// Deterministic program id when no Ryzer program_id is available
export function seedProgramId({ school_id, camp_name }) {
  return `seed:${String(school_id || "na")}:${slugify(camp_name || "camp")}`;
}

// Unique per occurrence key for upsert
export function buildEventKey({ source_platform, program_id, start_date, link_url, source_url }) {
  const platform = source_platform || "ryzer";
  const disc = link_url || source_url || "na";
  return `${platform}:${program_id}:${start_date || "na"}:${disc}`;
}

// Best-effort normalize price
export function normalizePrice({ price_min, price_max, price_raw }) {
  const min = Number.isFinite(Number(price_min)) ? Number(price_min) : null;
  const max = Number.isFinite(Number(price_max)) ? Number(price_max) : null;

  let single = null;
  if (min != null && max == null) single = min;
  if (min != null && max != null) single = min;

  if (single == null && typeof price_raw === "string") {
    const m = price_raw.replace(/,/g, "").match(/(\d+(\.\d+)?)/);
    if (m) single = Number(m[1]);
  }

  return { price_min: min, price_max: max, price: single };
}
