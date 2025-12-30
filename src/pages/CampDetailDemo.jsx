import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
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

export default function CampDetailDemo() {
  const navigate = useNavigate();
  const { seasonYear, demoYear } = useSeasonAccess();

  const urlParams = new URLSearchParams(window.location.search);
  const campId = urlParams.get("id");

  const {
    data: campSummaries = [],
    isLoading,
    isError,
    error
  } = usePublicCampSummariesClient({
    seasonYear,
    enabled: true
  });

  const summary = useMemo(
    () => campSummaries.find((s) => s.camp_id === campId),
    [campSummaries, campId]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 text-rose-700">
        Failed to load demo camp: {String(error?.message || error)}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-6 text-slate-600">
        Demo camp not found.
        <div className="mt-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Header */}
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
                  <span className="text-xs text-slate-500 font-medium">
                    {summary.sport_name}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-deep-navy">{summary.school_name}</h1>
              <p className="text-slate-600">{summary.camp_name}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Key Details */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4">
            <Calendar className="w-5 h-5 text-slate-400 mb-2" />
            <p className="text-xs text-slate-500 uppercase tracking-wide">Date</p>
            <p className="font-semibold text-slate-900">
              {format(new Date(summary.start_date), "MMM d, yyyy")}
              {summary.end_date && summary.end_date !== summary.start_date && (
                <>
                  <br />to {format(new Date(summary.end_date), "MMM d, yyyy")}
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

          {summary.school_conference && (
            <div className="bg-white rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                Conference
              </p>
              <p className="font-semibold text-slate-900">{summary.school_conference}</p>
            </div>
          )}
        </div>

        {/* Positions */}
        {summary.position_codes?.length > 0 && (
          <div className="bg-white rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">Positions</p>
            <div className="flex flex-wrap gap-2">
              {summary.position_codes.map((code) => (
                <Badge key={code} variant="secondary" className="bg-slate-100">
                  {code}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {summary.notes && (
          <div className="bg-white rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
              About This Camp
            </p>
            <p className="text-slate-700 leading-relaxed">{summary.notes}</p>
          </div>
        )}

        {/* Actions (demo-safe) */}
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