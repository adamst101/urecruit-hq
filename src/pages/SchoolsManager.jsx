import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

const FIELDS = [
  { key: "school_name",             label: "School Name",            type: "string",  width: 260, required: true },
  { key: "division",                label: "Division",               type: "select",  width: 160,
    options: ["NCAA Division I FBS","NCAA Division I FCS","NCAA Division I","NCAA Division II","NCAA Division III","NAIA","NJCAA","CCCAA","NWAC","Junior College","Community College","Unknown"] },
  { key: "conference",              label: "Conference",             type: "string",  width: 160 },
  { key: "athletics_nickname",      label: "Nickname",               type: "string",  width: 140 },
  { key: "subdivision",             label: "Subdivision",            type: "string",  width: 120 },
  { key: "city",                    label: "City",                   type: "string",  width: 130 },
  { key: "state",                   label: "State",                  type: "string",  width: 70 },
  { key: "country",                 label: "Country",                type: "string",  width: 80 },
  { key: "website_url",             label: "Website",                type: "url",     width: 200 },
  { key: "wikipedia_url",           label: "Wikipedia",              type: "url",     width: 200 },
  { key: "athletic_logo_url",       label: "Athletic Logo",          type: "image",   width: 110 },
  { key: "logo_url",                label: "Logo",                   type: "image",   width: 90 },
  { key: "athletic_logo_source",    label: "Logo Source",            type: "string",  width: 220 },
  { key: "athletic_logo_confidence",label: "Logo Conf.",             type: "number",  width: 90 },
  { key: "athletic_logo_updated_at",label: "Logo Updated",           type: "string",  width: 160 },
  { key: "source_platform",         label: "Source Platform",        type: "string",  width: 120 },
  { key: "source_key",              label: "Source Key",             type: "string",  width: 200 },
  { key: "unitid",                  label: "UNITID",                 type: "string",  width: 100 },
  { key: "active",                  label: "Active",                 type: "boolean", width: 70 },
];

const DIVISION_COLORS = {
  "NCAA Division I FBS":  "#1a6b3a",
  "NCAA Division I FCS":  "#1a4e6b",
  "NCAA Division I":      "#1a3d6b",
  "NCAA Division II":     "#4a3d8f",
  "NCAA Division III":    "#6b3d7a",
  "NAIA":                 "#8f5a1a",
  "NJCAA":                "#5a8f1a",
  "CCCAA":                "#1a7a6b",
  "NWAC":                 "#6b5a1a",
  "Junior College":       "#555",
  "Community College":    "#444",
  "Unknown":              "#888",
};

function DivBadge({ value }) {
  if (!value) return <span style={{ color: "#666", fontSize: 11 }}>—</span>;
  const color = DIVISION_COLORS[value] || "#444";
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600,
      whiteSpace: "nowrap", fontFamily: "monospace",
    }}>{value}</span>
  );
}

function ImageThumb({ src }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <span style={{ color: "#666", fontSize: 11 }}>—</span>;
  return (
    <img src={src} alt="" onError={() => setErr(true)}
      style={{ height: 28, maxWidth: 60, objectFit: "contain", borderRadius: 3, background: "#fff", padding: 2 }} />
  );
}

function CellEditor({ field, value, onSave, onCancel }) {
  const [val, setVal] = useState(value ?? "");
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); ref.current?.select?.(); }, []);

  const commit = () => onSave(field.type === "boolean" ? val === "true" || val === true : val);
  const onKey = e => { if (e.key === "Enter") commit(); if (e.key === "Escape") onCancel(); };

  if (field.type === "boolean") return (
    <select ref={ref} value={String(val)} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={onKey} style={editorStyle}>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  );
  if (field.type === "select") return (
    <select ref={ref} value={val} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={onKey} style={editorStyle}>
      <option value="">—</option>
      {field.options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  return (
    <input ref={ref} value={val} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={onKey}
      style={{ ...editorStyle, minWidth: Math.max(120, field.width - 16) }} />
  );
}

const editorStyle = {
  background: "#1a2235", color: "#e8f0ff", border: "1.5px solid #4a90e2",
  borderRadius: 4, padding: "3px 7px", fontSize: 12, fontFamily: "monospace",
  outline: "none", width: "100%", boxSizing: "border-box",
};

function CellValue({ field, value }) {
  if (value === null || value === undefined || value === "")
    return <span style={{ color: "#444", fontSize: 11 }}>—</span>;
  if (field.type === "image") return <ImageThumb src={value} />;
  if (field.key === "division") return <DivBadge value={value} />;
  if (field.type === "boolean") return (
    <span style={{ color: value ? "#4caf82" : "#e05c5c", fontSize: 11, fontWeight: 600 }}>{value ? "✓" : "✗"}</span>
  );
  if (field.type === "url") return (
    <a href={value} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
      style={{ color: "#4a90e2", fontSize: 11, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: field.width - 16 }}>
      {value.replace(/^https?:\/\//, "").substring(0, 30)}{value.length > 36 ? "…" : ""}
    </a>
  );
  if (field.type === "number") return (
    <span style={{ color: "#a0c4ff", fontSize: 11, fontFamily: "monospace" }}>
      {typeof value === "number" ? value.toFixed(2) : value}
    </span>
  );
  return (
    <span style={{ fontSize: 12, color: "#c8d8f0", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: field.width - 16, whiteSpace: "nowrap" }}>
      {String(value)}
    </span>
  );
}

const PAGE_SIZE = 100;

export default function SchoolsManager() {
  const [schools, setSchools]         = useState([]);
  const [filtered, setFiltered]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [search, setSearch]           = useState("");
  const [divFilter, setDivFilter]     = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [editing, setEditing]         = useState(null);
  const [saving, setSaving]           = useState({});
  const [saveMsg, setSaveMsg]         = useState(null);
  const [visibleCols, setVisibleCols] = useState(() => new Set(FIELDS.map(f => f.key)));
  const [showColPicker, setShowColPicker] = useState(false);
  const [sortField, setSortField]     = useState("school_name");
  const [sortDir, setSortDir]         = useState("asc");
  const [page, setPage]               = useState(0);

  useEffect(() => {
    setLoading(true);
    base44.entities.School.filter({}, "school_name", 99999)
      .then(all => setSchools(all || []))
      .catch(e => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let rows = [...schools];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r => FIELDS.some(f => String(r[f.key] ?? "").toLowerCase().includes(q)));
    }
    if (divFilter) rows = rows.filter(r => r.division === divFilter);
    if (activeFilter !== "") rows = rows.filter(r => String(r.active) === activeFilter);
    rows.sort((a, b) => {
      const av = String(a[sortField] ?? "").toLowerCase();
      const bv = String(b[sortField] ?? "").toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    setFiltered(rows);
    setPage(0);
  }, [schools, search, divFilter, activeFilter, sortField, sortDir]);

  const handleSort = key => {
    if (sortField === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(key); setSortDir("asc"); }
  };

  const startEdit = (rowId, fieldKey) => {
    if (fieldKey === "source_key") return;
    setEditing({ rowId, fieldKey });
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async (rowId, fieldKey, newValue) => {
    setEditing(null);
    const key = `${rowId}:${fieldKey}`;
    setSaving(s => ({ ...s, [key]: true }));
    base44.entities.School.update(rowId, { [fieldKey]: newValue })
      .then(() => {
        setSchools(prev => prev.map(s => s.id === rowId ? { ...s, [fieldKey]: newValue } : s));
        setSaveMsg("Saved ✓");
        setTimeout(() => setSaveMsg(null), 1500);
      })
      .catch(e => {
        setSaveMsg("Error: " + String(e?.message || e));
        setTimeout(() => setSaveMsg(null), 3000);
      })
      .finally(() => setSaving(s => { const n = { ...s }; delete n[key]; return n; }));
  };

  const toggleCol = key => setVisibleCols(prev => {
    const n = new Set(prev);
    if (n.has(key)) { if (n.size > 1) n.delete(key); } else n.add(key);
    return n;
  });

  const visFields = FIELDS.filter(f => visibleCols.has(f.key));
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const divisions = [...new Set(schools.map(s => s.division).filter(Boolean))].sort();

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Schools</div>
          <div style={styles.subtitle}>
            {filtered.length.toLocaleString()} of {schools.length.toLocaleString()} records
            {saveMsg && <span style={{ marginLeft: 16, color: saveMsg.startsWith("Error") ? "#e05c5c" : "#4caf82", fontSize: 12 }}>{saveMsg}</span>}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <button style={styles.colBtn} onClick={() => setShowColPicker(v => !v)}>⊞ Columns</button>
          {showColPicker && (
            <div style={styles.colPicker}>
              {FIELDS.map(f => (
                <label key={f.key} style={styles.colPickerItem}>
                  <input type="checkbox" checked={visibleCols.has(f.key)} onChange={() => toggleCol(f.key)} style={{ marginRight: 6 }} />
                  {f.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        <input style={styles.searchInput} placeholder="🔍  Search all fields…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={styles.filterSelect} value={divFilter} onChange={e => setDivFilter(e.target.value)}>
          <option value="">All divisions</option>
          {divisions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select style={styles.filterSelect} value={activeFilter} onChange={e => setActiveFilter(e.target.value)}>
          <option value="">Active: all</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <div style={styles.paginator}>
          <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(0)}>«</button>
          <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
          <span style={{ color: "#7090b0", fontSize: 12, padding: "0 8px" }}>{page + 1} / {totalPages || 1}</span>
          <button style={styles.pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
          <button style={styles.pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={styles.loading}>Loading schools…</div>
      ) : error ? (
        <div style={styles.errMsg}>{error}</div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {visFields.map(f => (
                  <th key={f.key} style={{ ...styles.th, width: f.width, minWidth: f.width }} onClick={() => handleSort(f.key)}>
                    {f.label}
                    {sortField === f.key && <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, ri) => (
                <tr key={row.id} style={{ background: ri % 2 === 0 ? "#0d1520" : "#101b2a" }}>
                  {visFields.map(f => {
                    const isEditing = editing?.rowId === row.id && editing?.fieldKey === f.key;
                    const isSaving  = saving[`${row.id}:${f.key}`];
                    return (
                      <td key={f.key} style={{ ...styles.td, width: f.width, minWidth: f.width,
                        background: isEditing ? "#1a2840" : isSaving ? "#1a2820" : undefined,
                        cursor: f.key === "source_key" ? "default" : "pointer" }}
                        onDoubleClick={() => startEdit(row.id, f.key)} title="Double-click to edit">
                        {isEditing ? (
                          <CellEditor field={f} value={row[f.key]} onSave={v => saveEdit(row.id, f.key, v)} onCancel={cancelEdit} />
                        ) : isSaving ? (
                          <span style={{ color: "#4caf82", fontSize: 11 }}>saving…</span>
                        ) : (
                          <CellValue field={f} value={row[f.key]} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={visFields.length} style={{ ...styles.td, textAlign: "center", color: "#446", padding: 40 }}>No schools match your filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        <span style={{ color: "#446", fontSize: 11 }}>Double-click any cell to edit • Enter to save • Esc to cancel</span>
        <div style={styles.paginator}>
          <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(0)}>«</button>
          <button style={styles.pageBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
          <span style={{ color: "#7090b0", fontSize: 12, padding: "0 8px" }}>
            Rows {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <button style={styles.pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
          <button style={styles.pageBtn} disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  root: { background: "#080e18", minHeight: "100vh", fontFamily: "'IBM Plex Mono','Fira Code',monospace", color: "#c8d8f0", display: "flex", flexDirection: "column" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 24px 12px", borderBottom: "1px solid #1a2535" },
  title: { fontSize: 22, fontWeight: 700, color: "#e8f4ff", letterSpacing: 1 },
  subtitle: { fontSize: 12, color: "#4a6080", marginTop: 3 },
  colBtn: { background: "#131f30", color: "#7090b0", border: "1px solid #1e3048", borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  colPicker: { position: "absolute", right: 0, top: "100%", marginTop: 4, background: "#0d1a28", border: "1px solid #1e3048", borderRadius: 8, padding: "10px 14px", zIndex: 100, minWidth: 220, maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, boxShadow: "0 8px 32px #00000088" },
  colPickerItem: { fontSize: 12, color: "#a0b8d0", cursor: "pointer", display: "flex", alignItems: "center", whiteSpace: "nowrap" },
  filters: { display: "flex", alignItems: "center", gap: 10, padding: "10px 24px", borderBottom: "1px solid #111d2a", flexWrap: "wrap" },
  searchInput: { background: "#0d1a28", border: "1px solid #1e3048", borderRadius: 6, color: "#c8d8f0", padding: "7px 14px", fontSize: 13, fontFamily: "inherit", outline: "none", width: 280 },
  filterSelect: { background: "#0d1a28", border: "1px solid #1e3048", borderRadius: 6, color: "#a0b8d0", padding: "7px 12px", fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer" },
  paginator: { display: "flex", alignItems: "center", marginLeft: "auto" },
  pageBtn: { background: "#0d1a28", border: "1px solid #1e3048", borderRadius: 4, color: "#5080a0", padding: "4px 9px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", margin: "0 2px" },
  tableWrap: { flex: 1, overflowX: "auto", overflowY: "auto" },
  table: { borderCollapse: "collapse", tableLayout: "fixed", fontSize: 12, width: "max-content", minWidth: "100%" },
  th: { background: "#0a1525", color: "#4a7090", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", padding: "9px 10px", textAlign: "left", borderBottom: "2px solid #1a2e44", position: "sticky", top: 0, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", zIndex: 2 },
  td: { padding: "6px 10px", borderBottom: "1px solid #0f1c2a", verticalAlign: "middle", overflow: "hidden", whiteSpace: "nowrap" },
  loading: { padding: 60, textAlign: "center", color: "#446", fontSize: 14 },
  errMsg: { padding: 40, textAlign: "center", color: "#e05c5c", fontSize: 13 },
  footer: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 24px", borderTop: "1px solid #111d2a", background: "#080e18" },
};