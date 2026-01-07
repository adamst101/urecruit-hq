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
      `}</style>
      {children}
    </div>
  );
}