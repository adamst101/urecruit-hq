// src/pages/Checkout.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, ArrowLeft, Tag, Lock } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess";
import SecondAthleteSection from "../components/checkout/SecondAthleteSection";

function trackEvent(payload) {
  try {
    const EventEntity = base44?.entities?.Event || base44?.entities?.Events;
    if (!EventEntity?.create) return;
    const now = new Date();
    const iso = now.toISOString();
    const day = iso.slice(0, 10);
    const eventName = payload?.event_name || payload?.event_type || "event";
    const sourcePlatform = payload?.source_platform || payload?.source || "web";
    const sourceKey = payload?.source_key || `${sourcePlatform}:${eventName}`;
    EventEntity.create({
      source_platform: String(sourcePlatform),
      event_type: String(eventName),
      title: String(payload?.title || eventName),
      source_key: String(sourceKey),
      start_date: String(payload?.start_date || day),
      payload_json: JSON.stringify(payload || {}),
      ts: iso,
    });
  } catch {}
}

export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading, mode, accountId } = useSeasonAccess();

  const [seasonConfig, setSeasonConfig] = useState(null);
  const [seasonLoading, setSeasonLoading] = useState(true);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  // Second athlete state
  const [addSecondAthlete, setAddSecondAthlete] = useState(false);
  const [athleteTwoName, setAthleteTwoName] = useState("");
  const [athleteTwoGradYear, setAthleteTwoGradYear] = useState("");

  const signedIn = !!accountId;

  const backTarget = useMemo(() => createPageUrl("Subscribe"), []);
  const discoverTarget = useMemo(() => createPageUrl("Discover"), []);

  const params = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const source = params.get("source") || "checkout_page";
  const isAddOn = params.get("addon") === "1";

  // Fetch dynamic season config
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke("getActiveSeason", {});
        if (!cancelled && res.data?.ok && res.data?.season) {
          setSeasonConfig(res.data.season);
        }
      } catch {}
      if (!cancelled) setSeasonLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const soldYear = seasonConfig?.season_year || new Date().getFullYear();
  const primaryPrice = seasonConfig?.price_primary || 49;
  const addOnPrice = seasonConfig?.price_add_on || 39;
  const BASE_PRICE = isAddOn ? addOnPrice : primaryPrice;

  const isBetaFreeCode = appliedCoupon?.code?.toUpperCase() === "BETA100";

  // Compute total
  const secondAthleteTotal = (!isAddOn && addSecondAthlete) ? addOnPrice : 0;

  const discountedPrice = useMemo(() => {
    if (isBetaFreeCode) return 0;
    const subtotal = BASE_PRICE + secondAthleteTotal;
    if (!appliedCoupon) return subtotal;
    if (appliedCoupon.percentOff) return Math.max(0, subtotal - subtotal * (appliedCoupon.percentOff / 100));
    if (appliedCoupon.amountOff) return Math.max(0, subtotal - appliedCoupon.amountOff);
    return subtotal;
  }, [appliedCoupon, isBetaFreeCode, BASE_PRICE, secondAthleteTotal]);

  const discountAmount = (BASE_PRICE + secondAthleteTotal) - discountedPrice;

  // Redirect paid users away (unless buying add-on)
  useEffect(() => {
    if (isLoading) return;
    if (mode === "paid" && !isAddOn) navigate(discoverTarget, { replace: true });
  }, [isLoading, mode, discoverTarget, navigate, isAddOn]);

  // Track checkout viewed
  useEffect(() => {
    if (isLoading || seasonLoading) return;
    if (mode === "paid" && !isAddOn) return;
    const key = `evt_checkout_viewed_${soldYear}_${isAddOn ? "addon" : "primary"}`;
    try { if (sessionStorage.getItem(key) === "1") return; sessionStorage.setItem(key, "1"); } catch {}
    trackEvent({ event_name: "checkout_viewed", mode: isAddOn ? "addon" : "demo", season_year: soldYear, source, account_id: accountId || null, is_add_on: isAddOn });
  }, [isLoading, seasonLoading, mode, soldYear, source, accountId, isAddOn]);

  // Apply coupon
  async function handleApplyCoupon() {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError("");
    setAppliedCoupon(null);
    try {
      const res = await base44.functions.invoke("createStripeCheckout", {
        couponCode: couponCode.trim(),
        athleteId: accountId || "",
        userEmail: "",
        successUrl: window.location.origin + createPageUrl("CheckoutSuccess"),
        cancelUrl: window.location.origin + createPageUrl("Subscribe"),
      });
      const result = res.data;
      if (result?.ok) {
        setAppliedCoupon({ code: couponCode.trim().toUpperCase() });
      } else {
        setCouponError(result?.error || "Invalid coupon code");
      }
    } catch {
      setCouponError("Could not validate coupon. Please try again.");
    } finally {
      setCouponLoading(false);
    }
  }

  // BETA100 free activation
  async function handleFreeActivation() {
    if (!signedIn) {
      const returnUrl = window.location.pathname + window.location.search;
      base44.auth.redirectToLogin(returnUrl);
      return;
    }
    setCheckoutLoading(true);
    setCheckoutError("");
    trackEvent({ event_name: "checkout_beta100_clicked", season_year: soldYear, source, account_id: accountId || null });
    try {
      const res = await base44.functions.invoke("activateFreeAccess", {
        promoCode: "BETA100",
        athleteId: accountId || "",
        userEmail: "",
        accountId: accountId || "",
      });
      const result = res.data;
      if (result?.ok) {
        navigate(createPageUrl("CheckoutSuccess") + "?free=true&season=" + (result.seasonYear || soldYear));
      } else {
        setCheckoutError(result?.error || "Activation failed. Please try again.");
        setCheckoutLoading(false);
      }
    } catch {
      setCheckoutError("Activation failed. Please try again.");
      setCheckoutLoading(false);
    }
  }

  // Real Stripe checkout
  async function handleCheckout() {
    if (!isAddOn && addSecondAthlete && !athleteTwoName.trim()) {
      setCheckoutError("Please enter the second athlete's name.");
      return;
    }
    setCheckoutLoading(true);
    setCheckoutError("");
    trackEvent({ event_name: "checkout_pay_clicked", season_year: soldYear, source, account_id: accountId || null, coupon: appliedCoupon?.code || null, add_second: addSecondAthlete });
    try {
      const res = await base44.functions.invoke("createStripeCheckout", {
        couponCode: appliedCoupon?.code || "",
        athleteId: accountId || "",
        userEmail: "",
        successUrl: window.location.origin + createPageUrl("CheckoutSuccess"),
        cancelUrl: window.location.origin + createPageUrl("Subscribe"),
        isAddOn,
        addSecondAthlete: !isAddOn && addSecondAthlete,
        athleteTwoName: athleteTwoName.trim(),
        athleteTwoGradYear: athleteTwoGradYear.trim(),
      });
      const result = res.data;
      if (result?.ok && result?.sessionUrl) {
        window.location.href = result.sessionUrl;
      } else {
        setCheckoutError(result?.error || "Checkout failed. Please try again.");
        setCheckoutLoading(false);
      }
    } catch {
      setCheckoutError("Checkout failed. Please try again.");
      setCheckoutLoading(false);
    }
  }

  if (isLoading || seasonLoading) return null;
  if (mode === "paid" && !isAddOn) return null;

  const displayName = seasonConfig?.display_name || `Season ${soldYear}`;

  const features = isAddOn
    ? [`Add another athlete to ${displayName}`, "Own favorites & registration tracking", "Conflict & travel detection", "Independent calendar view"]
    : [`Full access to ${displayName}`, "759+ college football camps", "Conflict & travel detection", "Multiple athletes per account", "Updated every Monday"];

  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh", padding: "24px 16px", fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <button onClick={() => navigate(backTarget)} type="button" style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 15, marginBottom: 24, padding: 0 }}>
          <ArrowLeft style={{ width: 16, height: 16 }} /> Back
        </button>

        {/* Order Summary Card */}
        <div style={{ background: "#111827", borderRadius: 16, overflow: "hidden", border: "1px solid #1f2937" }}>
          <div style={{ height: 4, background: "#e8a020" }} />
          <div style={{ padding: "28px 24px" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: 3, color: "#e8a020", textTransform: "uppercase" }}>Order Summary</div>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#f9fafb", margin: "8px 0 0", lineHeight: 1 }}>
              {isAddOn ? `Add-On Athlete ${soldYear}` : displayName}
            </h2>

            {/* Price breakdown */}
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, color: "#d1d5db", padding: "8px 0" }}>
                <span>{isAddOn ? `Add-On Athlete ${soldYear}` : `Season Pass ${soldYear}`}</span>
                <span>${BASE_PRICE.toFixed(2)}</span>
              </div>

              {!isAddOn && addSecondAthlete && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, color: "#d1d5db", padding: "8px 0" }}>
                  <span>Additional Athlete</span>
                  <span>${addOnPrice.toFixed(2)}</span>
                </div>
              )}

              {appliedCoupon && discountAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, color: "#e8a020", padding: "8px 0" }}>
                  <span>Discount ({appliedCoupon.code})</span>
                  <span>-${discountAmount.toFixed(2)}</span>
                </div>
              )}

              <div style={{ height: 1, background: "#1f2937", margin: "8px 0" }} />

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, fontWeight: 700, color: "#f9fafb", padding: "8px 0" }}>
                <span>Total</span>
                <span>${discountedPrice.toFixed(2)}</span>
              </div>
            </div>

            {/* Features */}
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
              {features.map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, color: "#d1d5db" }}>
                  <span style={{ color: "#e8a020", fontSize: 16, lineHeight: "20px", flexShrink: 0 }}>✓</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Second Athlete Section (only for primary purchase, not BETA100) */}
        {!isAddOn && !isBetaFreeCode && (
          <SecondAthleteSection
            addSecond={addSecondAthlete}
            setAddSecond={setAddSecondAthlete}
            athleteTwoName={athleteTwoName}
            setAthleteTwoName={setAthleteTwoName}
            athleteTwoGradYear={athleteTwoGradYear}
            setAthleteTwoGradYear={setAthleteTwoGradYear}
            addOnPrice={addOnPrice}
          />
        )}

        {/* Coupon Section */}
        <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", padding: "20px 24px", marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Tag style={{ width: 16, height: 16, color: "#9ca3af" }} />
            <span style={{ fontSize: 15, color: "#d1d5db", fontWeight: 600 }}>Promo Code</span>
          </div>

          {appliedCoupon ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 style={{ width: 16, height: 16, color: "#22c55e" }} />
              <span style={{ color: "#22c55e", fontSize: 14, fontWeight: 600 }}>{appliedCoupon.code} applied!</span>
              <button onClick={() => { setAppliedCoupon(null); setCouponCode(""); }} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 13, marginLeft: "auto" }}>Remove</button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                  placeholder="Enter code"
                  style={{ flex: 1, background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "10px 14px", fontSize: 15, color: "#f9fafb", outline: "none" }}
                />
                <button
                  onClick={handleApplyCoupon} disabled={couponLoading || !couponCode.trim()}
                  style={{ background: couponCode.trim() ? "#e8a020" : "#374151", color: couponCode.trim() ? "#0a0e1a" : "#6b7280", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 15, fontWeight: 700, cursor: couponCode.trim() ? "pointer" : "default", opacity: couponLoading ? 0.6 : 1 }}
                >
                  {couponLoading ? "..." : "Apply"}
                </button>
              </div>
              {couponError && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{couponError}</p>}
            </>
          )}
        </div>

        {/* Pay / Activate Button */}
        <button
          onClick={isBetaFreeCode ? handleFreeActivation : handleCheckout}
          disabled={checkoutLoading}
          style={{
            width: "100%", background: checkoutLoading ? "#b8860b" : "#e8a020", color: "#0a0e1a",
            border: "none", borderRadius: 12, padding: "18px 0", fontSize: 19, fontWeight: 700,
            cursor: checkoutLoading ? "wait" : "pointer", marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {checkoutLoading ? (
            <><Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} /> Processing...</>
          ) : isBetaFreeCode ? (
            <>Activate Free Access →</>
          ) : (
            <>Pay ${discountedPrice.toFixed(2)} — Get Season Access</>
          )}
        </button>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

        {checkoutError && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", marginTop: 12, color: "#ef4444", fontSize: 14 }}>
            {checkoutError}
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
          <Lock style={{ width: 14, height: 14, color: "#6b7280" }} />
          <span style={{ color: "#6b7280", fontSize: 13 }}>Secure checkout via Stripe</span>
          <span style={{ color: "#374151" }}>·</span>
          <span style={{ color: "#6b7280", fontSize: 13 }}>support@urecruithq.com</span>
        </div>
      </div>
    </div>
  );
}