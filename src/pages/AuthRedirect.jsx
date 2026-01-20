import React, { useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

function trackEvent(payload) {
  try {
    // async-safe fire-and-forget (doesn't break UI on rejection)
    const p = base44?.entities?.Event?.create?.({ ...payload, ts: new Date().toISOString() });
    Promise.resolve(p).catch(() => {});
  } catch {}
}

function safeDecode(x) {
  try {
    return decodeURIComponent(String(x || ""));
  } catch {
    return String(x || "");
  }
}

/**
 * Prevent open-redirects + keep routing predictable:
 * - Allow only internal app paths that start with "/"
 * - Reject absolute URLs ("http", "//") and empty
 */
function normalizeNextPath(candidate) {
  const s = String(candidate || "").trim();
  if (!s) return createPageUrl("Discover");

  // Block absolute URLs or protocol-relative URLs
  const lower = s.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("//")) {
    return createPageUrl("Discover");
  }

  // Must be an internal route
  if (!s.startsWith("/")) return createPageUrl("Discover");

  return s;
}

function getNext(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const raw = sp.get("next");
    const decoded = raw ? safeDecode(raw) : createPageUrl("Discover");
    return normalizeNextPath(decoded);
  } catch {
    return createPageUrl("Discover");
  }
}

export default function AuthRedirect() {
  const nav = useNavigate();
  const loc = useLocation();
  const season = useSeasonAccess();

  const nextPath = useMemo(() => getNext(loc.search), [loc.search]);

  // Keep the original "next" stable during redirects
  const nextRef = useRef(nextPath);
  useEffect(() => {
    nextRef.current = nextPath;
  }, [nextPath]);

  // Core gate:
  // 1) If not authenticated -> send to Base44 built-in /login, returning here after login
  // 2) If authenticated + entitled -> go to next (paid workspace)
  // 3) If authenticated + NOT entitled -> go to Subscribe
  useEffect(() => {
    if (season?.isLoading) return;

    const accountId = season?.accountId || null;
    const mode = season?.mode || "demo"; // "paid" | "demo"
    const next = nextRef.current || createPageUrl("Discover");

    trackEvent({
      event_name: "auth_redirect_eval",
      source: "AuthRedirect",
      auth_state: accountId ? "authed" : "anon",
      mode,
      next
    });

    // 1) Not authed -> go to Base44 /login and come back to this exact URL
    if (!accountId) {
      try {
        // Absolute URL back to this exact AuthRedirect URL (Base44 expects from_url)
        const returnTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;

        const loginUrl = `${window.location.origin}/login?from_url=${encodeURIComponent(returnTo)}`;
        window.location.assign(loginUrl);
      } catch {
        nav(createPageUrl("Home"), { replace: true });
      }
      return;
    }

    // 2) Authed + entitled -> paid
    if (mode === "paid") {
      trackEvent({
        event_name: "auth_redirect_success_paid",
        source: "AuthRedirect",
        next
      });
      nav(next, { replace: true });
      return;
    }

    // 3) Authed but NOT entitled -> force subscribe path
    trackEvent({
      event_name: "auth_redirect_block_no_entitlement",
      source: "AuthRedirect",
      next
    });

    const subscribeUrl =
      createPageUrl("Subscribe") + `?source=auth_gate&next=${encodeURIComponent(next)}`;

    nav(subscribeUrl, { replace: true });
  }, [season?.isLoading, season?.accountId, season?.mode, nav]);

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-6 rounded-2xl shadow-sm border border-default bg-white">
        <div className="text-lg font-bold text-deep-navy">Checking access…</div>
        <div className="mt-2 text-sm text-slate-600">
          Verifying your subscription and routing you to the correct workspace.
        </div>

        <div className="mt-5 flex gap-2">
          <Button
            variant="outline"
            onClick={() => nav(createPageUrl("Home"), { replace: true })}
          >
            Back to Home
          </Button>
          <Button
            onClick={() =>
              nav(createPageUrl("Subscribe") + `?source=auth_redirect_cta`, { replace: false })
            }
          >
            View pricing
          </Button>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          If you’re not subscribed, you’ll be sent to pricing.
        </div>
      </Card>
    </div>
  );
}
