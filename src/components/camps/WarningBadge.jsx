// src/components/camps/WarningBadge.jsx
import React from "react";

export default function WarningBadge({ warnings }) {
  if (!Array.isArray(warnings) || warnings.length === 0) return null;

  const hasError        = warnings.some((w) => w.severity === "error");
  const hasFamilyConflict = warnings.some((w) => w.type === "family_conflict");
  const hasFlight       = warnings.some((w) => w.message?.includes("✈️"));
  const hasTravel       = warnings.some((w) => w.type === "back_to_back_travel");

  if (hasError || hasFamilyConflict) {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-600/20 text-red-400 text-[9px] font-bold flex-shrink-0"
        title={hasError ? "Date conflict" : "Family scheduling conflict"}
      >
        !
      </span>
    );
  }

  if (hasFlight) {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] flex-shrink-0"
        style={{ color: "#9ca3af" }}
        title="Flight likely needed"
      >
        ✈
      </span>
    );
  }

  if (hasTravel) {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] flex-shrink-0"
        style={{ color: "#9ca3af" }}
        title="Travel warning"
      >
        🚗
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] flex-shrink-0"
      style={{ color: "#9ca3af" }}
      title="Travel note"
    >
      ✈
    </span>
  );
}
