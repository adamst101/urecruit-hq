// src/pages/Calendar.jsx
import React, { useMemo } from "react";
import { Loader2, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { createPageUrl } from "../utils";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import BottomNav from "../components/navigation/BottomNav";
import RouteGuard from "../components/auth/RouteGuard";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { useDemoProfile } from "../components/hooks/useDemoProfile";

/**
 * CalendarPage
 * - Paid: shows current season camps (from client-composed summaries)
 * - Demo: lightweight placeholder (until you build demo calendar overlays)
 *
 * Wrapper policy:
 * - requireChild=true: if authed AND no athlete -> RouteGuard will force Profile
 * - demo users can still browse calendar placeholder
 */
function CalendarPage() {
  const navigate = useNavigate();
  const { mode, currentYear } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading, isError: identityError, error } = useAthleteIdentity();
  const { demoProfileId } = useDemoProfile();

  const isPaid = mode === "paid";
  const athleteId = athleteProfile?.id;
  const sportId = athleteProfile?.sport_id;

  const paidQuery = useCampSummariesClient({
    athleteId,
    sportId,
    enabled: isPaid && !!athleteId
  });

  const loading = (isPaid && (identityLoading || paidQuery.isLoading));
  const isError = (isPaid && (identityError || paidQuery.isError));
  const errObj = error || paidQuery.error;

  const camps = useMemo(() => {
    if (!isPaid) return [];
    const rows = paidQuery.data || [];
    return Array.isArray(rows) ? rows : [];
  }, [isPaid, paidQuery.data]);

  const registered = useMemo(() => {
    return camps.filter((c) => c.intent_status === "registered" || c.intent_status === "completed");
  }, [camps]);

  const favorites = useMemo(() => {
    return camps.filter((c) => c.intent_status === "favorite");
  }, [camps]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 pb-20">
        <Card className="max-w-md mx-auto p-4 border-rose-200 bg-rose-50 text-rose-700">
          <div className="font-semibold">Failed to load Calendar</div>
          <div className="text-xs mt-2 break-words">{String(errObj?.message || errObj)}</div>
          <Button className="w-full mt-4" onClick={() => navigate(createPageUrl("Discover"))}>
            Back to Discover
          </Button>
        </Card>
        <BottomNav />
      </div>
    );
  }

  // -----------------------------
  // DEMO Calendar (placeholder)
  // -----------------------------
  if (!isPaid) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20">
        <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="max-w-md mx-auto p-4">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-deep-navy">Calendar</h1>
              <Badge className="bg-slate-900 text-white">Demo</Badge>
            </div>
            <div className="text-sm text-slate-600 mt-1">
              Calendar overlays are part of the Season Pass experience.
            </div>
          </div>
        </div>

        <div className="max-w-md mx-auto p-4 space-y-3">
          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-amber-900">Upgrade to unlock Calendar</div>
                <div className="text-sm text-amber-900/80 mt-1">
                  See your favorites + registrations as a schedule and spot conflicts.
                </div>

                <div className="mt-3">
                  <Button
                    className="w-full"
                    onClick={() => navigate(createPageUrl("Subscribe") + `?source=calendar_demo`)}
                  >
                    See Plan & Pricing
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-slate-600">
              Demo profile: <span className="font-medium">{demoProfileId || "default"}</span>
            </div>
          </Card>
        </div>

        <BottomNav />
      </div>
    );
  }

  // -----------------------------
  // PAID Calendar (simple list view)
  // -----------------------------
  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-deep-navy">Calendar</h1>
            <Badge className="bg-emerald-600 text-white">Current {currentYear}</Badge>
          </div>
          <div className="text-sm text-slate-600 mt-1">
            Your registered and favorited camps (overlay UI can come next).
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        {registered.length === 0 && favorites.length === 0 ? (
          <Card className="p-4">
            <div className="font-semibold text-deep-navy">Nothing to schedule yet</div>
            <div className="text-sm text-slate-600 mt-1">
              Favorite or register for camps in Discover to see them here.
            </div>
            <Button className="w-full mt-4" onClick={() => navigate(createPageUrl("Discover"))}>
              Go to Discover
            </Button>
          </Card>
        ) : (
          <>
            {registered.length > 0 && (
              <Section title="Registered">
                {registered.map((c) => (
                  <CampRow key={c.camp_id} camp={c} />
                ))}
              </Section>
            )}

            {favorites.length > 0 && (
              <Section title="Favorites">
                {favorites.map((c) => (
                  <CampRow key={c.camp_id} camp={c} />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-600 mb-2">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CampRow({ camp }) {
  return (
    <Card className="p-3">
      <div className="font-semibold text-deep-navy">{camp.school_name || "Unknown School"}</div>
      <div className="text-sm text-slate-600">{camp.camp_name || "Camp"}</div>
      {(camp.start_date || camp.state || camp.city) && (
        <div className="text-xs text-slate-500 mt-1">
          {[camp.start_date, [camp.city, camp.state].filter(Boolean).join(", ")].filter(Boolean).join(" • ")}
        </div>
      )}
    </Card>
  );
}

export default function Calendar() {
  // ✅ Same wrapper policy as Discover:
  // - Demo users can still see the (locked) calendar page
  // - Paid users must have an athlete profile before using Calendar
  return (
    <RouteGuard
      requireAuth={false}
      requireSub={false}
      requireChild={true}
      allowProfileWithoutSub={true}
    >
      <CalendarPage />
    </RouteGuard>
  );
}
