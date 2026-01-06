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

/**
 * Analytics helper (fire-and-forget)
 */
function trackEvent(payload) {
  try {
    base44.entities.Event.create({
      ...payload,
      ts: new Date().toISOString()
    });
  } catch {
    // never block UX
  }
}

/**
 * Base44-safe entity bulk fetch:
 * - Try "in"
 * - Fall back to per-id
 */
async function fetchEntityMap(entityName, ids) {
  const map = new Map();
  const cleanIds = uniq((ids || []).map(normId)).filter(Boolean);
  if (!cleanIds.length) return map;

  let rows = [];
  try {
    rows = await base44.entities[entityName].filter({ id: { in: cleanIds } });
  } catch {
    try {
      rows = await base44.entities[entityName].filter({ _id: { in: cleanIds } });
    } catch {
      rows = [];
    }
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    rows = [];
    for (const id of cleanIds) {
      try {
        const one = await base44.entities[entityName].filter({ id });
        if (Array.isArray(one) && one[0]) {
          rows.push(one[0]);
          continue;
        }
      } catch {}
      try {
        const one2 = await base44.entities[entityName].filter({ _id: id });
        if (Array.isArray(one2) && one2[0]) rows.push(one2[0]);
      } catch {}
    }
  }

  (rows || []).forEach((r) => {
    const key = normId(r);
    if (key) map.set(key, r);
  });

  return map;
}

/**
 * DEMO:
 * - Pull Camps with optional equality filters (sport/state) from demoProfile
 * - Filter by year client-side using start_date string bounds
 * - Join School + Sport
 */
async function fetchDemoCampSummaries({ demoYear, demoProfile }) {
  if (!demoYear) return [];

  const whereBase = {};
  if (demoProfile?.sport_id) whereBase.sport_id = demoProfile.sport_id;
  if (demoProfile?.state) whereBase.state = demoProfile.state;

  const rows = await base44.entities.Camp.filter(whereBase);
  const campsAll = Array.isArray(rows) ? rows : [];

  const campsNorm = campsAll
    .map((c) => ({
      ...c,
      camp_id: normId(c),
      school_id: normId(c.school_id) || c.school_id || null,
      sport_id: normId(c.sport_id) || c.sport_id || null
    }))
    .filter((c) => c.camp_id);

  const start = `${Number(demoYear)}-01-01`;
  const next = `${Number(demoYear) + 1}-01-01`;

  let camps = campsNorm.filter((c) => {
    const d = c?.start_date;
    return typeof d === "string" && d >= start && d < next;
  });

  // dedupe by camp_id
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

  // optional positions filter (camp.position_ids intersects demoProfile.position_ids)
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

  // --- Pull demo context from URL if present (Home sets ?mode=demo&season=YYYY) ---
  const urlParams = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const urlMode = urlParams.get("mode");
  const urlSeason = urlParams.get("season");
  const urlDemoYear = urlSeason && Number.isFinite(Number(urlSeason)) ? Number(urlSeason) : null;

  const paidSummariesQuery = useCampSummariesClient({
    athleteId,
    sportId,
    enabled: gate.mode === "paid" && !!athleteId
  });

  // demo year preference:
  // 1) explicit ?season=YYYY
  // 2) currentYear - 1
  const resolvedDemoYear = urlDemoYear || Number(currentYear) - 1;

  // demoEnabled should still key off gate.mode (authoritative) + demoProfile loaded.
  // urlMode is just a hint (keeps routing consistent from Home), not a source of truth.
  const demoEnabled = gate.mode !== "paid" && demoLoaded;

  const demoSummariesQuery = useQuery({
    queryKey: [
      "demoCampSummaries",
      resolvedDemoYear,
      demoProfile?.sport_id || null,
      demoProfile?.state || null,
      demoProfile?.division || null,
      Array.isArray(demoProfile?.position_ids) ? demoProfile.position_ids.join(",") : ""
    ],
    enabled: demoEnabled && !!resolvedDemoYear,
    queryFn: () => fetchDemoCampSummaries({ demoYear: resolvedDemoYear, demoProfile })
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

  /**
   * Position join for whatever list is currently shown (demo or paid)
   */
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
    queryFn: () => fetchEntityMap("Position", allPositionIds)
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

  /**
   * Demo analytics: Discover viewed (once per session/year)
   */
  useEffect(() => {
    if (loading) return;
    if (gate.mode === "paid") return;

    const key = `evt_discover_viewed_${resolvedDemoYear}`;
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "discover_viewed",
      mode: "demo",
      season_year: resolvedDemoYear,
      entry_mode: urlMode || null
    });
  }, [gate.mode, loading, resolvedDemoYear, urlMode]);

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

      {/* DEMO SUBSCRIBE BANNER */}
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

            const isFav =
              gate.mode === "paid"
                ? s.intent_status === "favorite"
                : isDemoFavorite(effectiveDemoProfileId, s.camp_id);

            const isRegistered =
              gate.mode === "paid" &&
              (s.intent_status === "registered" || s.intent_status === "completed");

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

                  try {
                    sessionStorage.setItem("last_demo_camp_id", String(camp_id));
                  } catch {}

                  // IMPORTANT: same screen for demo + paid
                  const pathname = createPageUrl("CampDetail");
                  const qs =
                    gate.mode === "paid"
                      ? `?id=${encodeURIComponent(camp_id)}`
                      : `?id=${encodeURIComponent(camp_id)}&mode=demo&season=${encodeURIComponent(
                          resolvedDemoYear
                        )}`;

                  navigate(`${pathname}${qs}`, {
                    state: { camp_id, id: camp_id }
                  });
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
  /**
   * Policy:
   * - Demo users can browse Discover without auth.
   * - Paid users MUST complete athlete profile before Discover.
   *
   * That is exactly: requireProfile=true (paid-only enforced inside RouteGuard).
   */
  return (
    <RouteGuard requireProfile={true}>
      <DiscoverPage />
    </RouteGuard>
  );
}
