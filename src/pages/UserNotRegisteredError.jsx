// src/pages/UserNotRegisteredError.jsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ArrowRight, LogOut } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

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

export default function UserNotRegisteredError() {
  const navigate = useNavigate();
  const { isLoading, mode, accountId } = useSeasonAccess();

  useEffect(() => {
    if (isLoading) return;

    const key = "evt_user_not_registered_viewed";
    try {
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}

    trackEvent({
      event_name: "user_not_registered_viewed",
      mode: mode || null,
      account_id: accountId || null,
      source: "user_not_registered_error",
    });
  }, [isLoading, mode, accountId]);

  if (isLoading) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-slate-50 p-4">
      <Card className="max-w-md w-full p-8 border-slate-200">
        <div className="text-center space-y-6">
          <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-amber-100">
            <Lock className="w-8 h-8 text-amber-700" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-deep-navy">Access Restricted</h1>
            <p className="text-slate-600 mt-2">
              Your account isn't registered for this application yet.
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-600 text-left">
            <p className="font-medium text-slate-700 mb-2">What you can do:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Confirm you're logged in with the correct email</li>
              <li>Contact the app administrator to request access</li>
              <li>Log out and sign back in</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => {
                trackEvent({
                  event_name: "user_not_registered_go_home_clicked",
                  source: "user_not_registered_error",
                  account_id: accountId || null,
                });
                navigate(createPageUrl("Home"));
              }}
            >
              Go to Home
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                trackEvent({
                  event_name: "user_not_registered_logout_clicked",
                  source: "user_not_registered_error",
                  account_id: accountId || null,
                });

                try {
                  await base44.auth?.signOut?.();
                } catch {}

                navigate(createPageUrl("Home"), { replace: true });
              }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Log out
            </Button>
          </div>

          <div className="text-xs text-slate-500">
            If you believe this is a mistake, please contact support or the app administrator.
          </div>
        </div>
      </Card>
    </div>
  );
}