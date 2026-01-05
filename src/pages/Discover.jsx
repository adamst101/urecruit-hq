import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, SlidersHorizontal } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav";
import CampCard from "../components/camps/CampCard";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { useDemoProfile } from "../components/hooks/useDemoProfile";

import { useWriteGate } from "../components/hooks/useWriteGate";
import { toggleDemoFavorite, isDemoFavorite } from "../components/hooks/demoFavorites";

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

// ✅ normalize id/_id/object → string id
function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function pickSchoolName(s) {
  return s?.school_name || s?.name || s?.title || "Unknown School";
}
function pickSchoolDivision(s) {
  return (
    s?.division ||
    s?.school_division ||
    s?.division_code ||
    s?.division_level ||
    null
  );
}
function pickSportName(sp) {
  return sp?.sport_name || sp?.name || sp?.title || null;
}

// ✅ join helper that keys map by normalized id (works with id or _id)
async function fetchEntityMap(entityName, ids) {
  const map = new Map();
  const cleanIds = uniq((ids || []).map(normId));
  if (!cleanIds.length) return map;

  let rows = [];
  // Try id: { in: [...] }
  try {
    rows = await base44.entities[entityName].filter({ id: { in: cleanIds } });
  } catch {
    // Try _id: { in: [...] }
    try {
      rows = await base44.entities[entityName].filter({ _id: { in: cleanIds } });
    } catch {
      rows = [];
      // Fallback per-id probes
      for (const id of cleanIds) {
        try {
          const one = await base44.entities[entityName].filter({ id }, { limit: 1 });
          if (Array.isArray(one) && one[0]) rows.push(one[0]);
          continue;
        } catch {}
        try {
          const one2 = await base44.entities[entityName].filter({ _id: id }, { limit: 1 });
          if (Array.isArray(one2) && one2[0]) rows.push(one2[0]);
        } catch {}
      }
    }
  }

  (rows || []).forEach((r) => {
    const key = normId(r);
    if (key) map.set(key, r);
  });
  return map;
}

/**
 * DEMO query:
 * - Pull Camps (optionally filtered by sport/state equality)
 * - Filter by demoYear using client-side start_date bounds
 * - Normalize ids
 * - Join School + Sport
 * - Apply division + position filters client-side
 * - Return "summary" rows shaped like Discover expects
 */
async function fetchDemoCampSummaries({ demoYear, demoProfile }) {
  if (!demoYear) return [];

  // 1) Fetch Camps (only equality filters server-side)
  const whereBase = {};
  if (demoProfile?.sport_id) whereBase.sport_id = demoProfile.sport_id;
  if (demoProfile?.state) whereBase.state = demoProfile.state;

  const rows = await base44.entities.Camp.filter(whereBase);
  const campsAll = Array.isArray(rows) ? rows : [];

  // 2) Normalize IDs up front (critical)
  const campsNorm = campsAll
    .map((c) => ({
      ...c,
      camp_id: normId(c),
      school_id: normId(c.school_id) || c.school_id || null,
      sport_id: normId(c.sport_id) || c.sport_id || null
    }))
    .filter((c) => c.camp_id);

  // 3) Client-side year filter (YYYY-MM-DD string compare is safe)
  const start = `${Number(demoYear)}-01-01`;
  const next = `${Number(demoYear) + 1}-01-01`;

  let camps = campsNorm.filter((c) => {
    const d = c?.start_date;
    return typeof d === "string" && d >= start && d < next;
  });

  // 4) Dedupe by camp_id (prevents duplicates)
  const seen = new Set();
  camps = camps.filter((c) => (seen.has(c.camp_id) ? false : (seen.add(c.camp_id), true)));

  // 5) Join School + Sport
  const schoolIds = uniq(camps.map((c) => c.school_id));
  const sportIds = uniq(camps.map((c) => c.sport_id));

  const [schoolMap, sportMap] = await Promise.all([
    fetchEntityMap("School", schoolIds),
    fetchEntityMap("Sport", sportIds)
  ]);

  // 6) Division filter (needs school join)
  if (demoProfile?.division) {
    const want = demoProfile.division;
    camps = camps.filter((c) => {
      const sch = c.school_id ? schoolMap.get(c.school_id) : null;
      return pickSchoolDivision(sch) === want;
    });
  }

  // 7) Position filter
  const pos = Array.isArray(demoProfile?.position_ids)
    ? demoProfile.position_ids.filter(Boolean)
    : [];
  if (pos.length) {
    camps = camps.filter((c) => {
      const cpos = Array.isArray(c?.position_ids) ? c.position_ids : [];
      return pos.some((p) => cpos.includes(p));
    });
  }

  // 8) Map to summary shape used by Discover
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

export default function Discover() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { loading: accessLoading, currentYear } = useSeasonAccess();
  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError
  } = useAthleteIdentity();

  const { loaded: demoLoaded, demoProfile, demoProfileId } = useDemoProfile();
  const gate = useWriteGate();

  // localStorage favorites need a rerender trigger
  const [, setDemoFavTick] = useState(0);

  // Paid identifiers
  const athleteId = athleteProfile?.id;
  const sportId = athleteProfile?.sport_id;

  // Paid query (unchanged)
  const paidSummariesQuery = useCampSummariesClient({
    athleteId,
    sportId,
    enabled: gate.mode === "paid" && !!athleteId
  });

  // Demo year = previous year
  const resolvedDemoYear = Number(currentYear) - 1;
  const demoEnabled = gate.mode !== "paid" && demoLoaded;

  // Demo query
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

  // Paid profile guard
  useEffect(() => {
    if (accessLoading || identityLoading) return;
    if (gate.mode === "paid" && !athleteProfile) {
      navigate(createPageUrl("Onboarding"));
    }
  }, [gate.mode, accessLoading, identityLoading, athleteProfile, navigate]);

  const loading =
    accessLoading ||
    (gate.mode === "paid"
      ? paidSummariesQuery.isLoading || identityLoading
      : demoSummariesQuery.isLoading || !demoLoaded);

  const isError =
    gate.mode === "paid"
      ? paidSummariesQuery.isError || identityError
      : demoSummariesQuery.isError;

  const errorObj =
    gate.mode === "paid" ? paidSummariesQuery.error : demoSummariesQuery.error;

  const summaries = useMemo(() => {
    const data =
      gate.mode === "paid"
        ? paidSummariesQuery.data || []
        : demoSummariesQuery.data || [];
    return Array.isArray(data) ? data : [];
  }, [gate.mode, paidSummariesQuery.data, demoSummariesQuery.data]);

  // Paid favorites mutation
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

      // Don't toggle if registered/completed
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
          <div className="text-xs mt-2 break-words">
            {String(errorObj?.message || errorObj)}
          </div>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(createPageUrl("DemoSetup"))}
              >
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Personalize
              </Button>
            )}
          </div>
        </div>
      </div>

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
              <div className="mt-4 space-y-2">
                <Button className="w-full" onClick={() => navigate(createPageUrl("DemoSetup"))}>
                  Update Demo Filters
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.location.reload()}
                >
                  Refresh
                </Button>
              </div>
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

            const positions = Array.isArray(s.position_ids)
              ? s.position_ids.map((id) => ({ position_id: id }))
              : [];

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
                positions={positions}
                isFavorite={isFav}
                isRegistered={isRegistered}
                onFavoriteToggle={() => {
                  gate.write({
                    demo: () => {
                      toggleDemoFavorite(effectiveDemoProfileId, s.camp_id);
                      setDemoFavTick((x) => x + 1);
                    },
                    paid: () => toggleFavorite.mutate({ campId: s.camp_id }),
                    blocked: () => navigate(createPageUrl("Onboarding"))
                  });
                }}
                // ✅ Critical: pass camp id via BOTH querystring + navigation state
                // This makes CampDetailDemo immune to helpers/routers that strip ?id=
                onClick={() => {
                  const camp_id = s.camp_id;
                  const page = gate.mode === "paid" ? "CampDetail" : "CampDetailDemo";
                  navigate(
                    createPageUrl({ path: page, query: { id: camp_id, camp_id } }),
                    { state: { camp_id, id: camp_id } }
                  );
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
