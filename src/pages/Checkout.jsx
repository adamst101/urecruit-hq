import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Loader2, Check, X } from "lucide-react";
import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

const GRAD_YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i);
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

export default function Checkout() {
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const isAddonMode = params.get("mode") === "addon";

  const [seasonConfig, setSeasonConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const [isAuthed, setIsAuthed] = useState(false);

  // Profile step state
  const [step, setStep] = useState("profile"); // "profile" | "payment"
  const [sports, setSports] = useState([]);
  const [athleteFirstName, setAthleteFirstName] = useState("");
  const [athleteLastName, setAthleteLastName] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [sportId, setSportId] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [homeState, setHomeState] = useState("");
  const [parentFirstName, setParentFirstName] = useState("");
  const [parentLastName, setParentLastName] = useState("");
  const [parentPhone, setParentPhone] = useState("");

  // Promo state
  const [promoCode, setPromoCode] = useState("");
  const [promoState, setPromoState] = useState(null); // null | "checking" | { ok, isFree, percentOff, amountOff, code, error }

  // Load season config + check auth
  useEffect(() => {
    let cancelled = false;
    const withTimeout = (p, ms) =>
      Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
    (async () => {
      try {
        const [seasonRes, authed] = await Promise.all([
          withTimeout(base44.functions.invoke("getActiveSeason", {}), 5000).catch(() => null),
          base44.auth.isAuthenticated().catch(() => false),
        ]);
        if (cancelled) return;
        if (seasonRes?.data?.ok && seasonRes?.data?.season) {
          setSeasonConfig(seasonRes.data.season);
        }
        const authenticated = !!authed;
        setIsAuthed(authenticated);
        // Add-on flow requires an existing account
        if (isAddonMode && !authenticated) {
          navigate("/Subscribe", { replace: true });
          return;
        }
        // In add-on mode, pre-populate parent info from the primary athlete profile
        if (isAddonMode && authenticated) {
          try {
            const profiles = await base44.entities.AthleteProfile.filter({ is_primary: true });
            const primary = Array.isArray(profiles) ? profiles[0] : null;
            if (primary) {
              if (primary.parent_first_name) setParentFirstName(primary.parent_first_name);
              if (primary.parent_last_name) setParentLastName(primary.parent_last_name);
              if (primary.parent_phone) setParentPhone(primary.parent_phone);
            }
          } catch {}
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [isAddonMode]);

  // Pre-warm validatePromo Deno function so cold-start latency is absorbed before the user types a code
  useEffect(() => {
    base44.functions.invoke("validatePromo", { promoCode: "" }).catch(() => {});
  }, []);

  // Load sports list
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rows = await base44.entities.Sport.list();
        if (mounted) setSports(Array.isArray(rows) ? rows.filter(r => r.active !== false) : []);
      } catch {}
    })();
    return () => { mounted = false; };
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

  // Restore form data saved before login redirect, then advance to payment step
  useEffect(() => {
    if (loading) return;
    try {
      const saved = sessionStorage.getItem("checkoutForm");
      if (!saved) return;
      sessionStorage.removeItem("checkoutForm");
      const d = JSON.parse(saved);
      if (d.athleteFirstName) setAthleteFirstName(d.athleteFirstName);
      if (d.athleteLastName) setAthleteLastName(d.athleteLastName);
      if (d.gradYear) setGradYear(d.gradYear);
      if (d.sportId) setSportId(d.sportId);
      if (d.homeCity) setHomeCity(d.homeCity);
      if (d.homeState) setHomeState(d.homeState);
      if (d.parentFirstName) setParentFirstName(d.parentFirstName);
      if (d.parentLastName) setParentLastName(d.parentLastName);
      if (d.parentPhone) setParentPhone(d.parentPhone);
      // Skip straight to payment step — user already filled the form before login
      if (d.athleteFirstName) setStep("payment");
    } catch {}
  }, [loading]);

  function handleContinueToPayment(e) {
    e.preventDefault();
    if (!athleteFirstName.trim()) { setError("Athlete first name is required"); return; }
    if (!athleteLastName.trim()) { setError("Athlete last name is required"); return; }
    if (!homeCity.trim()) { setError("Home city is required"); return; }
    if (!homeState) { setError("Home state is required"); return; }
    if (!isAddonMode) {
      if (!parentFirstName.trim()) { setError("Parent / guardian first name is required"); return; }
      if (!parentLastName.trim()) { setError("Parent / guardian last name is required"); return; }
      if (!parentPhone.trim()) { setError("Parent / guardian phone number is required"); return; }
    }
    setError(null);
    setStep("payment");
  }

  const applyPromo = useCallback(async (code) => {
    const trimmed = (code || "").trim();
    if (!trimmed) return;
    setPromoState("checking");
    setError(null);
    const withTimeout = (p, ms) =>
      Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
    // Retry once on timeout (Deno cold start can take several seconds)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await withTimeout(
          base44.functions.invoke("validatePromo", { promoCode: trimmed }),
          10000
        );
        const data = res.data;
        if (data?.ok) {
          setPromoState(data);
        } else {
          setPromoState({ ok: false, error: data?.error || "Invalid code" });
        }
        return;
      } catch (e) {
        if (e?.message === "timeout" && attempt === 0) {
          // First attempt timed out — silently retry (Deno cold start)
          continue;
        }
        const msg = e?.message === "timeout"
          ? "Validation timed out — please try again"
          : "Could not validate code — please try again";
        setPromoState({ ok: false, error: msg });
        return;
      }
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
        isAddOn: isAddonMode || undefined,
        athleteFirstName: athleteFirstName.trim() || undefined,
        athleteLastName: athleteLastName.trim() || undefined,
        gradYear: gradYear || undefined,
        sportId: sportId || undefined,
        homeCity: homeCity.trim() || undefined,
        homeState: homeState || undefined,
        parentFirstName: isAddonMode ? undefined : (parentFirstName.trim() || undefined),
        parentLastName: isAddonMode ? undefined : (parentLastName.trim() || undefined),
        parentPhone: isAddonMode ? undefined : (parentPhone.trim() || undefined),
      });
      const data = res.data;
      if (data?.ok) {
        navigate("/Workspace", { replace: true });
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

    // All promo codes (including 100% off) go through Stripe checkout so
    // max_redemptions is enforced server-side. $0 sessions fire the webhook
    // with payment_status "no_payment_required" which the webhook handles.
    setWorking(true);
    try {
      const successUrl = window.location.origin + createPageUrl("CheckoutSuccess");
      const cancelUrl = window.location.href;

      const athleteFullName = [athleteFirstName.trim(), athleteLastName.trim()].filter(Boolean).join(" ");

      const res = await base44.functions.invoke("createStripeCheckout", {
        couponCode: promoCode.trim() || undefined,
        promoId: promoState?.promoId || undefined,
        successUrl,
        cancelUrl,
        isAddOn: isAddonMode || undefined,
        // Add-on: pass athlete as athleteTwoName (what the webhook uses for scenario C)
        athleteTwoName: isAddonMode ? (athleteFullName || undefined) : undefined,
        athleteTwoGradYear: isAddonMode ? (gradYear || undefined) : undefined,
        // Parent info — sent for both primary and add-on (add-on pre-populated from primary profile)
        parentFirstName: parentFirstName.trim() || undefined,
        parentLastName: parentLastName.trim() || undefined,
        parentPhone: parentPhone.trim() || undefined,
        athleteFirstName: isAddonMode ? undefined : (athleteFirstName.trim() || undefined),
        athleteLastName: isAddonMode ? undefined : (athleteLastName.trim() || undefined),
        gradYear: isAddonMode ? undefined : (gradYear || undefined),
        sportId: sportId || undefined,
        homeCity: homeCity.trim() || undefined,
        homeState: homeState || undefined,
        coachInviteCode: (() => { try { return localStorage.getItem("coachInviteCode") || undefined; } catch { return undefined; } })(),
      });
      const data = res.data;
      console.log("createStripeCheckout response:", data);
      if (data?.ok && data?.sessionUrl) {
        window.location.href = data.sessionUrl;
        return;
      }
      setError(data?.error || "Failed to create checkout session. Please try again.");
    } catch (e) {
      console.error("createStripeCheckout error:", e);
      setError(e?.message || "Something went wrong. Please try again.");
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

  const basePrice = isAddonMode
    ? (seasonConfig?.price_add_on || 39)
    : (seasonConfig?.price_primary || 49);
  const displayName = isAddonMode
    ? `Additional Athlete — Season ${seasonConfig?.season_year || ""}`
    : (seasonConfig?.display_name || `Season ${seasonConfig?.season_year || ""}`);
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
          onClick={() => step === "payment" ? setStep("profile") : navigate(isAddonMode ? "/Account" : createPageUrl("Subscribe"))}
          style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} /> {step === "payment" ? "Back" : isAddonMode ? "Back to account" : "Back to pricing"}
        </button>

        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: "#f9fafb", margin: "0 0 24px" }}>
          {isAddonMode ? "ADD ATHLETE" : step === "profile" ? "YOUR INFO" : "CHECKOUT"}
        </h1>

        {/* ──── STEP 1: PROFILE FORM ──── */}
        {step === "profile" && (
          <form onSubmit={handleContinueToPayment} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Athlete Info */}
            <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", borderTop: "3px solid #e8a020", padding: "20px 24px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e8a020", letterSpacing: 1, textTransform: "uppercase", marginBottom: 16 }}>Athlete Info</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={S.label}>First Name *</label>
                  <input value={athleteFirstName} onChange={e => setAthleteFirstName(e.target.value)} placeholder="First" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Last Name *</label>
                  <input value={athleteLastName} onChange={e => setAthleteLastName(e.target.value)} placeholder="Last" style={S.input} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <div>
                  <label style={S.label}>Grad Year</label>
                  <select value={gradYear} onChange={e => setGradYear(e.target.value)} style={S.input}>
                    <option value="">Select...</option>
                    {GRAD_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Sport</label>
                  <select value={sportId} onChange={e => setSportId(e.target.value)} style={S.input}>
                    <option value="">Select...</option>
                    {sports.map(s => <option key={s.id} value={s.id}>{s.sport_name || s.name}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <div>
                  <label style={S.label}>Home City *</label>
                  <input value={homeCity} onChange={e => setHomeCity(e.target.value)} placeholder="City" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>State *</label>
                  <select value={homeState} onChange={e => setHomeState(e.target.value)} style={S.input}>
                    <option value="">Select...</option>
                    {US_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Parent / Guardian Info — hidden in add-on mode (already on file) */}
            <div style={{ background: "#111827", borderRadius: 12, border: "1px solid #1f2937", padding: "20px 24px", display: isAddonMode ? "none" : "block" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e8a020", letterSpacing: 1, textTransform: "uppercase", marginBottom: 16 }}>Parent / Guardian</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={S.label}>First Name *</label>
                  <input value={parentFirstName} onChange={e => setParentFirstName(e.target.value)} placeholder="First" style={S.input} />
                </div>
                <div>
                  <label style={S.label}>Last Name *</label>
                  <input value={parentLastName} onChange={e => setParentLastName(e.target.value)} placeholder="Last" style={S.input} />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={S.label}>Phone Number *</label>
                <input value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="(555) 555-5555" type="tel" style={S.input} />
              </div>
            </div>

            {error && (
              <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, padding: "12px 16px", color: "#fca5a5", fontSize: 14 }}>
                {error}
              </div>
            )}

            <button type="submit" style={{ width: "100%", background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 10, padding: "18px 0", fontSize: 19, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              Continue to Checkout <ArrowRight style={{ width: 18, height: 18 }} />
            </button>
            <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", margin: 0 }}>
              You can update your profile anytime after purchase.
            </p>
          </form>
        )}

        {/* ──── STEP 2: PAYMENT ──── */}
        {step === "payment" && <>

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
              <><Check style={{ width: 16, height: 16 }} /> {promoFree ? "Free access unlocked" : "Promo code applied"}</>
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

        {/* Account note for new users — not shown in add-on mode */}
        {!isAddonMode && !isAuthed && (
          <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", margin: "0 0 12px", lineHeight: 1.5 }}>
            No account yet? You'll create one after checkout.
          </p>
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

        <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginTop: 12 }}>
          🔒 Secured by Stripe · You'll be redirected to complete{promoFree ? " your free order" : " payment"}
        </p>
        </>}
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
  label: { display: "block", fontSize: 13, color: "#9ca3af", marginBottom: 4 },
  input: { width: "100%", background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "10px 12px", fontSize: 15, color: "#f9fafb", outline: "none", boxSizing: "border-box" },
};