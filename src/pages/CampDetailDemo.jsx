import React, { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Loader2, ArrowLeft, Calendar, MapPin, DollarSign, ExternalLink, Lock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { usePublicCampSummariesClient } from "@/components/hooks/usePublicCampSummariesClient";
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

function getCampIdFromAllSources({ params, location }) {
  // 1) Route param: /CampDetailDemo/:id or /CampDetailDemo/:camp_id
  const fromParams =
    normId(params?.id) ||
    normId(params?.camp_id) ||
    normId(params?.campId);

  // 2) Navigation state: navigate(url, { state: { camp_id } })
  const fromState =
    normId(location?.state?.camp_id) ||
    normId(location?.state?.id);

  // 3) Querystring: ?id=... or ?camp_id=...
  const sp = new URLSearchParams(location?.search || "");
  const fromQuery = normId(sp.get("id") || sp.get("camp_id") || sp.get("campId"));

  // 4) Session fallback (survives query stripping + refresh)
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

export default function CampDetailDemo() {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();

  const { seasonYear, demoYear } = useSeasonAccess();

  const campId = useMemo(
    () => getCampIdFromAllSources({ params, location }),
    [params, location]
  );

  // Always query demoYear for demo detail
  const {
    data: campSummaries = [],
    isLoading,
    isError,
    error
  } = usePublicCampSummariesClient({
    seasonYear: demoYear,
    enabled: true
  });

  const summary = useMemo(() => {
    if (!campId) return null;
    return (campSummaries || []).find((s) => normId(s?.camp_id) === campId);
  }, [campSummaries, campId]);

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
          <div className="text-xs mt-2 text-slate-500">
            This page accepts an id from:
            <ul className="list-disc pl-5 mt-1">
              <li>Querystring: ?id=... or ?camp_id=...</li>
              <li>Route param: /.../:id or /.../:camp_id</li>
              <li>Navigation state: navigate(url, {`{ state: { camp_id } }`})</li>
              <li>SessionStorage fallback: last_demo_camp_id</li>
            </ul>
          </div>

          <div className="mt-4 space-y-2">
            <Button className="w-full" variant="outline" onClick={() => navigate("/Discover")}>
              Go to Discover
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

  if (!summary) {
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

  // Optional: store the last resolved id too
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
            {summary.school_logo_url && (
              <img
                src={summary.school_logo_url}
                alt={summary.school_name}
                className="w-16 h-16 rounded-xl object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {summary.school_division && (
                  <Badge className={cn("text-xs", divisionColors[summary.school_division])}>
                    {summary.school_division}
                  </Badge>
                )}
                {summary.sport_name && (
                  <span className="text-xs text-slate-500 font-medium">{summary.sport_name}</span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-deep-navy">
                {summary.school_name || "Unknown School"}
              </h1>
              <p className="text-slate-600">{summary.camp_name || "Camp"}</p>
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
              {safeDate(summary.start_date)}
              {summary.end_date && summary.end_date !== summary.start_date && (
                <>
                  <br />to {safeDate(summary.end_date)}
                </>
              )}
            </p>
          </div>

          {(summary.city || summary.state) && (
            <div className="bg-white rounded-xl p-4">
              <MapPin className="w-5 h-5 text-slate-400 mb-2" />
              <p className="text-xs text-slate-500 uppercase tracking-wide">Location</p>
              <p className="font-semibold text-slate-900">
                {[summary.city, summary.state].filter(Boolean).join(", ")}
              </p>
            </div>
          )}

          {summary.price && (
            <div className="bg-white rounded-xl p-4">
              <DollarSign className="w-5 h-5 text-slate-400 mb-2" />
              <p className="text-xs text-slate-500 uppercase tracking-wide">Cost</p>
              <p className="font-semibold text-slate-900">${summary.price}</p>
            </div>
          )}
        </div>

        {summary.notes && (
          <div className="bg-white rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">About This Camp</p>
            <p className="text-slate-700 leading-relaxed">{summary.notes}</p>
          </div>
        )}

        <div className="space-y-3">
          <Button className="w-full" onClick={() => navigate("/signup")}>
            Unlock Current Season
          </Button>

          {summary.link_url && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(summary.link_url, "_blank")}
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
