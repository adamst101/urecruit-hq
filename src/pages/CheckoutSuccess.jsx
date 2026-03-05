import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading"); // loading | paid | pending | error
  const [data, setData] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  const isFree = params.get("free") === "true";
  const freeSeason = params.get("season");

  useEffect(() => {
    (async () => {
      try { setIsLoggedIn(await base44.auth.isAuthenticated()); } catch { setIsLoggedIn(false); }
    })();
  }, []);

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
      const res = await base44.functions.invoke("verifyStripeSession", { sessionId });
      const result = res.data;
      if (result?.ok && result?.paid) { setData(result); setStatus("paid"); }
      else if (result?.ok && !result?.paid) { setData(result); setStatus("pending"); }
      else { setStatus("error"); }
    })();
  }, [sessionId, navigate, isFree, freeSeason]);

  function handleCreateAccount() {
    try {
      sessionStorage.setItem("postPaymentSignup", "true");
      if (data?.seasonYear) sessionStorage.setItem("paidSeasonYear", String(data.seasonYear));
    } catch {}
    const returnUrl = `${window.location.origin}/AuthRedirect?next=/Workspace&source=post_payment_signup`;
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

  // ── Paid / Free Success ──
  if (status === "paid") {
    // Free flow — user is already logged in
    if (isFree) {
      return (
        <Page>
          <CheckCircle2 style={{ width: 64, height: 64, color: "#22c55e", marginBottom: 20 }} />
          <h1 style={S.title}>YOU'RE IN!</h1>
          <p style={{ color: "#9ca3af", fontSize: 20, marginTop: 12 }}>Your free access is active.</p>
          {isLoggedIn && (
            <button onClick={() => navigate(createPageUrl("Workspace"), { replace: true })} style={S.ctaBtn}>
              Go to My HQ →
            </button>
          )}
        </Page>
      );
    }

    // Paid flow
    return (
      <Page>
        <CheckCircle2 style={{ width: 64, height: 64, color: "#22c55e", marginBottom: 20 }} />
        <h1 style={S.title}>PAYMENT CONFIRMED!</h1>
        <p style={{ color: "#9ca3af", fontSize: 20, marginTop: 12 }}>Your Season Pass is active.</p>

        {isLoggedIn ? (
          <button onClick={() => navigate(createPageUrl("Workspace"), { replace: true })} style={S.ctaBtn}>
            Go to My HQ →
          </button>
        ) : (
          <>
            {/* Info box */}
            <div style={{
              background: "rgba(232,160,32,0.12)", border: "1px solid rgba(232,160,32,0.4)",
              borderRadius: 12, padding: "16px 20px", textAlign: "left", marginTop: 24, maxWidth: 400, width: "100%"
            }}>
              <p style={{ fontWeight: 700, color: "#f9fafb", fontSize: 16, margin: "0 0 8px" }}>
                Now create your account
              </p>
              <p style={{ color: "#9ca3af", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                Create your account to access your Season Pass.
              </p>
            </div>

            {/* Email matching tip */}
            <div style={{
              background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.25)",
              borderRadius: 10, padding: "12px 16px", textAlign: "left", marginTop: 12, maxWidth: 400, width: "100%"
            }}>
              <p style={{ color: "#e8a020", fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>
                💡 Tip
              </p>
              <p style={{ color: "#9ca3af", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                Use the same email address you entered at checkout so your payment is linked automatically.
              </p>
            </div>

            <button onClick={handleCreateAccount} style={S.ctaBtn}>
              Create My Account →
            </button>

            <p style={{ color: "#6b7280", fontSize: 14, marginTop: 16 }}>
              Already have an account?{" "}
              <button onClick={() => {
                try {
                  sessionStorage.setItem("postPaymentSignup", "true");
                  if (data?.seasonYear) sessionStorage.setItem("paidSeasonYear", String(data.seasonYear));
                } catch {}
                const returnUrl = `${window.location.origin}/AuthRedirect?next=/Workspace&source=post_payment_login`;
                base44.auth.redirectToLogin(returnUrl);
              }} style={{ background: "none", border: "none", color: "#e8a020", cursor: "pointer", textDecoration: "underline", fontSize: 14 }}>
                Log in instead →
              </button>
            </p>
          </>
        )}
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

function Page({ children }) {
  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{FONTS}</style>
      <div style={{ textAlign: "center", maxWidth: 480, fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {children}
      </div>
    </div>
  );
}

const S = {
  title: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: "clamp(40px, 6vw, 56px)",
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
    padding: "16px 0",
    fontSize: 18,
    fontWeight: 700,
    cursor: "pointer",
    marginTop: 24,
  },
};