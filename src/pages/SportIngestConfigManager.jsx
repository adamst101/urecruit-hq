import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";

export default function SportIngestConfigManager() {
  const nav = useNavigate();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // config id being edited
  const [editField, setEditField] = useState(null); // "keywords" | "mappings"
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState({});
  const [testResults, setTestResults] = useState({});

  useEffect(() => {
    base44.entities.SportIngestConfig.filter({}, "sport_key", 100)
      .then(r => setConfigs(r || []))
      .finally(() => setLoading(false));
  }, []);

  const toggleActive = async (cfg) => {
    setSaving(s => ({ ...s, [cfg.id]: true }));
    const newActive = !cfg.active;
    await base44.entities.SportIngestConfig.update(cfg.id, { active: newActive });
    setConfigs(prev => prev.map(c => c.id === cfg.id ? { ...c, active: newActive } : c));
    setSaving(s => { const n = { ...s }; delete n[cfg.id]; return n; });
  };

  const runTestDry = async (cfg) => {
    setSaving(s => ({ ...s, ["test_" + cfg.id]: true }));
    setTestResults(prev => ({ ...prev, [cfg.id]: { loading: true } }));
    try {
      const res = await base44.functions.invoke("ingestCampsUSA", {
        sport_key: cfg.sport_key,
        dryRun: true,
        maxSchools: 5,
        startAt: 0,
        step: "matchSchools",
        compact: true,
      });
      setTestResults(prev => ({ ...prev, [cfg.id]: { loading: false, data: res.data } }));
    } catch (e) {
      setTestResults(prev => ({ ...prev, [cfg.id]: { loading: false, error: String(e.message || e) } }));
    }
    setSaving(s => { const n = { ...s }; delete n["test_" + cfg.id]; return n; });
  };

  const openEdit = (cfg, field) => {
    setEditing(cfg.id);
    setEditField(field);
    if (field === "keywords") {
      setEditValue(JSON.stringify(cfg.non_sport_keywords || [], null, 2));
    } else if (field === "mappings") {
      setEditValue(JSON.stringify(cfg.hardcoded_mappings || [], null, 2));
    } else if (field === "blocklist") {
      setEditValue(JSON.stringify(cfg.program_blocklist || [], null, 2));
    }
  };

  const saveEdit = async () => {
    try {
      const parsed = JSON.parse(editValue);
      const update = {};
      if (editField === "keywords") update.non_sport_keywords = parsed;
      else if (editField === "mappings") update.hardcoded_mappings = parsed;
      else if (editField === "blocklist") update.program_blocklist = parsed;
      await base44.entities.SportIngestConfig.update(editing, update);
      setConfigs(prev => prev.map(c => c.id === editing ? { ...c, ...update } : c));
      setEditing(null);
    } catch (e) {
      alert("Invalid JSON: " + e.message);
    }
  };

  const S = {
    root: { background: "#F3F4F6", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" },
    header: { background: "#FFF", borderBottom: "1px solid #E5E7EB", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    th: { padding: "10px 12px", textAlign: "left", borderBottom: "2px solid #E5E7EB", color: "#6B7280", fontSize: 12, fontWeight: 600, textTransform: "uppercase", background: "#F9FAFB" },
    td: { padding: "10px 12px", borderBottom: "1px solid #F3F4F6", fontSize: 14 },
    btn: { background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" },
    btnPrimary: { background: "#0B1F3B", color: "#FFF", border: "none", borderRadius: 4, padding: "4px 12px", fontSize: 12, cursor: "pointer" },
  };

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#0B1F3B" }}>🏆 Sport Ingest Configs</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{configs.length} sports configured</div>
        </div>
        <button onClick={() => nav("/AdminOps")} style={S.btn}>← Admin</button>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#9CA3AF" }}>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr>
                {["Sport", "Gender", "Directory URL", "Source Platform", "Active", "Last Run", "Actions"].map(h => (
                   <th key={h} style={S.th}>{h}</th>
                 ))}
              </tr>
            </thead>
            <tbody>
              {configs.map((cfg, i) => (
                <tr key={cfg.id} style={{ background: i % 2 === 0 ? "#FFF" : "#F9FAFB" }}>
                  <td style={{ ...S.td, fontWeight: 700 }}>
                    <span style={{ fontSize: 16, marginRight: 6 }}>
                      {cfg.sport_key === "football" ? "🏈" : cfg.sport_key.startsWith("basketball") ? "🏀" : cfg.sport_key === "baseball" ? "⚾" : cfg.sport_key === "softball" ? "🥎" : cfg.sport_key.startsWith("soccer") ? "⚽" : cfg.sport_key === "volleyball" ? "🏐" : cfg.sport_key.startsWith("lacrosse") ? "🥍" : cfg.sport_key === "gymnastics" ? "🤸" : "🏆"}
                    </span>
                    {cfg.display_name}
                  </td>
                  <td style={S.td}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
                      background: cfg.gender === "mens" ? "#DBEAFE" : cfg.gender === "womens" ? "#FCE7F3" : "#F3F4F6",
                      color: cfg.gender === "mens" ? "#1D4ED8" : cfg.gender === "womens" ? "#BE185D" : "#6B7280",
                    }}>
                      {cfg.gender === "mens" ? "♂ Men's" : cfg.gender === "womens" ? "♀ Women's" : "⚥ Both"}
                    </span>
                    {["basketballcampsusa_mens","basketballcampsusa_womens","lacrossecampsusa_mens","lacrossecampsusa_womens","soccercampsus_mens","soccercampsus_womens"].includes(cfg.source_platform) && (
                      <span title="Shares directory URL with opposite gender config — gender filtering is active" style={{ marginLeft: 6, cursor: "help", fontSize: 14 }}>⚠️</span>
                    )}
                  </td>
                  <td style={{ ...S.td, fontFamily: "monospace", fontSize: 12, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <a href={cfg.directory_url} target="_blank" rel="noopener" style={{ color: "#2563EB" }}>{cfg.directory_url}</a>
                  </td>
                  <td style={{ ...S.td, fontFamily: "monospace", fontSize: 12 }}>{cfg.source_platform}</td>
                  <td style={S.td}>
                    <button
                      onClick={() => toggleActive(cfg)}
                      disabled={saving[cfg.id]}
                      style={{
                        ...S.btn,
                        background: cfg.active ? "#059669" : "#DC2626",
                        color: "#FFF",
                        border: "none",
                        padding: "4px 14px",
                        fontWeight: 600,
                      }}
                    >
                      {saving[cfg.id] ? "…" : cfg.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td style={{ ...S.td, fontSize: 12, color: "#6B7280" }}>
                    {cfg.last_run_at ? new Date(cfg.last_run_at).toLocaleString() : "Never"}
                  </td>
                  <td style={S.td}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button onClick={() => openEdit(cfg, "keywords")} style={S.btn} title="Edit non-sport keywords">Keywords</button>
                      <button onClick={() => openEdit(cfg, "mappings")} style={S.btn} title="Edit hardcoded mappings">Mappings</button>
                      <button onClick={() => openEdit(cfg, "blocklist")} style={S.btn} title="Edit program blocklist">Blocklist</button>
                      <button onClick={() => runTestDry(cfg)} disabled={saving["test_" + cfg.id]} style={S.btnPrimary}>
                        {saving["test_" + cfg.id] ? "Testing…" : "Test Run"}
                      </button>
                      <button onClick={() => nav("/CampsManager?source_platform=" + cfg.source_platform)} style={S.btn}>Camps →</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Test Results */}
      {Object.keys(testResults).map(cfgId => {
        const tr = testResults[cfgId];
        const cfg = configs.find(c => c.id === cfgId);
        if (!tr || tr.loading) return null;
        return (
          <div key={cfgId} style={{ margin: "16px 24px", background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Test Results: {cfg?.display_name || cfgId}</div>
            {tr.error ? (
              <div style={{ color: "#DC2626" }}>Error: {tr.error}</div>
            ) : tr.data ? (
              <div style={{ fontSize: 13 }}>
                <div>Programs: {tr.data.totalPrograms} | Matched: {tr.data.totalMatched} | Unmatched: {tr.data.totalUnmatched} | Match Rate: {tr.data.matchRate}%</div>
                {tr.data.unmatched && tr.data.unmatched.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer", color: "#D97706" }}>Unmatched ({tr.data.unmatched.length})</summary>
                    <pre style={{ fontSize: 11, background: "#F9FAFB", padding: 8, borderRadius: 4, overflow: "auto", maxHeight: 200 }}>
                      {JSON.stringify(tr.data.unmatched, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ) : null}
            <button onClick={() => setTestResults(prev => { const n = { ...prev }; delete n[cfgId]; return n; })} style={{ ...S.btn, marginTop: 8 }}>Dismiss</button>
          </div>
        );
      })}

      {/* Edit Modal */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#FFF", borderRadius: 12, padding: 24, width: "90%", maxWidth: 600, maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
              Edit {editField === "keywords" ? "Non-Sport Keywords" : editField === "mappings" ? "Hardcoded Mappings" : "Program Blocklist"}
            </div>
            <textarea
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              style={{ width: "100%", height: 300, fontFamily: "monospace", fontSize: 12, padding: 12, border: "1px solid #E5E7EB", borderRadius: 6 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)} style={S.btn}>Cancel</button>
              <button onClick={saveEdit} style={S.btnPrimary}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}