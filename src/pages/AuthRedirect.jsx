// src/pages/AuthRedirect.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";

/**
 * AuthRedirect.jsx
 *
 * Post-login routing hub. Decides where to send the user:
 *
 * 1. postPaymentSignup in sessionStorage → /Workspace (poll for entitlement if slow)
 * 2. pendingPromoCode in sessionStorage → /Checkout?promo=CODE
 * 3. loginReturnUrl in sessionStorage → that URL
 * 4. Authenticated + entitled → /Workspace (or sanitized next)
 * 5. Authenticated + NOT entitled → /Subscribe?newAccount=true
 * 6. Not authenticated → /Home
 */

const PATHS = {
  HOME: "/Home",
  WORKSPACE: "/Workspace",
  SUBSCRIBE: "/Subscribe",
  DISCOVER: "/Discover",
};

function safeString(x) {
  if (x == null) return "";
  return String(x);
}

function getNextFromSearch(search) {
  try {
    const sp = new URLSearchParams(search || "");
    const next = sp.get("next");
    return next ? safeString(next) : "";
  } catch {
    return "";
  }
}

function sanitizeNext(nextRaw) {
  const fallback = PATHS.WORKSPACE;
  const s = safeString(nextRaw).trim();
  if (!s) return fallback;
  if (s.startsWith("http://") || s.startsWith("https://")) return fallback;
  const pathish = s.startsWith("/") ? s : `/${s}`;
  try {
    const u = new URL(pathish, window.location.origin);
    u.searchParams.delete("mode");
    u.searchParams.delete("src");
    u.searchParams.delete("source");
    const cleaned = `${u.pathname}${u.search ? u.search : ""}`;
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

function ssGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function ssRemove(key) {
  try { sessionStorage.removeItem(key); } catch {}
}

export default function AuthRedirect() {
  const nav = useNavigate();
  const loc = useLocation();
  const season = useSeasonAccess();

  const [statusMsg, setStatusMsg] = useState("Signing you in…");
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  const didRoute = useRef(false);

  const next = useMemo(() => {
    const qNext = getNextFromSearch(loc?.search);
    if (qNext) return sanitizeNext(qNext);
    const ss = ssGet("post_login_next");
    if (ss) {
      ssRemove("post_login_next");
      return sanitizeNext(ss);
    }
    return PATHS.WORKSPACE;
  }, [loc?.search]);

  const isCheckoutReturn = useMemo(() => next.startsWith("/Checkout"), [next]);

  useEffect(() => {
    if (season?.isLoading || didRoute.current) return;

    // Not authenticated → Home
    if (!season?.accountId) {
      didRoute.current = true;
      nav(`${PATHS.HOME}?signin=1&next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }

    // Clear demo stickiness
    ssRemove("demoMode_v1");
    ssRemove("demo_mode_v1");
    ssRemove("demo_year_v1");

    const accountId = season.accountId;

    // ── Priority 1: Post-payment signup flow ──
    const postPayment = ssGet("postPaymentSignup");
    if (postPayment) {
      ssRemove("postPaymentSignup");
      ssRemove("paidSeasonYear");

      // Entitlement might already exist (webhook fast)
      if (season?.hasAccess && season?.entitlement) {
        didRoute.current = true;
        nav(PATHS.WORKSPACE, { replace: true });
        return;
      }

      // Poll for entitlement (webhook may be slow)
      setStatusMsg("Setting up your access…");
      let attempts = 0;
      const maxAttempts = 5; // 5 × 2s = 10s
      const interval = setInterval(async () => {
        attempts++;
        try {
          const ents = await base44.entities.Entitlement.filter({
            account_id: accountId,
            status: "active",
          });
          if (Array.isArray(ents) && ents.length > 0) {
            clearInterval(interval);
            didRoute.current = true;
            nav(PATHS.WORKSPACE, { replace: true });
            return;
          }
        } catch {}
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          setShowSlowWarning(true);
        }
      }, 2000);
      return;
    }

    // ── Priority 2: Pending promo code (BETA100 flow) ──
    const pendingPromo = ssGet("pendingPromoCode");
    if (pendingPromo) {
      ssRemove("pendingPromoCode");
      didRoute.current = true;
      nav(`/Checkout?promo=${encodeURIComponent(pendingPromo)}&activate=true`, { replace: true });
      return;
    }

    // ── Priority 3: Return URL from sessionStorage ──
    const returnUrl = ssGet("loginReturnUrl");
    if (returnUrl) {
      ssRemove("loginReturnUrl");
      didRoute.current = true;
      nav(sanitizeNext(returnUrl), { replace: true });
      return;
    }

    // ── Priority 4: Entitled → next destination ──
    if (season?.hasAccess && season?.entitlement) {
      didRoute.current = true;
      nav(next, { replace: true });
      return;
    }

    // ── Priority 5: Checkout return (free-code flow) ──
    if (isCheckoutReturn) {
      didRoute.current = true;
      nav(next, { replace: true });
      return;
    }

    // ── Priority 6: Not entitled → Subscribe with welcome message ──
    didRoute.current = true;
    nav(`${PATHS.SUBSCRIBE}?newAccount=true&source=auth_redirect`, { replace: true });
  }, [season?.isLoading, season?.accountId, season?.hasAccess, season?.entitlement, next, nav, isCheckoutReturn]);

  // Slow webhook warning
  if (showSlowWarning) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-6">
        <div className="text-center max-w-md" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#f9fafb", marginBottom: 12 }}>
            Taking longer than expected
          </h2>
          <p style={{ fontSize: 16, color: "#9ca3af", lineHeight: 1.6, marginBottom: 20 }}>
            Your payment was confirmed but access setup is still processing.
          </p>
          <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.6, marginBottom: 24 }}>
            Please email us at{" "}
            <a href="mailto:support@urecruithq.com" style={{ color: "#e8a020", textDecoration: "underline" }}>
              support@urecruithq.com
            </a>{" "}
            with your receipt and we'll sort it out right away.
          </p>
          <button
            onClick={() => nav(PATHS.WORKSPACE, { replace: true })}
            style={{
              background: "#1f2937", color: "#f9fafb", border: "1px solid #374151",
              borderRadius: 8, padding: "12px 24px", fontSize: 16, fontWeight: 600, cursor: "pointer",
            }}
          >
            Continue to HQ →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#e8a020] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-sm text-[#9ca3af]">{statusMsg}</p>
      </div>
    </div>
  );
}