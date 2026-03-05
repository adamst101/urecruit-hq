import React from "react";

export default function CalendarViewToggle({ calView, setCalView }) {
  const views = [
    { key: "list", label: "≡ List" },
    { key: "month", label: "⊞ Month" },
  ];

  return (
    <div className="flex gap-0">
      {views.map((v) => {
        const isActive = calView === v.key;
        return (
          <button
            key={v.key}
            onClick={() => setCalView(v.key)}
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
              marginLeft: v.key === "month" ? -1 : 0,
            }}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}