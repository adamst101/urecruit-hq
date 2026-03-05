// src/pages/Checkout.jsx
// Collects athlete info, initiates Stripe checkout session, redirects to Stripe
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Loader2 } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import SecondAthleteSection from "../components/checkout/SecondAthleteSection.jsx";

export default function Checkout() {
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  const seasonParam = params.get("season");
  const source = params.get("source") || "checkout";
  const next = params.get("next") || createPageUrl("CheckoutSuccess");

  const { isLoading: accessLoading, hasAccess, mode, accountId, isAuthenticated } = useSeasonAccess();

  const [seasonConfig, setSeasonConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [email, setEmail] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [addSecond, setAddSecond] = useState(false);
  const [athleteTwoName, setAthleteTwoName] = useState("");
  const [athleteTwoGradYear, setAthleteTwoGradYear] = useState("");

  // Load season config
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke("getActiveSeason", {});
        if (!cancelled && res.data?.ok && res.data?.season) {
          setSeasonConfig(res.data.season);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Pre-fill email from auth
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (me?.email) setEmail(me.email);
      } catch {}
    })();
  }, [isAuthenticated]);

  // Redirect if already paid
  useEffect(() => {
    if (accessLoading) return;
    if (mode === "paid" && hasAccess) {
      navigate(createPageUrl("Workspace"), { replace: true });
    }
  }, [accessLoading, mode, hasAccess, navigate]);

  const soldSeason = seasonConfig?.season_year || seasonParam || "";
  const pricePrimary = seasonConfig?.price_primary || 49;
  const priceAddOn = seasonConfig?.price_add_on || 39;
  const totalPrice = addSecond ? pricePrimary + priceAddOn : pricePrimary;

  // Check if promo code is a 100%-free code (like BETA100) that bypasses Stripe
  const [promoStatus, setPromoStatus] = useState(null); // null | "checking" | "free" | "discount" | "invalid"
  const [promoMessage, setPromoMessage] = useState("");

  async function handleApplyPromo() {
    const code = couponCode.trim();
    if (!code) {
      setPromoStatus(null);
      setPromoMessage("");
      return;
    }

    setPromoStatus("checking");
    setPromoMessage("");

    // First check if this is a free-access code by trying activateFreeAccess
    // That function only accepts codes like BETA100 that grant 100% free access
    if (isAuthenticated) {
      try {
        const freeRes = await base44.functions.invoke("activateFreeAccess", {
          promoCode: code,
          userEmail: email,
        });
        const freeData = freeRes.data;

        if (freeData?.ok) {
          setPromoStatus("free");
          setPromoMessage(freeData.alreadyActive
            ? "You already have an active pass! Redirecting..."
            : `Code "${code}" applied — 100% free access activated!`);
          // Redirect to success after a brief moment
          setTimeout(() => {
            navigate(
              createPageUrl("CheckoutSuccess") +
              `?free=true&season=${encodeURIComponent(freeData.seasonYear || soldSeason)}`
            , { replace: true });
          }, 1500);
          return;
        }
        // If the error is "This code requires card payment", it's a discount code — not free
        if (freeData?.error && !freeData.error.includes("card payment")) {
          setPromoStatus("invalid");
          setPromoMessage(freeData.error);
          return;
        }
      } catch {}
    }

    // It's either a discount code or user isn't logged in — mark as discount to apply at Stripe
    setPromoStatus("discount");
    setPromoMessage(`Code "${code}" will be applied at checkout`);
  }

  async function handleCheckout() {
    setError(null);

    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (addSecond && !athleteTwoName.trim()) {
      setError("Please enter the second athlete's name");
      return;
    }

    // If promo already activated free access, just redirect
    if (promoStatus === "free") return;

    // If user entered a promo but hasn't applied it yet, apply it first
    if (couponCode.trim() && !promoStatus) {
      await handleApplyPromo();
      // If it turned out to be free, don't continue to Stripe
      // We need a small delay to let state update
      return;
    }

    setWorking(true);

    try {
      const successUrl = window.location.origin + createPageUrl("CheckoutSuccess");
      const cancelUrl = window.location.href;

      const res = await base44.functions.invoke("createStripeCheckout", {
        userEmail: email,
        couponCode: couponCode.trim() || undefined,
        athleteOneName: athleteName.trim() || undefined,
        addSecondAthlete: addSecond,
        athleteTwoName: addSecond ? athleteTwoName.trim() : undefined,
        athleteTwoGradYear: addSecond ? athleteTwoGradYear.trim() : undefined,
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

  if (loading || accessLoading) {
    return (
      <div style={S.page}>
        <style>{S.fonts}</style>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#e8a020" }} />
      </div>
    );
  }

  return (
    <div style={{ background: "#0a0e1a", color: "#f9fafb", minHeight: "100vh", fontFamily: "'DM Sans', Inter, system-ui, sans-serif" }}>
      <style>{S.fonts}</style>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 24px" }}>
        {/* Back */}
        <button
          onClick={() => navigate(createPageUrl("Subscribe"))}
          style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} /> Back to pricing
        </button>

        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: "#f9fafb", margin: "0 0 8px" }}>
          CHECKOUT
        </h1>
        <p style={{ color: "#9ca3af", fontSize: 16, marginBottom: 32 }}>
          Season Pass {soldSeason} · ${pricePrimary}
        </p>

        {/* Email */}
        <label style={S.label}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          style={S.input}
        />

        {/* Athlete name (optional) */}
        <label style={{ ...S.label, marginTop: 16 }}>Athlete Name <span style={{ color: "#6b7280" }}>(optional)</span></label>
        <input
          type="text"
          value={athleteName}
          onChange={(e) => setAthleteName(e.target.value)}
          placeholder="First Last"
          style={S.input}
        />

        {/* Second athlete */}
        <SecondAthleteSection
          addSecond={addSecond}
          setAddSecond={setAddSecond}
          athleteTwoName={athleteTwoName}
          setAthleteTwoName={setAthleteTwoName}
          athleteTwoGradYear={athleteTwoGradYear}
          setAthleteTwoGradYear={setAthleteTwoGradYear}
          addOnPrice={priceAddOn}
        />

        {/* Promo code */}
        <label style={{ ...S.label, marginTop: 20 }}>Promo Code <span style={{ color: "#6b7280" }}>(optional)</span></label>
        <input
          type="text"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value)}
          placeholder="Enter code"
          style={S.input}
        />

        {/* Price summary */}
        <div style={{ background: "#111827", borderRadius: 12, padding: "16px 20px", marginTop: 24, border: "1px solid #1f2937" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, color: "#9ca3af" }}>
            <span>Season Pass {soldSeason}</span>
            <span style={{ color: "#f9fafb", fontWeight: 700 }}>${pricePrimary}</span>
          </div>
          {addSecond && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, color: "#9ca3af", marginTop: 8 }}>
              <span>Second Athlete</span>
              <span style={{ color: "#f9fafb", fontWeight: 700 }}>${priceAddOn}</span>
            </div>
          )}
          <div style={{ height: 1, background: "#1f2937", margin: "12px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700 }}>
            <span>Total</span>
            <span style={{ color: "#e8a020" }}>${totalPrice}</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, padding: "12px 16px", marginTop: 16, color: "#fca5a5", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* CTA */}
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
            marginTop: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: working ? 0.7 : 1
          }}
        >
          {working ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
          ) : (
            <>Continue to Payment <ArrowRight style={{ width: 18, height: 18 }} /></>
          )}
        </button>

        <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginTop: 12 }}>
          🔒 Secured by Stripe · You'll be redirected to complete payment
        </p>
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
    justifyContent: "center"
  },
  fonts: `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`,
  label: {
    display: "block",
    fontSize: 14,
    fontWeight: 600,
    color: "#d1d5db",
    marginBottom: 6
  },
  input: {
    width: "100%",
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "12px 14px",
    fontSize: 16,
    color: "#f9fafb",
    outline: "none",
    boxSizing: "border-box"
  }
};