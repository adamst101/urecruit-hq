// src/layout/main.js  (Base44 uses this as the shared layout)
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LogIn, User } from "lucide-react";

import { base44 } from "../api/base44Client";
import { createPageUrl } from "../utils";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

async function safeMe() {
  try {
    const me = await base44.auth.me();
    return me || null;
  } catch {
    return null;
  }
}

// Remove demo-only query params so “Member login” doesn’t send an entitled user back into demo mode.
function cleanNextUrl(pathname, search) {
  try {
    const sp = new URLSearchParams(search || "");
    // demo flags
    sp.delete("mode");
    sp.delete("src");
    sp.delete("source");

    const qs = sp.toString();
    return `${pathname || "/"}${qs ? `?${qs}` : ""}`;
  } catch {
    return `${pathname || "/"}${search || ""}`;
  }
}

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [logoOk, setLogoOk] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  const isHomePage = useMemo(() => {
    const p = String(location?.pathname || "").toLowerCase();
    return p === "/" || p === "/home";
  }, [location?.pathname]);

  // Keep auth state current (so we can show Member login vs Account)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await safeMe();
      if (cancelled) return;
      setIsAuthed(!!me?.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [location?.pathname, location?.search]);

  function goHome() {
    navigate(createPageUrl("Home"));
  }

  function goAccount() {
    navigate(createPageUrl("Profile"));
  }

  // “Member login” should behave consistently across pages:
  // - Clear any demo session flags
  // - Send the user to Base44 /login with a from_url that returns to Subscribe gate + next
  //   (Subscribe can then show paid vs demo state cleanly)
  function handleMemberLogin() {
    try {
      sessionStorage.removeItem("demo_mode_v1");
      sessionStorage.removeItem("demo_year_v1");
    } catch {}

    const nextClean = cleanNextUrl(location.pathname, location.search);

    // After login, land on Subscribe gate (works for both entitled and unentitled)
    // Subscribe already knows how to label Paid vs Demo and can route forward if you want later.
    const fromUrl =
      `${window.location.origin}${createPageUrl("Subscribe")}` +
      `?source=auth_gate&next=${encodeURIComponent(nextClean)}`;

    const loginUrl = `${window.location.origin}/login?from_url=${encodeURIComponent(fromUrl)}`;
    window.location.assign(loginUrl);
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Shared header (hide on Home because Home has its own hero header) */}
      {!isHomePage && (
        <div className="bg-white border-b border-default sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            {/* Brand */}
            <button
              type="button"
              onClick={goHome}
              className="flex items-center gap-3 hover:opacity-90 transition-opacity"
            >
              {logoOk ? (
                <img
                  src={LOGO_URL}
                  alt="URecruit HQ"
                  loading="eager"
                  onError={() => setLogoOk(false)}
                  className="h-9 md:h-10 w-auto object-contain"
                />
              ) : (
                <div className="text-lg md:text-xl font-extrabold text-brand">URecruit HQ</div>
              )}
            </button>

            {/* Right button: Member login (anon) OR Account (authed) */}
            {!isAuthed ? (
              <button
                type="button"
                onClick={handleMemberLogin}
                className="btn-outline-brand px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Member login</span>
                <span className="sm:hidden">Login</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={goAccount}
                className="btn-outline-brand px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <User className="w-4 h-4" />
                <span className="hidden sm:inline">Account</span>
                <span className="sm:hidden">Acct</span>
              </button>
            )}
          </div>
        </div>
      )}

      {children}

      {/* Theme + utility classes */}
      <style>{`
        :root{
          --brand:#0B1F3B;         /* Navy */
          --accent:#D4AF37;        /* Gold */
          --ink:#111827;           /* Charcoal */
          --muted:#6B7280;         /* Gray */
          --surface:#F3F4F6;       /* Light gray surface */
          --border:#E5E7EB;        /* Border */
        }

        .bg-surface{ background: var(--surface); }
        .bg-accent{ background: var(--accent); }

        .text-brand{ color: var(--brand); }
        .text-ink{ color: var(--ink); }
        .text-muted{ color: var(--muted); }

        .border-default{ border-color: var(--border); }

        .btn-brand{
          background: var(--brand);
          color: white;
          border: 1px solid var(--brand);
        }
        .btn-brand:hover{ filter: brightness(0.95); }

        .btn-outline-brand{
          background: white;
          color: var(--ink);
          border: 1px solid var(--border);
        }
        .btn-outline-brand:hover{
          border-color: var(--brand);
          color: var(--brand);
        }
      `}</style>
    </div>
  );
}
