import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess";

export default function Upgrade() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next");
  const { accountId } = useSeasonAccess();
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubscribe() {
    setWorking(true);
    setErr(null);
    try {
      // Replace with your billing integration
      // Expected: triggers checkout and returns success
      await base44.functions.startCheckout?.();

      // After checkout, route to next or Profile
      nav(next ? next : createPageUrl("Profile"), { replace: true });
    } catch (e) {
      setErr(e?.message || "Subscription failed. Please try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div style={{ padding: 28, maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>Upgrade</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Full access: target schools, full discover, calendar overlays, and multi-athlete profiles.
          </div>
        </div>
        <button
          onClick={() => nav(createPageUrl("Home"))}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
        >
          Back
        </button>
      </div>

      <div style={{ marginTop: 18, border: "1px solid #eee", borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Plan</div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 34, fontWeight: 900 }}>$X</div>
          <div style={{ opacity: 0.7 }}>/ month</div>
        </div>

        <ul style={{ marginTop: 12, lineHeight: 1.7 }}>
          <li>Unlimited target schools</li>
          <li>Unlimited camps + advanced filters</li>
          <li>Calendar conflict detection</li>
          <li>Multiple athletes per account</li>
        </ul>

        {err && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#fff3f3", border: "1px solid #ffd0d0" }}>
            {err}
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          <button
            disabled={working}
            onClick={handleSubscribe}
            style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", fontWeight: 800 }}
          >
            {working ? "Processing…" : "Subscribe"}
          </button>

          {accountId && (
            <button
              onClick={() => nav(createPageUrl("Profile"))}
              style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #ddd", background: "#fff" }}
            >
              Manage athletes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}