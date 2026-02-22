// src/pages/MyCamps.jsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";

import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import BottomNav from "../components/navigation/BottomNav";
import RouteGuard from "../components/auth/RouteGuard";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import { useAthleteIdentity } from "../components/useAthleteIdentity";
import { useCampSummariesClient } from "../components/hooks/useCampSummariesClient";
import { base44 } from "../api/base44Client";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

function normLower(x) {
  return String(x || "").trim().toLowerCase();
}

function MyCampsPage() {
  const navigate = useNavigate();
  const { currentYear } = useSeasonAccess();
  const { athleteProfile } = useAthleteIdentity();

  const athleteId = normId(athleteProfile);
  const sportId = normId(athleteProfile?.sport_id) || athleteProfile?.sport_id;

  // Only fetch diagnostics on demand (prevents rate-limit spikes)
  const [diag, setDiag] = useState({ loading: false, loaded: false, count: 0, favorites: 0, registered: 0, err: "" });

  const { data, isLoading, isError, error, refetch } = useCampSummariesClient({
    athleteId: athleteId ? String(athleteId) : undefined,
    sportId: sportId ? String(sportId) : "",
    enabled: !!athleteId,
  });

  const campSummaries = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const registered = useMemo(() => {
    return campSummaries.filter((c) => {
      const st = normLower(c?.intent_status);
      return st === "registered" || st === "completed";
    });
  }, [campSummaries]);

  const favorites = useMemo(() => {
    return campSummaries.filter((c) => normLower(c?.intent_status) === "favorite");
  }, [campSummaries]);

  async function runDiagnostics() {
    if (!athleteId) return;
    setDiag({ loading: true, loaded: false, count: 0, favorites: 0, registered: 0, err: "" });

    try {
      const Intent = base44?.entities?.CampIntent;
      if (!Intent?.filter) throw new Error("CampIntent not available");

      const rows = await Intent.filter({ athlete_id: String(athleteId) });
      const arr = Array.isArray(rows) ? rows : [];
      const fav = arr.filter((r) => normLower(r?.status) === "favorite").length;
      const reg = arr.filter((r) => ["registered", "completed"].includes(normLower(r?.status))).length;

      setDiag({ loading: false, loaded: true, count: arr.length, favorites: fav, registered: reg, err: "" });
    } catch (e) {
      setDiag({ loading: false, loaded: true, count: 0, favorites: 0, registered: 0, err: String(e?.message || e) });
    }
  }

  if (isLoading) {
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
          <div className="font-semibold">Failed to load My Camps</div>
          <div className="text-xs mt-2 break-words">{String(error?.message || error)}</div>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="w-full" onClick={() => refetch()}>
              Retry
            </Button>
            <Button className="w-full" onClick={() => navigate(createPageUrl("Discover"))}>
              Back to Discover
            </Button>
          </div>
        </Card>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-md mx-auto p-4">
          <h1 className="text-2xl font-bold text-deep-navy">My Camps</h1>
          <div className="text-sm text-slate-600 mt-1">Current season ({currentYear}).</div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        {registered.length === 0 && favorites.length === 0 && (
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-slate-600 mt-0.5" />
              <div>
                <div className="font-semibold text-deep-navy">No camps yet</div>
                <div className="text-sm text-slate-600 mt-1">
                  Favorite or register for camps in Discover to see them here.
                </div>

                <div className="mt-4 flex gap-2">
                  <Button className="w-full" onClick={() => navigate(createPageUrl("Discover"))}>
                    Go to Discover
                  </Button>
                  <Button variant="outline" className="w-full" onClick={runDiagnostics} disabled={diag.loading}>
                    {diag.loading ? "Checking…" : "Troubleshoot"}
                  </Button>
                </div>

                {diag.loaded && (
                  <div className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    {diag.err ? (
                      <>
                        <div className="font-semibold">Diagnostics failed</div>
                        <div className="mt-1 break-words">{diag.err}</div>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold">Intent status</div>
                        <div className="mt-1">
                          Intents: {diag.count} • Favorites: {diag.favorites} • Registered: {diag.registered}
                        </div>
                        <div className="mt-2">
                          If intents &gt; 0 but this page is empty, your Camp IDs likely changed after a promotion rerun.
                          Next fix is to store event_key in intents (stable) and re-favorite once.
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

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
      </div>

      <BottomNav />
    </div>
  );
}

export default function MyCamps() {
  return (
    <RouteGuard requireAuth={true} requirePaid={true} requireProfile={true}>
      <MyCampsPage />
    </RouteGuard>
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
    </Card>
  );
}