import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "../../api/base44Client";
import { isAdminEmail } from "./adminEmails.jsx";

export default function AdminRoute({ children }) {
  const [state, setState] = useState("loading"); // loading | admin | denied

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await base44.auth.me();
        if (cancelled) return;
        if (me && isAdminEmail(me.email)) {
          setState("admin");
        } else {
          setState("denied");
        }
      } catch {
        if (!cancelled) setState("denied");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === "loading") return null;
  if (state === "denied") return <Navigate to="/Workspace" replace />;
  return children;
}