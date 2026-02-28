// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav.jsx";
import FilterSheet from "../components/filters/FilterSheet.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { readDemoMode } from "../components/hooks/demoMode.jsx";

import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";
import { useCampFilters } from "../components/filters/useCampFilters.jsx";
import { useWriteGate } from "../components/hooks/useWriteGate.jsx";

import {
  matchesDivision,
  matchesSport,
  matchesPositions,
  matchesState,
  matchesDateRange,
} from "../components/filters/filterUtils.jsx";

/* -------------------------
   Rate-limit hardened helpers
------------------------- */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

function isRateLimitError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("rate limit") || msg.includes("rate limited") || msg.includes("429") || msg.includes("too many");
}

async function safeFilter(entity, where, sort, limit, { retries = 2, baseDelayMs = 350 } = {}) {
  if (!entity?.filter) return [];
  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const rows = await entity.filter(where || {}, sort, limit);
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      lastErr = e;
      if (!isRateLimitError(e) || attempt === retries) break;
      await sleep(baseDelayMs * Math.pow(2, attempt));
    }
  }

  throw lastErr;
}

function chunk(arr, size) {
  const out = [];
  const a = Array.isArray(arr) ? arr : [];
  const n = Math.max(1, Number(size) || 50);
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

function asArray(x) {
  return Array.isArray(x) ? x : [];
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function readActiveFlag(row) {
  if (typeof row?.active === "boolean") return row.active;
  if (typeof row?.is_active === "boolean") return row.is_active;
  if (typeof row?.isActive === "boolean") return row.isActive;

  const st = String(row?.status || "").toLowerCase().trim();
  if (st === "inactive") return false;
  if (st === "active") return true;
  return true;
}

function isBadLogoUrl(url) {
  const u = String(url || "").trim();
  if (!u) return true;
  const lu = u.toLowerCase();

  // Known vendor/source placeholders (not school identity)
  if (lu.includes("ryzer")) return true;
  if (lu.includes("sportsusa")) return true;
  if (lu.includes("sportscamps")) return true;

  // Generic placeholders
  if (lu.includes("placeholder")) return true;

  return false;
}

function pickBestLogoUrl(...candidates) {
  for (const c of candidates) {
    const u = String(c || "").trim();
    if (!u) continue;
    if (isBadLogoUrl(u)) continue;
    return u;
  }
  return null;
}

function initialBadge(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  const ch = s.replace(/[^A-Za-z0-9]/g, "").slice(0, 1);
  return (ch || "?").toUpperCase();
}

function toISODate(dateInput) {
  if (!dateInput) return null;

  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

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

  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function footballSeasonYearForDate(d = new Date()) {
  const y = d.getUTCFullYear();
  const feb1 = new Date(Date.UTC(y, 1, 1, 0, 0, 0));
  return d >= feb1 ? y : y - 1;
}

function getUrlParams(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const mode = sp.get("mode");
    const season = sp.get("season");
    return {
      mode: mode ? String(mode).toLowerCase() : null,
      requestedSeason: safeNumber(season),
    };
  } catch {
    return { mode: null, requestedSeason: null };
  }
}

function chipLabel(key, nf) {
  if (!nf) return "";
  if (key === "state") return nf.state ? String(nf.state).toUpperCase() : "State";
  if (key === "dates") {
    if (!nf.startDate && !nf.endDate) return "Dates";
    if (nf.startDate && !nf.endDate) return `From ${nf.startDate}`;
    if (!nf.startDate && nf.endDate) return `Until ${nf.endDate}`;
    return `${nf.startDate} → ${nf.endDate}`;
  }
  return "";
}

function hasActiveFilters(nf, isPaid) {
  if (!nf) return false;
  const divOn = Array.isArray(nf.divisions) && nf.divisions.length > 0;
  const posOn = Array.isArray(nf.positions) && nf.positions.length > 0;
  const stateOn = !!nf.state;
  const dateOn = !!nf.startDate || !!nf.endDate;
  const sportOn = !isPaid && Array.isArray(nf.sports) && nf.sports.length > 0;
  return divOn || posOn || stateOn || dateOn || sportOn;
}

// Schema-safe Event telemetry (never breaks UX)
function trackEvent(payload) {
  try {
    const EventEntity = base44?.entities?.Event || base44?.entities?.Events;
    if (!EventEntity?.create) return;

    const iso = new Date().toISOString();
    const day = iso.slice(0, 10);

    const eventName = payload?.event_name || payload?.event_type || "event";
    const sourcePlatform = payload?.source_platform || "web";
    const title = payload?.title || String(eventName);
    const sourceKey = payload?.source_key || `${String(sourcePlatform)}:${String(eventName)}`;

    EventEntity.create({
      source_platform: String(sourcePlatform),
      event_type: String(eventName),
      title: String(title),
      source_key: String(sourceKey),
      start_date: payload?.start_date || day,
      payload_json: JSON.stringify(payload || {}),
      ts: iso,
    });
  } catch {
    // ignore
  }
}

/* =========================================================
   Page
========================================================= */
export default function Discover() {
  const nav = useNavigate();
  const loc = useLocation();

  // ✅ FIX: demo mode is nullable and does NOT contain `isDemoMode`
  const dm = readDemoMode(); // null or { mode: "demo", seasonYear, setAt }
  const isDemoMode = dm?.mode === "demo";
  const demoSeasonOverride = Number.isFinite(Number(dm?.seasonYear)) ? Number(dm.seasonYear) : null;

  const { identity: athleteProfile } = useAthleteIdentity();
  const athleteSportId = athleteProfile?.sport_id != null ? String(athleteProfile.sport_id) : "";

  const { hasAccess, seasonYear: accessSeasonYear } = useSeasonAccess();
  const writeGate = useWriteGate();

  const isPaid = !!hasAccess && !isDemoMode;

  const urlp = useMemo(() => getUrlParams(loc?.search || ""), [loc?.search]);
  const seasonYear = useMemo(() => {
    if (urlp?.requestedSeason) return urlp.requestedSeason;
    if (isDemoMode && demoSeasonOverride) return demoSeasonOverride;
    if (accessSeasonYear) return accessSeasonYear;
    return footballSeasonYearForDate(new Date());
  }, [urlp?.requestedSeason, isDemoMode, demoSeasonOverride, accessSeasonYear]);

  const [isLoading, setIsLoading] = useState(false);
  const [campErr, setCampErr] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [intentByKey, setIntentByKey] = useState({});
  const [schoolById, setSchoolById] = useState({});
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const filtersApi = useCampFilters();
  const nf = filtersApi?.nf || null;

  const campKeyForRow = (r) => {
    const campId = String(r?.id ?? "");
    const eventKey = r?.event_key ? String(r.event_key) : "";
    return eventKey || campId;
  };

  const resultsCountLabel = useMemo(() => {
    const n = Array.isArray(rawRows) ? rawRows.length : 0;
    if (isLoading) return "Loading…";
    if (campErr) return "Error";
    return `${n} camps`;
  }, [rawRows, isLoading, campErr]);

  async function loadIntents(keys) {
    try {
      const CampIntent = base44?.entities?.CampIntent;
      if (!CampIntent?.filter) return {};

      const keyArr = asArray(keys).filter(Boolean);
      if (!keyArr.length) return {};

      const out = {};
      const groups = chunk(keyArr, 50);

      for (const g of groups) {
        const rows = await safeFilter(CampIntent, { intent_key: g }, "-updated_at", 2000, { retries: 2, baseDelayMs: 350 });
        for (const r of asArray(rows)) {
          const k = String(r?.intent_key || "");
          if (!k) continue;
          out[k] = r;
        }
      }

      return out;
    } catch {
      return {};
    }
  }

  async function upsertIntent(intentKey, nextStatus) {
    const CampIntent = base44?.entities?.CampIntent;
    if (!CampIntent?.create) return;

    const key = String(intentKey || "");
    if (!key) return;

    const existing = intentByKey?.[key] || null;

    if (!nextStatus) {
      if (existing?.id && CampIntent?.update) {
        await CampIntent.update(existing.id, { status: "" });
        setIntentByKey((p) => ({ ...p, [key]: { ...existing, status: "" } }));
      }
      return;
    }

    if (existing?.id && CampIntent?.update) {
      const updated = await CampIntent.update(existing.id, { status: String(nextStatus) });
      setIntentByKey((p) => ({ ...p, [key]: updated || { ...existing, status: String(nextStatus) } }));
      return;
    }

    const created = await CampIntent.create({ intent_key: key, status: String(nextStatus) });
    setIntentByKey((p) => ({ ...p, [key]: created || { intent_key: key, status: String(nextStatus) } }));
  }

  async function loadSchoolsForRows(rows) {
    try {
      const School = base44?.entities?.School;
      if (!School?.filter) return {};

      const ids = Array.from(
        new Set(
          asArray(rows)
            .map((r) => normId(r?.school_id))
            .filter(Boolean)
            .map(String)
        )
      );

      if (!ids.length) return {};

      const out = {};
      const groups = chunk(ids, 50);

      for (const g of groups) {
        const srows = await safeFilter(School, { id: g }, "school_name", 2000, { retries: 2, baseDelayMs: 350 });
        for (const s of asArray(srows)) {
          const sid = String(s?.id ?? "");
          if (!sid) continue;
          out[sid] = s;
        }
      }

      return out;
    } catch {
      return {};
    }
  }

  const applyFilters = useMemo(() => {
    const isPaidMode = isPaid;

    return (rows) => {
      const a = asArray(rows);

      return a.filter((r) => {
        if (!readActiveFlag(r)) return false;

        if (isPaidMode) {
          if (!matchesSport(r, [athleteSportId].filter(Boolean))) return false;
        } else {
          if (Array.isArray(nf?.sports) && nf.sports.length > 0 && !matchesSport(r, nf.sports)) return false;
        }

        if (Array.isArray(nf?.divisions) && nf.divisions.length > 0 && !matchesDivision(r, nf.divisions)) return false;
        if (Array.isArray(nf?.positions) && nf.positions.length > 0 && !matchesPositions(r, nf.positions)) return false;
        if (nf?.state && !matchesState(r, nf.state)) return false;
        if ((nf?.startDate || nf?.endDate) && !matchesDateRange(r, nf.startDate || "", nf.endDate || "")) return false;

        return true;
      });
    };
  }, [isPaid, athleteSportId, nf]);

  async function loadCamps() {
    setIsLoading(true);
    setCampErr(null);

    try {
      const CampEntity = base44?.entities?.Camp;
      if (!CampEntity?.filter) {
        setRawRows([]);
        setCampErr("Camps not available.");
        return;
      }

      let rows = [];
      try {
        rows = await safeFilter(CampEntity, { season_year: seasonYear }, "-start_date", 2000, { retries: 2, baseDelayMs: 350 });
      } catch (e1) {
        try {
          rows = await safeFilter(CampEntity, { season_year: String(seasonYear) }, "-start_date", 2000, { retries: 2, baseDelayMs: 350 });
        } catch (e2) {
          throw e2 || e1;
        }
      }

      const filtered = applyFilters(rows);

      setRawRows(filtered);

      const keys = filtered.map(campKeyForRow).filter(Boolean);
      const intents = await loadIntents(keys);
      setIntentByKey(intents);

      const schools = await loadSchoolsForRows(filtered);
      setSchoolById(schools);

      trackEvent({
        event_name: "discover_loaded",
        source: "discover",
        season_year: seasonYear,
        paid: isPaid,
        raw_camps: Array.isArray(rows) ? rows.length : 0,
        shown_camps: filtered.length,
      });
    } catch (e) {
      const msg = isRateLimitError(e) ? "Camps not available: Rate limit exceeded" : String(e?.message || e || "Failed to load camps");
      setCampErr(msg);
      setRawRows([]);

      trackEvent({
        event_name: "discover_error",
        source: "discover",
        season_year: seasonYear,
        paid: isPaid,
        error: msg,
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCamps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonYear, isPaid]);

  function clearFilters() {
    filtersApi?.clearFilters?.();
    setTimeout(() => loadCamps(), 0);
  }

  const shownRows = rawRows;

  const favoriteCount = useMemo(() => {
    const map = intentByKey || {};
    let c = 0;
    for (const k of Object.keys(map)) {
      const st = String(map[k]?.status || "").toLowerCase();
      if (st === "favorite") c += 1;
    }
    return c;
  }, [intentByKey]);

  const activeChipKeys = useMemo(() => {
    const out = [];
    if (Array.isArray(nf?.divisions) && nf.divisions.length) out.push("divisions");
    if (Array.isArray(nf?.positions) && nf.positions.length) out.push("positions");
    if (nf?.state) out.push("state");
    if (nf?.startDate || nf?.endDate) out.push("dates");
    if (!isPaid && Array.isArray(nf?.sports) && nf.sports.length) out.push("sports");
    return out;
  }, [nf, isPaid]);

  const chipsLabel = (k) => {
    if (k === "divisions") return `Division: ${nf?.divisions?.join(", ") || ""}`;
    if (k === "positions") return `Position: ${nf?.positions?.join(", ") || ""}`;
    if (k === "sports") return `Sport: ${nf?.sports?.join(", ") || ""}`;
    return chipLabel(k, nf);
  };

  const CampList = () => {
    const rows = asArray(shownRows);

    if (campErr) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">Camps not available</div>
          <div className="mt-1 text-sm text-slate-700">{campErr}</div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => loadCamps()}>
              Retry
            </Button>
            <Button variant="outline" onClick={() => nav("/AdminOps")}>
              Open Admin Ops
            </Button>
          </div>
          <div className="mt-3 text-xs text-amber-900/70">
            Tip: If this keeps happening, you’re hitting Base44 throttling. Retry after a few seconds.
          </div>
        </Card>
      );
    }

    if (isLoading) {
      return (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <Card key={n} className="p-4 border-slate-200 bg-white">
              <div className="animate-pulse">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200" />
                    <div className="min-w-0">
                      <div className="h-3 w-28 bg-slate-200 rounded" />
                      <div className="mt-2 h-5 w-56 bg-slate-200 rounded" />
                      <div className="mt-2 h-4 w-40 bg-slate-200 rounded" />
                      <div className="mt-3 flex gap-2">
                        <div className="h-6 w-20 bg-slate-200 rounded" />
                        <div className="h-6 w-28 bg-slate-200 rounded" />
                      </div>
                    </div>
                  </div>
                  <div className="h-9 w-9 bg-slate-200 rounded" />
                </div>
                <div className="mt-4 flex items-center justify-end">
                  <div className="h-8 w-20 bg-slate-200 rounded" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      );
    }

    if (!rows.length) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">No camps found</div>
          <div className="mt-1 text-sm text-slate-600">
            No camps found for season {seasonYear} (or filters excluded them).
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
            <Button onClick={() => setIsFiltersOpen(true)}>Edit filters</Button>
          </div>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {rows.map((r) => {
          const campId = String(r?.id ?? "");
          const eventKey = r?.event_key ? String(r.event_key) : "";
          const intentKey = eventKey || campId;

          const schoolId = String(normId(r?.school_id) ?? "");
          const srow = schoolById[schoolId] || null;

          const schoolName = srow?.school_name || srow?.name || r?.school_name || "Unknown School";
          const schoolCity = srow?.city || r?.city || null;
          const schoolState = srow?.state || r?.state || null;
          const schoolDivision = srow?.division || srow?.school_division || r?.division || null;

          const schoolLogo = pickBestLogoUrl(
            srow?.logo_url,
            srow?.school_logo_url,
            srow?.athletics_logo_url,
            r?.school_logo_url,
            r?.logo_url
          );

          const linkUrl = r?.link_url ?? r?.source_url ?? r?.url ?? null;
          const startIso = toISODate(r?.start_date);
          const endIso = toISODate(r?.end_date);
          const dateLabel =
            startIso && endIso && endIso !== startIso ? `${startIso} → ${endIso}` : startIso || "TBD";

          const intent = intentByKey?.[intentKey] || null;
          const isFavorite = String(intent?.status || "").toLowerCase() === "favorite";

          return (
            <Card
              key={campId}
              className="p-4 border-slate-200 bg-white cursor-pointer hover:shadow-sm transition"
              role="button"
              tabIndex={0}
              onClick={() =>
                nav(isPaid ? `/CampDetail?id=${encodeURIComponent(campId)}` : `/CampDetailDemo?id=${encodeURIComponent(campId)}`)
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                    {schoolLogo ? (
                      <img src={schoolLogo} alt={`${schoolName} logo`} className="w-full h-full object-contain" loading="lazy" />
                    ) : (
                      <div className="text-xs font-semibold text-slate-500">{initialBadge(schoolName)}</div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {schoolDivision && <Badge className="bg-slate-900 text-white text-xs">{schoolDivision}</Badge>}
                      {!isPaid && (
                        <Badge variant="outline" className="text-xs">
                          Demo
                        </Badge>
                      )}
                    </div>

                    <div className="text-lg font-semibold text-deep-navy truncate mt-1">{schoolName}</div>
                    <div className="text-sm text-slate-700 truncate">{r?.camp_name ?? r?.name ?? "Camp"}</div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-1">{dateLabel}</span>
                      {(schoolCity || schoolState) && (
                        <span className="rounded-md bg-slate-50 border border-slate-200 px-2 py-1">
                          {[schoolCity, schoolState].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0"
                  disabled={!isPaid}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isPaid) return;

                    const ok = await (writeGate?.ensure ? writeGate.ensure("favorite") : true);
                    if (!ok) return;

                    const next = isFavorite ? "" : "favorite";
                    await upsertIntent(intentKey, next);
                  }}
                  aria-label={isPaid ? (isFavorite ? "Remove favorite" : "Add favorite") : "Favorites locked"}
                >
                  <span className={(isFavorite ? "text-amber-500" : "text-slate-400") + " text-2xl leading-none"}>
                    {isFavorite ? "★" : "☆"}
                  </span>
                </Button>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!linkUrl}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!linkUrl) return;

                    try {
                      window.open(String(linkUrl), "_blank", "noopener,noreferrer");
                    } catch {}

                    if (isPaid) {
                      const ok = await (writeGate?.ensure ? writeGate.ensure("register") : true);
                      if (ok) await upsertIntent(intentKey, "registered");
                    }
                  }}
                >
                  Register
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-2xl font-bold text-deep-navy">Discover</div>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                Season {seasonYear}
              </Badge>
              {isPaid ? <Badge className="bg-deep-navy text-white">Paid</Badge> : <Badge variant="outline">Demo</Badge>}
              <span className="text-xs text-slate-500">{resultsCountLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isPaid && (
              <Button
                variant="outline"
                onClick={() => nav("/MyCamps")}
                aria-label="Go to My Camps"
                title="View saved and registered camps"
                className="whitespace-nowrap"
              >
                My Camps
                {favoriteCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[22px] h-[22px] px-2 rounded-full bg-slate-900 text-white text-xs">
                    {favoriteCount}
                  </span>
                )}
              </Button>
            )}

            <Button variant="outline" onClick={() => setIsFiltersOpen(true)} aria-label="Open filters">
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Filters
            </Button>
          </div>
        </div>

        {hasActiveFilters(nf, isPaid) && (
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            {activeChipKeys.map((k) => (
              <button
                key={k}
                type="button"
                className="text-xs px-2 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50"
                onClick={() => setIsFiltersOpen(true)}
              >
                {chipsLabel(k)}
              </button>
            ))}
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-500"
              onClick={clearFilters}
            >
              Clear
            </button>
          </div>
        )}

        <div className="mt-5">
          <CampList />
        </div>
      </div>

      <FilterSheet
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        filters={nf || {}}
        onFilterChange={(next) => filtersApi?.setNF?.(next)}
        positions={[]}
        sports={[]}
        lockSportId={isPaid ? String(athleteSportId || "") : ""}
        onClear={clearFilters}
        onApply={() => {
          setIsFiltersOpen(false);
          loadCamps();
        }}
      />

      <BottomNav />
    </div>
  );
}