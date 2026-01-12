// src/pages/Profile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Lock, LogIn, Loader2, CheckCircle2, UserCircle2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

import BottomNav from "../components/navigation/BottomNav.jsx";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

function loginUrl(nextPath) {
  const next = encodeURIComponent(nextPath || "/");
  return `/login?next=${next}&source=profile`;
}

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

export default function Profile() {
  const nav = useNavigate();
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const isAuthed = !!season.accountId;
  const isPaid = season.mode === "paid";

  // Hard rule:
  // - Profile is part of paid workspace context (requiredProfile for paid pages).
  // - If authed but not entitled => redirect to Subscribe.
  useEffect(() => {
    if (!isAuthed) return;
    if (!season.isLoading && !isPaid) {
      const next = encodeURIComponent(createPageUrl("Profile"));
      nav(`${createPageUrl("Subscribe")}?next=${next}&reason=entitlement_required`, { replace: true });
    }
  }, [isAuthed, isPaid, season.isLoading, nav]);

  useEffect(() => {
    trackEvent({
      event_name: "profile_view",
      source: "profile",
      auth_state: isAuthed ? "authed" : "anon",
      mode: isPaid ? "paid" : "demo"
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const athleteId = athleteProfile?.id ? String(athleteProfile.id) : null;

  // ---- editable fields (simple + tolerant of schema variance) ----
  const initial = useMemo(() => {
    const p = athleteProfile || {};
    return {
      athlete_name: p.athlete_name || p.name || "",
      grad_year: p.grad_year ? String(p.grad_year) : "",
      position_primary: p.position_primary || p.primary_position || "",
      state: p.state || "",
      height: p.height || "",
      weight: p.weight || ""
    };
  }, [athleteProfile]);

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const setField = (k, v) => {
    setSaved(false);
    setErr("");
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  async function saveProfile() {
    if (!isPaid) return;
    if (!isAuthed) return;

    setSaving(true);
    setErr("");
    setSaved(false);

    try {
      const payload = {
        account_id: season.accountId,
        active: true,
        athlete_name: String(form.athlete_name || "").trim(),
        grad_year: form.grad_year ? Number(form.grad_year) : null,
        position_primary: String(form.position_primary || "").trim(),
        state: String(form.state || "").trim(),
        height: String(form.height || "").trim(),
        weight: String(form.weight || "").trim()
      };

      // Create or update
      if (athleteId) {
        await base44.entities.AthleteProfile.update(athleteId, payload);
      } else {
        await base44.entities.AthleteProfile.create(payload);
      }

      trackEvent({
        event_name: "profile_saved",
        source: "profile",
        mode: "paid"
      });

      setSaved(true);

      // Best practice: refresh identity by hard reload of page state
      // (react-query cache will update on next visit; Base44 can be finicky).
      setTimeout(() => {
        try {
          nav(createPageUrl("Discover"));
        } catch {}
      }, 300);
    } catch (e) {
      setErr("Couldn’t save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const renderBody = () => {
    // Not logged in => block
    if (!isAuthed) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <Lock className="w-5 h-5 text-slate-500" />
            </div>
            <div>
              <div className="text-lg font-semibold text-deep-navy">Log in to access Profile</div>
              <div className="mt-1 text-sm text-slate-600">
                Profile is part of the paid workspace. Log in with your subscriber account.
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  onClick={() => window.location.assign(loginUrl(createPageUrl("Profile")))}
                  className="btn-brand"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Log in
                </Button>
                <Button variant="outline" onClick={() => nav(createPageUrl("Home"))}>
                  Back to Home
                </Button>
              </div>
            </div>
          </div>
        </Card>
      );
    }

    // Authed but not paid => we redirect; show stable card if delayed
    if (!season.isLoading && !isPaid) {
      return (
        <Card className="p-5 border-slate-200">
          <div className="text-lg font-semibold text-deep-navy">Subscription required</div>
          <div className="mt-1 text-sm text-slate-600">
            Your login is active, but you don’t have an entitlement for the current season.
          </div>
          <div className="mt-4">
            <Button onClick={() => nav(createPageUrl("Subscribe"))} className="btn-brand">
              Go to Sign-Up
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>
      );
    }

    if (season.isLoading || identityLoading) {
      return (
        <div className="py-10 text-center text-slate-500">
          <Loader2 className="w-5 h-5 inline animate-spin mr-2" />
          Loading…
        </div>
      );
    }

    return (
      <Card className="p-5 border-slate-200">
        <div className="flex items-center gap-2">
          <UserCircle2 className="w-6 h-6 text-slate-600" />
          <div className="text-lg font-semibold text-deep-navy">Athlete Profile</div>
        </div>

        <div className="mt-1 text-sm text-slate-600">
          This profile powers paid features (My Camps, Calendar overlays, and future planning tools).
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <Label>athlete name</Label>
            <Input value={form.athlete_name} onChange={(e) => setField("athlete_name", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>grad year</Label>
              <Input value={form.grad_year} onChange={(e) => setField("grad_year", e.target.value)} />
            </div>
            <div>
              <Label>state</Label>
              <Input value={form.state} onChange={(e) => setField("state", e.target.value)} />
            </div>
          </div>

          <div>
            <Label>primary position</Label>
            <Input
              value={form.position_primary}
              onChange={(e) => setField("position_primary", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>height</Label>
              <Input value={form.height} onChange={(e) => setField("height", e.target.value)} />
            </div>
            <div>
              <Label>weight</Label>
              <Input value={form.weight} onChange={(e) => setField("weight", e.target.value)} />
            </div>
          </div>

          {err && <div className="text-sm text-rose-600">{err}</div>}

          {saved && (
            <div className="text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Saved
            </div>
          )}

          <div className="pt-2 flex gap-2">
            <Button onClick={saveProfile} className="btn-brand" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  Save
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>

            <Button variant="outline" onClick={() => nav(createPageUrl("Discover"))}>
              Back to Discover
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-md mx-auto px-4 pt-5 pb-24">{renderBody()}</div>
      <BottomNav />
    </div>
  );
}
