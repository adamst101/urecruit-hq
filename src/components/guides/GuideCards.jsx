import React from "react";

export function SectionAnchor({ id }) {
  return <div id={id} style={{ paddingTop: 80, marginTop: -80 }} />;
}

export function SectionTitle({ icon, title }) {
  return (
    <h2 style={{
      fontFamily: "'Bebas Neue', sans-serif",
      fontSize: 32,
      color: "#f9fafb",
      margin: "0 0 8px",
      display: "flex",
      alignItems: "center",
      gap: 10
    }}>
      {icon} {title}
    </h2>
  );
}

export function SectionIntro({ children }) {
  return (
    <p style={{ color: "#d1d5db", fontSize: 15, lineHeight: 1.7, margin: "0 0 24px", maxWidth: 680 }}>
      {children}
    </p>
  );
}

export function StageCard({ badge, badgeColor = "#e8a020", children }) {
  return (
    <div style={{
      background: "#1f2937",
      borderLeft: "4px solid #e8a020",
      borderRadius: 12,
      padding: "20px 24px",
      marginBottom: 16
    }}>
      {badge && (
        <span style={{
          display: "inline-block",
          background: badgeColor,
          color: "#0a0e1a",
          fontSize: 12,
          fontWeight: 700,
          padding: "3px 10px",
          borderRadius: 6,
          marginBottom: 12,
          letterSpacing: 0.5
        }}>
          {badge}
        </span>
      )}
      {children}
    </div>
  );
}

export function InfoBox({ icon = "📋", color = "#1e3a5f", borderColor = "#2563eb", children }) {
  return (
    <div style={{
      background: color,
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      padding: "14px 16px",
      marginTop: 12,
      fontSize: 14,
      lineHeight: 1.7,
      color: "#d1d5db"
    }}>
      <span style={{ marginRight: 6 }}>{icon}</span>{children}
    </div>
  );
}

export function TipBox({ children }) {
  return (
    <div style={{
      background: "rgba(34,197,94,0.1)",
      border: "1px solid rgba(34,197,94,0.3)",
      borderRadius: 10,
      padding: "14px 16px",
      marginTop: 12,
      fontSize: 14,
      lineHeight: 1.7,
      color: "#86efac"
    }}>
      💡 {children}
    </div>
  );
}

export function WarningBox({ children }) {
  return (
    <div style={{
      background: "rgba(232,160,32,0.1)",
      border: "1px solid rgba(232,160,32,0.3)",
      borderRadius: 10,
      padding: "14px 16px",
      marginTop: 12,
      fontSize: 14,
      lineHeight: 1.7,
      color: "#fbbf24"
    }}>
      ⚠️ {children}
    </div>
  );
}

export function ErrorBox({ children }) {
  return (
    <div style={{
      background: "rgba(239,68,68,0.1)",
      border: "1px solid rgba(239,68,68,0.3)",
      borderRadius: 10,
      padding: "14px 16px",
      marginTop: 12,
      fontSize: 14,
      lineHeight: 1.7,
      color: "#fca5a5"
    }}>
      {children}
    </div>
  );
}

export function BodyText({ children, style }) {
  return (
    <p style={{ color: "#d1d5db", fontSize: 15, lineHeight: 1.7, margin: "0 0 8px", ...style }}>
      {children}
    </p>
  );
}

export function ContactCard({ header, headerColor = "#22c55e", intro, bullets }) {
  return (
    <div style={{
      background: "#1f2937",
      borderRadius: 12,
      padding: "20px 24px",
      flex: 1,
      minWidth: 220
    }}>
      <h4 style={{ color: headerColor, fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>{header}</h4>
      <p style={{ color: "#d1d5db", fontSize: 14, lineHeight: 1.6, margin: "0 0 10px" }}>{intro}</p>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {bullets.map((b, i) => (
          <li key={i} style={{ color: "#9ca3af", fontSize: 13, lineHeight: 1.7, marginBottom: 4 }}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

export function DMTemplate({ title, lines }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ color: "#9ca3af", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{title}</p>
      <div style={{
        background: "#111827",
        border: "1px solid #374151",
        borderRadius: 10,
        padding: "16px 20px",
        fontFamily: "monospace",
        fontSize: 13,
        lineHeight: 1.8,
        color: "#d1d5db",
        whiteSpace: "pre-wrap"
      }}>
        {lines}
      </div>
    </div>
  );
}

export function GridCards({ children, columns = 2 }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(auto-fit, minmax(${columns === 2 ? "260px" : "200px"}, 1fr))`,
      gap: 12,
      marginBottom: 16
    }}>
      {children}
    </div>
  );
}

export function SmallCard({ title, titleColor = "#e8a020", children }) {
  return (
    <div style={{
      background: "#1f2937",
      borderRadius: 12,
      padding: "16px 20px"
    }}>
      <h4 style={{ color: titleColor, fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>{title}</h4>
      <div style={{ color: "#d1d5db", fontSize: 14, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}