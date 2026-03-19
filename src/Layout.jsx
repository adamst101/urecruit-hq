// src/Layout.jsx  (Base44 shared layout must be named Layout.jsx in /src root)
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "./api/base44Client";
import { createPageUrl } from "./utils";
import { clearSeasonAccessCache } from "./components/hooks/useSeasonAccess.jsx";
import { clearActiveAthlete } from "./components/hooks/useActiveAthlete.jsx";
import SupportButton from "./components/support/SupportButton.jsx";
import NoAccessWarning from "./components/auth/NoAccessWarning.jsx";
import NoAccessBanner from "./components/auth/NoAccessBanner.jsx";
import InstallPromptCapture from "./components/pwa/InstallPromptCapture.jsx";

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

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [logoOk, setLogoOk] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  const isHomePage = useMemo(() => {
    const p = location.pathname || "";
    return p === "/" || p === "/Home" || p === "/home";
  }, [location.pathname]);

  // Keep auth state current
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
  }, [location.pathname]);

  function goHome() {
    navigate(createPageUrl("Home"));
  }

  function goWorkspace() {
    navigate(createPageUrl("Workspace"));
  }

  function handleSubscribe() {
    navigate(createPageUrl("Subscribe") + "?source=layout_nav");
  }

  async function handleLogout() {
    clearSeasonAccessCache();
    clearActiveAthlete();
    try {
      if (base44?.auth?.logout) { await base44.auth.logout("/Home"); return; }
      if (base44?.auth?.signOut) { await base44.auth.signOut(); }
    } catch {}
    window.location.assign("/Home");
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Persistent banner for logged-in users without paid access */}
      <NoAccessBanner />

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
              ) : null}
            </button>

            {/* Right buttons */}
            {isAuthed ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goWorkspace}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
                  style={{ background: "#e8a020" }}
                >
                  Go to HQ
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn-outline-brand px-3 py-1.5 rounded-lg text-sm font-medium"
                >
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {children}

      <SupportButton />
      <NoAccessWarning />
      <InstallPromptCapture />

      {/* Theme + utility classes */}
      <style>{`
        :root{
          --brand:#0B1F3B;
          --accent:#D4AF37;
          --ink:#111827;
          --muted:#6B7280;
          --surface:#F3F4F6;
          --border:#E5E7EB;
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