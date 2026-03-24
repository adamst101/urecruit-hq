// src/pages/CoachInviteLanding.jsx
// Handles /CoachInviteLanding?coach=CODE
// Validates the code, stores it in localStorage, then redirects to /Home.
// Parent sees nothing unusual — demo and site work as normal.
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

export default function CoachInviteLanding() {
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const code = new URLSearchParams(loc.search).get("coach") || "";

      if (code) {
        try {
          const coaches = await base44.entities.Coach.filter({
            invite_code: code,
            active: true,
          });

          if (!cancelled && Array.isArray(coaches) && coaches.length > 0) {
            try { localStorage.setItem("coachInviteCode", code); } catch {}
            console.log("Coach invite code stored:", code);
          } else {
            // Invalid or inactive code — store nothing, redirect cleanly
            console.warn("Coach invite code not found or inactive:", code);
          }
        } catch (err) {
          // Entity lookup failed — store nothing, redirect cleanly
          console.warn("Coach invite code lookup failed:", err?.message);
        }
      }

      if (!cancelled) {
        nav(createPageUrl("Home"), { replace: true });
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Render nothing — redirect happens immediately
  return null;
}
