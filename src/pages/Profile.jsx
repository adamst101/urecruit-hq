// src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, UserCircle2, ArrowRight, CheckCircle2 } from "lucide-react";

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

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, accountId, currentYear, demoYear } = useSeasonAccess();

  const postPurchase = !!location?.state?.postPurchase;
  const isAuthed = !!accountId;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [athletes, setAthletes] = useState([]);
  const [activeAthleteId, setActiveAthleteId] = useState(null);

  const [newName, setNewName] = useState("");
  const [newSportId, setNewSportId] = useState("");
  const [saving, setSaving] = useState(false);

  const badge = useMemo(() => {
    if (!isAuthed) return <Badge className="bg-slate-900 text-white">Demo {demoYear}</Badge>;
    if (mode === "paid") return <Badge className="bg-emerald-600 text-white">Paid {currentYear}</Badge>;
    return <Badge className="bg-amber-500 text-white">Unpaid</Badge>;
  }, [isAuthed, mode, currentYear, demoYear]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setErr("");
      setLoading(true);

      try {
        if (!isAuthed) {
          if (mounted) {
            setAthletes([]);
            setActiveAthleteId(null);
          }
          return;
        }

        // Load athletes for this account
        const rows = await base44.entities.Athlete.filter({ account_id: accountId });
        const list = Array.isArray(rows) ? rows : [];

        // Load account active athlete id (optional)
        let acct = null;
        try {
          const a = await base44.entities.Account.filter({ id: accountId });
          acct = Array.isArray(a) ? a[0] : null;
        } catch {}

        const active = normId(acct?.active_athlete_id) || normId(list[0]);

        if (mounted) {
          setAthletes(list);
          setActiveAthleteId(active);
        }
      } catch (e) {
        if (mounted) setErr(String(e?.message || e));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [accountId, isAuthed]);

  const enforceCreateAthlete = postPurchase && mode === "paid" && isAuthed && athletes.length === 0;

  const setActive = async (athleteId) => {
    const id = normId(athleteId);
    if (!id) return;

    setActiveAthleteId(id);
    try {
      await base44.entities.Account.update(accountId, { active_athlete_id: id });
      trackEvent({ event_name: "active_athlete_set", mode: "paid", season_year: currentYear });
    } catch {}
  };

  const addAthlete = async () => {
    const name = newName.trim();
    if (!name) return;

    setSaving(true);
    setErr("");
    try {
      const created = await base44.entities.Athlete.create({
        account_id: accountId,
        athlete_name: name,
        sport_id: newSportId || null
      });

      const createdId = normId(created) || normId(created?.id);

      const next = [created, ...athletes].filter(Boolean);
      setAthletes(next);

      if (createdId) {
        await setActive(createdId);
      }

      setNewName("");
      setNewSportId("");

      trackEvent({ event_name: "athlete_created", mode: "paid", season_year: currentYear });

      // If coming from purchase, continue to Discover once at least one athlete exists
      if (postPurchase) {
        navigate(createPageUrl("Discover"));
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <div className="max-w-md mx-auto space-y-4">
          <div className="pt-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-deep-navy">Family</h1>
              {badge}
            </div>
            <p className="text-slate-600 mt-1">Sign in to manage athletes under one account.</p>
          </div>

          <Card className="p-4">
            <Button className="w-full" onClick={() => navigate(createPageUrl("Home"))}>
              Go to Home
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="pt-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-deep-navy">Family</h1>
            {badge}
          </div>
          <p className="text-slate-600 mt-1">
            One email can manage multiple athletes. Select an active athlete to personalize camps.
          </p>
        </div>

        {err && (
          <Card className="p-3 border-rose-200 bg-rose-50 text-rose-700">
            <div className="text-sm break-words">{err}</div>
          </Card>
        )}

        {/* Post-purchase enforcement */}
        {enforceCreateAthlete && (
          <Card className="p-4 border-emerald-200 bg-emerald-50">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-emerald-900">Almost done</div>
                <div className="text-sm text-emerald-900/80 mt-1">
                  Add your first athlete profile to finish activation.
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Athlete list */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <UserCircle2 className="w-5 h-5 text-slate-700" />
            <div className="font-semibold text-deep-navy">Athletes</div>
          </div>

          {athletes.length === 0 ? (
            <div className="text-sm text-slate-600">No athletes yet.</div>
          ) : (
            <div className="space-y-2">
              {athletes.map((a) => {
                const id = normId(a);
                const active = id && activeAthleteId === id;
                return (
                  <button
                    key={id}
                    className={`w-full text-left p-3 rounded-xl border ${
                      active ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
                    }`}
                    onClick={() => setActive(id)}
                    type="button"
                  >
                    <div className="font-semibold text-slate-900">{a?.athlete_name || "Athlete"}</div>
                    <div className="text-xs text-slate-500">{active ? "Active athlete" : "Tap to set active"}</div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Add athlete */}
        <Card className="p-4">
          <div className="font-semibold text-deep-navy">Add athlete</div>
          <div className="mt-3 space-y-2">
            <input
              className="w-full border border-slate-200 rounded-xl p-3 bg-white"
              placeholder="Athlete name (e.g., Jordan)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="w-full border border-slate-200 rounded-xl p-3 bg-white"
              placeholder="Sport ID (optional for now)"
              value={newSportId}
              onChange={(e) => setNewSportId(e.target.value)}
            />
            <Button className="w-full" onClick={addAthlete} disabled={saving || !newName.trim()}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  Add Athlete
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Continue */}
        {!enforceCreateAthlete && (
          <Button className="w-full" onClick={() => navigate(createPageUrl("Discover"))}>
            Continue to Discover
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
