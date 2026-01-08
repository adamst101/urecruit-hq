import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { base44 } from './api/base44Client';
import { createPageUrl } from './utils';

const LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/693c6f46122d274d698c00ef/d0ff95a98_logo_transp.png";

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [logoOk, setLogoOk] = useState(true);
  
  const isHomePage = location.pathname === '/' || location.pathname === '/Home' || location.pathname === '/home';

  async function handleLogin() {
    try {
      if (typeof base44.auth?.signIn === "function") {
        await base44.auth.signIn();
      }
    } catch {}
  }

  function goHome() {
    navigate(createPageUrl("Home"));
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Global Header - hidden on Home page */}
      {!isHomePage && (
        <div className="bg-white border-b border-default sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <button onClick={goHome} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              {logoOk ? (
                <img
                  src={LOGO_URL}
                  alt="URecruit HQ"
                  loading="eager"
                  onError={() => setLogoOk(false)}
                  className="h-8 md:h-10 w-auto object-contain"
                />
              ) : (
                <div className="text-lg md:text-xl font-extrabold text-brand">URecruit HQ</div>
              )}
            </button>

            <button
              onClick={handleLogin}
              className="btn-outline-brand px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Log in</span>
            </button>
          </div>
        </div>
      )}

      <style>{`
        :root {
          --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
          --navy: #0B1F3B;
          --gold: #D4AF37;
          --white: #FFFFFF;
          --charcoal: #111827;
          --surface: #F3F4F6;
          --border: #E5E7EB;
        }
        body {
          font-family: var(--font-sans);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        .safe-area-bottom {
          padding-bottom: env(safe-area-inset-bottom);
        }
        .active\\:scale-98:active {
          transform: scale(0.98);
        }
        /* Text */
        .text-brand{ color:var(--navy); }
        .text-ink{ color:var(--charcoal); }
        .text-muted{ color:rgba(17,24,39,.72); }
        /* Surfaces */
        .bg-brand{ background-color:var(--navy); }
        .bg-surface{ background-color:var(--surface); }
        .bg-white{ background-color:var(--white); }
        /* Accents */
        .text-accent{ color:var(--gold); }
        .bg-accent{ background-color:var(--gold); }
        .ring-accent{ box-shadow:0 0 0 3px rgba(212,175,55,.25); }
        /* Borders */
        .border-default{ border-color:var(--border); }
        /* Buttons */
        .btn-brand{ background:var(--navy); color:var(--white); }
        .btn-brand:hover{ filter:brightness(.92); }
        .btn-outline-brand{ background:transparent; color:var(--navy); border:1px solid var(--border); }
        .btn-outline-brand:hover{ background:rgba(11,31,59,.06); }
        .btn-accent{ background:var(--gold); color:var(--navy); }
        .btn-accent:hover{ filter:brightness(.96); }
      `}</style>
      {children}
    </div>
  );
}