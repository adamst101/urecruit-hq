// src/pages/AuthRedirect.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { base44 } from "../api/base44Client";
import { useSeasonAccess, clearSeasonAccessCache } from "../components/hooks/useSeasonAccess.jsx";

/**
 * AuthRedirect.jsx
 *
 * Post-login routing hub. Decides where to send the user:
 *
 * 1. postPaymentSignup in sessionStorage → /Workspace (poll for entitlement if slow)
 * 2. pendingCoachRegistration in sessionStorage → registerCoach → /CoachDashboard
 * 3. coach role already set → /CoachDashboard directly
 * 4. pendingPromoCode in sessionStorage → /Checkout?promo=CODE
 * 5. loginReturnUrl in sessionStorage → that URL
 * 6. Authenticated + entitled → /Workspace (or sanitized next)
 * 7. Authenticated + NOT entitled → /Subscribe?newAccount=true
 * 8. Not authenticated → /Home
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

    // ── Set auth full_name from checkout form (parent name) if available ──
    // Runs once per login — covers both Stripe and promo code flows.
    // Silently ignored if the form hasn't been filled in yet.
    try {
      const savedForm = ssGet("checkoutForm");
      if (savedForm) {
        const fd = JSON.parse(savedForm);
        const fullName = [fd.parentFirstName, fd.parentLastName].filter(Boolean).join(" ").trim();
        if (fullName) {
          base44.auth.updateMe({ full_name: fullName }).catch(() => {});
        }
        // Also persist first_name / last_name on the User entity
        if (accountId && (fd.parentFirstName || fd.parentLastName)) {
          base44.entities.User.update(accountId, {
            first_name: fd.parentFirstName?.trim() || null,
            last_name: fd.parentLastName?.trim() || null,
          }).catch(() => {});
        }
        // Persist coach invite code to localStorage so Workspace can load coach messages
        if (fd.coachInviteCode) {
          try { localStorage.setItem("coachInviteCode", fd.coachInviteCode); } catch {}
        }
      }
    } catch {}

    // ── Complete pending coach registration ──
    const pendingCoach = ssGet("pendingCoachRegistration");
    if (pendingCoach) {
      ssRemove("pendingCoachRegistration");
      didRoute.current = true;
      setStatusMsg("Setting up your coach account…");
      (async () => {
        try {
          const coachData = JSON.parse(pendingCoach);
          await base44.functions.invoke("registerCoach", {
            accountId,
            first_name: coachData.first_name,
            last_name: coachData.last_name,
            title: coachData.title,
            school_or_org: coachData.school_or_org,
            email: coachData.email,
            phone: coachData.phone,
            website: coachData.website,
            sport: coachData.sport,
          });
          clearSeasonAccessCache();
        } catch (e) {
          console.error("registerCoach from AuthRedirect failed:", e?.message);
        }
        nav("/CoachDashboard", { replace: true });
      })();
      return;
    }

    // ── Coach accounts (approved or pending) → CoachDashboard ──
    if (season?.role === "coach" || season?.role === "coach_pending") {
      didRoute.current = true;
      nav("/CoachDashboard", { replace: true });
      return;
    }

    // ── Priority 1: Post-payment signup flow ──
    const postPayment = ssGet("postPaymentSignup");
    if (postPayment) {
      ssRemove("postPaymentSignup");
      ssRemove("paidSeasonYear");

      // Entitlement might already exist (webhook fast) — admins have hasAccess but no entitlement record
      if (season?.hasAccess && (season?.entitlement || season?.role === "admin")) {
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
            clearSeasonAccessCache();
            didRoute.current = true;
            nav(PATHS.WORKSPACE, { replace: true });
            return;
          }
        } catch {}
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          // Webhook may have created the entitlement with no account_id
          // (user paid anonymously before creating their account).
          // Try to link the Stripe session to this account now.
          const stripeSessionId = ssGet("stripeSessionId");
          ssRemove("stripeSessionId");
          if (stripeSessionId) {
            setStatusMsg("Linking your purchase…");
            try {
              const res = await base44.functions.invoke("linkStripePayment", { sessionId: stripeSessionId });
              const ok = res?.data?.ok || res?.ok;
              if (ok) {
                clearSeasonAccessCache();
                didRoute.current = true;
                nav(PATHS.WORKSPACE, { replace: true });
                return;
              }
            } catch {}
          }
          setShowSlowWarning(true);
        }
      }, 2000);
      return;
    }

    // ── Priority 2: Pending promo code → activate directly, skip Checkout redirect ──
    const pendingPromo = ssGet("pendingPromoCode");
    if (pendingPromo) {
      ssRemove("pendingPromoCode");

      let formData = {};
      try {
        const saved = ssGet("checkoutForm");
        if (saved) { formData = JSON.parse(saved); ssRemove("checkoutForm"); }
      } catch {}

      didRoute.current = true;
      setStatusMsg("Activating your free access…");

      // Call activateFreeAccess directly using accountId already resolved by useSeasonAccess.
      // Avoids calling base44.auth.me() which fails immediately after account creation.
      (async () => {
        try {
          await base44.functions.invoke("activateFreeAccess", {
            promoCode: pendingPromo,
            accountId,
            athleteFirstName: formData.athleteFirstName || undefined,
            athleteLastName: formData.athleteLastName || undefined,
            gradYear: formData.gradYear || undefined,
            sportId: formData.sportId || undefined,
            homeCity: formData.homeCity || undefined,
            homeState: formData.homeState || undefined,
            parentFirstName: formData.parentFirstName || undefined,
            parentLastName: formData.parentLastName || undefined,
            parentPhone: formData.parentPhone || undefined,
            coachInviteCode: formData.coachInviteCode || undefined,
          });
        } catch (e) {
          console.error("activateFreeAccess failed in AuthRedirect:", e?.message);
        }
        // Always clear cache before navigating so Workspace does a fresh entitlement check
        clearSeasonAccessCache();
        nav(PATHS.WORKSPACE, { replace: true });
      })();
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

    // ── Priority 4: Entitled → next destination — admins have hasAccess but no entitlement record ──
    if (season?.hasAccess && (season?.entitlement || season?.role === "admin")) {
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