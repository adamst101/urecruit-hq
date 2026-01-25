// src/Layout.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LogIn, User } from "lucide-react";

import { base44 } from "./api/base44Client";
import { createPageUrl } from "./utils";

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

  const isHomePage =
    location.pathname === "/" ||
    location.pathname === "/Home" ||
    location.pathname === "/home";

  // Detect auth state (so we can hide Member login when already signed in)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const me = await safeMe();
      if (cancelled) return;
      setIsAuthed(!!me?.id);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  async function handleMemberLogin() {
    try {
      await base44.auth.redirectToLogin();
    } catch {}
  }

  function goHome() {
    navigate(createPageUrl("Home"));
  }

  function goAccount() {
    navigate(createPageUrl("Profile"));
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Global Header - hidden on Home page */}
      {!isHomePage && (
        <div className="bg-white border-b border-default sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <button
              onClick={goHome}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              type="button"
            >
              {logoOk ? (
                <img
                  src={LOGO_URL}
                  alt="URecruit HQ"
                  loading="eager"
                  onError={() => setLogoOk(false)}
                  className="h-8 md:h-10 w-auto object-contain"
                />
              ) : (
                <div className="text-lg md:text-xl font-extrabold text-brand">
                  URecruit HQ
                </div>
              )}
              <div className="text-lg md:text-xl font-extrabold text-brand">
                URecruit HQ
              </div>
            </button>

            {/* Right side: show Account when signed in, otherwise Member login */}
            {!isAuthed ? (
              <button
                onClick={handleMemberLogin}
                className="btn-outline-brand px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                type="button"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Member login</span>
                <span className="sm:hidden">Login</span>
              </button>
            ) : (
              <button
                onClick={goAccount}
                className="btn-outline-brand px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                type="button"
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
    </div>
  );
}
