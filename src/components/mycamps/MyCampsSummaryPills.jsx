import React from "react";

export default function MyCampsSummaryPills({ favCount, regCount, conflictCount, activeFilter, onFilterChange }) {
  const pills = [
    { key: "favorite", label: `★ ${favCount} Favorited`, bg: "#92400e", bgActive: "#d97706", count: favCount },
    { key: "registered", label: `✓ ${regCount} Registered`, bg: "#065f46", bgActive: "#10b981", count: regCount },
  ];

  if (conflictCount > 0) {
    pills.push({ key: "conflict", label: `⚠ ${conflictCount} Conflict`, bg: "#7f1d1d", bgActive: "#ef4444", count: conflictCount });
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {pills.map((p) => {
        const isActive = activeFilter === p.key;
        return (
          <button
            key={p.key}
            onClick={() => onFilterChange(isActive ? null : p.key)}
            style={{
              background: isActive ? p.bgActive : p.bg,
              color: "#fff",
              border: isActive ? "2px solid #fff" : "2px solid transparent",
              borderRadius: 20,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {p.label}
          </button>
        );
      })}
      {activeFilter && (
        <button
          onClick={() => onFilterChange(null)}
          style={{
            background: "transparent",
            color: "#9ca3af",
            border: "1px solid #374151",
            borderRadius: 20,
            padding: "6px 14px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Clear filter
        </button>
      )}
    </div>
  );
}