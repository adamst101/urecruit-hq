import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";
import { Button } from "../components/ui/button";

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading"); // loading | paid | pending | error
  const [data, setData] = useState(null);

  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");

  useEffect(() => {
    if (!sessionId) {
      navigate(createPageUrl("Workspace"), { replace: true });
      return;
    }

    async function verify() {
      setStatus("loading");
      const res = await base44.functions.invoke("verifyStripeSession", { sessionId });
      const result = res.data;

      if (result?.ok && result?.paid) {
        setData(result);
        setStatus("paid");
      } else if (result?.ok && !result?.paid) {
        setData(result);
        setStatus("pending");
      } else {
        setStatus("error");
      }
    }

    verify();
  }, [sessionId, navigate]);

  if (status === "loading") {
    return (
      <div style={{ background: "#0a0e1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#e8a020" }} />
        <p style={{ color: "#9ca3af", fontSize: 18, fontFamily: "'DM Sans', sans-serif" }}>Confirming your payment...</p>
      </div>
    );
  }

  if (status === "paid") {
    return (
      <div style={{ background: "#0a0e1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
        <div style={{ textAlign: "center", maxWidth: 480, fontFamily: "'DM Sans', sans-serif" }}>
          <CheckCircle2 style={{ width: 64, height: 64, color: "#22c55e", margin: "0 auto 20px" }} />
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(40px, 6vw, 56px)", color: "#f9fafb", lineHeight: 1, margin: 0 }}>
            YOU'RE IN! 🏈
          </h1>
          <p style={{ color: "#9ca3af", fontSize: 20, marginTop: 12 }}>
            Welcome to URecruit HQ {data?.seasonYear || ""}
          </p>
          <p style={{ color: "#6b7280", fontSize: 16, marginTop: 8, lineHeight: 1.6 }}>
            Your season pass is now active. Start discovering camps.
          </p>

          {data?.couponUsed && (
            <div style={{ display: "inline-block", background: "rgba(232,160,32,0.15)", border: "1px solid rgba(232,160,32,0.4)", borderRadius: 20, padding: "6px 16px", marginTop: 16, fontSize: 14, color: "#e8a020", fontWeight: 600 }}>
              Promo code {data.couponUsed} applied ✓
            </div>
          )}

          <div style={{ background: "#111827", borderRadius: 12, padding: "16px 20px", marginTop: 24, border: "1px solid #1f2937" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16 }}>
              <span style={{ color: "#9ca3af" }}>Season Pass {data?.seasonYear || ""}</span>
              <span style={{ color: "#f9fafb", fontWeight: 700 }}>${data?.amountPaid != null ? data.amountPaid.toFixed(2) : "49.00"}</span>
            </div>
          </div>

          <button
            onClick={() => navigate(createPageUrl("Workspace"), { replace: true })}
            style={{ width: "100%", background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 10, padding: "16px 0", fontSize: 18, fontWeight: 700, cursor: "pointer", marginTop: 24 }}
          >
            Go to My HQ →
          </button>

          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 16 }}>
            A receipt has been sent to {data?.email || "your email"}
          </p>
        </div>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div style={{ background: "#0a0e1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
        <div style={{ textAlign: "center", maxWidth: 480, fontFamily: "'DM Sans', sans-serif" }}>
          <AlertCircle style={{ width: 48, height: 48, color: "#e8a020", margin: "0 auto 16px" }} />
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: "#f9fafb", margin: 0 }}>Payment Pending</h2>
          <p style={{ color: "#9ca3af", fontSize: 16, marginTop: 12, lineHeight: 1.6 }}>
            If you completed payment, please wait a moment and refresh this page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8, padding: "12px 24px", fontSize: 16, fontWeight: 600, cursor: "pointer", marginTop: 20, display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <RefreshCw style={{ width: 16, height: 16 }} /> Refresh
          </button>
          <p style={{ color: "#6b7280", fontSize: 14, marginTop: 24 }}>
            Still having trouble? Contact us at support@urecruithq.com
          </p>
        </div>
      </div>
    );
  }

  // error
  return (
    <div style={{ background: "#0a0e1a", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ textAlign: "center", maxWidth: 480, fontFamily: "'DM Sans', sans-serif" }}>
        <AlertCircle style={{ width: 48, height: 48, color: "#ef4444", margin: "0 auto 16px" }} />
        <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: "#f9fafb", margin: 0 }}>Something Went Wrong</h2>
        <p style={{ color: "#9ca3af", fontSize: 16, marginTop: 12 }}>
          We couldn't verify your payment. Please try again or contact support.
        </p>
        <button
          onClick={() => navigate(createPageUrl("Subscribe"), { replace: true })}
          style={{ background: "#e8a020", color: "#0a0e1a", border: "none", borderRadius: 8, padding: "14px 24px", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 20 }}
        >
          Back to Subscribe
        </button>
        <p style={{ color: "#6b7280", fontSize: 14, marginTop: 16 }}>support@urecruithq.com</p>
      </div>
    </div>
  );
}