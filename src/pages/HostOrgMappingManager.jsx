import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";

const HostOrgMapping = base44.entities.HostOrgMapping;

export default function HostOrgMappingManager() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterVerified, setFilterVerified] = useState("");
  const [saving, setSaving] = useState({});
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    setLoading(true);
    HostOrgMapping.filter({}, "-created_date", 99999)
      .then(r => setRows(r || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter(r => {
    if (filterVerified === "true" && !r.verified) return false;
    if (filterVerified === "false" && r.verified) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.lookup_key || "").toLowerCase().includes(q)
      || (r.raw_value || "").toLowerCase().includes(q)
      || (r.school_name || "").toLowerCase().includes(q);
  });

  const verifiedCount = rows.filter(r => r.verified).length;
  const suggestedCount = rows.filter(r => !r.verified).length;

  const handleVerify = async (id) => {
    setSaving(s => ({ ...s, [id]: true }));
    try {
      await HostOrgMapping.update(id, { verified: true });
      setRows(prev => prev.map(r => r.id === id ? { ...r, verified: true } : r));
    } catch (e) { alert("Error: " + String(e?.message || e)); }
    finally { setSaving(s => { const n = { ...s }; delete n[id]; return n; }); }
  };

  const handleDelete = async (id) => {
    setSaving(s => ({ ...s, [id]: true }));
    try {
      await HostOrgMapping.delete(id);
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (e) { alert("Error: " + String(e?.message || e)); }
    finally { setSaving(s => { const n = { ...s }; delete n[id]; return n; }); }
  };

  async function processBatch(items, processFn, label) {
    const BATCH_SIZE = 5;
    const DELAY_MS = 300;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(processFn));
      setProgress(`${label}… ${Math.min(i + BATCH_SIZE, items.length)} / ${items.length}`);
      if (i + BATCH_SIZE < items.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }
    setProgress(null);
  }

  const handleVerifyAll = async () => {
    const unverified = filtered.filter(r => !r.verified);
    if (!unverified.length) return;
    if (!confirm(`Verify ${unverified.length} suggested mappings?`)) return;
    await processBatch(unverified, async (r) => {
      try {
        await HostOrgMapping.update(r.id, { verified: true });
        setRows(prev => prev.map(x => x.id === r.id ? { ...x, verified: true } : x));
      } catch (e) { /* skip */ }
    }, "Verifying");
  };

  const S = {
    root: { background: "#F3F4F6", minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", color: "#111827" },
    header: { background: "#FFF", borderBottom: "1px solid #E5E7EB", padding: "20px 24px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
    filters: { background: "#FFF", borderBottom: "1px solid #E5E7EB", padding: "10px 24px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
    th: { padding: "11px 12px", textAlign: "left", borderBottom: "2px solid #E5E7EB", color: "#6B7280", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", background: "#F9FAFB" },
    td: { padding: "9px 12px", borderBottom: "1px solid #F3F4F6", fontSize: 14 },
    btn: { background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 4, padding: "4px 10px", fontSize: 12, cursor: "pointer" },
  };

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#0B1F3B" }}>Host Org Mappings</div>
          <div style={{ fontSize: 14, color: "#6B7280", marginTop: 3 }}>
            {rows.length} total — {verifiedCount} verified, {suggestedCount} suggested
          </div>
        </div>
        <button onClick={() => nav("/AdminOps")} style={S.btn}>← Admin</button>
      </div>

      <div style={S.filters}>
        <input
          style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: "7px 14px", fontSize: 15, width: 350, outline: "none" }}
          placeholder="🔍  Search key, raw value, school…"
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <select style={{ ...S.btn, padding: "7px 12px", fontSize: 14 }} value={filterVerified} onChange={e => setFilterVerified(e.target.value)}>
          <option value="">All</option>
          <option value="true">Verified only</option>
          <option value="false">Suggested only</option>
        </select>
        <span style={{ fontSize: 14, color: "#6B7280" }}>{filtered.length} shown</span>
        <button onClick={handleVerifyAll} style={{ ...S.btn, background: "#059669", color: "#FFF", border: "none", marginLeft: "auto" }}>
          ✓ Verify all shown ({filtered.filter(r => !r.verified).length})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: "center", color: "#9CA3AF" }}>Loading…</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
            <thead>
              <tr>
                {["Ryzer Program / Host Org", "Key Type", "Lookup Key", "School", "Verified", "Confidence", "Source", "Count", ""].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ ...S.td, textAlign: "center", color: "#9CA3AF", padding: 40 }}>No mappings found</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? "#FFF" : "#F9FAFB" }}>
                  <td style={{ ...S.td, fontWeight: 600, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.raw_value || "—"}</td>
                  <td style={S.td}>
                    <span style={{ background: r.key_type === "ryzer_program_name" ? "#EEF2FF" : "#F0FDF4", color: r.key_type === "ryzer_program_name" ? "#4338CA" : "#166534", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
                      {r.key_type === "ryzer_program_name" ? "Ryzer" : "Host"}
                    </span>
                  </td>
                  <td style={{ ...S.td, fontFamily: "monospace", fontSize: 13, color: "#6B7280" }}>{r.lookup_key}</td>
                  <td style={{ ...S.td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.school_name || r.school_id || "—"}</td>
                  <td style={S.td}>
                    {r.verified
                      ? <span style={{ color: "#059669", fontWeight: 600 }}>✓ Yes</span>
                      : <span style={{ color: "#D97706", fontWeight: 600 }}>⚠ No</span>
                    }
                  </td>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{r.confidence != null ? Number(r.confidence).toFixed(2) : "—"}</td>
                  <td style={{ ...S.td, fontSize: 12, color: "#6B7280" }}>{r.source || "—"}</td>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{r.match_count ?? 0}</td>
                  <td style={S.td}>
                    <span style={{ display: "flex", gap: 4 }}>
                      {!r.verified && (
                        <button onClick={() => handleVerify(r.id)} disabled={saving[r.id]} style={{ ...S.btn, color: "#059669" }}>
                          {saving[r.id] ? "…" : "✓"}
                        </button>
                      )}
                      <button onClick={() => handleDelete(r.id)} disabled={saving[r.id]} style={{ ...S.btn, color: "#DC2626" }}>
                        {saving[r.id] ? "…" : "✗"}
                      </button>
                    </span>
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