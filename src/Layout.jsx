import React from 'react';

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        :root {
          --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
          --electric-blue: #2D6CF2;
          --deep-navy: #081B33;
          --neon-volt: #D6FF00;
          --gray-light: #A4B0BE;
          --gray-dark: #7A8C9E;
          --brand-navy: #0b1f3a;
          --brand-navy-dark: #081a31;
          --brand-bg: #f6f8fb;
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
        .bg-electric-blue { background-color: #2D6CF2; }
        .bg-deep-navy { background-color: #081B33; }
        .bg-neon-volt { background-color: #D6FF00; }
        .text-electric-blue { color: #2D6CF2; }
        .text-deep-navy { color: #081B33; }
        .text-neon-volt { color: #D6FF00; }
        .border-electric-blue { border-color: #2D6CF2; }
        .border-neon-volt { border-color: #D6FF00; }
        .hover\\:bg-electric-blue:hover { background-color: #2D6CF2; }
        .hover\\:bg-deep-navy:hover { background-color: #081B33; }
      `}</style>
      {children}
    </div>
  );
}