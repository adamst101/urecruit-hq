// src/components/camps/WarningBadge.jsx
import React from "react";

export default function WarningBadge({ warnings }) {
  if (!Array.isArray(warnings) || warnings.length === 0) return null;

  const hasError = warnings.some((w) => w.severity === "error");
  const hasFamilyConflict = warnings.some((w) => w.type === "family_conflict");
  const hasTravel = warnings.some((w) => w.type === "back_to_back_travel");
  const hasFlight = warnings.some((w) => w.message?.includes("✈️"));

  if (hasError) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold flex-shrink-0" title="Date conflict">
        !
      </span>
    );
  }

  if (hasFamilyConflict) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold flex-shrink-0" style={{ background: "#f97316" }} title="Family scheduling conflict">
        !
      </span>
    );
  }

  if (hasFlight) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] flex-shrink-0" title="Flight needed">
        ✈
      </span>
    );
  }

  if (hasTravel) {
    return (
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] flex-shrink-0" title="Travel warning">
        🚗
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex-shrink-0" title="Travel note">
      i
    </span>
  );
}