import React from "react";

export default function MyCampsTabs({ activeTab, onTabChange, favCount, regCount }) {
  const tabs = [
    { key: "favorites", label: `★ Favorites (${favCount})` },
    { key: "registered", label: `✓ Registered (${regCount})` },
  ];

  return (
    <div className="flex gap-0 border-b border-[#1f2937] mb-4">
      {tabs.map((t) => {
        const isActive = activeTab === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: isActive ? "3px solid #e8a020" : "3px solid transparent",
              color: isActive ? "#f9fafb" : "#6b7280",
              fontWeight: isActive ? 700 : 500,
              fontSize: 15,
              padding: "10px 20px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}