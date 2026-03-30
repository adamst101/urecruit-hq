// src/components/hooks/useSchoolIdentity.jsx
// Resolves the best available school identity (logo, name, division) for a set of Camp rows.

import { useEffect, useState } from "react";
import { base44 } from "../../api/base44Client";

const BAD_TEXT = new Set(["unknown", "n/a", "na", "none", "null", "undefined", "-", ""]);

function isBadText(v) {
  return BAD_TEXT.has(String(v ?? "").trim().toLowerCase());
}

function isBadLogoUrl(url) {
  const u = String(url || "").trim().toLowerCase();
  if (!u) return true;
  if (!u.startsWith("http://") && !u.startsWith("https://")) return true;
  if (u.includes("ryzer")) return true;
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

export function normalizeDivisionLabel(v) {
  const s = String(v ?? "").trim();
  if (!s || isBadText(s)) return null;
  const u = s.toUpperCase();
  if (u === "D1" || u === "DI") return "Division I";
  if (u === "D2" || u === "DII") return "Division II";
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

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function uniq(arr) {
  return Array.from(new Set((arr || []).map((x) => String(x)).filter(Boolean)));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

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
      await sleep(300 * Math.pow(2, i));
    }
  }
  console.warn("[useSchoolIdentity] safeFilter failed:", last?.message || last);
  return [];
}

// Module-level school cache — survives across re-renders and navigations
// Module-level school map — loaded once per session via a single unrestricted
// filter call. Filtering School by id with $in doesn't work in base44, so we
// load all schools upfront and look up locally by id.
const _schoolMap = new Map(); // id → school record
let _schoolMapLoaded = false;
let _schoolMapLoading = null; // in-flight promise, prevents duplicate fetches

export function schoolMapGet(id) {
  return id ? _schoolMap.get(String(id)) || null : null;
}

/**
 * Find a school record by name (case-insensitive).
 * Tries exact match first, then partial contains.
 * Must be called after ensureSchoolMap() has resolved.
 */
export function schoolMapFind(nameQuery) {
  if (!nameQuery) return null;
  const needle = nameQuery.toLowerCase().trim();
  // Pass 1: exact match
  for (const school of _schoolMap.values()) {
    if ((school.school_name || school.name || "").toLowerCase() === needle) return school;
  }
  // Pass 2: name contains needle
  for (const school of _schoolMap.values()) {
    if ((school.school_name || school.name || "").toLowerCase().includes(needle)) return school;
  }
  return null;
}

export async function ensureSchoolMap(School) {
  if (_schoolMapLoaded) return;
  if (_schoolMapLoading) return _schoolMapLoading;

  _schoolMapLoading = (async () => {
    try {
      const rows = await safeFilter(School, {}, "school_name", 2000);
      for (const r of (rows || [])) {
        const id = String(normId(r) || "");
        if (id) _schoolMap.set(id, r);
      }
      const sample = rows?.[0];
      console.log("[DIAG schoolMap] loaded", _schoolMap.size, "schools. Sample record keys:", sample ? Object.keys(sample) : "none");
      if (sample) console.log("[DIAG schoolMap] sample athletic_logo_url:", sample.athletic_logo_url, "| logo_url:", sample.logo_url, "| id:", normId(sample));
    } catch (e) {
      console.warn("[DIAG schoolMap] load failed:", e?.message || e);
      // leave map empty — lookups will return null
    }
    _schoolMapLoaded = true;
    _schoolMapLoading = null;
  })();

  return _schoolMapLoading;
}

async function fetchSchoolsByIds(School, ids) {
  const clean = uniq(ids);
  if (!School?.filter || clean.length === 0) return [];

  await ensureSchoolMap(School);

  const mapSample = Array.from(_schoolMap.keys()).slice(0, 3);
  console.log("[DIAG fetchSchoolsByIds] map size:", _schoolMap.size, "sample map keys:", mapSample);
  console.log("[DIAG fetchSchoolsByIds] looking up IDs:", clean.slice(0, 5));

  const result = [];
  const missing = [];
  for (const id of clean) {
    const record = _schoolMap.get(id);
    if (record) result.push(record);
    else missing.push(id);
  }
  console.log("[DIAG fetchSchoolsByIds] hits:", result.length, "misses:", missing.length, "first miss:", missing[0]);

  // Fall back to individual get() for IDs not in the bulk-loaded map.
  if (missing.length && School?.get) {
    const settled = await Promise.allSettled(missing.map((id) => School.get(id)));
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === "fulfilled" && r.value) {
        const id = String(normId(r.value) || missing[i]);
        _schoolMap.set(id, r.value);
        result.push(r.value);
      }
    }
  }

  return result;
}

export function buildIdentity(schoolRow, campRow) {
  const s = schoolRow || {};
  const r = campRow || {};

  // Prefer school entity fields, then camp's embedded program name (host_org / ryzer_program_name),
  // then camp_name as last resort. Never show a raw camp name as the school name if host_org exists.
  const name =
    pickBestText(s.school_name, s.name, r.school_name, r.host_org, r.ryzer_program_name) || "School";

  const logoUrl = pickBestLogo(
    s.athletic_logo_url,
    s.athletics_logo_url,
    s.team_logo_url,
    s.logo_url,
    s.school_logo_url,
    s.primary_logo_url,
    s.logo,
    r.school_logo_url,
    r.athletic_logo_url,
    r.athletics_logo_url,
    r.logo_url,
    r.logo
  );

  const division = pickBestDivision(
    s.division,
    s.ncaa_division,
    s.athletics_division,
    s.school_division,
    r.division,
    r.school_division
  );

  const city = pickBestText(s.city, r.city) || null;
  const state = pickBestText(s.state, r.state) || null;

  return { name, logoUrl, division, city, state };
}

export function useSchoolIdentity(campRows) {
  const [schoolById, setSchoolById] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const rows = asArray(campRows);
    if (!rows.length) {
      setSchoolById({});
      return;
    }

    const ids = uniq(rows.map((r) => normId(r?.school_id)).filter(Boolean));
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

        const fetched = await fetchSchoolsByIds(School, ids);
        const out = {};
        for (const s of fetched) {
          const sid = String(normId(s) || "");
          if (sid) out[sid] = s;
        }

        if (!cancelled) setSchoolById(out);
      } catch (e) {
        console.warn("[useSchoolIdentity] fetch error:", e?.message || e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSchools();
    return () => {
      cancelled = true;
    };
  }, [
    JSON.stringify(uniq(asArray(campRows).map((r) => normId(r?.school_id)).filter(Boolean)).sort()),
  ]);

  // Diagnostic counter — log first few calls to show hits/misses
  const _diagCount = { n: 0 };
  function resolveIdentity(schoolId, campRow) {
    const sid = String(schoolId || "");
    const srow = sid ? schoolById[sid] || null : null;
    if (_diagCount.n < 3) {
      _diagCount.n++;
      console.log(`[DIAG resolveIdentity] sid="${sid}" hit=${!!srow} schoolById size=${Object.keys(schoolById).length}`);
      if (srow) console.log("[DIAG resolveIdentity] school record:", JSON.stringify(srow).slice(0, 300));
    }
    return buildIdentity(srow, campRow);
  }

  return { schoolById, resolveIdentity, loading };
}

export default useSchoolIdentity;