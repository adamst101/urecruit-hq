import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import AdminRoute from "../components/auth/AdminRoute";

export default function GenerateDemoCamps() {
  const nav = useNavigate();
  const currentYear = new Date().getFullYear();
  const [targetYear, setTargetYear] = useState(currentYear - 1);
  const [dryRun, setDryRun] = useState(true);
  const [clearExisting, setClearExisting] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [counts, setCounts] = useState({});
  const [loadingCounts, setLoadingCounts] = useState(true);

  // Load existing DemoCamp counts by year
  useEffect(() => {
    (async () => {
      setLoadingCounts(true);
      try {
        const rows = await base44.entities.DemoCamp.filter({}, "demo_season_year", 99999);
        const byYear = {};
        for (const r of rows || []) {
          const y = r.demo_season_year || "unknown";
          byYear[y] = (byYear[y] || 0) + 1;
        }
        setCounts(byYear);
      } catch { setCounts({}); }
      setLoadingCounts(false);
    })();
  }, [result]);

  const run = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const resp = await base44.functions.invoke("generateDemoCamps", {
        dryRun,
        targetYear,
        clearExisting,
      });
      setResult(resp.data);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || String(e));
    }
    setRunning(false);
  };

  const S = {
    root: { background: "#F3F4F6", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" },
    header: { background: "#FFF", borderBottom: "1px solid #E5E7EB", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    label: { fontSize: 13, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 },
    input: { background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "6px 12px", fontSize: 14, width: 120, outline: "none" },
    btn: { background: "#FFF", color: "#374151", border: "1px solid #E5E7EB", borderRadius: 6, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
    runBtn: { background: "#0B1F3B", color: "#FFF", border: "none", borderRadius: 6, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  };

  return (
    <AdminRoute>
    <div style={S.root}>
      <div style={S.header}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0B1F3B" }}>🎭 Generate Demo Camps</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
            Clone current football camps with dates shifted back one year
          </div>
        </div>
        <button onClick={() => nav("/AdminOps")} style={S.btn}>← Admin</button>
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 900 }}>
        {/* Current counts */}
        <div style={{ background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 8, padding: "14px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0B1F3B", marginBottom: 8 }}>Existing DemoCamp Records</div>
          {loadingCounts ? (
            <div style={{ fontSize: 13, color: "#6B7280" }}>Loading…</div>
          ) : Object.keys(counts).length === 0 ? (
            <div style={{ fontSize: 13, color: "#6B7280" }}>No demo camps yet</div>
          ) : (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {Object.entries(counts).sort().map(([y, c]) => (
                <div key={y} style={{ background: "#F3F4F6", borderRadius: 6, padding: "6px 14px", fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: "#0B1F3B" }}>{y}</span>
                  <span style={{ color: "#6B7280", marginLeft: 6 }}>{c} camps</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Config */}
        <div style={{ background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 8, padding: "16px 20px", marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <span style={S.label}>Target Year</span>
            <input type="number" value={targetYear} onChange={e => setTargetYear(Number(e.target.value) || currentYear - 1)} style={S.input} />
          </div>
          <div>
            <span style={S.label}>Mode</span>
            <select value={String(dryRun)} onChange={e => setDryRun(e.target.value === "true")} style={S.input}>
              <option value="true">Dry Run (preview)</option>
              <option value="false">Live (write)</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 13, color: "#374151", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={clearExisting} onChange={e => setClearExisting(e.target.checked)} />
              Clear existing {targetYear} demo data first
            </label>
          </div>
          {dryRun && (
            <div style={{ color: "#D97706", fontSize: 13, fontWeight: 600, paddingBottom: 2 }}>
              ⚠ DRY RUN — no data will be written
            </div>
          )}
          <button onClick={run} disabled={running} style={{ ...S.runBtn, opacity: running ? 0.5 : 1 }}>
            {running ? "Running…" : "▶ Run"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#991B1B", fontSize: 13 }}>
            ✗ {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 8, padding: "16px 20px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: result.dryRun ? "#D97706" : "#059669", marginBottom: 12 }}>
              {result.dryRun ? "⚠ Dry Run Results" : "✓ Generation Complete"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
              <Stat label="Source Camps" value={result.total_source_camps} />
              <Stat label={result.dryRun ? "Would Create" : "Created"} value={result.dryRun ? result.demo_camps_would_create : result.demo_camps_created} />
              <Stat label="Target Year" value={result.targetYear} />
              <Stat label="Earliest Date" value={result.date_range?.earliest || "—"} />
              <Stat label="Latest Date" value={result.date_range?.latest || "—"} />
            </div>

            {result.sample && result.sample.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Sample Records</div>
                <div style={{ maxHeight: 300, overflowY: "auto", background: "#F9FAFB", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontFamily: "monospace" }}>
                  {result.sample.map((s, i) => (
                    <div key={i} style={{ borderBottom: "1px solid #E5E7EB", padding: "6px 0" }}>
                      <div><strong>{s.camp_name}</strong></div>
                      <div>dates: {s.start_date}{s.end_date ? ` → ${s.end_date}` : ""} · {s.city}, {s.state}</div>
                      <div>source_key: {s.source_key}</div>
                      <div>demo_source_id: {s.demo_source_id}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </AdminRoute>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: "#F9FAFB", borderRadius: 6, padding: "8px 12px" }}>
      <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1F3B", marginTop: 2 }}>{value}</div>
    </div>
  );
}