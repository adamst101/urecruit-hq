import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import AutoBatchRunner from "../components/admin/AutoBatchRunner";

export default function BackfillRyzerProgramName() {
  const nav = useNavigate();
  const [dryRun, setDryRun] = useState(true);
  const [maxCamps, setMaxCamps] = useState(50);
  const [sleepMs, setSleepMs] = useState(800);

  const S = {
    root: { background: "#F3F4F6", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" },
    header: { background: "#FFF", borderBottom: "1px solid #E5E7EB", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    label: { fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 },
    input: { background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "6px 12px", fontSize: 14, width: 120, outline: "none" },
    btn: { background: "#FFF", color: "#374151", border: "1px solid #E5E7EB", borderRadius: 6, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  };

  const formatLine = (batchNum, data, elapsedMs) => {
    const s = data.stats || {};
    const p = data.pagination || {};
    return `start=${p.startAt ?? "?"} · proc=${s.processed || 0} · upd=${s.updated || 0} · rpn=${s.rpnFound || 0} · venue=${s.venueNameFound || 0} · skip=${s.skipped || 0} · err=${s.errors || 0} · ${elapsedMs < 1000 ? elapsedMs + "ms" : (elapsedMs / 1000).toFixed(1) + "s"}`;
  };

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0B1F3B" }}>Backfill Ryzer Program Names</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
            Re-fetches Ryzer pages to fill missing ryzer_program_name, venue_name, venue_address
          </div>
        </div>
        <button onClick={() => nav("/AdminHQ")} style={S.btn}>← Admin</button>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 900 }}>
        {/* Config */}
        <div style={{ background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 8, padding: "16px 20px", marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <span style={S.label}>Dry Run</span>
            <select value={String(dryRun)} onChange={e => setDryRun(e.target.value === "true")} style={S.input}>
              <option value="true">Yes (preview)</option>
              <option value="false">No (write)</option>
            </select>
          </div>
          <div>
            <span style={S.label}>Batch Size</span>
            <input type="number" value={maxCamps} onChange={e => setMaxCamps(Number(e.target.value) || 50)} style={S.input} />
          </div>
          <div>
            <span style={S.label}>Sleep (ms)</span>
            <input type="number" value={sleepMs} onChange={e => setSleepMs(Number(e.target.value) || 800)} style={S.input} />
          </div>
          {dryRun && (
            <div style={{ color: "#D97706", fontSize: 13, fontWeight: 600, paddingBottom: 2 }}>
              ⚠ DRY RUN — no writes
            </div>
          )}
        </div>

        {/* Auto batch runner */}
        <AutoBatchRunner
          title="backfillRyzerProgramName"
          functionName="backfillRyzerProgramName"
          params={{
            dryRun: dryRun,
            maxCamps: maxCamps,
            sleepMs: sleepMs,
            timeBudgetMs: 50000,
          }}
          batchDelayMs={1500}
          maxBatches={200}
          doneKey="pagination.done"
          cursorKey="pagination.nextStartAt"
          cursorParam="startAt"
          formatLogLine={formatLine}
        />
      </div>
    </div>
  );
}