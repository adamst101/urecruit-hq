import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";

const GENDER_BADGE = {
  mens:   { symbol: "♂", label: "Men's",   bg: "#DBEAFE", color: "#1D4ED8" },
  womens: { symbol: "♀", label: "Women's", bg: "#FCE7F3", color: "#BE185D" },
  both:   { symbol: "⚥", label: "Both",    bg: "#F3F4F6", color: "#6B7280" },
};

const SPORT_ICONS = {
  football: "🏈", baseball: "⚾", basketball_mens: "🏀", basketball_womens: "🏀",
  gymnastics: "🤸", lacrosse_mens: "🥍", lacrosse_womens: "🥍",
  soccer_mens: "⚽", soccer_womens: "⚽", softball: "🥎", volleyball: "🏐",
};

export default function IngestStatusPanel() {
  const nav = useNavigate();
  const [configs, setConfigs] = useState([]);
  const [runs, setRuns] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.SportIngestConfig.filter({}, "sport_key", 100),
      base44.entities.LastIngestRun.list("-run_at", 200),
    ]).then(([cfgs, allRuns]) => {
      setConfigs(cfgs || []);

      // Chain runs (ingestCampsUSAChain) write one record per batch plus a
      // stats-less "COMPLETED" summary at the end. Aggregate all batch records
      // within 6 hours of the latest run_at per sport so totals are correct.
      const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

      const bySport = {};
      for (const r of (allRuns || [])) {
        if (r.dry_run) continue;
        if (!bySport[r.sport]) bySport[r.sport] = [];
        bySport[r.sport].push(r);
      }

      const byKey = {};
      for (const [sport, records] of Object.entries(bySport)) {
        const latestTs = Math.max(...records.map(r => new Date(r.run_at).getTime()));
        const cutoff = latestTs - SIX_HOURS_MS;

        // Collect all batch records in the window; skip stats-less COMPLETED rows
        const window = records.filter(r => {
          if (new Date(r.run_at).getTime() < cutoff) return false;
          if ((r.notes || "").startsWith("COMPLETED")) return false;
          return true;
        });

        const latest = records.reduce((a, b) => a.run_at > b.run_at ? a : b);

        if (window.length === 0) {
          byKey[sport] = latest;
          continue;
        }

        // Sum stats across all batches in this chain run
        const agg = window.reduce((acc, r) => ({
          camps_inserted: (acc.camps_inserted || 0) + (r.camps_inserted || 0),
          camps_updated:  (acc.camps_updated  || 0) + (r.camps_updated  || 0),
          camps_skipped:  (acc.camps_skipped  || 0) + (r.camps_skipped  || 0),
          camps_errors:   (acc.camps_errors   || 0) + (r.camps_errors   || 0),
        }), {});

        byKey[sport] = { ...latest, ...agg };
      }

      setRuns(byKey);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 16, color: "#9CA3AF", fontSize: 13 }}>Loading ingest status…</div>;
  if (configs.length === 0) return null;

  const S = {
    table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
    th: { padding: "8px 10px", textAlign: "left", borderBottom: "2px solid #E5E7EB", color: "#6B7280", fontSize: 11, fontWeight: 600, textTransform: "uppercase", background: "#F9FAFB" },
    td: { padding: "8px 10px", borderBottom: "1px solid #F3F4F6" },
  };

  return (
    <div style={{ background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #E5E7EB", fontWeight: 700, fontSize: 15, color: "#0B1F3B" }}>
        📊 Ingest Status
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={S.table}>
          <thead>
            <tr>
              {["Sport", "Last Run", "New", "Updated", "Skipped", "Errors", "Status"].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {configs.map((cfg, i) => {
              const run = runs[cfg.sport_key];
              const g = GENDER_BADGE[cfg.gender] || GENDER_BADGE.both;
              const icon = SPORT_ICONS[cfg.sport_key] || "🏆";
              const isActive = cfg.active;
              const hasRun = !!run;
              const runOk = hasRun && (run.notes || "").indexOf("FAILED") < 0;

              let statusLabel, statusColor, statusBg;
              if (!isActive) { statusLabel = "⏸ Inactive"; statusColor = "#6B7280"; statusBg = "#F3F4F6"; }
              else if (!hasRun) { statusLabel = "— No runs"; statusColor = "#6B7280"; statusBg = "#F3F4F6"; }
              else if (runOk) { statusLabel = "✅ OK"; statusColor = "#059669"; statusBg = "#ECFDF5"; }
              else { statusLabel = "⚠ Failed"; statusColor = "#DC2626"; statusBg = "#FEF2F2"; }

              return (
                <tr key={cfg.id} style={{ background: i % 2 === 0 ? "#FFF" : "#FAFBFC", cursor: "pointer" }}
                  onClick={() => nav("/CampsManager?source_platform=" + cfg.source_platform)}>
                  <td style={S.td}>
                    <span style={{ marginRight: 6 }}>{icon}</span>
                    <span style={{
                      display: "inline-block", padding: "1px 6px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                      background: g.bg, color: g.color, marginRight: 6,
                    }}>{g.symbol}</span>
                    <span style={{ fontWeight: 600 }}>{cfg.display_name}</span>
                  </td>
                  <td style={{ ...S.td, fontSize: 12, color: "#6B7280" }}>
                    {hasRun ? new Date(run.run_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                  </td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{hasRun ? run.camps_inserted : "—"}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{hasRun ? run.camps_updated : "—"}</td>
                  <td style={{ ...S.td, color: "#9CA3AF" }}>{hasRun ? run.camps_skipped : "—"}</td>
                  <td style={{ ...S.td, fontWeight: 600, color: (hasRun && run.camps_errors > 0) ? "#DC2626" : undefined }}>
                    {hasRun ? run.camps_errors : "—"}
                  </td>
                  <td style={S.td}>
                    <span style={{
                      display: "inline-block", padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                      background: statusBg, color: statusColor,
                    }}>{statusLabel}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}