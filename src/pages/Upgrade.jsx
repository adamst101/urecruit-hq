// src/pages/Upgrade.jsx
import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";

function trackEvent(payload) {
  try {
    const EventEntity = base44?.entities?.Event || base44?.entities?.Events;
    if (!EventEntity?.create) return;

    const now = new Date();
    const iso = now.toISOString();
    const day = iso.slice(0, 10);
    const eventName =
      payload?.event_name || payload?.event_type || payload?.title || payload?.name || "event";
    const sourcePlatform = payload?.source_platform || payload?.source || "web";
    const title = payload?.title || String(eventName);
    const sourceKey =
      payload?.source_key || payload?.sourceKey || `${String(sourcePlatform)}:${String(eventName)}`;
    const startDate = payload?.start_date || day;

    EventEntity.create({
      source_platform: String(sourcePlatform),
      event_type: String(eventName),
      title: String(title),
      source_key: String(sourceKey),
      start_date: String(startDate),
      payload_json: JSON.stringify(payload || {}),
      ts: iso,
    });
  } catch {}
}

export default function Upgrade() {
  const nav = useNavigate();
  const location = useLocation();

  const { isLoading, mode, hasAccess, seasonYear, currentYear, demoYear, accountId } =
    useSeasonAccess();

  const [working, setWorking] = useState(false);
  const [err, setErr] = useState(null);

  const params = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const next = params.get("next");
  const source = params.get("source") || "upgrade_page";

  const signedIn = !!accountId;

  async function handleSubscribe() {
    setWorking(true);
    setErr(null);

    trackEvent({
      event_name: "upgrade_subscribe_clicked",
      mode: mode || null,
      season_year: currentYear || null, // year being sold
      source,
      account_id: accountId || null,
      has_access: !!hasAccess
    });

    try {
      // Prefer new flow: send to Subscribe (which sends to Checkout)
      // Keep next so user returns where they intended after purchase.
      const subscribeUrl =
        createPageUrl("Subscribe") +
        `?force=1&source=${encodeURIComponent(source)}&next=${encodeURIComponent(
          next || createPageUrl("Profile")
        )}`;

      nav(subscribeUrl);
    } catch (e) {
      setErr(e?.message || "Subscription failed. Please try again.");

      trackEvent({
        event_name: "upgrade_subscribe_failed",
        mode: mode || null,
        season_year: currentYear || null,
        source,
        account_id: accountId || null,
        error: String(e?.message || e)
      });
    } finally {
      setWorking(false);
    }
  }

  // If they already have access, this page is pointless—send them onward.
  if (!isLoading && mode === "paid") {
    nav(createPageUrl("Discover"), { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-deep-navy">Upgrade</h1>
              <Badge className={mode === "paid" ? "bg-emerald-700 text-white" : "bg-slate-900 text-white"}>
                {mode === "paid" ? `Paid ${currentYear || ""}` : `Demo ${demoYear || ""}`}
              </Badge>
            </div>
            <p className="text-slate-600 mt-1">
              Full access: current-year camps, calendar overlays, and multi-athlete profiles.
            </p>
          </div>

          <Button variant="outline" onClick={() => nav(createPageUrl("Home"))}>
            Back
          </Button>
        </div>

        <Card className="p-4 border-amber-200 bg-amber-50">
          <div className="font-semibold text-amber-900">Season Pass</div>
          <div className="text-sm text-amber-900/80 mt-1">
            Unlock current season ({currentYear || "current year"}) and planning tools.
          </div>

          <div className="mt-3 bg-white/70 border border-amber-200 rounded-xl p-3">
            <div className="flex items-baseline justify-between">
              <div className="font-semibold text-amber-900">Season Pass</div>
              <div className="text-2xl font-bold text-amber-900">$49</div>
            </div>
            <div className="text-xs text-amber-900/70 mt-1">Per season. Add multiple athletes under one email.</div>
          </div>

          <ul className="mt-3 text-sm text-amber-900/90 space-y-1 list-disc pl-5">
            <li>Unlimited target schools</li>
            <li>Unlimited camps + full filters</li>
            <li>Calendar conflict detection</li>
            <li>Multiple athletes per account</li>
          </ul>

          {err && (
            <div className="mt-3 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
              {String(err)}
            </div>
          )}

          <div className="mt-4 space-y-2">
            <Button className="w-full" disabled={working || isLoading} onClick={handleSubscribe}>
              {working ? "Processing…" : "Continue to Pricing"}
            </Button>

            {signedIn && (
              <Button variant="outline" className="w-full" onClick={() => nav(createPageUrl("Profile"))}>
                Manage athletes
              </Button>
            )}
          </div>

          <div className="mt-3 text-xs text-amber-900/70">
            {signedIn ? "You’ll complete checkout next." : "Sign in during checkout to activate your subscription."}
          </div>
        </Card>
      </div>
    </div>
  );
}
