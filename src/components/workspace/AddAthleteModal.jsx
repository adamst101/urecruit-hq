import React, { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { base44 } from "../../api/base44Client";
import { createPageUrl } from "../../utils";

export default function AddAthleteModal({ seasonConfig, accountId, onClose }) {
  const [name, setName] = useState("");
  const [gradYear, setGradYear] = useState("");
  const [position, setPosition] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const addOnPrice = seasonConfig?.price_add_on || 39;
  const displayName = seasonConfig?.display_name || `Season ${seasonConfig?.season_year || new Date().getFullYear()}`;

  async function handleSubmit() {
    if (!name.trim()) { setError("Athlete name is required"); return; }
    setLoading(true);
    setError("");

    try {
      const res = await base44.functions.invoke("createStripeCheckout", {
        isAddOn: true,
        athleteTwoName: name.trim(),
        athleteTwoGradYear: gradYear.trim(),
        athleteId: "",
        couponCode: "",
        userEmail: "",
        successUrl: window.location.origin + createPageUrl("CheckoutSuccess"),
        cancelUrl: window.location.origin + createPageUrl("Workspace"),
      });

      const result = res.data;
      if (result?.ok && result?.sessionUrl) {
        window.location.href = result.sessionUrl;
      } else {
        setError(result?.error || "Checkout failed. Please try again.");
        setLoading(false);
      }
    } catch (e) {
      setError("Checkout failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)" }} />
      <div style={{ position: "relative", background: "#111827", borderRadius: 16, border: "1px solid #1f2937", maxWidth: 440, width: "100%", padding: "32px 28px" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "#6b7280" }}>
          <X style={{ width: 20, height: 20 }} />
        </button>

        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#f9fafb", letterSpacing: 1 }}>ADD ANOTHER ATHLETE</div>
        <p style={{ color: "#9ca3af", fontSize: 15, marginTop: 6 }}>${addOnPrice} for the {displayName}</p>

        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Athlete name (required)"
            style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "12px 14px", fontSize: 15, color: "#f9fafb", outline: "none" }}
          />
          <input
            type="text"
            value={gradYear}
            onChange={(e) => setGradYear(e.target.value)}
            placeholder="Grad year (required)"
            style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "12px 14px", fontSize: 15, color: "#f9fafb", outline: "none" }}
          />
          <input
            type="text"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="Position (optional)"
            style={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "12px 14px", fontSize: 15, color: "#f9fafb", outline: "none" }}
          />
        </div>

        <div style={{ marginTop: 20, background: "#0a0e1a", borderRadius: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between", fontSize: 16 }}>
          <span style={{ color: "#9ca3af" }}>Additional Athlete Season Pass</span>
          <span style={{ color: "#f9fafb", fontWeight: 700 }}>${addOnPrice}.00</span>
        </div>

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 14px", marginTop: 12, color: "#ef4444", fontSize: 14 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%", background: loading ? "#b8860b" : "#e8a020", color: "#0a0e1a",
            border: "none", borderRadius: 10, padding: "16px 0", fontSize: 17, fontWeight: 700,
            cursor: loading ? "wait" : "pointer", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {loading ? <><Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> Processing...</> : `Add Athlete — $${addOnPrice}`}
        </button>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}