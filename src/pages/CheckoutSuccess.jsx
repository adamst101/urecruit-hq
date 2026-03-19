import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, RefreshCw, AlertCircle, Check } from "lucide-react";
import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

const FEATURES = [
  "College football camps nationwide",
  "Conflict & travel detection",
  "Recruiting Guide & Camp Playbook",
  "Multi-athlete support",
  "Updated every Monday",
];

function StepIndicator({ step }) {
  // step: 1 = purchase done, 2 = create account, 3 = access hq
  const steps = ["Purchase", "Create Account", "Access HQ"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32, width: "100%", maxWidth: 400 }}>
      {steps.map((label, i) => {
        const num = i + 1;
        const done = num < step;
        const active = num === step;
        return (
          <React.Fragment key={label}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: done ? "#22c55e" : active ? "#e8a020" : "#1f2937",
                border: `2px solid ${done ? "#22c55e" : active ? "#e8a020" : "#374151"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700,
                color: done || active ? "#0a0e1a" : "#6b7280",
              }}>
                {done ? <Check style={{ width: 16, height: 16 }} /> : num}
              </div>
              <span style={{
                fontSize: 11, marginTop: 6, fontWeight: active ? 700 : 400,
                color: done ? "#22c55e" : active ? "#e8a020" : "#6b7280",
                textAlign: "center", lineHeight: 1.2,
              }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                height: 2, flex: 1, marginBottom: 18,
                background: done ? "#22c55e" : "#1f2937",
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading");
  const [data, setData] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // For addon: "waiting" | "done" | "error"
  const [addonStatus, setAddonStatus] = useState("waiting");
  const [addonError, setAddonError] = useState(null);

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  const isFree = params.get("free") === "true";
  const freeSeason = params.get("season");

  useEffect(() => {
    (async () => {
      try { setIsLoggedIn(await base44.auth.isAuthenticated()); } catch { setIsLoggedIn(false); }
    })();
  }, []);

  // Addon post-payment: poll for new athlete; fallback to creating it directly
  useEffect(() => {
    if (status !== "paid" || !isLoggedIn || !data?.isAddOn) return;
    let cancelled = false;

    (async () => {
      try {
        const me = await base44.auth.me();
        const accountId = me?.id;
        if (!accountId) { setAddonStatus("done"); return; }

        const initial = await base44.entities.AthleteProfile.filter({ account_id: accountId }).catch(() => []);
        const initialCount = Array.isArray(initial) ? initial.length : 0;

        // Poll up to 8 s for webhook to create the athlete
        const deadline = Date.now() + 8000;
        while (!cancelled && Date.now() < deadline) {
          await sleep(1500);
          const current = await base44.entities.AthleteProfile.filter({ account_id: accountId }).catch(() => []);
          if (Array.isArray(current) && current.length > initialCount) {
            if (!cancelled) setAddonStatus("done");
            return;
          }
        }

        // Webhook didn't fire in time — call linkStripePayment as fallback (uses service role)
        if (!cancelled) {
          try {
            const res = await base44.functions.invoke("linkStripePayment", { sessionId });
            const ok = res?.data?.ok || res?.ok;
            if (!ok) {
              const errMsg = res?.data?.error || "Could not create athlete profile";
              console.error("linkStripePayment fallback failed:", errMsg);
              if (!cancelled) setAddonError(errMsg);
            }
          } catch (e) {
            console.error("linkStripePayment invocation error:", e);
            if (!cancelled) setAddonError(e?.message || "Unexpected error");
          }
          if (!cancelled) setAddonStatus("done");
        }
      } catch (e) {
        console.error("Addon setup error:", e);
        if (!cancelled) { setAddonError(e?.message || "Unexpected error"); setAddonStatus("done"); }
      }
    })();

    return () => { cancelled = true; };
  }, [status, isLoggedIn, data]);

  // Navigate to Account once addon is confirmed (only if no error)
  useEffect(() => {
    if (addonStatus !== "done" || addonError) return;
    const t = setTimeout(() => navigate("/Account", { replace: true }), 1200);
    return () => clearTimeout(t);
  }, [addonStatus, addonError, navigate]);

  useEffect(() => {
    if (isFree) {
      setData({ seasonYear: freeSeason || "", amountPaid: 0 });
      setStatus("paid");
      return;
    }
    if (!sessionId) {
      navigate(createPageUrl("Workspace"), { replace: true });
      return;
    }
    (async () => {
      setStatus("loading");
      try {
        const res = await base44.functions.invoke("verifyStripeSession", { sessionId });
        const result = res.data;
        if (result?.ok && result?.paid) { setData(result); setStatus("paid"); }
        else if (result?.ok && !result?.paid) { setData(result); setStatus("pending"); }
        else { setStatus("error"); }
      } catch {
        setStatus("error");
      }
    })();
  }, [sessionId, navigate, isFree, freeSeason]);

  function handleCreateAccount() {
    try {
      sessionStorage.setItem("postPaymentSignup", "true");
      if (sessionId) sessionStorage.setItem("stripeSessionId", sessionId);
      if (data?.seasonYear) sessionStorage.setItem("paidSeasonYear", String(data.seasonYear));
    } catch {}
    const returnUrl = `${window.location.origin}/AuthRedirect?next=/Workspace&source=post_payment_signup`;
    base44.auth.redirectToLogin(returnUrl);
  }

  function handleLogin() {
    try {
      sessionStorage.setItem("postPaymentSignup", "true");
      if (sessionId) sessionStorage.setItem("stripeSessionId", sessionId);
      if (data?.seasonYear) sessionStorage.setItem("paidSeasonYear", String(data.seasonYear));
    } catch {}
    const returnUrl = `${window.location.origin}/AuthRedirect?next=/Workspace&source=post_payment_login`;
    base44.auth.redirectToLogin(returnUrl);
  }

  // ── Loading ──
  if (status === "loading") {
    return (
      <Page>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#e8a020" }} />
        <p style={{ color: "#9ca3af", fontSize: 18, marginTop: 16 }}>Confirming your payment...</p>
      </Page>
    );
  }

  // ── Free access success ──
  if (status === "paid" && isFree) {
    return (
      <Page>
        <CheckCircle2 style={{ width: 64, height: 64, color: "#22c55e", marginBottom: 20 }} />
        <h1 style={S.title}>YOU'RE IN!</h1>
        <p style={{ color: "#9ca3af", fontSize: 20, marginTop: 12 }}>Your free access is active.</p>
        {isLoggedIn && (
          <button onClick={() => navigate("/Account", { replace: true })} style={S.ctaBtn}>
            View My Account →
          </button>
        )}
      </Page>
    );
  }

  // ── Paid success — addon athlete, already logged in ──
  if (status === "paid" && isLoggedIn && data?.isAddOn) {
    if (addonError) {
      return (
        <Page>
          <AlertCircle style={{ width: 48, height: 48, color: "#ef4444", marginBottom: 16 }} />
          <h2 style={{ ...S.title, fontSize: 32 }}>PAYMENT SUCCEEDED</h2>
          <p style={{ color: "#9ca3af", fontSize: 15, marginTop: 12, lineHeight: 1.6, maxWidth: 360 }}>
            Your payment went through but we couldn't automatically add the athlete profile. Please contact support with your order details.
          </p>
          <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12, maxWidth: 360, fontFamily: "monospace", background: "#111827", padding: "10px 14px", borderRadius: 8 }}>
            {addonError}
          </p>
          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 16 }}>
            <a href="mailto:support@urecruithq.com" style={{ color: "#e8a020" }}>support@urecruithq.com</a>
          </p>
          <button onClick={() => navigate("/Account", { replace: true })} style={{ ...S.ctaBtn, marginTop: 20 }}>
            Go to My Account →
          </button>
        </Page>
      );
    }
    return (
      <Page>
        <Loader2 className="w-12 h-12 animate-spin" style={{ color: "#e8a020", marginBottom: 20 }} />
        <h1 style={{ ...S.title, fontSize: 36 }}>ADDING YOUR ATHLETE…</h1>
        <p style={{ color: "#9ca3af", fontSize: 16, marginTop: 12, lineHeight: 1.6, maxWidth: 340 }}>
          Payment confirmed. Finalizing {data?.athlete2Name || "your athlete"}'s profile — heading to your Account in a moment.
        </p>
      </Page>
    );
  }

  // ── Paid success — already logged in (primary purchase) ──
  if (status === "paid" && isLoggedIn) {
    return (
      <Page>
        <StepIndicator step={3} />
        <CheckCircle2 style={{ width: 64, height: 64, color: "#22c55e", marginBottom: 16 }} />
        <h1 style={S.title}>YOU'RE ALL SET!</h1>
        <p style={{ color: "#9ca3af", fontSize: 18, marginTop: 12, marginBottom: 24 }}>
          Season {data?.seasonYear} Pass is active on your account.
        </p>
        <FeatureCard />
        <button
          onClick={() => navigate("/Account", { replace: true })}
          style={S.ctaBtn}
        >
          View My Account →
        </button>
      </Page>
    );
  }

  // ── Paid success — needs account creation ──
  if (status === "paid") {
    const email = data?.email || "";
    const seasonYear = data?.seasonYear || "";
    const amountPaid = data?.amountPaid;

    return (
      <Page>
        <StepIndicator step={2} />

        {/* Success header */}
        <CheckCircle2 style={{ width: 56, height: 56, color: "#22c55e", marginBottom: 12 }} />
        <h1 style={S.title}>PAYMENT CONFIRMED!</h1>
        {amountPaid != null && (
          <p style={{ color: "#6b7280", fontSize: 15, marginTop: 6 }}>
            ${amountPaid} · Season {seasonYear} Pass
          </p>
        )}

        {/* What they unlocked */}
        <FeatureCard />

        {/* Account creation CTA */}
        <div style={{
          width: "100%", maxWidth: 440,
          background: "#111827",
          border: "1px solid #1f2937",
          borderTop: "3px solid #e8a020",
          borderRadius: 12,
          padding: "24px",
          marginTop: 24,
          textAlign: "left",
        }}>
          <p style={{ fontSize: 20, fontWeight: 700, color: "#f9fafb", margin: "0 0 8px" }}>
            One last step
          </p>
          <p style={{ color: "#9ca3af", fontSize: 15, lineHeight: 1.6, margin: "0 0 20px" }}>
            Create your free URecruit HQ account to access your Season Pass.
          </p>

          {email && (
            <div style={{
              background: "#0a0e1a",
              border: "1px solid #374151",
              borderRadius: 8,
              padding: "12px 16px",
              marginBottom: 20,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}>
              <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
                Your receipt was sent to
              </span>
              <span style={{ fontSize: 16, color: "#e8a020", fontWeight: 700 }}>{email}</span>
              <span style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                Use this email when creating your account to link your pass automatically.
              </span>
            </div>
          )}

          <button onClick={handleCreateAccount} style={{ ...S.ctaBtn, marginTop: 0, maxWidth: "100%" }}>
            Create My Account →
          </button>

          <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginTop: 16, marginBottom: 0 }}>
            Already have an account?{" "}
            <button
              onClick={handleLogin}
              style={{ background: "none", border: "none", color: "#e8a020", cursor: "pointer", textDecoration: "underline", fontSize: 13, padding: 0 }}
            >
              Log in instead →
            </button>
          </p>
        </div>

        <p style={{ color: "#6b7280", fontSize: 13, marginTop: 20 }}>
          Questions? <a href="mailto:support@urecruithq.com" style={{ color: "#e8a020" }}>support@urecruithq.com</a>
        </p>
      </Page>
    );
  }

  // ── Pending ──
  if (status === "pending") {
    return (
      <Page>
        <AlertCircle style={{ width: 48, height: 48, color: "#e8a020", marginBottom: 16 }} />
        <h2 style={{ ...S.title, fontSize: 36 }}>PAYMENT PENDING</h2>
        <p style={{ color: "#9ca3af", fontSize: 16, marginTop: 12, lineHeight: 1.6 }}>
          If you completed payment, please wait a moment and refresh.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8, padding: "12px 24px", fontSize: 16, fontWeight: 600, cursor: "pointer", marginTop: 20, display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <RefreshCw style={{ width: 16, height: 16 }} /> Refresh
        </button>
      </Page>
    );
  }

  // ── Error ──
  return (
    <Page>
      <AlertCircle style={{ width: 48, height: 48, color: "#ef4444", marginBottom: 16 }} />
      <h2 style={{ ...S.title, fontSize: 36 }}>SOMETHING WENT WRONG</h2>
      <p style={{ color: "#9ca3af", fontSize: 16, marginTop: 12 }}>
        We couldn't verify your payment. Please try again or contact support.
      </p>
      <button
        onClick={() => navigate(createPageUrl("Subscribe"), { replace: true })}
        style={S.ctaBtn}
      >
        Back to Subscribe
      </button>
      <p style={{ color: "#6b7280", fontSize: 14, marginTop: 16 }}>support@urecruithq.com</p>
    </Page>
  );
}

function FeatureCard() {
  return (
    <div style={{
      width: "100%", maxWidth: 440,
      background: "#111827",
      border: "1px solid #1f2937",
      borderRadius: 12,
      padding: "20px 24px",
      marginTop: 20,
      textAlign: "left",
    }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: 1, margin: "0 0 14px" }}>
        What you unlocked
      </p>
      {FEATURES.map(f => (
        <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 20, height: 20, borderRadius: "50%",
            background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Check style={{ width: 12, height: 12, color: "#22c55e" }} />
          </div>
          <span style={{ fontSize: 14, color: "#f9fafb" }}>{f}</span>
        </div>
      ))}
    </div>
  );
}

function Page({ children }) {
  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      <style>{FONTS}</style>
      <div style={{ textAlign: "center", maxWidth: 480, width: "100%", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {children}
      </div>
    </div>
  );
}

const S = {
  title: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "clamp(36px, 6vw, 52px)",
    color: "#f9fafb",
    lineHeight: 1,
    margin: 0,
  },
  ctaBtn: {
    width: "100%",
    maxWidth: 400,
    background: "#e8a020",
    color: "#0a0e1a",
    border: "none",
    borderRadius: 10,
    padding: "18px 0",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 24,
  },
};
