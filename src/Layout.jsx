// src/Layout.js (Base44 required root layout)
import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogIn, User } from "lucide-react";

import { createPageUrl } from "./utils";
import { useSeasonAccess } from "./components/hooks/useSeasonAccess.jsx";

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const season = useSeasonAccess(); // ✅ single source of truth
  const [logoOk, setLogoOk] = useState(true);

  const isHomePage =
    location.pathname === "/" ||
    location.pathname === "/Home" ||
    location.pathname === "/home";

  const isAuthed = !!season?.accountId;

  const currentPath = useMemo(
    () => (location?.pathname || "") + (location?.search || ""),
    [location?.pathname, location?.search]
  );

  function goHome() {
    navigate(createPageUrl("Home"));
  }

  function goAccount() {
    navigate(createPageUrl("Profile"));
  }

  function handleMemberLogin() {
    // Always return to where the user was
    const fromUrl = `${window.location.origin}${currentPath}`;
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
              <div className="text-lg md:text-xl font-extrabold text-brand">URecruit HQ</div>
            </button>

            {/* Right button */}
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

      {/* Theme + utility classes (keeps Home styling correct) */}
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
