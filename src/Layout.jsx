import React from 'react';

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-surface">
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