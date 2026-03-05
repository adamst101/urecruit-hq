import React from "react";

export default function MonthSubToggle({ subView, setSubView }) {
  const views = [
    { key: "week", label: "📅 Week" },
    { key: "agenda", label: "📆 Agenda" },
    { key: "grid", label: "🗓 Grid" },
  ];

  return (
    <div className="flex gap-0 justify-end mb-4">
      {views.map((v, i) => {
        const isActive = subView === v.key;
        return (
          <button
            key={v.key}
            onClick={() => setSubView(v.key)}
            style={{
              background: isActive ? "#1f2937" : "transparent",
              color: isActive ? "#e8a020" : "#6b7280",
              border: isActive ? "1px solid #e8a020" : "1px solid #374151",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: isActive ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.15s",
              marginLeft: i > 0 ? -1 : 0,
            }}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}