// src/pages/Home.jsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Lock, Sparkles } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

export default function Home() {
  const navigate = useNavigate();
  const { mode, accountId, currentYear, demoYear } = useSeasonAccess();

  useEffect(() => {
    trackEvent({ event_name: "home_viewed", mode: mode === "paid" ? "paid" : "demo", season_year: currentYear });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAuthed = !!accountId;
  const isPaid = mode === "paid";

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="pt-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-deep-navy">RecruitMe</h1>
            <Badge className={isPaid ? "bg-emerald-600 text-white" : "bg-slate-900 text-white"}>
              {isPaid ? `Paid ${currentYear}` : `Demo ${demoYear}`}
            </Badge>
          </div>
          <p className="text-slate-600 mt-1">
            Plan camps across schools, dates, travel, and recruiting priorities — in one place.
          </p>
        </div>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-6 h-6 text-slate-700 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-deep-navy">Start with the demo</div>
              <div className="text-sm text-slate-600 mt-1">
                Browse prior-season camps ({demoYear}) to see how planning works.
              </div>
              <div className="mt-4">
                <Button
                  className="w-full"
                  onClick={() => {
                    trackEvent({ event_name: "home_demo_clicked", mode: "demo", season_year: demoYear });
                    navigate(createPageUrl("Discover"));
                  }}
                >
                  Browse Demo Camps
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <Lock className="w-6 h-6 text-amber-700 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900">Unlock current season</div>
              <div className="text-sm text-amber-900/80 mt-1">
                Upgrade to access {currentYear} camps + favorites + calendar planning.
              </div>
              <div className="mt-4 space-y-2">
                <Button
                  className="w-full"
                  onClick={() => {
                    trackEvent({ event_name: "home_subscribe_clicked", mode: "demo", season_year: currentYear });
                    navigate(createPageUrl("Subscribe"));
                  }}
                >
                  See Plan & Pricing
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    trackEvent({ event_name: "home_login_clicked", mode: "demo", season_year: currentYear });
                    // If you have a dedicated login flow, point it here.
                    // Otherwise send to Profile/Onboarding that triggers auth.
                    navigate(createPageUrl("Profile"));
                  }}
                >
                  Log In
                </Button>
              </div>
              <div className="mt-3 text-xs text-amber-900/70">
                One account can manage multiple athletes (multiple children).
              </div>
            </div>
          </div>
        </Card>

        {isAuthed && (
          <Card className="p-4">
            <div className="text-sm text-slate-700">
              You’re signed in.{" "}
              <button
                className="underline text-slate-900"
                onClick={() => navigate(createPageUrl("Discover"))}
              >
                Continue to Discover
              </button>
              .
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
