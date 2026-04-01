import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";

const CampBlockList = base44.entities.CampBlockList;

export default function BlockListManager() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState({});

  useEffect(() => {
    setLoading(true);
    CampBlockList.filter({}, "-created_date", 99999)
      .then(r => setRows(r || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.source_key || "").toLowerCase().includes(q)
      || (r.notes || "").toLowerCase().includes(q)
      || (r.reason || "").toLowerCase().includes(q)
      || (r.camp_name || "").toLowerCase().includes(q);
  });

  const handleRemove = async (id) => {
    setRemoving(s => ({ ...s, [id]: true }));
    try {
      await CampBlockList.delete(id);
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      alert("Error: " + String(e?.message || e));
    } finally {
      setRemoving(s => { const n = { ...s }; delete n[id]; return n; });
    }
  };

  return (
    <div style={{ background: "#F3F4F6", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" }}>
      <div style={{ background: "#FFF", borderBottom: "1px solid #E5E7EB", padding: "20px 24px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#0B1F3B" }}>🚫 Block List</div>
          <div style={{ fontSize: 14, color: "#6B7280", marginTop: 3 }}>
            {filtered.length} of {rows.length} blocked source keys — these camps will never be re-ingested
          </div>
        </div>
        <button onClick={() => nav("/AdminHQ")}
          style={{ background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 6, padding: "6px 14px", fontSize: 14, cursor: "pointer" }}>
          ← Admin
        </button>
      </div>

      <div style={{ background: "#FFF", borderBottom: "1px solid #E5E7EB", padding: "10px 24px" }}>
        <input
          style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "7px 14px", fontSize: 15, width: 400, outline: "none" }}
          placeholder="🔍  Search source_key, reason, camp name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#9CA3AF" }}>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto", overflowY: "auto", flex: 1 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                {["Source Key", "Platform", "Reason", "Camp Name", "Blocked At", "Blocked By", "Notes", ""].map(h => (
                  <th key={h} style={{ padding: "11px 12px", textAlign: "left", borderBottom: "2px solid #E5E7EB", color: "#6B7280", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>No blocked camps</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? "#FFF" : "#F9FAFB" }}>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid #F3F4F6", fontFamily: "monospace", fontSize: 13 }}>{r.source_key}</td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid #F3F4F6" }}>{r.source_platform}</td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid #F3F4F6" }}>{r.reason}</td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid #F3F4F6", color: "#6B7280", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.camp_name || "—"}</td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid #F3F4F6", fontSize: 12, color: "#6B7280" }}>{r.blocked_at ? new Date(r.blocked_at).toLocaleString() : "—"}</td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid #F3F4F6", fontSize: 12 }}>{r.blocked_by || "—"}</td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid #F3F4F6", color: "#6B7280", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notes || "—"}</td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid #F3F4F6" }}>
                    <button
                      onClick={() => handleRemove(r.id)}
                      disabled={removing[r.id]}
                      style={{ background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#DC2626" }}>
                      {removing[r.id] ? "…" : "Unblock"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}