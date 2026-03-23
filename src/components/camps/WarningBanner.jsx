// src/components/camps/WarningBanner.jsx
import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function WarningBanner({ warnings }) {
  const [expanded, setExpanded] = useState(false);
  if (!Array.isArray(warnings) || warnings.length === 0) return null;

  const errorCount = warnings.filter((w) => w.severity === "error").length;
  const warnCount  = warnings.filter((w) => w.severity === "warning").length;

  return (
    <div className="rounded-lg border border-[#374151] bg-[#111827] px-3 py-2 mb-4">
      <button
        type="button"
        className="w-full flex items-center justify-between text-left gap-2"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-sm text-[#9ca3af]">
          ⚠️{" "}
          {errorCount > 0 && `${errorCount} date ${errorCount === 1 ? "conflict" : "conflicts"}`}
          {errorCount > 0 && warnCount > 0 && " · "}
          {warnCount > 0 && `${warnCount} travel ${warnCount === 1 ? "warning" : "warnings"}`}
          {errorCount === 0 && warnCount === 0 && `${warnings.length} ${warnings.length === 1 ? "notice" : "notices"}`}
        </span>
        <ChevronDown className={`w-4 h-4 text-[#6b7280] flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 pt-2 border-t border-[#1f2937]">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-[#9ca3af] leading-relaxed">
              {w.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
