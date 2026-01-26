// src/pages/Workspace.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Compass,
  CalendarDays,
  User,
  Shield,
  Upload,
  ArrowRight,
  Lock
} from "lucide-react";

import { createPageUrl } from "../utils";
import { base44 } from "../api/base44Client";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import { useAthleteIdentity } from "../components/useAthleteIdentity.jsx";

async function safeMe() {
  try {
    const me = await base44.auth.me();
    return me || null;
  } catch {
    return null;
  }
}

/**
 * Admin allowlist (MVP)
 * - Put your own accounts here
 * - Later you can replace this with a real "role" field if Base44 exposes it
 */
const ADMIN_ACCOUNT_IDS = new Set([
  "69643f35b97ae55e3aca1d95", // tom_adams_tx@live.com (from your debug output)
  "693c6f46122d274d698c00f0"  // tom.adams101@gmail.com (from your entitlement table)
]);

const ADMIN_EMAILS = new Set([
  "tom_adams_tx@live.com",
  "tom.adams101@gmail.com"
]);

function Tile({ icon: Icon, title, subtitle, onClick, variant = "default" }) {
  const cls =
    variant === "admin"
      ? "border-amber-200 bg-amber-50"
      : variant === "primary"
      ? "border-slate-200 bg-white"
      : "border-slate-200 bg-white";

  return (
    <Card className={`p-4 ${cls}`}>
      <div className="flex items-start gap-3">
        <div className="mt-1">
          <Icon className="w-5 h-5 text-slate-700" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-deep-navy">{title}</div>
          {subtitle ? <div className="text-sm text-slate-600 mt-1">{subtitle}</div> : null}
          <div className="mt-3">
            <Button onClick={onClick} className="w-full">
              Open <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Workspace() {
  const nav = useNavigate();
  const season = useSeasonAccess();
  const { athleteProfile, isLoading: identityLoading } = useAthleteIdentity();

  const [me, setMe] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const x = await safeMe();
      if (!cancelled) setMe(x);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAuthed = !!season?.accountId;
  const isEntitled = !!season?.hasAccess && !!season?.entitlement;

  const meEmail = String(me?.email || me?.user?.email || "").toLowerCase().trim();
  const isAdmin = useMemo(() => {
    const idOk = season?.accountId && ADMIN_ACCOUNT_IDS.has(String(season.accountId));
    const emailOk = meEmail && ADMIN_EMAILS.has(meEmail);
    return !!(idOk || emailOk);
  }, [season?.accountId, meEmail]);

  // If not authed, this page shouldn't be reachable — send Home
  useEffect(() => {
    if (season?.isLoading) return;
    if (!isAuthed) {
      nav(createPageUrl("Home") + "?signin=1", { replace: true });
    }
  }, [season?.isLoading, isAuthed, nav]);

  const loading = season?.isLoading || identityLoading;

  if (loading) return <div className="min-h-screen bg-slate-50" />;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-bold text-deep-navy">Workspace</div>
            <div className="text-sm text-slate-600 mt-1">
              {isEntitled
                ? `Member access · Season ${season?.seasonYear ?? "—"}`
                : `Demo-only access · Demo season ${season?.seasonYear ?? "—"}`}
            </div>
          </div>

          <Button variant="outline" onClick={() => nav(createPageUrl("Home"))}>
            Home
          </Button>
        </div>

        {/* Entitlement guidance */}
        {!isEntitled ? (
          <Card className="p-4 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-700 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-amber-900">You're signed in, but not subscribed.</div>
                <div className="text-sm text-amber-900/80 mt-1">
                  Subscribe to unlock the current season and planning tools.
                </div>
                <div className="mt-3">
                  <Button onClick={() => nav(createPageUrl("Subscribe") + "?source=workspace_gate")}>
                    Subscribe <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Profile guidance for paid users */}
        {isEntitled && !athleteProfile ? (
          <Card className="p-4 border-slate-200 bg-white">
            <div className="font-semibold text-deep-navy">Finish athlete setup</div>
            <div className="text-sm text-slate-600 mt-1">
              Create at least one athlete profile to enable favorites, registrations, and calendar planning.
            </div>
            <div className="mt-3">
              <Button onClick={() => nav(createPageUrl("Profile"))}>
                Go to Profile <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        ) : null}

        {/* Primary workspace tiles */}
        <div className="grid md:grid-cols-2 gap-3">
          <Tile
            icon={Compass}
            title="Discover"
            subtitle="Browse camps for your season."
            onClick={() => nav(createPageUrl("Discover"))}
            variant="primary"
          />

          <Tile
            icon={CalendarDays}
            title="Calendar"
            subtitle="Plan and sequence camps (members)."
            onClick={() => nav(createPageUrl("Calendar"))}
            variant="primary"
          />

          <Tile
            icon={User}
            title="Profile"
            subtitle="Athletes, positions, and preferences."
            onClick={() => nav(createPageUrl("Profile"))}
            variant="primary"
          />
        </div>

        {/* Admin tools */}
        {isAdmin ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-700" />
              <div className="font-semibold text-deep-navy">Admin</div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <Tile
                icon={Upload}
                title="Admin Import"
                subtitle="Promote CampDemo → Camp, run ingestion utilities."
                onClick={() => nav(createPageUrl("AdminImport"))}
                variant="admin"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}