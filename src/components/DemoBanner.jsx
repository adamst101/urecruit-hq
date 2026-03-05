import React from "react";
import { useNavigate } from "react-router-dom";

export default function DemoBanner({ seasonYear }) {
  const nav = useNavigate();
  const year = seasonYear || 2025;

  return (
    <div
      style={{
        background: "#111827",
        border: "1px solid #e8a020",
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 16,
      }}
    >
      <span style={{ fontSize: 14, color: "#f9fafb" }}>
        📋 You're viewing <strong style={{ color: "#e8a020" }}>{year} demo data</strong>
      </span>
      <button
        onClick={() => nav("/Subscribe?source=demo_banner")}
        style={{
          background: "#e8a020",
          color: "#0a0e1a",
          border: "none",
          borderRadius: 8,
          padding: "8px 18px",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Get Season Pass
      </button>
    </div>
  );
}