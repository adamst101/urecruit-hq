// src/components/DebugAthletePanel.jsx
//
// Floating debug overlay. Only renders when:
//   localStorage.setItem("__DEBUG_ATHLETE_IDENTITY__", "1")
//
// Shows the full athlete identity resolution chain and downstream data counts
// so you can distinguish "identity not resolved" from "no data for this athlete".
//
// Usage: open DevTools console, run:
//   localStorage.setItem("__DEBUG_ATHLETE_IDENTITY__", "1"); location.reload();
// To hide:
//   localStorage.removeItem("__DEBUG_ATHLETE_IDENTITY__"); location.reload();

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "../api/base44Client";
import { useAthleteIdentity } from "./useAthleteIdentity";
import { useSeasonAccess } from "./hooks/useSeasonAccess.jsx";

function normId(x) {
  if (!x) return null;
  if (typeof x === "string") return x;
  return x.id || x._id || x.uuid || null;
}

export default function DebugAthletePanel() {
  const [visible, setVisible] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);

  useEffect(() => {
    const enabled = localStorage.getItem("__DEBUG_ATHLETE_IDENTITY__") === "1";
    setDebugEnabled(enabled);
    setVisible(enabled);
  }, []);

  const { accountId } = useSeasonAccess();
  const { athleteProfile, diagnostics, resolutionMode } = useAthleteIdentity();

  const athleteId = normId(athleteProfile);

  const campIntentQuery = useQuery({
    queryKey: ["debug_campIntent_count", athleteId],
    enabled: debugEnabled && !!athleteId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await base44.entities.CampIntent.filter({ athlete_id: athleteId }).catch(() => []);
      return Array.isArray(res) ? res.length : 0;
    },
  });

  const activityQuery = useQuery({
    queryKey: ["debug_activity_count", athleteId],
    enabled: debugEnabled && !!athleteId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await base44.entities.RecruitingActivity.filter({ athlete_id: athleteId }).catch(() => []);
      return Array.isArray(res) ? res.length : 0;
    },
  });

  if (!debugEnabled) return null;

  const fetchMethod    = diagnostics?.fetchMethod ?? "unknown";
  const bridgeId       = diagnostics?.schoolPrefAthleteId ?? null;
  const finalId        = diagnostics?.finalProfileId ?? null;
  const missingWarning = diagnostics?.missingProfileWarning ?? false;
  const serverErrors   = diagnostics?.serverErrors ?? [];

  const warning = missingWarning
    ? "⚠ Linked bridge exists but athlete profile fetch failed"
    : (bridgeId && !finalId)
    ? "⚠ Bridge athlete_id found but profile not returned"
    : (finalId && campIntentQuery.data === 0 && activityQuery.data === 0)
    ? "⚠ Athlete resolved but no downstream data found (CampIntent=0, Activity=0)"
    : null;

  const rows = [
    ["authAccountId",   accountId || "—"],
    ["fetchMethod",     fetchMethod],
    ["schoolPrefId",    bridgeId || "—"],
    ["finalAthleteId",  finalId || "—"],
    ["resolutionMode",  resolutionMode],
    ["CampIntent #",    campIntentQuery.isPending ? "…" : (campIntentQuery.data ?? "—")],
    ["Activity #",      activityQuery.isPending   ? "…" : (activityQuery.data ?? "—")],
  ];

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: "fixed", bottom: 8, left: 8, zIndex: 99999,
          background: "#1e293b", color: "#94a3b8", border: "1px solid #334155",
          borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer",
        }}
      >
        [debug]
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 8, left: 8, zIndex: 99999,
      background: "#0f172a", color: "#e2e8f0", border: "1px solid #334155",
      borderRadius: 8, padding: "10px 14px", fontSize: 11, fontFamily: "monospace",
      maxWidth: 380, boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontWeight: 700, color: "#f1f5f9", letterSpacing: "0.05em" }}>
          ATHLETE IDENTITY DEBUG
        </span>
        <button
          onClick={() => setVisible(false)}
          style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13 }}
        >
          ✕
        </button>
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {rows.map(([label, val]) => (
            <tr key={label}>
              <td style={{ color: "#94a3b8", paddingRight: 10, paddingBottom: 2, whiteSpace: "nowrap" }}>{label}</td>
              <td style={{ color: "#f8fafc", wordBreak: "break-all" }}>{String(val)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {warning && (
        <div style={{
          marginTop: 8, padding: "5px 8px", background: "#7c2d12", borderRadius: 4,
          color: "#fed7aa", fontSize: 11, lineHeight: 1.4,
        }}>
          {warning}
        </div>
      )}

      {serverErrors.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {serverErrors.map((e, i) => (
            <div key={i} style={{ color: "#fca5a5", fontSize: 10, marginBottom: 2 }}>
              {e}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
