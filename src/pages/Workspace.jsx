// src/pages/Workspace.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Search, User, ShieldCheck, ArrowRight } from "lucide-react";

import { createPageUrl } from "../utils";
import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

export default function Workspace() {
  const nav = useNavigate();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const loading = !!season?.isLoading || !!identityLoading;

  const isEntitled = !!season?.accountId && !!season?.hasAccess && !!season?.entitlement?.season_year;
  const entitledSeason = season?.entitlement?.season_year || null;

  const athleteId = useMemo(() => {
    const x = athleteProfile;
    if (!x) return null;
    if (typeof x === "string") return x;
    return x.id || x._id || x.uuid || null;
  }, [athleteProfile]);

  const showMemberPanel = isEntitled;

  useEffect(() => {
    const key = "evt_workspace_viewed_v1";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "workspace_viewed",
      account_id: season?.accountId || null,
      entitled: isEntitled ? 1 : 0,
      entitlement_season: entitledSeason || null,
      has_athlete_profile: athleteId ? 1 : 0
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season?.accountId, isEntitled, entitledSeason, athleteId]);

  // Optional: if you want Workspace to be “members only”, you can gate here.
  // For now, keep it accessible and simply show the right CTAs.

  const subtitle = showMemberPanel
    ? "Your home base after login — jump into Discover, Calendar, and your profile."
    : "Start with the demo or subscribe to unlock your season.";

  const profileCtaLabel = athleteId ? "View Profile" : "Add Athlete Profile";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-3xl font-extrabold text-deep-navy">Workspace</div>
            <div className="mt-1 text-sm text-slate-600">{subtitle}</div>

            <div className="mt-3 flex flex-wrap gap-2">
              {showMemberPanel ? (
                <>
                  <Badge className="bg-emerald-700 text-white">Member</Badge>
                  {entitledSeason ? (
                    <Badge className="bg-slate-900 text-white">Season {String(entitledSeason)}</Badge>
                  ) : null}
                </>
              ) : (
                <Badge className="bg-slate-900 text-white">Demo</Badge>
              )}
            </div>
          </div>

          {/* ✅ Removed duplicate Account button from Workspace page.
              The only Account button should come from Layout.jsx header. */}
        </div>

        <div className="mt-6 grid md:grid-cols-3 gap-4">
          {/* Discover */}
          <Card className="p-5 border-slate-200">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Search className="w-5 h-5 text-slate-700" />
              </div>
              <div className="flex-1">
                <div className="text-base font-bold text-deep-navy">Discover</div>
                <div className="mt-1 text-sm text-slate-600">
                  Browse camps for your season. Filter by position and school.
                </div>

                <div className="mt-4">
                  <Button
                    className="w-full"
                    onClick={() => {
                      trackEvent({ event_name: "workspace_click", target: "discover" });
                      nav(createPageUrl("Discover"));
                    }}
                    disabled={loading}
                  >
                    Go to Discover
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Calendar */}
          <Card className="p-5 border-slate-200">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <Calendar className="w-5 h-5 text-slate-700" />
              </div>
              <div className="flex-1">
                <div className="text-base font-bold text-deep-navy">Calendar</div>
                <div className="mt-1 text-sm text-slate-600">
                  See your plan and avoid date conflicts.
                </div>

                <div className="mt-4">
                  <Button
                    className="w-full"
                    onClick={() => {
                      trackEvent({ event_name: "workspace_click", target: "calendar" });
                      nav(createPageUrl("Calendar"));
                    }}
                    disabled={loading}
                  >
                    Go to Calendar
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* ✅ Setup -> Profile */}
          <Card className="p-5 border-slate-200">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <User className="w-5 h-5 text-slate-700" />
              </div>
              <div className="flex-1">
                <div className="text-base font-bold text-deep-navy">Profile</div>
                <div className="mt-1 text-sm text-slate-600">
                  Add athletes and set your profile.
                </div>

                <div className="mt-4">
                  <Button
                    className="w-full"
                    onClick={() => {
                      trackEvent({ event_name: "workspace_click", target: "profile" });
                      nav(createPageUrl("Profile"));
                    }}
                    disabled={loading}
                  >
                    {profileCtaLabel}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {showMemberPanel ? (
          <Card className="mt-5 p-5 border-slate-200">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-700 mt-0.5" />
              <div>
                <div className="font-semibold text-deep-navy">Member access is active</div>
                <div className="text-sm text-slate-600 mt-1">
                  You’re seeing current-season data based on your entitlement. Demo flags are ignored for members.
                </div>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
