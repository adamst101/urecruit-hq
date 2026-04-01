// src/pages/AppHealthCheckDiag.jsx
// Current-environment diagnostic — NOT a production readiness check.
// Shows connectivity and basic health of whatever Base44 project the current
// page/URL params are pointing at. Useful when debugging test or dev environments.

import { useState } from "react";
import AdminRoute from "../components/auth/AdminRoute";
import { base44 } from "../api/base44Client";
import { appParams } from "../lib/app-params";
import { PROD_APP_ID } from "../api/healthCheckClient";

function getEnvInfo() {
  const appId    = appParams.appId    || localStorage.getItem("base44_app_id")     || "unknown";
  const serverUrl= appParams.serverUrl|| localStorage.getItem("base44_server_url") || "unknown";
  const lowerUrl = serverUrl.toLowerCase();
  const isTest   = lowerUrl.includes("dev") || lowerUrl.includes("test") || lowerUrl.includes("staging");
  const isProd   = appId === PROD_APP_ID;
  return { appId, serverUrl, isTest, isProd };
}

const DIAG_CHECKS = [
  {
    name: "Auth — current session",
    run: async () => {
      const me = await base44.auth.me();
      if (!me?.email) throw new Error("auth.me() returned no user — not authenticated in this environment");
      return `Signed in as ${me.email}`;
    },
  },
  {
    name: "Entity read — Camp (sample)",
    run: async () => {
      const rows = await base44.entities.Camp.filter({}, "start_date", 3);
      if (!Array.isArray(rows)) throw new Error("Camp.filter() did not return an array");
      return `Camp entity readable — ${rows.length} sample row${rows.length !== 1 ? "s" : ""} returned`;
    },
  },
  {
    name: "Entity read — UserProfile (sample)",
    run: async () => {
      const rows = await base44.entities.UserProfile.filter({}, "created_date", 3);
      if (!Array.isArray(rows)) throw new Error("UserProfile.filter() did not return an array");
      return `UserProfile entity readable — ${rows.length} sample row${rows.length !== 1 ? "s" : ""} returned`;
    },
  },
  {
    name: "Entity read — SportIngestConfig",
    run: async () => {
      const rows = await base44.entities.SportIngestConfig.filter({});
      const count = Array.isArray(rows) ? rows.length : 0;
      if (count === 0) return "⚠ SportIngestConfig is empty in this environment";
      return `${count} SportIngestConfig record${count !== 1 ? "s" : ""}`;
    },
  },
  {
    name: "Function probe — ingestCampsUSA (dry, 0 schools)",
    run: async () => {
      try {
        await base44.functions.invoke("ingestCampsUSA", { sport_key: "football", dryRun: true, maxSchools: 0 });
        return "ingestCampsUSA reachable";
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes("404") || msg.includes("not found")) throw new Error("ingestCampsUSA not deployed in this environment");
        return `ingestCampsUSA reachable (non-404 response: ${msg.slice(0, 80)})`;
      }
    },
  },
];

const S = {
  root: { background: "#F3F4F6", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" },
  header: { background: "#FFF", borderBottom: "1px solid #E5E7EB", padding: "20px 24px" },
  card: { background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 8, padding: "16px 20px", margin: "16px 24px" },
  btn: { background: "#0B1F3B", color: "#FFF", border: "none", borderRadius: 6, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  btnSm: { background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" },
};

function statusColor(s) {
  if (s === "pass") return "#059669";
  if (s === "fail") return "#dc2626";
  if (s === "running") return "#d97706";
  return "#9ca3af";
}

export default function AppHealthCheckDiag() {
  const env = getEnvInfo();
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);

  async function runAll() {
    setRunning(true);
    setResults(DIAG_CHECKS.map(c => ({ name: c.name, status: "running", msg: "" })));
    for (let i = 0; i < DIAG_CHECKS.length; i++) {
      try {
        const msg = await DIAG_CHECKS[i].run();
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: "pass", msg } : r));
      } catch (e) {
        setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: "fail", msg: e.message || String(e) } : r));
      }
    }
    setRunning(false);
  }

  const isProdWarning = env.isProd;

  return (
    <AdminRoute>
      <div style={S.root}>
        {/* Header */}
        <div style={S.header}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#0B1F3B" }}>🔬 Environment Diagnostic</div>
                <span style={{
                  padding: "3px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700,
                  background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d",
                }}>
                  NON-PRODUCTION DIAGNOSTIC
                </span>
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "7px 12px", marginBottom: 4,
                background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8,
                fontSize: 12,
              }}>
                <span><strong>App ID:</strong> <span style={{ fontFamily: "monospace" }}>{env.appId}</span></span>
                <span><strong>Server:</strong> <span style={{ fontFamily: "monospace" }}>{env.serverUrl}</span></span>
                {isProdWarning && (
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>
                    ⚠ This is the PRODUCTION App ID — changes here affect real data.
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>
                These checks run against the current page environment only.
                Results do not reflect production readiness.{" "}
                <a href="/AppHealthCheck" style={{ color: "#2563EB" }}>→ Go to Production Health Board</a>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {results.length > 0 && (
                <button onClick={() => setResults([])} style={S.btnSm}>Reset</button>
              )}
              <button onClick={runAll} disabled={running} style={{ ...S.btn, opacity: running ? 0.5 : 1 }}>
                {running ? "Running…" : "▶ Run Diagnostic"}
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div style={S.card}>
            {results.map((r, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "10px 0",
                borderBottom: i < results.length - 1 ? "1px solid #F3F4F6" : "none",
              }}>
                <span style={{ fontSize: 16, minWidth: 20, color: statusColor(r.status) }}>
                  {r.status === "pass" ? "✓" : r.status === "fail" ? "✕" : r.status === "running" ? "⏳" : "○"}
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{r.name}</div>
                  {r.msg && (
                    <div style={{ fontSize: 12, color: r.status === "fail" ? "#dc2626" : "#6B7280", marginTop: 2 }}>
                      {r.msg}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && !running && (
          <div style={{ padding: "60px 24px", textAlign: "center", color: "#9CA3AF" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔬</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
              Current Environment Diagnostic
            </div>
            <div style={{ fontSize: 13, maxWidth: 400, margin: "0 auto" }}>
              Click <strong>Run Diagnostic</strong> to check connectivity and basic read access
              for the environment this page is currently pointing at.
            </div>
          </div>
        )}
      </div>
    </AdminRoute>
  );
}
