// src/components/hooks/useSchoolIdentity.jsx
//
// Resolves the best available school identity (logo, name, division) for a set of Camp rows.
//
// Priority chain per field:
//
//   logo:     School.athletics_logo_url → School.team_logo_url → School.logo_url
//             → School.school_logo_url → Camp.school_logo_url → Camp.athletics_logo_url
//             → Camp.logo_url
//             (Ryzer placeholder and vendor logos are always rejected)
//
//   name:     School.school_name → School.name → Camp.school_name
//             (never "unknown", "n/a", etc.)
//
//   division: School.division → School.ncaa_division → School.athletics_division
//             → School.school_division → Camp.division → Camp.school_division
//             (normalized to "Division I / II / III" format)
//
// Returns: { schoolById: Map<schoolId, { name, logoUrl, division }>, loading }
//
// Usage:
//   const { resolveIdentity } = useSchoolIdentity(campRows);
//   const { name, logoUrl, division } = resolveIdentity(schoolId, campRow);

import { useEffect, useState } from "react";
import { base44 } from "../../api/base44Client";

// ─── url / text guards ────────────────────────────────────────────────────────

const BAD_TEXT = new Set(["unknown", "n/a", "na", "none", "null", "undefined", "-", ""]);

function isBadText(v) {
  return BAD_TEXT.has(String(v ?? "").trim().toLowerCase());
}

function isBadLogoUrl(url) {
  const u = String(url || "").trim().toLowerCase();
  if (!u) return true;
  if (!u.startsWith("http://") && !u.startsWith("https://")) return true;
  // Vendor / source placeholders — never a real school identity logo
  if (u.includes("ryzer")) return true;
  if (u.includes("sportsusa")) return true;
  if (u.includes("sportscamps")) return true;
  if (u.includes("placeholder")) return true;
  return false;
}

function pickBestLogo(...candidates) {
  for (const c of candidates) {
    const u = String(c || "").trim();
    if (!u) continue;
    if (!isBadLogoUrl(u)) return u;
  }
  return null;
}

function pickBestText(...candidates) {
  for (const c of candidates) {
    const s = String(c || "").trim();
    if (!s) continue;
    if (!isBadText(s)) return s;
  }
  return null;
}

// ─── division normalization ───────────────────────────────────────────────────

export function normalizeDivisionLabel(v) {
  const s = String(v ?? "").trim();
  if (!s || isBadText(s)) return null;
  const u = s.toUpperCase();
  if (u === "D1" || u === "DI")   return "Division I";
  if (u === "D2" || u === "DII")  return "Division II";
  if (u === "D3" || u === "DIII") return "Division III";
  if (u.startsWith("DIVISION ")) return `Division ${u.replace("DIVISION", "").trim()}`;
  return s;
}

function pickBestDivision(...candidates) {
  for (const c of candidates) {
    const d = normalizeDivisionLabel(c);
    if (d) return d;
  }
  return null;
}

// ─── id normalization ─────────────────────────────────────────────────────────

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

function isRateLimitError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("429") || msg.includes("too many");
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

async function safeFilter(entity, where, sort, limit, retries = 2) {
  if (!entity?.filter) return [];
  let last = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const rows = await entity.filter(where || {}, sort, limit);
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      last = e;
      if (!isRateLimitError(e) || i === retries) break;
      await sleep(350 * Math.pow(2, i));
    }
  }
  console.warn("[useSchoolIdentity] safeFilter failed:", last?.message || last);
  return [];
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── identity builder ─────────────────────────────────────────────────────────

/**
 * Build the best identity object from a School row + Camp row.
 * Either arg can be null — always returns a safe object.
 */
export function buildIdentity(schoolRow, campRow) {
  const s = schoolRow || {};
  const r = campRow  || {};

  const name = pickBestText(
    s.school_name,
    s.name,
    r.school_name,
    r.camp_name,   // last-resort: at least show something
  ) || "School";

  const logoUrl = pickBestLogo(
    s.athletics_logo_url,
    s.team_logo_url,
    s.logo_url,
    s.school_logo_url,
    s.primary_logo_url,
    s.logo,
    r.school_logo_url,
    r.athletics_logo_url,
    r.logo_url,
    r.logo,
  );

  const division = pickBestDivision(
    s.division,
    s.ncaa_division,
    s.athletics_division,
    s.school_division,
    r.division,
    r.school_division,
  );

  const city  = pickBestText(s.city,  r.city)  || null;
  const state = pickBestText(s.state, r.state) || null;

  return { name, logoUrl, division, city, state };
}

// ─── hook ─────────────────────────────────────────────────────────────────────

/**
 * useSchoolIdentity(campRows)
 *
 * Fetches School rows for all unique school_ids in campRows.
 * Returns:
 *   schoolById  — { [schoolId]: schoolRow }  (raw School rows for direct access)
 *   resolveIdentity(schoolId, campRow) → { name, logoUrl, division, city, state }
 *   loading     — true while fetching
 */
export function useSchoolIdentity(campRows) {
  const [schoolById, setSchoolById] = useState({});
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    const rows = asArray(campRows);
    if (!rows.length) {
      setSchoolById({});
      return;
    }

    const ids = Array.from(
      new Set(rows.map((r) => normId(r?.school_id)).filter(Boolean).map(String))
    );
    if (!ids.length) {
      setSchoolById({});
      return;
    }

    let cancelled = false;

    async function fetchSchools() {
      setLoading(true);
      try {
        const School = base44?.entities?.School;
        if (!School?.filter) return;

        const out = {};
        const groups = chunk(ids, 50);

        for (const g of groups) {
          if (cancelled) break;
          const srows = await safeFilter(School, { id: g }, "school_name", 2000);
          for (const s of asArray(srows)) {
            const sid = String(s?.id ?? "");
            if (sid) out[sid] = s;
          }
        }

        if (!cancelled) setSchoolById(out);
      } catch (e) {
        console.warn("[useSchoolIdentity] fetch error:", e?.message || e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSchools();
    return () => { cancelled = true; };
  }, [
    // Re-run when the set of school ids changes (stable JSON key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(
      Array.from(
        new Set(asArray(campRows).map((r) => normId(r?.school_id)).filter(Boolean).map(String))
      ).sort()
    ),
  ]);

  function resolveIdentity(schoolId, campRow) {
    const sid   = String(schoolId || "");
    const srow  = sid ? (schoolById[sid] || null) : null;
    return buildIdentity(srow, campRow);
  }

  return { schoolById, resolveIdentity, loading };
}

export default useSchoolIdentity;