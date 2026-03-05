import React from "react";
import { useSeasonAccess } from "../components/hooks/useSeasonAccess.jsx";
import GuidePaywall from "../components/guides/GuidePaywall.jsx";

export default function CampPlaybook() {
  const { isLoading, hasAccess, mode, isAuthenticated } = useSeasonAccess();

  if (isLoading) return null;

  if (!hasAccess || mode === "demo") {
    return <GuidePaywall isAuthenticated={isAuthenticated} />;
  }

  return (
    <div style={{
      background: "#0a0e1a",
      minHeight: "100vh",
      padding: "40px 16px",
      fontFamily: "'DM Sans', Inter, system-ui, sans-serif"
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 48,
          color: "#f9fafb",
          marginBottom: 32
        }}>
          CAMP PLAYBOOK
        </h1>
        <p style={{ color: "#9ca3af", fontSize: 16, lineHeight: 1.7 }}>
          Full playbook content coming soon. This page is only accessible to paid Season Pass members.
        </p>
      </div>
    </div>
  );
}