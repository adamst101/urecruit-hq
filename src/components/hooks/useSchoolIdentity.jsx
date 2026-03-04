// src/components/hooks/useSchoolIdentity.jsx
//
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

async function fetchSchoolsByIds(School, ids) {
  const clean = uniq(ids);
  if (!School?.filter || clean.length === 0) return [];

  const out = [];
  for (const part of chunk(clean, 60)) {
    const tries = [
      { id: { in: part } },
      { id: { $in: part } },
      { _id: { in: part } },
      { _id: { $in: part } },
      { id: part },
    ];

    let rows = [];
    for (const where of tries) {
      rows = await safeFilter(School, where, "school_name", 2000);
      if (rows.length) break;
    }
    out.push(...rows);
  }

  if (!out.length) {
    const all = await safeFilter(School, {}, "school_name", 5000);
    const wanted = new Set(clean);
    return asArray(all).filter((s) => {
      const id = String(normId(s) || "");
      return id && wanted.has(id);
    });
  }

  const seen = new Set();
  const deduped = [];
  for (const r of out) {
    const id = String(normId(r) || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(r);
  }
  return deduped;
}

export function buildIdentity(schoolRow, campRow) {
  const s = schoolRow || {};
  const r = campRow || {};

  const name =
    pickBestText(s.school_name, s.name, r.school_name, r.camp_name) || "School";

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

  function resolveIdentity(schoolId, campRow) {
    const sid = String(schoolId || "");
    const srow = sid ? schoolById[sid] || null : null;
    return buildIdentity(srow, campRow);
  }

  return { schoolById, resolveIdentity, loading };
}

export default useSchoolIdentity;

