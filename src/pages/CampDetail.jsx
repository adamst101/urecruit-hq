import React, { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  MapPin,
  DollarSign,
  ExternalLink,
  Star,
  CheckCircle,
  ArrowLeft,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

import { useAthleteIdentity } from "@/components/useAthleteIdentity";
import { useCampSummariesClient } from "@/components/hooks/useCampSummariesClient";

const divisionColors = {
  "D1 (FBS)": "bg-amber-500 text-white",
  "D1 (FCS)": "bg-orange-500 text-white",
  D2: "bg-blue-600 text-white",
  D3: "bg-emerald-600 text-white",
  NAIA: "bg-purple-600 text-white",
  JUCO: "bg-slate-600 text-white"
};

export default function CampDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  const campId = urlParams.get("id");

  // -----------------------------
  // Identity (single source of truth)
  // -----------------------------
  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError,
    error: identityErrorObj
  } = useAthleteIdentity();

  const athleteId = athleteProfile?.id;
  const athleteSportId = athleteProfile?.sport_id;

  // -----------------------------
  // Shared read model
  // -----------------------------
  const {
    data: campSummaries = [],
    isLoading: campsLoading,
    isError: campsError,
    error: campsErrorObj
  } = useCampSummariesClient({
    athleteId,
    sportId: athleteSportId,
    enabled: !!athleteId && !identityLoading && !identityError
  });

  const summary = useMemo(
    () => campSummaries.find((s) => s.camp_id === campId),
    [campSummaries, campId]
  );

  // -----------------------------
  // Mutations (write-only)
  // -----------------------------
  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      if (!athleteId || !campId) return;

      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteId,
        camp_id: campId
      });

      const intent = existing?.[0] || null;

      if (!intent) {
        await base44.entities.CampIntent.create({
          athlete_id: athleteId,
          camp_id: campId,
          status: "favorite"
        });
        return;
      }

      if (intent.status === "favorite") {
        await base44.entities.CampIntent.update(intent.id, { status: "removed" });
      } else if (intent.status !== "registered" && intent.status !== "completed") {
        await base44.entities.CampIntent.update(intent.id, { status: "favorite" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });
    }
  });

  const toggleRegistrationMutation = useMutation({
    mutationFn: async () => {
      if (!athleteId || !campId) return;

      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteId,
        camp_id: campId
      });

      const intent = existing?.[0] || null;

      if (!intent) {
        await base44.entities.CampIntent.create({
          athlete_id: athleteId,
          camp_id: campId,
          status: "registered",
          registration_confirmed: true
        });
        return;
      }

      if (intent.status === "registered") {
        await base44.entities.CampIntent.update(intent.id, {
          status: "completed"
        });
      } else if (intent.status === "completed") {
        await base44.entities.CampIntent.update(intent.id, {
          status: "removed"
        });
      } else {
        await base44.entities.CampIntent.update(intent.id, {
          status: "registered",
          registration_confirmed: true
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });
    }
  });

  // -----------------------------
  // Render guards
  // -----------------------------
  if (identityLoading || campsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (identityError || campsError) {
    return (
      <div className="p-6 text-rose-700">
        {String(identityErrorObj || campsErrorObj)}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-6 text-slate-600">
        Camp not found or no longer available.
      </div>
    );
  }

  const isFavorite = summary.intent_status === "favorite";
  const isRegistered =
    summary.intent_status === "registered" ||
    summary.intent_status === "completed";

  // -----------------------------
  // UI
  // -----------------------------
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
              <h1 className="text-2xl font-bold text-deep-navy">
                {summary.school_name}
              </h1>
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
              {summary.end_date &&
                summary.end_date !== summary.start_date && (
                  <>
                    <br />to {format(new Date(summary.end_date), "MMM d, yyyy")}
                  </>
                )}
            </p>
          </div>

          {(summary.city || summary.state) && (
            <div className="bg-white rounded-xl p-4">
              <MapPin className="w-5 h-5 text-slate-400 mb-2" />
              <p className="text-xs text-slate-500 uppercase tracking-wide">
                Location
              </p>
              <p className="font-semibold text-slate-900">
                {[summary.city, summary.state].filter(Boolean).join(", ")}
              </p>
            </div>
          )}

          {summary.price && (
            <div className="bg-white rounded-xl p-4">
              <DollarSign className="w-5 h-5 text-slate-400 mb-2" />
              <p className="text-xs text-slate-500 uppercase tracking-wide">Cost</p>
              <p className="font-semibold text-slate-900">
                ${summary.price}
              </p>
            </div>
          )}

          {summary.school_conference && (
            <div className="bg-white rounded-xl p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                Conference
              </p>
              <p className="font-semibold text-slate-900">
                {summary.school_conference}
              </p>
            </div>
          )}
        </div>

        {/* Positions */}
        {summary.position_codes?.length > 0 && (
          <div className="bg-white rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">
              Positions
            </p>
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

        {/* Status */}
        {isRegistered && (
          <div className="flex items-center gap-2 p-4 bg-emerald-50 rounded-xl text-emerald-700">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">
              You’re{" "}
              {summary.intent_status === "completed"
                ? "completed"
                : "registered"}{" "}
              for this camp
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button
            variant="outline"
            className={cn(
              "w-full",
              isFavorite &&
                "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
            )}
            onClick={() => toggleFavoriteMutation.mutate()}
            disabled={toggleFavoriteMutation.isPending}
          >
            <Star className={cn("w-4 h-4 mr-2", isFavorite && "fill-current")} />
            {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          </Button>

          <Button
            className={cn(
              "w-full",
              isRegistered
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-electric-blue hover:bg-deep-navy"
            )}
            onClick={() => toggleRegistrationMutation.mutate()}
            disabled={toggleRegistrationMutation.isPending}
          >
            {summary.intent_status === "completed"
              ? "Mark as Incomplete"
              : isRegistered
              ? "Mark as Completed"
              : "Mark as Registered"}
          </Button>

          {summary.link_url && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(summary.link_url, "_blank")}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to Registration Site
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
