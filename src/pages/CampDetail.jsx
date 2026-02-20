// src/pages/CampDetail.jsx
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  DollarSign,
  Star,
  CheckCircle2,
  Loader2
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
import { useDemoProfile } from "../components/hooks/useDemoProfile";

import { toggleDemoFavorite, isDemoFavorite } from "../components/hooks/demoFavorites";
import { isDemoRegistered, toggleDemoRegistered } from "../components/hooks/demoRegistered";

import RouteGuard from "../components/auth/RouteGuard";

const divisionColors = {
  "D1 (FBS)": "bg-amber-500 text-white",
  "D1 (FCS)": "bg-orange-500 text-white",
  D2: "bg-blue-600 text-white",
  D3: "bg-emerald-600 text-white",
  NAIA: "bg-purple-600 text-white",
  JUCO: "bg-slate-600 text-white"
};

function trackEvent(payload) {
  try {
    const EventEntity = base44?.entities?.Event || base44?.entities?.Events;
    if (!EventEntity?.create) return;

    const now = new Date();
    const iso = now.toISOString();
    const day = iso.slice(0, 10);
    const eventName =
      payload?.event_name || payload?.event_type || payload?.title || payload?.name || "event";
    const sourcePlatform = payload?.source_platform || payload?.source || "web";
    const title = payload?.title || String(eventName);
    const sourceKey =
      payload?.source_key || payload?.sourceKey || `${String(sourcePlatform)}:${String(eventName)}`;
    const startDate = payload?.start_date || day;

    EventEntity.create({
      source_platform: String(sourcePlatform),
      event_type: String(eventName),
      title: String(title),
      source_key: String(sourceKey),
      start_date: String(startDate),
      payload_json: JSON.stringify(payload || {}),
      ts: iso,
    });
  } catch {}
}

// --------------------
// Query-cache lookup (demo data source)
// --------------------
function findCampSummaryInCache(queryClient, campId) {
  try {
    const all = queryClient.getQueryCache().getAll();
    for (const q of all) {
      const data = q.state?.data;
      if (!data) continue;

      // Common patterns: array of summaries OR {data:[...]} OR {items:[...]}
      const arr =
        Array.isArray(data) ? data :
        Array.isArray(data?.data) ? data.data :
        Array.isArray(data?.items) ? data.items :
        null;

      if (!arr) continue;

      const hit = arr.find((x) => String(x?.camp_id) === String(campId));
      if (hit) return hit;
    }
  } catch {}
  return null;
}

function CampDetailInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const { mode, isLoading: accessLoading, seasonYear } = useSeasonAccess();
  const {
    athleteProfile,
    isLoading: identityLoading,
    isError: identityError,
    error: identityErrorObj
  } = useAthleteIdentity();

  const { demoProfileId } = useDemoProfile();
  const effectiveDemoProfileId = demoProfileId || "default";

  const campId = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    return params.get("id");
  }, [location.search]);

  const paid = mode === "paid";

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

  // Access loading: keep minimal skeleton (do not redirect anywhere)
  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // Identity loading: only relevant for paid (demo should not block on identity)
  if (paid && identityLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // Identity error (paid only)
  if (paid && identityError) {
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
                onClick={() =>
                  navigate(
                    createPageUrl("Profile") +
                      `?next=${encodeURIComponent(location.pathname + location.search)}`
                  )
                }
              >
                Go to Profile Setup
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Paid + Profile exists
  const athleteId = athleteProfile?.id || null;
  const sportId = athleteProfile?.sport_id || null;

  // Paid: load with client hook (authoritative)
  const paidSummariesQuery = useCampSummariesClient({
    athleteId,
    sportId,
    enabled: paid && !!athleteId
  });

  const paidSummaries = paidSummariesQuery?.data || [];

  // Determine summary:
  // - Paid: from hook
  // - Demo: from query cache (Discover already loaded)
  const baseSummary = useMemo(() => {
    if (paid) {
      return (paidSummaries || []).find((s) => String(s.camp_id) === String(campId)) || null;
    }
    return findCampSummaryInCache(queryClient, campId);
  }, [paid, paidSummaries, campId, queryClient]);

  // Overlay demo intent from shared stores (favorites + registered)
  const demoIsFav = !paid ? isDemoFavorite(effectiveDemoProfileId, campId) : false;
  const demoIsReg = !paid ? isDemoRegistered(effectiveDemoProfileId, campId) : false;

  const summary = useMemo(() => {
    if (!baseSummary) return null;

    if (!paid) {
      let intent_status = baseSummary.intent_status || "none";
      if (demoIsReg) intent_status = "registered";
      else if (demoIsFav) intent_status = "favorite";
      return { ...baseSummary, intent_status };
    }

    return baseSummary;
  }, [baseSummary, paid, demoIsFav, demoIsReg]);

  const invalidateSummaries = () => {
    // Paid: invalidate the known key
    queryClient.invalidateQueries({ queryKey: ["myCampsSummaries_client"] });

    // Demo: invalidate all so list refreshes (safe blunt instrument)
    if (!paid) queryClient.invalidateQueries();
  };

  // Mutations
  const toggleFavorite = useMutation({
    mutationFn: async () => {
      // DEMO: local-only using the SAME store as Discover
      if (!paid) {
        // registered in demo behaves like registered in paid: block favorite toggle
        if (isDemoRegistered(effectiveDemoProfileId, campId)) return;
        toggleDemoFavorite(effectiveDemoProfileId, campId);
        return;
      }

      // PAID: backend write
      const existing = await base44.entities.CampIntent.filter({
        athlete_id: athleteId,
        camp_id: campId
      });

      const intent = existing?.[0] || null;

      // registered/completed are not toggleable via favorite button
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
    onSuccess: () => {
      invalidateSummaries();
      trackEvent({
        event_name: "camp_favorite_toggled",
        mode: paid ? "paid" : "demo",
        season_year: seasonYear || null,
        camp_id: campId,
        athlete_id: athleteId || null
      });
    }
  });

  const registerCamp = useMutation({
    mutationFn: async () => {
      // DEMO: local-only register marker (no backend)
      if (!paid) {
        if (isDemoRegistered(effectiveDemoProfileId, campId)) return;
        toggleDemoRegistered(effectiveDemoProfileId, campId); // set true
        return;
      }

      // PAID: backend write
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
          priority: "high"
        });
        return;
      }

      // If already registered/completed, do nothing
      if (intent.status === "registered" || intent.status === "completed") return;

      await base44.entities.CampIntent.update(intent.id, { status: "registered" });
    },
    onSuccess: () => {
      invalidateSummaries();
      trackEvent({
        event_name: "camp_mark_registered",
        mode: paid ? "paid" : "demo",
        season_year: seasonYear || null,
        camp_id: campId,
        athlete_id: athleteId || null
      });
    }
  });

  // Paid query states
  if (paid && paidSummariesQuery?.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (paid && paidSummariesQuery?.isError) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-md mx-auto">
          <Card className="p-4 border-rose-200 bg-rose-50 text-rose-700">
            <div className="font-semibold">Failed to load camp detail</div>
            <div className="text-xs mt-2 break-words">
              {String(paidSummariesQuery?.error?.message || paidSummariesQuery?.error)}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // If not found (demo may not have cache yet)
  if (!summary) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-md mx-auto">
          <Card className="p-4">
            <div className="font-semibold text-deep-navy">Camp not found</div>
            <div className="text-sm text-slate-600 mt-1">
              {paid
                ? "This camp may not be available for your current sport filter or season."
                : "Open Discover first so demo camps load, then return to this camp."}
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

  const isFavorite = summary.intent_status === "favorite";
  const isRegistered = summary.intent_status === "registered" || summary.intent_status === "completed";

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
                  <Badge className={cn("text-xs", divisionColors[summary.school_division])}>
                    {summary.school_division}
                  </Badge>
                )}
                {summary.sport_name && (
                  <span className="text-xs text-slate-500 font-medium">{summary.sport_name}</span>
                )}
                {isRegistered && (
                  <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                    {paid ? "Registered" : "Registered (Demo)"}
                  </Badge>
                )}
                {!paid && <Badge className="bg-slate-100 text-slate-700 text-xs">Demo</Badge>}
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
                  : paid
                  ? "Toggle favorite"
                  : "Toggle favorite (demo: local only)"
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
        {!paid ? (
          <Card className="p-3 border-slate-200 bg-slate-50">
            <div className="text-xs text-slate-600">
              Demo mode: favorites and registrations are saved locally on this device (no account writes).
            </div>
          </Card>
        ) : null}

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
                <span className="font-medium">{summary.price > 0 ? `$${summary.price}` : "Free"}</span>
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
                {paid ? "Registering…" : "Saving…"}
              </>
            ) : isRegistered ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {paid ? "Registered" : "Registered (Demo)"}
              </>
            ) : paid ? (
              "Mark as Registered"
            ) : (
              "Mark as Registered (Demo)"
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

export default function CampDetail() {
  /**
   * Policy:
   * - Same screen for demo + paid
   * - RouteGuard enforces profile only when paid (per your implementation)
   */
  return (
    <RouteGuard requireProfile={true}>
      <CampDetailInner />
    </RouteGuard>
  );
}
