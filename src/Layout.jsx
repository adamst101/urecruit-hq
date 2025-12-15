import React from 'react';

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        :root {
          --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
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