// src/pages/CampDetailDemo.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  ArrowLeft,
  Calendar,
  MapPin,
  DollarSign,
  ExternalLink,
  Lock,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { createPageUrl } from "../utils";

const divisionColors = {
  "D1 (FBS)": "bg-amber-500 text-white",
  "D1 (FCS)": "bg-orange-500 text-white",
  D2: "bg-blue-600 text-white",
  D3: "bg-emerald-600 text-white",
  NAIA: "bg-purple-600 text-white",
  JUCO: "bg-slate-600 text-white",
};

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
function pickSchoolLogo(s) {
  return s?.logo_url || s?.school_logo_url || s?.logo || s?.image_url || null;
}
function pickSportName(sp) {
  return sp?.sport_name || sp?.name || sp?.title || null;
}

function trackEvent(payload) {
  try {
    base44.entities.Event.create({
      ...payload,
      ts: new Date().toISOString(),
    });
  } catch {}
}

function getCampIdFromAllSources({ params, location }) {
  const fromParams = normId(params?.id) || normId(params?.camp_id);
  const fromState = normId(location?.state?.camp_id) || normId(location?.state?.id);
  const sp = new URLSearchParams(location?.search || "");
  const fromQuery = normId(sp.get("id") || sp.get("camp_id") || sp.get("campId"));

  let fromSession = null;
  try {
    fromSession = normId(sessionStorage.getItem("last_demo_camp_id"));
  } catch {}

  return fromParams || fromState || fromQuery || fromSession || null;
}

function safeDate(d) {
  try {
    return d ? format(new Date(d), "MMM d, yyyy") : "TBD";
  } catch {
    return "TBD";
  }
}

async function fetchOneById(entityName, id) {
  const cleanId = normId(id);
  if (!cleanId) return null;

  try {
    const rows = await base44.entities[entityName].filter({ id: cleanId });
    if (Array.isArray(rows) && rows[0]) return rows[0];
  } catch {}

  try {
    const rows2 = await base44.entities[entityName].filter({ _id: cleanId });
    if (Array.isArray(rows2) && rows2[0]) return rows2[0];
  } catch {}

  return null;
}

async function fetchEntityMap(entityName, ids) {
  const map = new Map();
  const cleanIds = Array.from(new Set((ids || []).map(normId).filter(Boolean)));
  if (!cleanIds.length) return map;

  let rows = [];
  try {
    rows = await base44.entities[entityName].filter({ id: { in: cleanIds } });
  } catch {
    rows = [];
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
 * NOTE:
 * This function name stays the same to minimize churn, but it now keys off `seasonYear`
 * instead of a hard-coded `demoYear`.
 *
 * If you truly want "demo-only", this page will still show the lock banner, but the
 * data filter uses seasonYear (demo users -> demoYear; paid users -> currentYear).
 */
async function fetchDemoCampDetail({ campId, seasonYear }) {
  if (!campId || !seasonYear) return null;

  const camp = await fetchOneById("Camp", campId);
  if (!camp) return null;

  // Gate by the selected season year using camp.start_date (string YYYY-MM-DD)
  const start = `${Number(seasonYear)}-01-01`;
  const next = `${Number(seasonYear) + 1}-01-01`;
  const d = camp?.start_date;

  if (!(typeof d === "string" && d >= start && d < next)) return null;

  const schoolId = normId(camp.school_id) || camp.school_id || null;
  const sportId = normId(camp.sport_id) || camp.sport_id || null;
  const positionIds = Array.isArray(camp.position_ids)
    ? camp.position_ids.map(normId).filter(Boolean)
    : [];

  const [school, sport, posMap] = await Promise.all([
    schoolId ? fetchOneById("School", schoolId) : Promise.resolve(null),
    sportId ? fetchOneById("Sport", sportId) : Promise.resolve(null),
    positionIds.length ? fetchEntityMap("Position", positionIds) : Promise.resolve(new Map()),
  ]);

  const resolvedPositions = positionIds
    .map((pid) => posMap.get(pid))
    .filter(Boolean)
    .map((p) => ({
      position_id: normId(p),
      position_code: p.position_code,
      position_name: p.position_name,
    }));

  return {
    camp_id: normId(camp),
    camp_name: camp.camp_name,
    start_date: camp.start_date,
    end_date: camp.end_date || null,
    city: camp.city || null,
    state: camp.state || null,
    price: typeof camp.price === "number" ? camp.price : null,
    link_url: camp.link_url || null,
    notes: camp.notes || null,

    school_id: schoolId,
    school_name: pickSchoolName(school),
    school_division: pickSchoolDivision(school),
    school_logo_url: pickSchoolLogo(school),

    sport_id: sportId,
    sport_name: pickSportName(sport),

    positions: resolvedPositions,
  };
}

export default function CampDetailDemo() {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  // ✅ Standard hook usage
  const { isLoading, mode, hasAccess, seasonYear, currentYear, demoYear } =
    useSeasonAccess();

  const campId = useMemo(
    () => getCampIdFromAllSources({ params, location }),
    [params, location]
  );

  const goBackToDiscover = () => navigate(createPageUrl("Discover"));

  // ✅ Prevent identifier collision: alias query loading state
  const {
    data: detail,
    isLoading: detailLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["campDetail", campId, seasonYear],
    enabled: !!campId && !!seasonYear && !isLoading,
    queryFn: () => fetchDemoCampDetail({ campId, seasonYear }),
  });

  // persist last viewed camp id (helps navigation fallback)
  try {
    if (campId) sessionStorage.setItem("last_demo_camp_id", String(campId));
  } catch {}

  // dedupe viewed event per session
  const viewedKey = useMemo(
    () => (campId && seasonYear ? `evt_camp_detail_${seasonYear}_${campId}` : null),
    [campId, seasonYear]
  );
  const onceRef = useRef(false);

  useEffect(() => {
    if (onceRef.current) return;
    if (!detail) return;

    try {
      if (viewedKey && sessionStorage.getItem(viewedKey) === "1") return;
      if (viewedKey) sessionStorage.setItem(viewedKey, "1");
    } catch {}

    onceRef.current = true;

    trackEvent({
      event_name: "camp_detail_viewed",
      mode: mode || null,
      camp_id: detail.camp_id,
      school_id: detail.school_id,
      sport_id: detail.sport_id,
      positions: (detail.positions || []).map((p) => p.position_code).filter(Boolean),
      season_year: seasonYear,
      source: "camp_detail_demo",
      has_access: !!hasAccess,
    });
  }, [detail, viewedKey, seasonYear, mode, hasAccess]);

  // ✅ Access/season loading guard first
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // ✅ Then data loading
  if (detailLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-md mx-auto bg-white border border-rose-200 rounded-xl p-4 text-rose-700">
          <div className="font-semibold">Failed to load camp</div>
          <div className="text-xs mt-2 break-words">
            {String(error?.message || error)}
          </div>
          <Button
            className="w-full mt-4"
            variant="outline"
            onClick={goBackToDiscover}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Discover
          </Button>
        </div>
      </div>
    );
  }

  if (!campId) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-4 text-slate-700">
          <div className="font-semibold">Missing camp id.</div>
          <Button className="w-full mt-4" variant="outline" onClick={goBackToDiscover}>
            Back to Discover
          </Button>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-4 text-slate-700">
          <div className="font-semibold">Camp not found.</div>
          <div className="text-xs mt-2 text-slate-500">
            This camp may not be available for season <b>{seasonYear}</b>.
          </div>
          <div className="mt-4 space-y-2">
            <Button className="w-full" variant="outline" onClick={goBackToDiscover}>
              Back to Discover
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isDemo = mode === "demo";

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-md mx-auto p-4">
          <button
            onClick={goBackToDiscover}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
            type="button"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>

          {/* Keep demo banner, but key it correctly */}
          {isDemo && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 mb-4 flex items-start gap-2">
              <Lock className="w-4 h-4 mt-0.5" />
              <div className="text-sm">
                Demo camp from season <b>{demoYear}</b>. Subscribe to unlock the
                current season <b>{currentYear}</b>.
              </div>
            </div>
          )}

          <div className="flex items-start gap-4">
            {detail.school_logo_url && (
              <img
                src={detail.school_logo_url}
                alt={detail.school_name}
                className="w-16 h-16 rounded-xl object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {detail.school_division && (
                  <Badge
                    className={cn(
                      "text-xs",
                      divisionColors[detail.school_division] ||
                        "bg-slate-900 text-white"
                    )}
                  >
                    {detail.school_division}
                  </Badge>
                )}
                {detail.sport_name && (
                  <span className="text-xs text-slate-500 font-medium">
                    {detail.sport_name}
                  </span>
                )}
              </div>

              <h1 className="text-2xl font-bold text-deep-navy">
                {detail.school_name}
              </h1>
              <p className="text-slate-600">{detail.camp_name}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4">
            <Calendar className="w-5 h-5 text-slate-400 mb-2" />
            <p className="text-xs text-slate-500 uppercase tracking-wide">Date</p>
            <p className="font-semibold text-slate-900">
              {safeDate(detail.start_date)}
              {detail.end_date && detail.end_date !== detail.start_date && (
                <>
                  <br />
                  to {safeDate(detail.end_date)}
                </>
              )}
            </p>
          </div>

          {(detail.city || detail.state) && (
            <div className="bg-white rounded-xl p-4">
              <MapPin className="w-5 h-5 text-slate-400 mb-2" />
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Location
              </p>
              <p className="font-semibold text-slate-900">
                {[detail.city, detail.state].filter(Boolean).join(", ")}
              </p>
            </div>
          )}

          {detail.price != null && (
            <div className="bg-white rounded-xl p-4">
              <DollarSign className="w-5 h-5 text-slate-400 mb-2" />
              <p className="text-xs text-slate-500 uppercase tracking-wide">Cost</p>
              <p className="font-semibold text-slate-900">
                {detail.price > 0 ? `$${detail.price}` : "Free"}
              </p>
            </div>
          )}
        </div>

        {detail.notes && (
          <div className="bg-white rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
              About This Camp
            </p>
            <p className="text-slate-700 leading-relaxed">{detail.notes}</p>
          </div>
        )}

        <div className="space-y-3">
          {isDemo && (
            <Button
              className="w-full"
              onClick={() => {
                trackEvent({
                  event_name: "upgrade_intent_clicked",
                  mode: "demo",
                  season_year: seasonYear, // ✅ single source of truth
                  source: "camp_detail_demo",
                  camp_id: detail.camp_id,
                  school_id: detail.school_id,
                  sport_id: detail.sport_id,
                  positions: (detail.positions || [])
                    .map((p) => p.position_code)
                    .filter(Boolean),
                });

                navigate(
                  createPageUrl("Subscribe") +
                    `?force=1&source=camp_detail_demo&next=${encodeURIComponent(
                      createPageUrl("Discover")
                    )}`
                );
              }}
            >
              See Plan & Pricing
            </Button>
          )}

          {detail.link_url && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                trackEvent({
                  event_name: "demo_registration_site_clicked",
                  mode: mode || null,
                  season_year: seasonYear,
                  source: "camp_detail_demo",
                  camp_id: detail.camp_id,
                  school_id: detail.school_id,
                  sport_id: detail.sport_id,
                });
                window.open(detail.link_url, "_blank");
              }}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View Registration Site {isDemo ? "(Demo)" : ""}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
