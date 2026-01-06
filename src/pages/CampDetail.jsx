// src/pages/CampDetail.jsx
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  DollarSign,
  Star,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";
import { cn } from "../lib/utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";

const divisionColors = {
  "D1 (FBS)": "bg-amber-500 text-white",
  "D1 (FCS)": "bg-orange-500 text-white",
  D2: "bg-blue-600 text-white",
  D3: "bg-emerald-600 text-white",
  NAIA: "bg-purple-600 text-white",
  JUCO: "bg-slate-600 text-white",
};

export default function CampDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // ✅ Standard hook usage (and fixes your old `loading:` destructure)
  const { isLoading: accessLoading, mode } = useSeasonAccess();

  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError,
    error: identityErrorObj,
  } = useAthleteIdentity();

  const campId = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    return params.get("id");
  }, [location.search]);

  /**
   * 🚫 DEMO GUARD
   * Demo/unpaid users must be routed to CampDetailDemo.
   */
  useEffect(() => {
    if (accessLoading) return;
    if (!campId) return;

    if (mode !== "paid") {
      navigate(createPageUrl(`CampDetailDemo?id=${campId}`), { replace: true });
    }
  }, [mode, accessLoading, campId, navigate]);

  /**
   * 🧭 PROFILE GUARD (paid users only)
   */
  useEffect(() => {
    if (accessLoading || identityLoading) return;
    if (mode !== "paid") return; // demo guard handles
    if (!athleteProfile) navigate(createPageUrl("Onboarding"), { replace: true });
  }, [mode, accessLoading, identityLoading, athleteProfile, navigate]);

  // Loading skeleton (avoid rendering paid content until guards resolve)
  if (accessLoading || identityLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // If demo, we render nothing (redirect effect will fire)
  if (mode !== "paid") return null;

  // Identity error
  if (identityError) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-md mx-auto">
          <Card className="p-4 border-rose-200 bg-rose-50 text-rose-700">
            <div className="font-semibold">Failed to load athlete profile</div>
            <div className="text-sm mt-1 break-words">
              {String(identityErrorObj?.message || identityErrorObj)}
            </div>
            <div className="mt-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => navigate(createPageUrl("Discover"))}
              >
                Back to Discover
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // No campId
  if (!campId) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-md mx-auto">
          <Card className="p-4">
            <div className="font-semibold text-deep-navy">Missing camp id</div>
            <div className="text-sm text-slate-600 mt-1">
              This page requires a camp id query param: <code>?id=...</code>
            </div>
            <div className="mt-4">
              <Button className="w-full" onClick={() => navigate(createPageUrl("Discover"))}>
                Go to Discover
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Paid + Profile exists
  const athleteId = athleteProfile?.id;
  const sportId = athleteProfile?.sport_id;

  const {
    data: summaries = [],
    isLoading: summariesLoading,
    isError: summariesError,
    error: summariesErrorObj,
  } = useCampSummariesClient({
    athleteId,
    sportId,
    enabled: !!athleteId,
  });

  const summary = useMemo(() => {
    return (summaries || []).find((s) => String(s.camp_id) === String(campId)) || null;
  }, [summaries, campId]);

  // Mutations (consistent keys)
  const invalidateSummaries = () => {
    queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });
  };

  const toggleFavorite = useMutation({
    mutationFn: async () => {
      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteId,
        camp_id: campId,
      });

      const intent = existing?.[0] || null;

      // registered/completed are not toggleable via favorite button
      if (intent?.status === "registered" || intent?.status === "completed") return;

      if (!intent) {
        await base44.entities.CampIntent.create({
          athlete_id: athleteId,
          camp_id: campId,
          status: "favorite",
          priority: "medium",
        });
        return;
      }

      const intentId = intent.id || intent._id || intent.uuid;
      if (!intentId) return;

      if (intent.status === "favorite") {
        await base44.entities.CampIntent.update(intentId, { status: "removed" });
      } else {
        await base44.entities.CampIntent.update(intentId, { status: "favorite" });
      }
    },
    onSuccess: invalidateSummaries,
  });

  const registerCamp = useMutation({
    mutationFn: async () => {
      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteId,
        camp_id: campId,
      });

      const intent = existing?.[0] || null;

      if (!intent) {
        await base44.entities.CampIntent.create({
          athlete_id: athleteId,
          camp_id: campId,
          status: "registered",
          priority: "high",
        });
        return;
      }

      // If already registered/completed, do nothing
      if (intent.status === "registered" || intent.status === "completed") return;

      const intentId = intent.id || intent._id || intent.uuid;
      if (!intentId) return;

      await base44.entities.CampIntent.update(intentId, { status: "registered" });
    },
    onSuccess: invalidateSummaries,
  });

  if (summariesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (summariesError) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-md mx-auto">
          <Card className="p-4 border-rose-200 bg-rose-50 text-rose-700">
            <div className="font-semibold">Failed to load camp detail</div>
            <div className="text-xs mt-2 break-words">
              {String(summariesErrorObj?.message || summariesErrorObj)}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-md mx-auto">
          <Card className="p-4">
            <div className="font-semibold text-deep-navy">Camp not found</div>
            <div className="text-sm text-slate-600 mt-1">
              This camp may not be available for your current sport filter or season.
            </div>
            <div className="mt-4">
              <Button className="w-full" onClick={() => navigate(createPageUrl("Discover"))}>
                Back to Discover
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const isFavorite = summary.intent_status === "favorite";
  const isRegistered =
    summary.intent_status === "registered" || summary.intent_status === "completed";

  const startDate = summary.start_date ? new Date(summary.start_date) : null;
  const endDate = summary.end_date ? new Date(summary.end_date) : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <button
            onClick={() => navigate(createPageUrl("Discover"))}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-3"
            type="button"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {summary.school_division && (
                  <Badge
                    className={cn(
                      "text-xs",
                      divisionColors[summary.school_division] || "bg-slate-900 text-white"
                    )}
                  >
                    {summary.school_division}
                  </Badge>
                )}
                {summary.sport_name && (
                  <span className="text-xs text-slate-500 font-medium">
                    {summary.sport_name}
                  </span>
                )}
                {isRegistered && (
                  <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                    Registered
                  </Badge>
                )}
              </div>

              <h1 className="text-xl font-bold text-deep-navy truncate">
                {summary.school_name || "Unknown School"}
              </h1>
              <div className="text-sm text-slate-600">{summary.camp_name}</div>
            </div>

            <button
              onClick={() => toggleFavorite.mutate()}
              className={cn(
                "p-2 rounded-full transition-all",
                isFavorite
                  ? "bg-rose-50 text-rose-500"
                  : "bg-slate-50 text-slate-400 hover:text-slate-700"
              )}
              disabled={toggleFavorite.isPending || isRegistered}
              title={
                isRegistered
                  ? "Registered camps cannot be favorited/removed here"
                  : "Toggle favorite"
              }
              type="button"
            >
              <Star className={cn("w-5 h-5", isFavorite && "fill-current")} />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-md mx-auto p-4 space-y-4">
        <Card className="p-4">
          <div className="space-y-3">
            {startDate && (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>
                  {format(startDate, "MMM d, yyyy")}
                  {endDate && summary.end_date !== summary.start_date
                    ? ` – ${format(endDate, "MMM d, yyyy")}`
                    : ""}
                </span>
              </div>
            )}

            {(summary.city || summary.state) && (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span>{[summary.city, summary.state].filter(Boolean).join(", ")}</span>
              </div>
            )}

            {summary.price != null && (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <DollarSign className="w-4 h-4 text-slate-400" />
                <span className="font-medium">
                  {Number(summary.price) > 0 ? `$${summary.price}` : "Free"}
                </span>
              </div>
            )}

            {Array.isArray(summary.position_codes) && summary.position_codes.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {summary.position_codes.slice(0, 8).map((code, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full"
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        {summary.notes && (
          <Card className="p-4">
            <div className="text-sm font-semibold text-deep-navy mb-2">Notes</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{summary.notes}</div>
          </Card>
        )}

        <div className="space-y-2">
          <Button
            className="w-full"
            onClick={() => registerCamp.mutate()}
            disabled={isRegistered || registerCamp.isPending}
          >
            {registerCamp.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Registering…
              </>
            ) : isRegistered ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Registered
              </>
            ) : (
              "Mark as Registered"
            )}
          </Button>

          {summary.link_url && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(summary.link_url, "_blank")}
            >
              Open Camp Link
            </Button>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
