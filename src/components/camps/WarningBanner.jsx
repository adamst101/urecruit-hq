// src/components/camps/WarningBanner.jsx
import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

const SEVERITY_STYLES = {
  error: "bg-red-900/30 border-red-700/50 text-red-300",
  warning: "bg-amber-900/30 border-amber-700/50 text-amber-300",
  info: "bg-blue-900/30 border-blue-700/50 text-blue-300",
};

export default function WarningBanner({ warnings }) {
  const [expanded, setExpanded] = useState(false);
  if (!Array.isArray(warnings) || warnings.length === 0) return null;

  const errorCount = warnings.filter((w) => w.severity === "error").length;
  const warnCount = warnings.filter((w) => w.severity === "warning").length;

  return (
    <div className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-3 mb-4">
      <button
        type="button"
        className="w-full flex items-center justify-between text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-sm font-medium text-amber-300">
          ⚠️ {warnings.length} scheduling {warnings.length === 1 ? "conflict" : "conflicts"} detected
          {errorCount > 0 && ` (${errorCount} date ${errorCount === 1 ? "conflict" : "conflicts"})`}
          {warnCount > 0 && ` · ${warnCount} travel ${warnCount === 1 ? "warning" : "warnings"}`}
          . Review your plan.
        </span>
        <ChevronDown className={`w-4 h-4 text-amber-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`text-xs rounded-lg border px-3 py-2 ${SEVERITY_STYLES[w.severity] || SEVERITY_STYLES.info}`}
            >
              {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}