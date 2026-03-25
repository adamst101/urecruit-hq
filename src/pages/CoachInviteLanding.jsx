// src/pages/CoachInviteLanding.jsx
// No longer used — coaches share their code directly, not a link.
// Redirects to home if anyone lands here via an old link.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";

export default function CoachInviteLanding() {
  const nav = useNavigate();
  useEffect(() => { nav(createPageUrl("Home"), { replace: true }); }, []);
  return null;
}
