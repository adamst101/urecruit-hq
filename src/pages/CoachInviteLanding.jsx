// src/pages/CoachInviteLanding.jsx
// Stores the coach invite code and redirects to the signup/checkout flow.
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "../utils";

export default function CoachInviteLanding() {
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    const code = new URLSearchParams(loc.search).get("coach") || "";
    if (code) {
      try { localStorage.setItem("coachInviteCode", code); } catch {}
    }
    nav(createPageUrl("Checkout"), { replace: true });
  }, []);

  return null;
}
