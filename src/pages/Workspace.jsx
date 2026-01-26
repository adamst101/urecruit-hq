// src/pages/Workspace.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Search, User, Shield } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

// --- tiny helpers ---
function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

async function safeMe() {
  try {
    const me = await base44.auth.me();
    return me || null;
  } catch {
    return null;
  }
}

export default function Workspace() {
  const nav = useNavigate();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const athleteId = useMemo(() => normId(athleteProfile), [athleteProfile]);

  const [meEmail, setMeEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await safeMe();
      if (cancelled) return;
      setMeEmail(String(me?.email || me?.user_metadata?.email || "").toLowerCase());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // MVP admin allowlist (edit as needed)
  const isAdmin = useMemo(() => {
    const allow = [
      "tom_adams_tx@live.com",
      "tom.adams101@gmail.com"
    ];
    return !!meEmail && allow.includes(meEmail);
  }, [meEmail]);

  const loading = !!season?.isLoading || !!identityLoading;

  const isMember = !!season?.accountId && !!season?.hasAccess && !!season?.entitlement;
  const memberSeason = Number(season?.entitlement?.season_year) || season?.seasonYear || null;

  if (loading) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="max-w-5xl mx-auto px-4 pt-8">
        <div className="mb-4">
          <div className="text-3xl font-extrabold text-brand">Workspace</div>
          <div className="text-sm text-slate-600 mt-1">
            Your home base after login — jump into Discover, Calendar, and Profile.
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {isMember ? (
              <Badge className="bg-emerald-700 text-white">Member</Badge>
            ) : (
              <Badge className="bg-slate-900 text-white">Demo</Badge>
            )}

            {memberSeason ? (
              <Badge className="bg-white text-slate-700 border border-slate-200">
                Season {memberSeason}
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Primary tiles */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 font-semibold text-deep-navy">
              <Search className="w-4 h-4" />
              Discover
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Browse camps for your season. Filter by position and school.
            </div>
            <div className="mt-4">
              <Button className="w-full btn-brand" onClick={() => nav(createPageUrl("Discover"))}>
                Go to Discover
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 font-semibold text-deep-navy">
              <CalendarDays className="w-4 h-4" />
              Calendar
            </div>
            <div className="mt-1 text-sm text-slate-600">
              See your plan and avoid date conflicts.
            </div>
            <div className="mt-4">
              <Button className="w-full btn-brand" onClick={() => nav(createPageUrl("Calendar"))}>
                Go to Calendar
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 font-semibold text-deep-navy">
              <User className="w-4 h-4" />
              Profile
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Add athletes and manage your athlete profile setup.
            </div>
            <div className="mt-4">
              <Button className="w-full btn-brand" onClick={() => nav(createPageUrl("Profile"))}>
                {athleteId ? "View Profile" : "Create Athlete Profile"}
              </Button>
            </div>
          </Card>
        </div>

        {/* Status callout */}
        <Card className="mt-4 p-4 border-slate-200 bg-white">
          {isMember ? (
            <div className="text-sm text-slate-700">
              <b>Member access is active.</b>{" "}
              You’re seeing current-season data based on your entitlement. Demo flags are ignored for members.
            </div>
          ) : (
            <div className="text-sm text-slate-700">
              <b>You’re in demo mode.</b>{" "}
              You can browse prior-season camps. To unlock the current season and save planning items, subscribe.
            </div>
          )}
        </Card>

        {/* Admin tools (only for allowlisted accounts) */}
        {isAdmin ? (
          <div className="mt-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Shield className="w-4 h-4" />
              Admin tools
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <Card className="p-5">
                <div className="font-semibold text-deep-navy">Admin Import</div>
                <div className="mt-1 text-sm text-slate-600">
                  Promote CampDemo → Camp, validate seed fields, and run ingestion utilities.
                </div>
                <div className="mt-4">
                  <Button variant="outline" className="w-full" onClick={() => nav(createPageUrl("AdminImport"))}>
                    Go to Admin Import
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
