// src/pages/Workspace.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Shield, Settings, Calendar, Search, User, Database } from "lucide-react";

import { createPageUrl } from "../utils";
import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

// --- Small helpers ---
function safeString(x) {
  try { return String(x ?? ""); } catch { return ""; }
}

function parseDebug(search) {
  try {
    const sp = new URLSearchParams(search || "");
    return sp.get("debug") === "1";
  } catch {
    return false;
  }
}

function trackEvent(payload) {
  try {
    base44.entities.Event.create({ ...payload, ts: new Date().toISOString() });
  } catch {}
}

/**
 * MVP Admin gate:
 * - Update this allowlist to your admin account IDs (or emails).
 * - You can expand to a real RBAC model later.
 */
const ADMIN_ACCOUNT_IDS = [
  // Example: "693c6f46122d274d698c00f0",
  // Example: "69643f35b97ae55e3aca1d95"
];

const ADMIN_EMAILS = [
  // Example: "tom.adams101@gmail.com"
];

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
  const loc = useLocation();

  const season = useSeasonAccess();
  const { athleteProfile, isLoading: athleteLoading } = useAthleteIdentity();

  const debug = useMemo(() => parseDebug(loc.search), [loc.search]);

  const [me, setMe] = useState(null);
  const [meLoading, setMeLoading] = useState(true);

  // Pull Base44 user (for admin gating + display)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMeLoading(true);
      const m = await safeMe();
      if (cancelled) return;
      setMe(m);
      setMeLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const isAuthed = !!season?.accountId;
  const isEntitled = !!season?.hasAccess && !!season?.entitlement;
  const entitledSeason = season?.entitlement?.season_year ? Number(season.entitlement.season_year) : null;

  const athleteId = useMemo(() => {
    if (!athleteProfile) return null;
    if (typeof athleteProfile === "string") return athleteProfile;
    return athleteProfile?.id || athleteProfile?._id || athleteProfile?.uuid || null;
  }, [athleteProfile]);

  const isAdmin = useMemo(() => {
    const id = safeString(season?.accountId);
    const email = safeString(me?.email || me?.user_metadata?.email || me?.name || "");

    if (ADMIN_ACCOUNT_IDS.includes(id)) return true;
    if (email && ADMIN_EMAILS.some((e) => e.toLowerCase() === email.toLowerCase())) return true;
    return false;
  }, [season?.accountId, me]);

  // Guard: Workspace should be post-login. If not authed, send to Home signin.
  useEffect(() => {
    if (season?.isLoading) return;
    if (isAuthed) return;

    const next = createPageUrl("Workspace");
    nav(createPageUrl("Home") + `?signin=1&next=${encodeURIComponent(next)}`, { replace: true });
  }, [season?.isLoading, isAuthed, nav]);

  // Track view once
  useEffect(() => {
    if (season?.isLoading) return;
    if (!isAuthed) return;

    const key = "evt_workspace_viewed_v1";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "workspace_viewed",
      account_id: season?.accountId || null,
      mode: season?.mode || "demo",
      has_access: !!season?.hasAccess,
      entitled_season: entitledSeason || null
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season?.isLoading, isAuthed]);

  const loading = !!season?.isLoading || meLoading || athleteLoading;

  function goDiscover() {
    // Paid users should never be forced into demo by URL; keep it clean.
    nav(createPageUrl("Discover"));
  }

  function goCalendar() {
    nav(createPageUrl("Calendar"));
  }

  function goProfile() {
    nav(createPageUrl("Profile"));
  }

  function goSubscribe() {
    nav(createPageUrl("Subscribe") + `?source=workspace_cta`);
  }

  function goAdminImport() {
    nav(createPageUrl("AdminImport"));
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-5xl mx-auto px-6 py-6 md:py-10 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl md:text-3xl font-extrabold text-brand">Workspace</div>
            <div className="text-sm text-muted mt-1">
              Your home base after login — jump into Discover, Calendar, and setup.
            </div>

            <div className="mt-2 flex flex-wrap gap-2 items-center">
              {loading ? (
                <Badge className="bg-slate-900 text-white">Loading…</Badge>
              ) : isEntitled ? (
                <Badge className="bg-emerald-700 text-white">Member</Badge>
              ) : (
                <Badge className="bg-slate-900 text-white">Demo</Badge>
              )}

              {isEntitled && entitledSeason ? (
                <Badge className="bg-white text-ink border border-default">
                  Season {entitledSeason}
                </Badge>
              ) : season?.demoYear ? (
                <Badge className="bg-white text-ink border border-default">
                  Demo {season.demoYear}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={goProfile}>
              <User className="w-4 h-4 mr-2" />
              Account
            </Button>
          </div>
        </div>

        {/* Primary actions */}
        <div className="grid md:grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-ink flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Discover
                </div>
                <div className="text-sm text-muted mt-1">
                  Browse camps for your season. Filter by position and school.
                </div>
              </div>
            </div>
            <div className="mt-3">
              <Button className="btn-brand w-full" onClick={goDiscover}>
                Go to Discover <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-ink flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Calendar
                </div>
                <div className="text-sm text-muted mt-1">
                  See your plan and avoid date conflicts.
                </div>
              </div>
            </div>
            <div className="mt-3">
              <Button className="btn-brand w-full" onClick={goCalendar}>
                Go to Calendar <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-ink flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Setup
                </div>
                <div className="text-sm text-muted mt-1">
                  Add athletes and set your profile.
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <Button className="btn-brand w-full" onClick={goProfile}>
                {athleteId ? "Manage Athletes" : "Add Athlete Profile"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>

              {!isEntitled ? (
                <Button variant="outline" className="w-full" onClick={goSubscribe}>
                  Upgrade to Member
                </Button>
              ) : null}
            </div>
          </Card>
        </div>

        {/* Membership / gating explanation */}
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-muted mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-ink">
                {isEntitled ? "Member access is active" : "You’re browsing demo mode"}
              </div>
              <div className="text-sm text-muted mt-1">
                {isEntitled
                  ? "You’re seeing current-season data based on your entitlement. Demo flags are ignored for members."
                  : "Demo shows prior-season camps and blocks write actions (favorites/registered). Upgrade to unlock current season."}
              </div>
            </div>
          </div>
        </Card>

        {/* Admin tools (MVP allowlist) */}
        {isAdmin ? (
          <Card className="p-4 border border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-amber-800 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-amber-900">Admin Tools</div>
                <div className="text-sm text-amber-900/80 mt-1">
                  One-off utilities for data migration and ingestion ops.
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={goAdminImport} className="btn-brand">
                    Admin Import <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>

                  {/* Add more admin tools here as you create them */}
                  {/* <Button variant="outline" onClick={() => nav(createPageUrl("AdminSomething"))}>Admin Something</Button> */}
                </div>

                <div className="mt-2 text-xs text-amber-900/70">
                  Admin gate is controlled by allowlists in <b>Workspace.jsx</b>.
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Debug banner (optional) */}
        {debug ? (
          <Card className="p-4">
            <div className="text-xs text-slate-500 mb-2">DEBUG: Workspace</div>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto">
{JSON.stringify(
  {
    url: `${loc.pathname}${loc.search}`,
    season: {
      isLoading: !!season?.isLoading,
      mode: season?.mode || null,
      hasAccess: !!season?.hasAccess,
      accountId: season?.accountId || null,
      demoYear: season?.demoYear || null,
      currentYear: season?.currentYear || null,
      seasonYear: season?.seasonYear || null,
      entitlementSeason: season?.entitlement?.season_year || null
    },
    athlete: {
      hasAthleteProfile: !!athleteId
    },
    me: {
      email: me?.email || me?.user_metadata?.email || null
    },
    isAdmin
  },
  null,
  2
)}
            </pre>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
