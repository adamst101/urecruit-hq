import React, { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Calendar, MapPin, DollarSign, ExternalLink, Lock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { base44 } from "@/api/base44Client";
import { useSeasonAccess } from "@/components/hooks/useSeasonAccess";

const divisionColors = {
  "D1 (FBS)": "bg-amber-500 text-white",
  "D1 (FCS)": "bg-orange-500 text-white",
  D2: "bg-blue-600 text-white",
  D3: "bg-emerald-600 text-white",
  NAIA: "bg-purple-600 text-white",
  JUCO: "bg-slate-600 text-white"
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
  return s?.division || s?.school_division || s?.division_code || s?.division_level || null;
}
function pickSchoolLogo(s) {
  return s?.logo_url || s?.school_logo_url || s?.logo || s?.image_url || null;
}
function pickSportName(sp) {
  return sp?.sport_name || sp?.name || sp?.title || null;
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

/**
 * Fetch one entity row by id with Base44-safe fallbacks.
 */
async function fetchOneById(entityName, id) {
  const cleanId = normId(id);
  if (!cleanId) return null;

  // Try id
  try {
    const rows = await base44.entities[entityName].filter({ id: cleanId });
    if (Array.isArray(rows) && rows[0]) return rows[0];
  } catch {}

  // Try _id
  try {
    const rows2 = await base44.entities[entityName].filter({ _id: cleanId });
    if (Array.isArray(rows2) && rows2[0]) return rows2[0];
  } catch {}

  return null;
}

/**
 * Demo detail should match Discover:
 * - fetch Camp by id
 * - ensure it belongs to demoYear (based on start_date)
 * - join School + Sport
 */
async function fetchDemoCampDetail({ campId, demoYear }) {
  if (!campId || !demoYear) return null;

  const camp = await fetchOneById("Camp", campId);
  if (!camp) return null;

  // Enforce demoYear membership like Discover does (string compare)
  const start = `${Number(demoYear)}-01-01`;
  const next = `${Number(demoYear) + 1}-01-01`;
  const d = camp?.start_date;

  if (!(typeof d === "string" && d >= start && d < next)) {
    // Camp exists but not in demoYear dataset
    return null;
  }

  const schoolId = normId(camp.school_id) || camp.school_id || null;
  const sportId = normId(camp.sport_id) || camp.sport_id || null;

  const [school, sport] = await Promise.all([
    schoolId ? fetchOneById("School", schoolId) : Promise.resolve(null),
    sportId ? fetchOneById("Sport", sportId) : Promise.resolve(null)
  ]);

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
    position_ids: Array.isArray(camp.position_ids) ? camp.position_ids : [],

    school_id: schoolId,
    school_name: pickSchoolName(school),
    school_division: pickSchoolDivision(school),
    school_logo_url: pickSchoolLogo(school),

    sport_id: sportId,
    sport_name: pickSportName(sport)
  };
}

export default function CampDetailDemo() {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const { demoYear, seasonYear } = useSeasonAccess();

  const campId = useMemo(() => getCampIdFromAllSources({ params, location }), [params, location]);

  const { data: detail, isLoading, isError, error } = useQuery({
    queryKey: ["demoCampDetail", campId, demoYear],
    enabled: !!campId && !!demoYear,
    queryFn: () => fetchDemoCampDetail({ campId, demoYear })
  });

  // Persist resolved id for refresh resilience
  try {
    if (campId) sessionStorage.setItem("last_demo_camp_id", String(campId));
  } catch {}

  if (isLoading) {
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
          <div className="font-semibold">Failed to load demo camp</div>
          <div className="text-xs mt-2 break-words">{String(error?.message || error)}</div>
          <Button className="w-full mt-4" variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
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
          <div className="mt-4 space-y-2">
            <Button className="w-full" variant="outline" onClick={() => navigate("/Discover")}>
              Back to Discover
            </Button>
            <Button className="w-full" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-4 text-slate-700">
          <div className="font-semibold">Demo camp not found.</div>
          <div className="text-xs mt-2 text-slate-500">
            Looking for camp_id: <span className="font-mono">{campId}</span>
            <br />
            demoYear: <b>{demoYear}</b> (seasonYear: <b>{seasonYear}</b>)
          </div>
          <div className="mt-4 space-y-2">
            <Button className="w-full" variant="outline" onClick={() => navigate("/Discover")}>
              Back to Discover
            </Button>
            <Button className="w-full" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-md mx-auto p-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>

          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 mb-4 flex items-start gap-2">
            <Lock className="w-4 h-4 mt-0.5" />
            <div className="text-sm">
              Demo camp from season <b>{demoYear}</b>. Sign up to unlock the current season.
            </div>
          </div>

          <div className="flex items-start gap-4">
            {detail.school_logo_url && (
              <img
                src={detail.school_logo_url}
                alt={detail.school_name}
                className="w-16 h-16 rounded-xl object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {detail.school_division && (
                  <Badge className={cn("text-xs", divisionColors[detail.school_division])}>
                    {detail.school_division}
                  </Badge>
                )}
                {detail.sport_name && (
                  <span className="text-xs text-slate-500 font-medium">{detail.sport_name}</span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-deep-navy">{detail.school_name}</h1>
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
                  <br />to {safeDate(detail.end_date)}
                </>
              )}
            </p>
          </div>

          {(detail.city || detail.state) && (
            <div className="bg-white rounded-xl p-4">
              <MapPin className="w-5 h-5 text-slate-400 mb-2" />
              <p className="text-xs text-slate-500 uppercase tracking-wide">Location</p>
              <p className="font-semibold text-slate-900">
                {[detail.city, detail.state].filter(Boolean).join(", ")}
              </p>
            </div>
          )}

          {detail.price && (
            <div className="bg-white rounded-xl p-4">
              <DollarSign className="w-5 h-5 text-slate-400 mb-2" />
              <p className="text-xs text-slate-500 uppercase tracking-wide">Cost</p>
              <p className="font-semibold text-slate-900">${detail.price}</p>
            </div>
          )}
        </div>

        {detail.notes && (
          <div className="bg-white rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">About This Camp</p>
            <p className="text-slate-700 leading-relaxed">{detail.notes}</p>
          </div>
        )}

        <div className="space-y-3">
          <Button className="w-full" onClick={() => navigate("/signup")}>
            Unlock Current Season
          </Button>

          {detail.link_url && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(detail.link_url, "_blank")}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View Registration Site (Demo)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
