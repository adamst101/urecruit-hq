import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import AutoBatchRunner from "../components/admin/AutoBatchRunner";
import AdminRoute from "../components/auth/AdminRoute";
import { base44 } from "../api/base44Client";

export default function TestFunctions() {
  const nav = useNavigate();

  // ── Coach Roster Diag ──
  const [diagCode, setDiagCode] = useState("");
  const [diagDry, setDiagDry] = useState(true);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState(null);

  // ── Stripe Session Diag ──
  const [sessionId, setSessionId] = useState("");
  const [sessionRunning, setSessionRunning] = useState(false);
  const [sessionResult, setSessionResult] = useState(null);

  async function runSessionDiag() {
    if (!sessionId.trim()) return;
    setSessionRunning(true);
    setSessionResult(null);
    try {
      const res = await base44.functions.invoke("diagStripeSession", {
        sessionId: sessionId.trim(),
      });
      setSessionResult(res?.data ?? res);
    } catch (e) {
      setSessionResult({ ok: false, error: e?.message });
    } finally {
      setSessionRunning(false);
    }
  }

  async function runDiag() {
    if (!diagCode.trim()) return;
    setDiagRunning(true);
    setDiagResult(null);
    try {
      const res = await base44.functions.invoke("diagCoachRoster", {
        inviteCode: diagCode.trim().toUpperCase(),
        dryRun: diagDry,
      });
      setDiagResult(res?.data ?? res);
    } catch (e) {
      setDiagResult({ ok: false, error: e?.message });
    } finally {
      setDiagRunning(false);
    }
  }

  const [dryRun, setDryRun] = useState(true);
  const [sportKey, setSportKey] = useState("football");
  const [maxSchools, setMaxSchools] = useState(20);
  const [pipeDryRun, setPipeDryRun] = useState(true);
  const [dateDryRun, setDateDryRun] = useState(true);

  const S = {
    root: { background: "#F3F4F6", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" },
    header: { background: "#FFF", borderBottom: "1px solid #E5E7EB", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    label: { fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 },
    input: { background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "6px 12px", fontSize: 14, width: 140, outline: "none" },
    btn: { background: "#FFF", color: "#374151", border: "1px solid #E5E7EB", borderRadius: 6, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  };

  return (
    <AdminRoute>
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

        {/* ── Coach Roster Diagnostic ── */}
        <div style={{ background: "#FFF", border: "2px solid #e8a020", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1F3B", marginBottom: 12 }}>🔍 Coach Roster Diagnostic</div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <span style={S.label}>Invite Code</span>
              <input
                value={diagCode}
                onChange={e => setDiagCode(e.target.value.toUpperCase())}
                placeholder="e.g. ADAMS-SCH-1234"
                style={{ ...S.input, width: 220, fontFamily: "monospace" }}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={diagDry} onChange={e => setDiagDry(e.target.checked)} />
              Dry run (no write)
            </label>
            <button
              onClick={runDiag}
              disabled={diagRunning || !diagCode.trim()}
              style={{ ...S.btn, background: "#e8a020", color: "#fff", border: "none", opacity: diagRunning ? 0.6 : 1 }}
            >
              {diagRunning ? "Running…" : "Run Diagnostic"}
            </button>
          </div>
          {diagResult && (
            <pre style={{
              background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 6,
              padding: "12px 14px", fontSize: 12, overflowX: "auto",
              whiteSpace: "pre-wrap", wordBreak: "break-all",
              color: diagResult.ok ? "#065f46" : "#991b1b",
            }}>
              {JSON.stringify(diagResult, null, 2)}
            </pre>
          )}
        </div>

        {/* ── Stripe Session Diagnostic ── */}
        <div style={{ background: "#FFF", border: "2px solid #6366f1", borderRadius: 8, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1F3B", marginBottom: 12 }}>🔍 Stripe Session Diagnostic</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>
            Paste a Stripe session ID (from the success URL <code style={{ background: "#F3F4F6", padding: "1px 5px", borderRadius: 4 }}>?session_id=cs_...</code>) to see what metadata was captured, including <code style={{ background: "#F3F4F6", padding: "1px 5px", borderRadius: 4 }}>coach_invite_code</code>.
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <span style={S.label}>Session ID</span>
              <input
                value={sessionId}
                onChange={e => setSessionId(e.target.value)}
                placeholder="cs_live_... or cs_test_..."
                style={{ ...S.input, width: 320, fontFamily: "monospace" }}
              />
            </div>
            <button
              onClick={runSessionDiag}
              disabled={sessionRunning || !sessionId.trim()}
              style={{ ...S.btn, background: "#6366f1", color: "#fff", border: "none", opacity: sessionRunning ? 0.6 : 1 }}
            >
              {sessionRunning ? "Looking up…" : "Look Up Session"}
            </button>
          </div>
          {sessionResult && (
            <pre style={{
              background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 6,
              padding: "12px 14px", fontSize: 12, overflowX: "auto",
              whiteSpace: "pre-wrap", wordBreak: "break-all",
              color: sessionResult.ok ? "#065f46" : "#991b1b",
            }}>
              {JSON.stringify(sessionResult, null, 2)}
            </pre>
          )}
        </div>

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

        {/* Step 1 — Strip pipe suffixes from camp names */}
        <div style={{ marginTop: 32, borderTop: "1px solid #E5E7EB", paddingTop: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 6 }}>Step 1</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1F3B", marginBottom: 4 }}>Strip Pipe Suffixes from Camp Names</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 14 }}>
            Removes <code style={{ background: "#F3F4F6", padding: "1px 5px", borderRadius: 4 }}>| anything</code> suffixes from existing camp names. One-time cleanup — no Ryzer fetch needed.
          </div>
          <div style={{ background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 8, padding: "16px 20px", marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <span style={S.label}>Mode</span>
              <select value={String(pipeDryRun)} onChange={e => setPipeDryRun(e.target.value === "true")} style={S.input}>
                <option value="true">Dry Run (preview)</option>
                <option value="false">Live (write)</option>
              </select>
            </div>
            {pipeDryRun && (
              <div style={{ color: "#D97706", fontSize: 13, fontWeight: 600, paddingBottom: 2 }}>
                ⚠ DRY RUN — no data will be written
              </div>
            )}
          </div>
          <AutoBatchRunner
            title="stripPipeCampNames"
            functionName="stripPipeCampNames"
            params={{ dryRun: pipeDryRun, maxCamps: 200 }}
            batchDelayMs={500}
            maxBatches={50}
            doneKey="pagination.done"
            cursorKey="pagination.nextStartAt"
            cursorParam="startAt"
          />
        </div>

        {/* Step 2 — Repair date-only camp names */}
        <div style={{ marginTop: 32, borderTop: "1px solid #E5E7EB", paddingTop: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: 6 }}>Step 2</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1F3B", marginBottom: 4 }}>Repair Date-Only Camp Names</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 14 }}>
            Finds camps whose name is just a date (e.g. <code style={{ background: "#F3F4F6", padding: "1px 5px", borderRadius: 4 }}>06/15/2025</code>, <code style={{ background: "#F3F4F6", padding: "1px 5px", borderRadius: 4 }}>June 15-17, 2025</code>) and re-fetches the real name from Ryzer.
          </div>
          <div style={{ background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 8, padding: "16px 20px", marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <span style={S.label}>Mode</span>
              <select value={String(dateDryRun)} onChange={e => setDateDryRun(e.target.value === "true")} style={S.input}>
                <option value="true">Dry Run (preview)</option>
                <option value="false">Live (write)</option>
              </select>
            </div>
            {dateDryRun && (
              <div style={{ color: "#D97706", fontSize: 13, fontWeight: 600, paddingBottom: 2 }}>
                ⚠ DRY RUN — no data will be written
              </div>
            )}
          </div>
          <AutoBatchRunner
            title="repairDateOnlyCampNames"
            functionName="repairDateOnlyCampNames"
            params={{ dryRun: dateDryRun, maxCamps: 25, sleepMs: 2000 }}
            batchDelayMs={3000}
            maxBatches={100}
            doneKey="pagination.done"
            cursorKey="pagination.nextStartAt"
            cursorParam="startAt"
          />
        </div>
      </div>
    </div>
    </AdminRoute>
  );
}