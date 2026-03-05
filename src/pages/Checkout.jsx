import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Loader2, Check, X } from "lucide-react";
import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

export default function Checkout() {
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  const [seasonConfig, setSeasonConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const [isAuthed, setIsAuthed] = useState(false);

  // Promo state
  const [promoCode, setPromoCode] = useState("");
  const [promoState, setPromoState] = useState(null); // null | "checking" | { ok, isFree, percentOff, amountOff, code, error }

  // Load season config + check auth
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [seasonRes, authed] = await Promise.all([
          base44.functions.invoke("getActiveSeason", {}),
          base44.auth.isAuthenticated().catch(() => false),
        ]);
        if (cancelled) return;
        if (seasonRes.data?.ok && seasonRes.data?.season) {
          setSeasonConfig(seasonRes.data.season);
        }
        setIsAuthed(!!authed);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-apply promo from URL param or sessionStorage
  useEffect(() => {
    if (loading) return;
    const urlPromo = params.get("promo");
    const pendingPromo = (() => { try { return sessionStorage.getItem("pendingPromoCode"); } catch { return null; } })();
    const code = urlPromo || pendingPromo || "";
    if (pendingPromo) { try { sessionStorage.removeItem("pendingPromoCode"); } catch {} }
    if (code) {
      setPromoCode(code);
      applyPromo(code);
    }
  }, [loading]);

  // After returning from login with a free code, auto-activate
  useEffect(() => {
    if (loading || !isAuthed) return;
    const urlPromo = params.get("promo");
    const autoActivate = params.get("activate") === "true";
    if (autoActivate && urlPromo && promoState?.isFree) {
      activateFreeAccess(urlPromo);
    }
  }, [loading, isAuthed, promoState]);

  const applyPromo = useCallback(async (code) => {
    const trimmed = (code || "").trim();
    if (!trimmed) return;
    setPromoState("checking");
    setError(null);
    try {
      const res = await base44.functions.invoke("validatePromo", { promoCode: trimmed });
      const data = res.data;
      if (data?.ok) {
        setPromoState(data);
      } else {
        setPromoState({ ok: false, error: data?.error || "Invalid code" });
      }
    } catch {
      setPromoState({ ok: false, error: "Could not validate code" });
    }
  }, []);

  async function activateFreeAccess(code) {
    setWorking(true);
    setError(null);
    try {
      const me = await base44.auth.me();
      const res = await base44.functions.invoke("activateFreeAccess", {
        promoCode: code || promoCode.trim(),
        accountId: me?.id,
        userEmail: me?.email,
      });
      const data = res.data;
      if (data?.ok) {
        navigate(
          createPageUrl("CheckoutSuccess") + `?free=true&season=${encodeURIComponent(data.seasonYear || "")}`,
          { replace: true }
        );
      } else {
        setError(data?.error || "Failed to activate access");
        setWorking(false);
      }
    } catch (e) {
      setError(e?.message || "Something went wrong");
      setWorking(false);
    }
  }

  async function handleCheckout() {
    setError(null);

    // Free code flow
    if (promoState?.ok && promoState?.isFree) {
      if (isAuthed) {
        // Already logged in — activate immediately
        await activateFreeAccess(promoCode.trim());
      } else {
        // Save code and redirect to login — AuthRedirect will pick up pendingPromoCode
        try { sessionStorage.setItem("pendingPromoCode", promoCode.trim()); } catch {}
        const returnUrl = `${window.location.origin}/AuthRedirect?source=promo_checkout`;
        base44.auth.redirectToLogin(returnUrl);
      }
      return;
    }

    // Paid flow — redirect to Stripe
    setWorking(true);
    try {
      const successUrl = window.location.origin + createPageUrl("CheckoutSuccess");
      const cancelUrl = window.location.href;

      const res = await base44.functions.invoke("createStripeCheckout", {
        couponCode: promoCode.trim() || undefined,
        successUrl,
        cancelUrl,
      });
      const data = res.data;
      if (data?.ok && data?.sessionUrl) {
        window.location.href = data.sessionUrl;
        return;
      }
      setError(data?.error || "Failed to create checkout session");
    } catch (e) {
      setError(e?.message || "Something went wrong");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <div style={S.page}>
        <style>{FONTS}</style>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#e8a020" }} />
      </div>
    );
  }

  const basePrice = seasonConfig?.price_primary || 49;
  const displayName = seasonConfig?.display_name || `Season ${seasonConfig?.season_year || ""}`;
  const promoValid = promoState?.ok;
  const promoFree = promoState?.isFree;
  const promoChecking = promoState === "checking";

  // Calculate discount
  let discountAmount = 0;
  if (promoValid) {
    if (promoState.percentOff) discountAmount = Math.round(basePrice * promoState.percentOff) / 100;
    else if (promoState.amountOff) discountAmount = promoState.amountOff;
  }
  const finalPrice = Math.max(0, basePrice - discountAmount);

  // Button text
  let buttonText = `Complete Purchase — $${finalPrice}`;
  if (promoFree) buttonText = "Get Access";
  else if (!promoValid && !promoChecking) buttonText = `Complete Purchase — $${basePrice}`;

  return (
    <div style={{ background: "#0a0e1a", color: "#f9fafb", minHeight: "100vh", fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <style>{FONTS}</style>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 24px" }}>
        {/* Back */}
        <button
          onClick={() => navigate(createPageUrl("Subscribe"))}
          style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} /> Back to pricing
        </button>

        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: "#f9fafb", margin: "0 0 24px" }}>
          CHECKOUT
        </h1>

        {/* ──── ORDER SUMMARY CARD ──── */}
        <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", borderTop: "3px solid #e8a020", padding: "20px 24px", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, marginBottom: 12 }}>
            <span style={{ color: "#f9fafb", fontWeight: 600 }}>{displayName}</span>
            <span style={{ color: "#f9fafb", fontWeight: 700 }}>${basePrice}</span>
          </div>

          {promoValid && discountAmount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, color: "#e8a020", marginBottom: 12 }}>
              <span>Discount ({promoState.code})</span>
              <span>−${discountAmount.toFixed(2)}</span>
            </div>
          )}

          {promoValid && discountAmount > 0 && (
            <>
              <div style={{ height: 1, background: "#1f2937", margin: "0 0 12px" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700 }}>
                <span>Total</span>
                <span style={{ color: promoFree ? "#22c55e" : "#f9fafb" }}>${finalPrice.toFixed(2)}</span>
              </div>
            </>
          )}

          {/* Features */}
          <div style={{ marginTop: 16, borderTop: "1px solid #1f2937", paddingTop: 14 }}>
            {[
              "College football camps nationwide",
              "Conflict & travel detection",
              "Recruiting Guide & Camp Playbook",
              "Multi-athlete support",
              "Updated every Monday",
            ].map((f) => (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#9ca3af", marginBottom: 6 }}>
                <Check style={{ width: 14, height: 14, color: "#22c55e", flexShrink: 0 }} /> {f}
              </div>
            ))}
          </div>
        </div>

        {/* ──── PROMO CODE ROW ──── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            value={promoCode}
            onChange={(e) => {
              setPromoCode(e.target.value);
              if (promoState) { setPromoState(null); }
            }}
            placeholder="Promo code (optional)"
            disabled={promoChecking || promoValid}
            style={{ flex: 1, background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "12px 14px", fontSize: 16, color: "#f9fafb", outline: "none", boxSizing: "border-box" }}
          />
          <button
            type="button"
            onClick={() => applyPromo(promoCode)}
            disabled={!promoCode.trim() || promoChecking || promoValid}
            style={{
              background: promoValid ? "#22c55e" : "#1f2937",
              color: promoValid ? "#fff" : "#f9fafb",
              border: "1px solid #374151",
              borderRadius: 8,
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 600,
              cursor: promoChecking || promoValid ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              opacity: !promoCode.trim() ? 0.5 : 1,
            }}
          >
            {promoChecking ? "Checking..." : promoValid ? "✓ Applied" : "Apply"}
          </button>
        </div>

        {/* Promo feedback */}
        {promoState && promoState !== "checking" && (
          <div style={{
            fontSize: 14, padding: "8px 12px", borderRadius: 8, marginBottom: 16,
            display: "flex", alignItems: "center", gap: 8,
            background: promoValid ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${promoValid ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
            color: promoValid ? "#86efac" : "#fca5a5",
          }}>
            {promoValid ? (
              <><Check style={{ width: 16, height: 16 }} /> {promoFree ? "100% off — free access" : `${promoState.percentOff}% off applied`}</>
            ) : (
              <><X style={{ width: 16, height: 16 }} /> {promoState.error || "Invalid or expired code"}</>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, color: "#fca5a5", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* ──── ACTION BUTTON ──── */}
        <button
          onClick={handleCheckout}
          disabled={working}
          style={{
            width: "100%",
            background: working ? "#b8860b" : "#e8a020",
            color: "#0a0e1a",
            border: "none",
            borderRadius: 10,
            padding: "18px 0",
            fontSize: 19,
            fontWeight: 700,
            cursor: working ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: working ? 0.7 : 1,
          }}
        >
          {working ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
          ) : (
            <>{buttonText} <ArrowRight style={{ width: 18, height: 18 }} /></>
          )}
        </button>

        {!promoFree && (
          <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginTop: 12 }}>
            🔒 Secured by Stripe · You'll be redirected to complete payment
          </p>
        )}
      </div>
    </div>
  );
}

const S = {
  page: {
    background: "#0a0e1a",
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};