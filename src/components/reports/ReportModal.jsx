// src/components/reports/ReportModal.jsx
// Scope + period selector modal for generating recruiting reports.
// Dark-themed, inline styles only — matches Coach HQ visual system.

import React, { useState, useEffect } from "react";
import { buildPlayerRecruitingReportData, buildProgramRecruitingReportData, REPORT_PERIODS } from "../../lib/reportBuilder.js";
import { exportPlayerReportPdf, exportProgramReportPdf } from "../../lib/reportExporter.js";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&display=swap');`;

// ── Subcomponent: pill toggle button ─────────────────────────────────────────
function PillBtn({ active, onClick, children, flex = 1 }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex,
        padding: "10px 12px",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 700,
        border: `1px solid ${active ? "#e8a020" : "#374151"}`,
        background: active ? "rgba(232,160,32,0.1)" : "#0a0e1a",
        color: active ? "#e8a020" : "#6b7280",
        transition: "border-color 0.15s, color 0.15s, background 0.15s",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      {children}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReportModal({
  open,
  onClose,
  coach,
  roster,
  athleteJourneys,
  campsByAccountId,
  programMetrics,
  preselectedAthleteId = null,
}) {
  const [scope,     setScope]     = useState("program");
  const [athleteId, setAthleteId] = useState("");
  const [period,    setPeriod]    = useState("all");
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState(null);

  // Reset state whenever the modal opens / preselected athlete changes
  useEffect(() => {
    if (!open) return;
    const initialScope = preselectedAthleteId ? "athlete" : "program";
    setScope(initialScope);
    setAthleteId(
      preselectedAthleteId ||
      (roster && roster.length > 0 ? roster[0].account_id : "")
    );
    setPeriod("all");
    setGenerating(false);
    setError(null);
  }, [open, preselectedAthleteId]);

  if (!open) return null;

  const sortedRoster = [...(roster || [])].sort((a, b) =>
    (a.athlete_name || "").localeCompare(b.athlete_name || "")
  );

  const programName = coach?.school_or_org || "Program";
  const coachName   = coach
    ? `${coach.first_name || ""} ${coach.last_name || ""}`.trim() || null
    : null;

  const scopeDescription = scope === "program"
    ? `Generates a full program report with a program summary followed by individual athlete profiles for all ${roster?.length || 0} athlete${(roster?.length || 0) !== 1 ? "s" : ""} on your roster.`
    : "Generates a player report including recruiting snapshot, narrative summary, school contacts, camp history, and activity log.";

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      if (scope === "athlete") {
        const rosterEntry = (roster || []).find(r => r.account_id === athleteId);
        if (!rosterEntry) { setError("Athlete not found on roster."); setGenerating(false); return; }
        const data = buildPlayerRecruitingReportData({
          rosterEntry,
          journey:  athleteJourneys?.[athleteId] || null,
          camps:    campsByAccountId?.[athleteId] || [],
          coachName,
          programName,
          period,
        });
        const ok = exportPlayerReportPdf(data);
        if (ok === false) { setError("Pop-up blocked. Please allow pop-ups and try again."); setGenerating(false); return; }
      } else {
        const data = buildProgramRecruitingReportData({
          coach, roster, athleteJourneys, campsByAccountId, programMetrics, period,
        });
        const ok = exportProgramReportPdf(data);
        if (ok === false) { setError("Pop-up blocked. Please allow pop-ups and try again."); setGenerating(false); return; }
      }
      onClose();
    } catch (err) {
      setError(err?.message || "Failed to generate report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  const canGenerate = !generating && (scope === "program" || !!athleteId);

  return (
    <>
      <style>{FONTS}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.65)",
          zIndex: 1200,
          backdropFilter: "blur(3px)",
          WebkitBackdropFilter: "blur(3px)",
        }}
      />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Download Recruiting Report"
        style={{
          position: "fixed", zIndex: 1201,
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "calc(100% - 40px)",
          maxWidth: 460,
          background: "#111827",
          border: "1px solid rgba(148,163,184,0.2)",
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.75)",
          padding: "22px 22px 20px",
          fontFamily: "'DM Sans', system-ui, sans-serif",
          color: "#f9fafb",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#e8a020", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              Recruiting Report
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: "#f9fafb", letterSpacing: 1 }}>
              Download Report
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: 22, lineHeight: 1, padding: 4, marginTop: -2 }}
          >
            ×
          </button>
        </div>

        {/* ── Scope ── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>
            Report Scope
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <PillBtn active={scope === "program"} onClick={() => setScope("program")}>Full Program</PillBtn>
            <PillBtn active={scope === "athlete"} onClick={() => setScope("athlete")}>Single Athlete</PillBtn>
          </div>
        </div>

        {/* ── Athlete selector ── */}
        {scope === "athlete" && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>
              Athlete
            </div>
            {sortedRoster.length === 0 ? (
              <p style={{ fontSize: 13, color: "#6b7280" }}>No athletes on roster.</p>
            ) : (
              <div style={{ position: "relative" }}>
                <select
                  value={athleteId}
                  onChange={e => setAthleteId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 36px 10px 12px",
                    background: "#0a0e1a",
                    border: "1px solid #374151",
                    borderRadius: 8,
                    color: "#f9fafb",
                    fontSize: 13,
                    cursor: "pointer",
                    appearance: "none",
                    WebkitAppearance: "none",
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  {sortedRoster.map(r => (
                    <option key={r.account_id} value={r.account_id}>
                      {r.athlete_name || "Unknown"}{r.athlete_grad_year ? ` — Class of ${r.athlete_grad_year}` : ""}
                    </option>
                  ))}
                </select>
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#6b7280", pointerEvents: "none", fontSize: 11 }}>▾</span>
              </div>
            )}
          </div>
        )}

        {/* ── Period ── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>
            Activity Period
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {REPORT_PERIODS.map(opt => (
              <PillBtn key={opt.value} active={period === opt.value} onClick={() => setPeriod(opt.value)}>
                {opt.label}
              </PillBtn>
            ))}
          </div>
        </div>

        {/* ── Description callout ── */}
        <div style={{
          background: "#0a0f1e",
          border: "1px solid #1a2535",
          borderLeft: "3px solid #e8a020",
          borderRadius: 8,
          padding: "9px 12px",
          marginBottom: 18,
        }}>
          <p style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.6, margin: 0 }}>
            {scopeDescription}
            {" "}A print window will open — use <strong style={{ color: "#94a3b8" }}>Save as PDF</strong> to download.
          </p>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 8,
            padding: "9px 12px",
            marginBottom: 14,
            fontSize: 12.5,
            color: "#f87171",
          }}>
            {error}
          </div>
        )}

        {/* ── Actions ── */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "11px 14px",
              background: "transparent",
              border: "1px solid #374151",
              borderRadius: 10, cursor: "pointer",
              color: "#6b7280", fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            style={{
              flex: 2, padding: "11px 14px",
              background: canGenerate ? "#e8a020" : "#1f2937",
              border: "none", borderRadius: 10,
              cursor: canGenerate ? "pointer" : "default",
              color: canGenerate ? "#0a0e1a" : "#4b5563",
              fontSize: 14, fontWeight: 700,
              transition: "background 0.15s",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            {generating ? "Generating…" : "Generate Report"}
          </button>
        </div>
      </div>
    </>
  );
}
