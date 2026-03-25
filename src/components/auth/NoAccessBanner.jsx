// src/components/auth/NoAccessBanner.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { createPageUrl } from "../../utils";
import { useSeasonAccess } from "../hooks/useSeasonAccess.jsx";

const DISMISS_KEY = "accessBannerDismissed";

export default function NoAccessBanner() {
  const nav = useNavigate();
  const { isLoading, isAuthenticated, hasAccess, mode } = useSeasonAccess();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "true"; } catch { return false; }
  });

  if (isLoading || !isAuthenticated || hasAccess || mode === "demo" || mode === "coach_pending" || mode === "coach" || dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_KEY, "true"); } catch {}
  }

  return (
    <div style={{
      background: "#1d4ed8", width: "100%", height: 40,
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative", zIndex: 60,
      fontSize: 14, color: "#fff",
      padding: "0 40px 0 16px",
    }}>
      <span>
        🎯 Your account is ready — complete your Season Pass to unlock full access.{" "}
        <button
          onClick={() => nav(createPageUrl("Subscribe") + "?source=no_access_banner")}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#fbbf24", fontWeight: 700, fontSize: 14,
            textDecoration: "underline", textUnderlineOffset: 2,
          }}
        >
          Get Access →
        </button>
      </span>

      <button
        onClick={handleDismiss}
        style={{
          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.7)", padding: 4,
        }}
      >
        <X style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
}