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

// --- analytics helpers (keep your existing tracking shape)
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
 * This prevents “football”/”FB” from breaking the new reference-based join.
 */
function normalizeSportIdMaybe(rawSportId, sports) {
  if (!rawSportId) return null;

  // already looks like an id of an existing sport
  const direct = sports.find((s) => String(s?.id) === String(rawSportId));
  if (direct) return String(direct.id);

  const needle = String(rawSportId).trim().toLowerCase();
  if (!needle) return null;

  // try match by name or slug
  const byName = sports.find(
    (s) => String(s?.name || "").trim().toLowerCase() === needle
  );
  if (byName) return String(byName.id);

  const bySlug = sports.find(
    (s) => String(s?.slug || "").trim().toLowerCase() === needle
  );
  if (bySlug) return String(bySlug.id);

  // common aliases (expand as needed)
  const aliasMap = {
    fb: "football",
    "american football": "football",
    hoops: "basketball",
  };
  const mapped = aliasMap[needle];
  if (mapped) {
    const aliased = sports.find(
      (s) => String(s?.name || "").trim().toLowerCase() === mapped
    );
    if (aliased) return String(aliased.id);
  }

  return null;
}

export default function Profile() {
  const navigate = useNavigate();
  const location = useLocation();

  // IMPORTANT: include mode so demo can be allowed
  const {
    season,
    hasAccess,
    isLoading: accessLoading,
    mode, // "demo" | "paid" (per your Subscribe page)
    currentYear,
    demoYear,
    accountId,
  } = useSeasonAccess();

  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [profile, setProfile] = useState(null);

  // Profile fields
  const [sportId, setSportId] = useState(null);

  // For normalization
  const [sports, setSports] = useState([]);
  const [loadingSports, setLoadingSports] = useState(false);

  const nextUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("next") || createPageUrl("Discover");
  }, [location.search]);

  // ✅ Demo users MUST be able to set sport; don't block Profile.
  // Only block if you explicitly want to prevent profile edits for paid-only reasons.
  const ready = !accessLoading && !loadingProfile;
  const isDemo = mode === "demo";
  const canEditProfile = true; // allow both demo + paid
  const showPaywall = false; // never show subscription required on Profile

  // Load sports for normalization + selector
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingSports(true);
      try {
        const rows = await base44.entities.Sport.list();
        if (!mounted) return;
        setSports(Array.isArray(rows) ? rows : []);
      } catch {
        if (mounted) setSports([]);
      } finally {
        if (mounted) setLoadingSports(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Load profile
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoadingProfile(true);
      try {
        // If you use base44.functions.getAthleteProfile() in your app, swap it in here.
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
          season_year: currentYear || null,
          demo_year: demoYear || null,
          sport_id: normalized || rawSportId || null,
          account_id: accountId || null,
        });
      } catch (e) {
        if (mounted) setProfile(null);
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [sports, mode, currentYear, demoYear, accountId]);

  async function onSave() {
    if (!canEditProfile) return;

    if (!sportId) {
      trackEvent({
        event_name: "profile_save_blocked_missing_sport",
        mode: mode || null,
        season_year: currentYear || null,
        demo_year: demoYear || null,
        account_id: accountId || null,
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...(profile || {}),
        sport_id: String(sportId),
      };

      const updated =
        (await base44.entities.AthleteProfile?.update?.(
          normId(profile) || "me",
          payload
        )) || (await base44.entities.AthleteProfile?.upsert?.(payload));

      setProfile(updated || payload);

      trackEvent({
        event_name: "profile_saved",
        mode: mode || null,
        season_year: currentYear || null,
        demo_year: demoYear || null,
        sport_id: String(sportId),
        account_id: accountId || null,
      });

      navigate(nextUrl);
    } catch (e) {
      trackEvent({
        event_name: "profile_save_failed",
        mode: mode || null,
        season_year: currentYear || null,
        demo_year: demoYear || null,
        sport_id: sportId || null,
        account_id: accountId || null,
        error: String(e?.message || e),
      });
    } finally {
      setSaving(false);
    }
  }

  // Loading state
  if (!ready) {
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

  // (Optional) Paywall section disabled; leaving hook for future
  if (showPaywall && !hasAccess && !isDemo) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <Card className="p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Access</Badge>
            <div className="font-semibold">Subscription required</div>
          </div>
          <div className="text-sm opacity-80">
            Your current season access doesn’t allow updates to your RecruitMe profile.
          </div>
          <Button
            onClick={() =>
              navigate(
                createPageUrl("Subscribe") +
                  `?force=1&next=${encodeURIComponent(createPageUrl("Profile"))}`
              )
            }
          >
            Go to Subscribe
          </Button>
        </Card>
      </div>
    );
  }

  const sportMissing = !sportId;
  const disableSave = !canEditProfile || saving || loadingSports || sportMissing;

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

          {/* small mode pill for debugging/clarity */}
          {mode ? (
            <Badge variant="secondary">
              {mode === "paid" ? `Paid ${currentYear || ""}` : `Demo ${demoYear || ""}`}
            </Badge>
          ) : null}
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
                season_year: currentYear || null,
                demo_year: demoYear || null,
                sport_id: id || null,
                account_id: accountId || null,
              });
            }}
            disabled={saving}
          />

          <div className="text-xs opacity-70">
            This prevents “no camps found” due to sport mismatches.
          </div>
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

        {sportMissing && (
          <div className="text-xs text-red-600">Select a sport to continue.</div>
        )}
      </Card>
    </div>
  );
}

