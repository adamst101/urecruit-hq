// src/pages/Discover.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav";
import CampCard from "../components/camps/CampCard";

import RouteGuard from "../components/auth/RouteGuard";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { useDemoProfile } from "../components/hooks/useDemoProfile";

import { useWriteGate } from "../components/hooks/useWriteGate";
import { toggleDemoFavorite, isDemoFavorite } from "../components/hooks/demoFavorites";
import { isDemoRegistered } from "../components/hooks/demoRegistered";

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function pickSchoolName(s) {
  return s?.school_name || s?.name || s?.title || "Unknown School";
}
function pickSchoolDivision(s) {
  return s?.division || s?.school_division || s?.division_code || s?.division_level || null;
}
function pickSportName(sp) {
  return sp?.sport_name || sp?.name || sp?.title || null;
}

/** Analytics helper (fire-and-forget) */
function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

/** Chunk helper */
function chunk(arr, size = 50) {
  const out = [];
  for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Base44-safe entity bulk fetch:
 * - Try "in" (chunked)
 * - Fall back to per-id PARALLEL
 */
async function fetchEntityMap(entityName, ids) {
  const map = new Map();
  const cleanIds = uniq((ids || []).map(normId)).filter(Boolean);
  if (!cleanIds.length) return map;

  let rows = [];
  const chunks = chunk(cleanIds, 50);

  try {
    const results = await Promise.all(chunks.map((c) => base44.entities[entityName].filter({ id: { in: c } })));
    rows = results.flat().filter(Boolean);
  } catch {
    try {
      const results2 = await Promise.all(chunks.map((c) => base44.entities[entityName].filter({ _id: { in: c } })));
      rows = results2.flat().filter(Boolean);
    } catch {
      rows = [];
    }
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    const settles = await Promise.allSettled(
      cleanIds.map(async (id) => {
        try {
          const one = await base44.entities[entityName].filter({ id });
          if (Array.isArray(one) && one[0]) return one[0];
        } catch {}
        try {
          const one2 = await base44.entities[entityName].filter({ _id: id });
          if (Array.isArray(one2) && one2[0]) return one2[0];
        } catch {}
        return null;
      })
    );
    rows = settles.map((s) => (s.status === "fulfilled" ? s.value : null)).filter(Boolean);
  }

  (rows || []).forEach((r) => {
    const key = normId(r);
    if (key) map.set(key, r);
  });

  return map;
}

/**
 * DEMO:
 * - Pull Camps with optional equality filters
 * - Fixes:
 *   1) normalize demoProfile.sport_id (object -> string id)
 *   2) if server-side filters return 0, retry broader + client-filter
 *   3) never rely on Camp.filter({}) returning “all rows” (it may page/limit)
 */
async function fetchDemoCampSummaries({ demoYear, demoProfile }) {
  if (!demoYear) return [];

  const demoSportId = normId(demoProfile?.sport_id);
  const demoState = demoProfile?.state || null;

  const start = `${Number(demoYear)}-01-01`;
  const next = `${Number(demoYear) + 1}-01-01`;

  // Build tight server filter (fast path)
  const whereTight = {};
  if (demoSportId) whereTight.sport_id = demoSportId;
  if (demoState) whereTight.state = demoState;

  async function tryFetch(where) {
    // try date bounds server-side first
    try {
      const rows = await base44.entities.Camp.filter({
        ...where,
        start_date: { gte: start, lt: next }
      });
      return Array.isArray(rows) ? rows : [];
    } catch {
      // fallback: fetch without date operators, then client filter
      try {
        const rows2 = await base44.entities.Camp.filter(where);
        return Array.isArray(rows2) ? rows2 : [];
      } catch {
        return [];
      }
    }
  }

  // 1) Tight fetch
  let campsAll = await tryFetch(whereTight);

  // 2) If tight returns nothing, retry broader fetch (year-only), then client-filter sport/state.
  // This covers: sport_id stored as relation object, type mismatch, or Base44 filter quirks.
  if (campsAll.length === 0) {
    campsAll = await tryFetch({});
  }

  const campsNorm = (campsAll || [])
    .map((c) => ({
      ...c,
      camp_id: normId(c),
      school_id: normId(c.school_id) || c.school_id || null,
      sport_id: normId(c.sport_id) || c.sport_id || null
    }))
    .filter((c) => c.camp_id);

  // Always enforce year client-side (safe no matter what Base44 supported)
  let camps = campsNorm.filter((c) => {
    const d = c?.start_date;
    return typeof d === "string" && d >= start && d < next;
  });

  // Client-side sport/state safety filters (handles mismatched server-side types)
  if (demoSportId) camps = camps.filter((c) => normId(c.sport_id) === demoSportId);
  if (demoState) camps = camps.filter((c) => (c.state || null) === demoState);

  // Dedup
  const seen = new Set();
  camps = camps.filter((c) => (seen.has(c.camp_id) ? false : (seen.add(c.camp_id), true)));

  const schoolIds = uniq(camps.map((c) => c.school_id)).filter(Boolean);
  const sportIds = uniq(camps.map((c) => c.sport_id)).filter(Boolean);

  const [schoolMap, sportMap] = await Promise.all([
    fetchEntityMap("School", schoolIds),
    fetchEntityMap("Sport", sportIds)
  ]);

  // optional division filter (post-join)
  if (demoProfile?.division) {
    const want = demoProfile.division;
    camps = camps.filter((c) => {
      const sch = c.school_id ? schoolMap.get(c.school_id) : null;
      return pickSchoolDivision(sch) === want;
    });
  }

  // optional positions filter
  const pos = Array.isArray(demoProfile?.position_ids) ? demoProfile.position_ids.filter(Boolean) : [];
  if (pos.length) {
    camps = camps.filter((c) => {
      const cpos = Array.isArray(c?.position_ids) ? c.position_ids : [];
      return pos.some((p) => cpos.includes(p));
    });
  }

  return camps.map((c) => {
    const sch = c.school_id ? schoolMap.get(c.school_id) : null;
    const sp = c.sport_id ? sportMap.get(c.sport_id) : null;

    return {
      camp_id: c.camp_id,
      school_id: c.school_id,
      sport_id: c.sport_id,

      camp_name: c.camp_name,
      start_date: c.start_date,
      end_date: c.end_date || null,
      city: c.city || null,
      state: c.state || null,
      position_ids: Array.isArray(c.position_ids) ? c.position_ids : [],
      price: typeof c.price === "number" ? c.price : null,
      link_url: c.link_url || null,
      notes: c.notes || null,

      school_name: pickSchoolName(sch),
      school_division: pickSchoolDivision(sch),
      sport_name: pickSportName(sp),

      intent_status: null
    };
  });
}

function DiscoverPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const { isLoading: accessLoading, currentYear } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading, isError: identityError } = useAthleteIdentity();

  const { loaded: demoLoaded, demoProfile, demoProfileId } = useDemoProfile();
  const gate = useWriteGate();

  const [, setDemoFavTick] = useState(0);

  const athleteId = athleteProfile?.id;
  const sportId = athleteProfile?.sport_id;

  const urlParams = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const urlSeason = urlParams.get("season");
  const urlDemoYear = urlSeason && Number.isFinite(Number(urlSeason)) ? Number(urlSeason) : null;

  const paidSummariesQuery = useCampSummariesClient({
    athleteId,
    sportId,
    enabled: gate.mode === "paid" && !!athleteId
  });

  const resolvedDemoYear = urlDemoYear || Number(currentYear) - 1;

  // NOTE: demoEnabled must wait for demo profile to load
  const demoEnabled = gate.mode !== "paid" && demoLoaded;

  // Normalize demo key fields (prevents “object id” cache keys and filter mismatches)
  const demoSportIdKey = normId(demoProfile?.sport_id) || null;
  const demoPosKey = Array.isArray(demoProfile?.position_ids) ? demoProfile.position_ids.join(",") : "";

  const demoSummariesQuery = useQuery({
    queryKey: ["demoCampSummaries", resolvedDemoYear, demoSportIdKey, demoProfile?.state || null, demoProfile?.division || null, demoPosKey],
    enabled: demoEnabled && !!resolvedDemoYear,
    queryFn: () => fetchDemoCampSummaries({ demoYear: resolvedDemoYear, demoProfile }),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1
  });

  const loading =
    accessLoading ||
    (gate.mode === "paid"
      ? paidSummariesQuery.isLoading || identityLoading
      : demoSummariesQuery.isLoading || !demoLoaded);

  const isError = gate.mode === "paid" ? paidSummariesQuery.isError || identityError : demoSummariesQuery.isError;
  const errorObj = gate.mode === "paid" ? paidSummariesQuery.error : demoSummariesQuery.error;

  const summaries = useMemo(() => {
    const data = gate.mode === "paid" ? paidSummariesQuery.data || [] : demoSummariesQuery.data || [];
    return Array.isArray(data) ? data : [];
  }, [gate.mode, paidSummariesQuery.data, demoSummariesQuery.data]);

  const allPositionIds = useMemo(() => {
    const ids = [];
    for (const s of summaries) {
      const arr = Array.isArray(s?.position_ids) ? s.position_ids : [];
      for (const id of arr) ids.push(id);
    }
    return uniq(ids.map(normId)).filter(Boolean);
  }, [summaries]);

  const positionsMapQuery = useQuery({
    queryKey: ["positionsMap", allPositionIds.join("|")],
    enabled: allPositionIds.length > 0,
    queryFn: () => fetchEntityMap("Position", allPositionIds),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1
  });

  const positionsMap = positionsMapQuery.data || new Map();

  const invalidatePaidSummaries = () => {
    queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });
  };

  const toggleFavorite = useMutation({
    mutationFn: async ({ campId }) => {
      if (!athleteId) throw new Error("Missing athlete profile");

      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteId,
        camp_id: campId
      });

      const intent = existing?.[0] || null;
      if (intent?.status === "registered" || intent?.status === "completed") return;

      if (!intent) {
        await base44.entities.CampIntent.create({
          athlete_id: athleteId,
          camp_id: campId,
          status: "favorite",
          priority: "medium"
        });
        return;
      }

      if (intent.status === "favorite") {
        await base44.entities.CampIntent.update(intent.id, { status: "removed" });
      } else {
        await base44.entities.CampIntent.update(intent.id, { status: "favorite" });
      }
    },
    onSuccess: invalidatePaidSummaries
  });

  useEffect(() => {
    if (loading) return;
    if (gate.mode === "paid") return;

    const key = `evt_discover_viewed_${resolvedDemoYear}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({ event_name: "discover_viewed", mode: "demo", season_year: resolvedDemoYear });
  }, [gate.mode, loading, resolvedDemoYear]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <Card className="max-w-md mx-auto p-4 border-rose-200 bg-rose-50 text-rose-700">
          <div className="font-semibold">Failed to load Discover</div>
          <div className="text-xs mt-2 break-words">{String(errorObj?.message || errorObj)}</div>
          <Button className="w-full mt-4" onClick={() => navigate(createPageUrl("Home"))}>
            Back to Home
          </Button>
        </Card>
      </div>
    );
  }

  const badge =
    gate.mode === "paid" ? (
      <Badge className="bg-emerald-600 text-white">Current {currentYear}</Badge>
    ) : (
      <Badge className="bg-slate-900 text-white">Demo {resolvedDemoYear}</Badge>
    );

  const effectiveDemoProfileId = demoProfileId || "default";

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-deep-navy">Discover</h1>
                {badge}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                {gate.mode === "paid"
                  ? "Browse and manage camps."
                  : `Browse prior-season camps (${resolvedDemoYear}). Personalize the demo to filter.`}
              </div>
            </div>

            {gate.mode !== "paid" && (
              <Button variant="outline" size="sm" onClick={() => navigate(createPageUrl("DemoSetup"))}>
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Personalize
              </Button>
            )}
          </div>
        </div>
      </div>

      {gate.mode !== "paid" && (
        <div className="max-w-md mx-auto px-4 pt-3">
          <Card className="p-3 border-amber-200 bg-amber-50">
            <div className="text-sm text-amber-900">
              Current season camps are locked.{" "}
              <button
                className="underline font-medium"
                onClick={() => {
                  trackEvent({
                    event_name: "discover_subscribe_banner_clicked",
                    mode: "demo",
                    season_year: resolvedDemoYear
                  });
                  navigate(createPageUrl("Subscribe"));
                }}
                type="button"
              >
                See plan & pricing
              </button>
              .
            </div>
          </Card>
        </div>
      )}

      <div className="max-w-md mx-auto p-4 space-y-3">
        {summaries.length === 0 ? (
          <Card className="p-4 border-slate-200 bg-white">
            <div className="font-semibold text-deep-navy">No camps found</div>
            <div className="text-sm text-slate-600 mt-1">
              {gate.mode === "paid"
                ? "No camps matched your current filters."
                : `No ${resolvedDemoYear} camps match your demo filters. Try clearing filters in Personalize.`}
            </div>
            {gate.mode !== "paid" && (
              <Button className="w-full mt-3" variant="outline" onClick={() => navigate(createPageUrl("DemoSetup"))}>
                Clear / Update Demo Filters
              </Button>
            )}
          </Card>
        ) : (
          summaries.map((s) => {
            const camp = {
              id: s.camp_id,
              camp_name: s.camp_name,
              start_date: s.start_date,
              end_date: s.end_date,
              city: s.city,
              state: s.state,
              price: s.price,
              link_url: s.link_url,
              notes: s.notes,
              position_ids: s.position_ids || []
            };

            const school = {
              id: s.school_id,
              school_name: s.school_name,
              division: s.school_division
            };

            const sport = s.sport_id ? { id: s.sport_id, sport_name: s.sport_name } : null;

            const resolvedPositions = (Array.isArray(s.position_ids) ? s.position_ids : [])
              .map((pid) => positionsMap.get(normId(pid)))
              .filter(Boolean)
              .map((p) => ({
                position_id: normId(p),
                position_code: p.position_code,
                position_name: p.position_name
              }));

            const demoReg = gate.mode !== "paid" ? isDemoRegistered(effectiveDemoProfileId, s.camp_id) : false;

            const isFav =
              gate.mode === "paid"
                ? s.intent_status === "favorite"
                : isDemoFavorite(effectiveDemoProfileId, s.camp_id);

            const isRegistered =
              gate.mode === "paid"
                ? s.intent_status === "registered" || s.intent_status === "completed"
                : demoReg;

            return (
              <CampCard
                key={s.camp_id}
                camp={camp}
                school={school}
                sport={sport}
                positions={resolvedPositions}
                isFavorite={isFav}
                isRegistered={isRegistered}
                onFavoriteToggle={() => {
                  gate.write({
                    demo: () => {
                      if (isDemoRegistered(effectiveDemoProfileId, s.camp_id)) return;

                      trackEvent({
                        event_name: isDemoFavorite(effectiveDemoProfileId, s.camp_id)
                          ? "demo_favorite_removed"
                          : "demo_favorite_added",
                        mode: "demo",
                        camp_id: s.camp_id,
                        school_id: s.school_id,
                        sport_id: s.sport_id,
                        season_year: resolvedDemoYear
                      });

                      toggleDemoFavorite(effectiveDemoProfileId, s.camp_id);
                      setDemoFavTick((x) => x + 1);
                    },
                    paid: () => toggleFavorite.mutate({ campId: s.camp_id }),
                    blocked: () => navigate(createPageUrl("Subscribe"))
                  });
                }}
                onClick={() => {
                  const camp_id = s.camp_id;

                  if (gate.mode !== "paid") {
                    trackEvent({
                      event_name: "camp_card_clicked",
                      mode: "demo",
                      camp_id: s.camp_id,
                      school_id: s.school_id,
                      sport_id: s.sport_id,
                      positions: (resolvedPositions || []).map((p) => p.position_code).filter(Boolean),
                      season_year: resolvedDemoYear
                    });
                  }

                  const pathname = createPageUrl("CampDetail");
                  const qs =
                    gate.mode === "paid"
                      ? `?id=${encodeURIComponent(camp_id)}`
                      : `?id=${encodeURIComponent(camp_id)}&mode=demo&season=${encodeURIComponent(resolvedDemoYear)}`;

                  navigate(`${pathname}${qs}`, { state: { camp_id, id: camp_id } });
                }}
              />
            );
          })
        )}
      </div>

      <BottomNav />
    </div>
  );
}

export default function Discover() {
  return (
    <RouteGuard requireProfile={true}>
      <DiscoverPage />
    </RouteGuard>
  );
}
