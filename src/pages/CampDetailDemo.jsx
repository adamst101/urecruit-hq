import React, { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Loader2, ArrowLeft, Calendar, MapPin, DollarSign, ExternalLink, Lock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
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
function pickSportName(sp) {
  return sp?.sport_name || sp?.name || sp?.title || null;
}

function getCampIdFromAllSources({ params, location }) {
  const fromParams = normId(params?.id) || normId(params?.camp_id);
  const fromState = normId(location?.state?.camp_id) || normId(location?.state?.id);
  const sp = new URLSearchParams(location?.search || "");
  const fromQuery = normId(sp.get("id") || sp.get("camp_id"));

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

  // fallback per-id (Base44-safe)
  if (!Array.isArray(rows) || rows.length === 0) {
    rows = [];
    for (const id of cleanIds) {
      try {
        const one = await base44.entities[entityName].filter({ id });
        if (Array.isArray(one) && one[0]) rows.push(one[0]);
        else throw new Error("no match");
      } catch {
        try {
          const one2 = await base44.entities[entityName].filter({ _id: id });
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

async function fetchDemoCampDetail({ campId, demoYear }) {
  if (!campId || !demoYear) return null;

  // pull all camps (same as Discover)
  const campsAll = await base44.entities.Camp.filter({});
  const camps = Array.isArray(campsAll) ? campsAll : [];

  // normalize and year-filter same way as Discover
  const start = `${Number(demoYear)}-01-01`;
  const next = `${Number(demoYear) + 1}-01-01`;

  const campsNorm = camps
    .map((c) => ({
      ...c,
      camp_id: normId(c),
      school_id: normId(c.school_id) || c.school_id || null,
      sport_id: normId(c.sport_id) || c.sport_id || null
    }))
    .filter((c) => c.camp_id && typeof c.start_date === "string" && c.start_date >= start && c.start_date < next);

  const target = campsNorm.find((c) => c.camp_id === campId);
  if (!target) return null;

  const [schoolMap, sportMap] = await Promise.all([
    fetchEntityMap("School", [target.school_id]),
    fetchEntityMap("Sport", [target.sport_id])
  ]);

  const sch = target.school_id ? schoolMap.get(target.school_id) : null;
  const sp = target.sport_id ? sportMap.get(target.sport_id) : null;

  return {
    camp_id: target.camp_id,
    camp_name: target.camp_name,
    start_date: target.start_date,
    end_date: target.end_date || null,
    city: target.city || null,
    state: target.state || null,
    price: typeof target.price === "number" ? target.price : null,
    link_url: target.link_url || null,
    notes: target.notes || null,
    position_ids: Array.isArray(target.position_ids) ? target.position_ids : [],

    school_id: target.school_id,
    school_name: pickSchoolName(sch),
    school_division: pickSchoolDivision(sch),
    school_logo_url: sch?.logo_url || sch?.school_logo_url || null,

    sport_id: target.sport_id,
    sport_name: pickSportName(sp)
  };
}

export default function CampDetailDemo() {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const { demoYear } = useSeasonAccess();

  const campId = useMemo(() => getCampIdFromAllSources({ params, location }), [params, location]);

  const { data: detail, isLoading, isError, error } = useQuery({
    queryKey: ["demoCampDetail", campId, demoYear],
    enabled: !!campId && !!demoYear,
    queryFn: () => fetchDemoCampDetail({ campId, demoYear })
  });

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
            demoYear: <b>{demoYear}</b>
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

  // persist for refresh
  try {
    sessionStorage.setItem("last_demo_camp_id", String(campId));
  } catch {}

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
            <Button variant="outline" className="w-full" onClick={() => window.open(detail.link_url, "_blank")}>
              <ExternalLink className="w-4 h-4 mr-2" />
              View Registration Site (Demo)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
