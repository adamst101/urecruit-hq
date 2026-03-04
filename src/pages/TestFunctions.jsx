import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import AutoBatchRunner from "../components/admin/AutoBatchRunner";

export default function TestFunctions() {
  const nav = useNavigate();
  const [dryRun, setDryRun] = useState(true);
  const [sportKey, setSportKey] = useState("football");
  const [maxSchools, setMaxSchools] = useState(20);

  const S = {
    root: { background: "#F3F4F6", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" },
    header: { background: "#FFF", borderBottom: "1px solid #E5E7EB", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    label: { fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 },
    input: { background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "6px 12px", fontSize: 14, width: 140, outline: "none" },
    btn: { background: "#FFF", color: "#374151", border: "1px solid #E5E7EB", borderRadius: 6, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  };

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0B1F3B" }}>Ingest Runner</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
            Auto-batch ingestCampsUSA to completion
          </div>
        </div>
        <button onClick={() => nav("/AdminOps")} style={S.btn}>← Admin</button>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 900 }}>
        {/* Config */}
        <div style={{ background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 8, padding: "16px 20px", marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <span style={S.label}>Sport Key</span>
            <input value={sportKey} onChange={e => setSportKey(e.target.value)} style={S.input} placeholder="football" />
          </div>
          <div>
            <span style={S.label}>Mode</span>
            <select value={String(dryRun)} onChange={e => setDryRun(e.target.value === "true")} style={S.input}>
              <option value="true">Dry Run (preview)</option>
              <option value="false">Live (write)</option>
            </select>
          </div>
          <div>
            <span style={S.label}>Schools per batch</span>
            <input type="number" value={maxSchools} onChange={e => setMaxSchools(Math.max(1, parseInt(e.target.value) || 1))} style={{ ...S.input, width: 80 }} min={1} />
          </div>
          {dryRun && (
            <div style={{ color: "#D97706", fontSize: 13, fontWeight: 600, paddingBottom: 2 }}>
              ⚠ DRY RUN — no data will be written
            </div>
          )}
        </div>

        {/* Auto batch runner for ingestCampsUSA */}
        <AutoBatchRunner
          title={`ingestCampsUSA (${sportKey})`}
          functionName="ingestCampsUSA"
          params={{
            sport_key: sportKey,
            dryRun: dryRun,
            maxSchools: maxSchools,
          }}
          batchDelayMs={2000}
          maxBatches={100}
          doneKey="pagination.done"
          cursorKey="pagination.nextStartAt"
          cursorParam="startAt"
        />
      </div>
    </div>
  );
}