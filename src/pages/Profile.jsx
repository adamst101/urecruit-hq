// src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, UserCircle2, ArrowRight, CheckCircle2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import RouteGuard from "../components/auth/RouteGuard";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sp] = useSearchParams();

  const { mode, accountId, currentYear } = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const nextUrl = useMemo(() => {
    const n = sp.get("next");
    return n ? String(n) : null;
  }, [sp]);

  const isPaid = mode === "paid";
  const hasProfile = !!athleteProfile;

  // If the user already has a profile, get them out of Profile fast.
  // Profile should be a setup page, not a landing page.
  useEffect(() => {
    if (!isPaid) return;
    if (!accountId) return;
    if (identityLoading) return;

    if (hasProfile) {
      const dest = nextUrl || createPageUrl("MyCamps");
      navigate(dest, { replace: true });
    }
  }, [isPaid, accountId, identityLoading, hasProfile, nextUrl, navigate]);

  const onCreateProfile = async () => {
    trackEvent({
      event_name: "profile_create_clicked",
      account_id: accountId || null,
      source: "profile",
      mode: mode || null
    });

    // IMPORTANT: This is intentionally minimal because Base44 schemas vary.
    // You likely already have a form-based profile creation flow.
    // If you don’t, we’ll add it next step.
    navigate(createPageUrl("Onboarding") + `?next=${encodeURIComponent(nextUrl || createPageUrl("MyCamps"))}`);
  };

  return (
    <RouteGuard requireAuth={true} requirePaid={true} requireProfile={false}>
      <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 p-4">
        <div className="max-w-md mx-auto pt-6 pb-24">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-deep-navy">Athlete Profile</h1>
              <p className="text-slate-600 text-sm mt-1">
                Set up your athlete to unlock the paid season workspace.
              </p>
            </div>
            <Badge variant="outline">Season {currentYear}</Badge>
          </div>

          <Card className="p-6 border-slate-200">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <UserCircle2 className="w-6 h-6 text-slate-500" />
              </div>

              <div className="flex-1">
                <div className="font-semibold text-deep-navy">Profile required</div>
                <div className="text-sm text-slate-600 mt-1">
                  Your paid account is active, but you haven’t created an athlete profile yet.
                </div>

                <div className="mt-4 space-y-2">
                  <Button className="w-full" onClick={onCreateProfile}>
                    Create Athlete Profile
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate(createPageUrl("Home"))}
                  >
                    Back to Home
                  </Button>
                </div>

                {hasProfile && (
                  <div className="mt-4 flex items-center gap-2 text-emerald-700 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Profile detected — routing you now…
                  </div>
                )}

                {identityLoading && (
                  <div className="mt-4 flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading profile…
                  </div>
                )}
              </div>
            </div>
          </Card>

          <div className="text-xs text-slate-500 mt-4">
            If you believe this is a mistake, confirm you’re logged in with the right email.
          </div>
        </div>
      </div>
    </RouteGuard>
  );
}
