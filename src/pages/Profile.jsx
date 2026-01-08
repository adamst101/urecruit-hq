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
import SportSelector from "../components/SportSelector";

// --- analytics helpers
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

/**
 * Best-effort mapping for legacy free-text sport_id values.
 * Prevents “football”/”FB” from breaking the new reference-based join.
 */
function normalizeSportIdMaybe(rawSportId, sports) {
  if (!rawSportId) return null;

  // already looks like an id of an existing sport
  const direct = (sports || []).find((s) => String(s?.id) === String(rawSportId));
  if (direct) return String(direct.id);

  const needle = String(rawSportId).trim().toLowerCase();
  if (!needle) return null;

  // try match by sport_name OR name OR slug
  const byName = (sports || []).find((s) => {
    const n = String(s?.sport_name || s?.name || "").trim().toLowerCase();
    return n === needle;
  });
  if (byName) return String(byName.id);

  const bySlug = (sports || []).find((s) => String(s?.slug || "").trim().toLowerCase() === needle);
  if (bySlug) return String(bySlug.id);

  // common aliases
  const aliasMap = {
    fb: "football",
    "american football": "football",
    "flag football": "football",
    hoops: "basketball",
  };
  const mapped = aliasMap[needle];
  if (mapped) {
    const aliased = (sports || []).find((s) => {
      const n = String(s?.sport_name || s?.name || "").trim().toLowerCase();
      return n === mapped;
    });
    if (aliased) return String(aliased.id);
  }

  return null;
}

import RouteGuard from "../components/auth/RouteGuard";

function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ standardized hook usage
  const { isLoading, mode, seasonYear, currentYear, demoYear, accountId } = useSeasonAccess();

  const [saving, setSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  const [profile, setProfile] = useState(null);

  // sport selection is local state until save
  const [sportId, setSportId] = useState(null);

  // Sports list for legacy normalization (SportSelector may fetch too; this is for mapping)
  const [sports, setSports] = useState([]);
  const [sportsLoading, setSportsLoading] = useState(false);

  const nextUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("next") || createPageUrl("Discover");
  }, [location.search]);

  /**
   * ✅ Profile editability rules
   * - Paid: yes
   * - Demo: allow selection for UX, but DO NOT write to backend if user isn't signed in.
   *   (Otherwise you create an unauthorized write + confusing state)
   */
  const isAuthed = !!accountId;
  const canWriteBackend = isAuthed; // keep strict
  const canEditUI = true; // allow demo users to select sport for funnel flow

  // Load sports list (for normalization)
  useEffect(() => {
    let mounted = true;
    (async () => {
      setSportsLoading(true);
      try {
        const rows = await base44.entities.Sport.list();
        if (!mounted) return;
        setSports(Array.isArray(rows) ? rows : []);
      } catch {
        if (mounted) setSports([]);
      } finally {
        if (mounted) setSportsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Load profile (only if authed; in demo there may be no "me")
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (isLoading) return;

      setProfileLoading(true);

      // DEMO (not signed in): do not call "me" — it will often 401/throw.
      if (!isAuthed) {
        setProfile(null);
        setSportId(null);
        setProfileLoading(false);

        trackEvent({
          event_name: "profile_loaded",
          mode: mode || null,
          season_year: seasonYear || null,
          sport_id: null,
          account_id: null,
          has_access: mode === "paid",
          authed: false,
          source: "profile",
        });

        return;
      }

      try {
        const me = await base44.entities.AthleteProfile?.get?.("me");
        const p = me || null;

        if (!mounted) return;

        setProfile(p);

        const rawSportId = p?.sport_id ? String(p.sport_id) : null;
        const normalized = normalizeSportIdMaybe(rawSportId, sports);

        setSportId(normalized || rawSportId || null);

        trackEvent({
          event_name: "profile_loaded",
          mode: mode || null,
          season_year: seasonYear || null,
          sport_id: normalized || rawSportId || null,
          account_id: accountId || null,
          has_access: mode === "paid",
          authed: true,
          source: "profile",
        });
      } catch (e) {
        if (mounted) {
          setProfile(null);
          setSportId(null);
        }
      } finally {
        if (mounted) setProfileLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isLoading, isAuthed, mode, seasonYear, accountId, sports]);

  const pageLoading = isLoading || profileLoading;

  async function onSave() {
    if (!canEditUI) return;

    if (!sportId) {
      trackEvent({
        event_name: "profile_save_blocked_missing_sport",
        mode: mode || null,
        season_year: seasonYear || null,
        account_id: accountId || null,
        authed: isAuthed,
        source: "profile",
      });
      return;
    }

    // Demo (not signed in): treat "Save" as "Continue" (no backend write)
    if (!canWriteBackend) {
      trackEvent({
        event_name: "profile_continue_demo",
        mode: mode || "demo",
        season_year: seasonYear || null,
        sport_id: String(sportId),
        account_id: null,
        authed: false,
        source: "profile",
      });
      navigate(nextUrl);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...(profile || {}),
        sport_id: String(sportId),
      };

      const updated =
        (await base44.entities.AthleteProfile?.update?.(normId(profile) || "me", payload)) ||
        (await base44.entities.AthleteProfile?.upsert?.(payload));

      setProfile(updated || payload);

      trackEvent({
        event_name: "profile_saved",
        mode: mode || null,
        season_year: seasonYear || null,
        sport_id: String(sportId),
        account_id: accountId || null,
        authed: true,
        source: "profile",
      });

      navigate(nextUrl);
    } catch (e) {
      trackEvent({
        event_name: "profile_save_failed",
        mode: mode || null,
        season_year: seasonYear || null,
        sport_id: sportId || null,
        account_id: accountId || null,
        authed: true,
        source: "profile",
        error: String(e?.message || e),
      });
    } finally {
      setSaving(false);
    }
  }

  if (pageLoading) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin" />
            <div className="text-sm opacity-80">Loading profile…</div>
          </div>
        </Card>
      </div>
    );
  }

  const sportMissing = !sportId;
  const disableSave = !canEditUI || saving || sportsLoading || sportMissing;

  return (
    <div className="mx-auto max-w-xl p-6 space-y-4">
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <UserCircle2 className="h-6 w-6" />
          <div className="flex-1">
            <div className="text-lg font-semibold">Your Profile</div>
            <div className="text-sm opacity-70">
              Select your sport to personalize camps and discovery.
            </div>
          </div>

          <Badge variant="secondary">
            {mode === "paid" ? `Paid ${currentYear || ""}` : `Demo ${demoYear || ""}`}
          </Badge>
        </div>

        {/* Sport Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Sport</div>
            {sportId ? (
              <div className="flex items-center gap-1 text-sm opacity-70">
                <CheckCircle2 className="h-4 w-4" />
                Selected
              </div>
            ) : (
              <Badge variant="destructive">Required</Badge>
            )}
          </div>

          <SportSelector
            value={sportId}
            onChange={(id) => {
              setSportId(id);
              trackEvent({
                event_name: "profile_sport_selected",
                mode: mode || null,
                season_year: seasonYear || null,
                sport_id: id || null,
                account_id: accountId || null,
                authed: isAuthed,
                source: "profile",
              });
            }}
            disabled={saving}
          />

          <div className="text-xs opacity-70">
            This prevents “no camps found” due to sport mismatches.
          </div>

          {!isAuthed && (
            <div className="text-xs text-slate-600">
              You’re in demo mode. Sport selection helps personalization, but it won’t be saved to your account until you
              sign in.
            </div>
          )}
        </div>

        <div className="pt-2 flex items-center justify-end">
          <Button onClick={onSave} disabled={disableSave}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        {sportMissing && <div className="text-xs text-red-600">Select a sport to continue.</div>}
      </Card>
    </div>
  );
}

export default function Profile() {
  return (
    <RouteGuard requireAuth={true}>
      <ProfilePage />
    </RouteGuard>
  );
}