import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";

const School = base44.entities.School;

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
  { key: "athletics_wikipedia_url", label: "Athletics Wiki",          type: "url",     width: 200 },
  { key: "athletic_logo_url",       label: "Athletic Logo",          type: "image",   width: 110 },
  { key: "logo_url",                label: "Logo",                   type: "image",   width: 90 },
  { key: "athletic_logo_source",    label: "Logo Source",            type: "string",  width: 220 },
  { key: "athletic_logo_confidence",label: "Logo Conf.",             type: "number",  width: 90 },
  { key: "athletic_logo_updated_at",label: "Logo Updated",          type: "string",  width: 160 },
  { key: "source_platform",         label: "Source Platform",        type: "string",  width: 120 },
  { key: "source_key",              label: "Source Key",             type: "string",  width: 200 },
  { key: "unitid",                  label: "UNITID",                 type: "string",  width: 100 },
  { key: "active",                  label: "Active",                 type: "boolean", width: 70 },
  { key: "athletics_audit_status",  label: "Audit Status",           type: "auditstatus", width: 130 },
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

function Badge({ value }) {
  if (!value) return <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>;
  const color = DIVISION_COLORS[value] || "#444";
  return (
    <span style={{
      background: color + "22",
      color: color,
      border: `1px solid ${color}44`,
      borderRadius: 4,
      padding: "4px 9px",
      fontSize: 13,
      fontWeight: 600,
      whiteSpace: "nowrap",
      fontFamily: "monospace",
    }}>{value}</span>
  );
}

const AUDIT_STYLES = {
  "confirmed":     { bg: "#ECFDF5", color: "#059669", border: "#A7F3D0", label: "✓ Confirmed" },
  "no_athletics":  { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", label: "✗ No Athletics" },
  "wiki_not_found":{ bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", label: "? Wiki Not Found" },
  "pending":       { bg: "#F0F4FF", color: "#6B7280", border: "#D1D5DB", label: "· Pending" },
};

function AuditStatusBadge({ value }) {
  if (!value) return <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>;
  const s = AUDIT_STYLES[value] || { bg: "#F3F4F6", color: "#6B7280", border: "#D1D5DB", label: value };
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 4, padding: "4px 9px", fontSize: 13, fontWeight: 600,
      whiteSpace: "nowrap", fontFamily: "monospace",
    }}>{s.label}</span>
  );
}

function ImageThumb({ src }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>;
  return (
    <img
      src={src}
      alt=""
      onError={() => setErr(true)}
      style={{ height: 28, maxWidth: 60, objectFit: "contain", borderRadius: 3, background: "#fff", padding: 2 }}
    />
  );
}

function CellEditor({ field, value, onSave, onCancel }) {
  const [val, setVal] = useState(value ?? "");
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); ref.current?.select?.(); }, []);

  const commit = () => onSave(field.type === "boolean" ? val === "true" || val === true : val);
  const onKey = e => { if (e.key === "Enter") commit(); if (e.key === "Escape") onCancel(); };

  if (field.type === "boolean") return (
    <select
      ref={ref}
      value={String(val)}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      style={editorStyle}
    >
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
    <input
      ref={ref}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      style={{ ...editorStyle, minWidth: Math.max(120, field.width - 16) }}
    />
  );
}

const editorStyle = {
  background: "#FFFFFF",
  color: "#111827",
  border: "1.5px solid #0B1F3B",
  borderRadius: 4,
  padding: "5px 9px",
  fontSize: 14,
  fontFamily: "Inter, system-ui, sans-serif",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

function CellValue({ field, value }) {
  if (value === null || value === undefined || value === "") {
    return <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>;
  }
  if (field.type === "image") return <ImageThumb src={value} />;
  if (field.key === "division") return <Badge value={value} />;
  if (field.type === "auditstatus") return <AuditStatusBadge value={value} />;
  if (field.type === "boolean") return (
    <span style={{ color: value ? "#059669" : "#DC2626", fontSize: 13, fontWeight: 600 }}>
      {value ? "✓" : "✗"}
    </span>
  );
  if (field.type === "url") return (
    <a href={value} target="_blank" rel="noreferrer"
      style={{ color: "#0B1F3B", fontSize: 13, textDecoration: "underline", textDecorationColor: "#D1D5DB", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: field.width - 16 }}
      onClick={e => e.stopPropagation()}>
      {value.replace(/^https?:\/\//, "").substring(0, 30)}{value.length > 36 ? "…" : ""}
    </a>
  );
  if (field.type === "number") return (
    <span style={{ color: "#0B1F3B", fontSize: 13, fontFamily: "monospace" }}>
      {typeof value === "number" ? value.toFixed(2) : value}
    </span>
  );
  return (
    <span style={{ fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: field.width - 16, whiteSpace: "nowrap" }}>
      {String(value)}
    </span>
  );
}

export default function SchoolsManager() {
  const [schools, setSchools]       = useState([]);
  const [filtered, setFiltered]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [search, setSearch]         = useState("");
  const [divFilter, setDivFilter]   = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [auditFilter, setAuditFilter]   = useState("");
  const [editing, setEditing]       = useState(null); // { rowId, fieldKey }
  const [saving, setSaving]         = useState({});
  const [saveMsg, setSaveMsg]       = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // schoolId or null
  const [visibleCols, setVisibleCols] = useState(() => new Set(FIELDS.map(f => f.key)));
  const [showColPicker, setShowColPicker] = useState(false);
  const [sortField, setSortField]   = useState("school_name");
  const [sortDir, setSortDir]       = useState("asc");
  const [page, setPage]             = useState(0);
  const PAGE_SIZE = 100;
  const tableWrapRef = useRef(null);

  // Logo fill state
  const [logoFillRunning, setLogoFillRunning] = useState(false);
  const [logoFillDry, setLogoFillDry] = useState(true);
  const [logoFillLog, setLogoFillLog] = useState([]);
  const [logoFillStats, setLogoFillStats] = useState(null);
  const [showLogoFill, setShowLogoFill] = useState(false);
  const logoFillStop = useRef(false);

  const runLogoFill = useCallback(async () => {
    logoFillStop.current = false;
    setLogoFillRunning(true);
    setLogoFillLog([]);
    setLogoFillStats(null);

    let cursor = null;
    let totalUpdated = 0;
    let totalNoLogo = 0;
    let totalErrors = 0;
    let totalEligible = 0;
    let batchNum = 0;

    try {
      while (!logoFillStop.current) {
        batchNum++;
        setLogoFillLog(prev => [...prev, `Batch ${batchNum} — cursor ${cursor ?? "start"}…`]);
        const resp = await base44.functions.invoke("fillMissingLogosFromAthleticsWiki", {
          dryRun: logoFillDry,
          cursor,
          maxRows: 25,
          throttleMs: 400,
          timeBudgetMs: 50000,
        });
        const d = resp.data;
        if (!d?.ok) {
          setLogoFillLog(prev => [...prev, `❌ Error: ${d?.error || "unknown"}`]);
          break;
        }
        totalUpdated += d.stats.updated || 0;
        totalNoLogo += d.stats.noLogo || 0;
        totalErrors += d.stats.errors || 0;
        if (batchNum === 1) totalEligible = d.stats.eligible || 0;

        const names = (d.sample?.updated || []).map(u => u.name).join(", ");
        setLogoFillLog(prev => [...prev,
          `✓ Batch ${batchNum}: ${d.stats.updated} updated, ${d.stats.noLogo} no logo, ${d.stats.errors} errors` +
          (names ? ` — ${names}` : "")
        ]);
        setLogoFillStats({ totalEligible, totalUpdated, totalNoLogo, totalErrors });

        if (d.done || !d.next_cursor) {
          setLogoFillLog(prev => [...prev, `🏁 Done! ${totalUpdated} logos filled.`]);
          break;
        }
        cursor = d.next_cursor;
      }
      if (logoFillStop.current) {
        setLogoFillLog(prev => [...prev, "⏹ Stopped by user."]);
      }
    } catch (e) {
      setLogoFillLog(prev => [...prev, `❌ ${String(e?.message || e)}`]);
    } finally {
      setLogoFillRunning(false);
      // Reload schools to reflect changes
      if (!logoFillDry) {
        const all = await School.filter({}, "school_name", 99999);
        setSchools(all || []);
      }
    }
  }, [logoFillDry]);

  // Load all schools
  useEffect(() => {
    setLoading(true);
    const load = async () => {
      try {
        const all = await School.filter({}, "school_name", 99999);
        setSchools(all || []);
      } catch (e) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Track whether filter/sort criteria changed (vs just data refresh)
  const prevFiltersRef = useRef({ search, divFilter, activeFilter, auditFilter, sortField, sortDir });

  // Filter + sort
  useEffect(() => {
    let rows = [...schools];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        FIELDS.some(f => String(r[f.key] ?? "").toLowerCase().includes(q))
      );
    }
    if (divFilter) rows = rows.filter(r => r.division === divFilter);
    if (activeFilter !== "") rows = rows.filter(r => String(r.active) === activeFilter);
    if (auditFilter !== "") rows = rows.filter(r => (r.athletics_audit_status ?? "pending") === auditFilter);

    rows.sort((a, b) => {
      const av = String(a[sortField] ?? "").toLowerCase();
      const bv = String(b[sortField] ?? "").toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    setFiltered(rows);

    // Only reset page when filters/sort actually changed, not on data-only updates
    const prev = prevFiltersRef.current;
    if (prev.search !== search || prev.divFilter !== divFilter || prev.activeFilter !== activeFilter ||
        prev.auditFilter !== auditFilter || prev.sortField !== sortField || prev.sortDir !== sortDir) {
      setPage(0);
    }
    prevFiltersRef.current = { search, divFilter, activeFilter, auditFilter, sortField, sortDir };
  }, [schools, search, divFilter, activeFilter, auditFilter, sortField, sortDir]);

  const handleSort = key => {
    if (sortField === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(key); setSortDir("asc"); }
  };

  const startEdit = (rowId, fieldKey) => {
    const field = FIELDS.find(f => f.key === fieldKey);
    if (field?.key === "source_key") return; // read-only
    setEditing({ rowId, fieldKey });
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async (rowId, fieldKey, newValue) => {
    setEditing(null);
    const key = `${rowId}:${fieldKey}`;
    setSaving(s => ({ ...s, [key]: true }));
    try {
      await School.update(rowId, { [fieldKey]: newValue });
      setSchools(prev => prev.map(s => s.id === rowId ? { ...s, [fieldKey]: newValue } : s));
      setSaveMsg("Saved ✓");
      setTimeout(() => setSaveMsg(null), 1500);
    } catch (e) {
      setSaveMsg("Error: " + String(e?.message || e));
      setTimeout(() => setSaveMsg(null), 3000);
    } finally {
      setSaving(s => { const n = { ...s }; delete n[key]; return n; });
    }
  };

  const handleDelete = async (schoolId) => {
    setSaving(s => ({ ...s, [`del:${schoolId}`]: true }));
    try {
      await School.delete(schoolId);
      setSchools(prev => prev.filter(s => s.id !== schoolId));
      setSaveMsg("Deleted ✓");
      setTimeout(() => setSaveMsg(null), 1500);
    } catch (e) {
      setSaveMsg("Error: " + String(e?.message || e));
      setTimeout(() => setSaveMsg(null), 3000);
    } finally {
      setSaving(s => { const n = { ...s }; delete n[`del:${schoolId}`]; return n; });
      setConfirmDelete(null);
    }
  };

  const toggleCol = key => setVisibleCols(prev => {
    const n = new Set(prev);
    if (n.has(key)) { if (n.size > 1) n.delete(key); }
    else n.add(key);
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
            {saveMsg && <span style={{ marginLeft: 16, color: saveMsg.startsWith("Error") ? "#DC2626" : "#059669", fontSize: 14 }}>{saveMsg}</span>}
          </div>
        </div>
        <div style={styles.headerRight}>
          <button
            style={{ ...styles.colBtn, marginRight: 8, background: showLogoFill ? "#EEF2FF" : "#FFFFFF", borderColor: showLogoFill ? "#0B1F3B" : "#E5E7EB" }}
            onClick={() => setShowLogoFill(v => !v)}
          >
            🖼 Fill Missing Logos
          </button>
          <button style={styles.colBtn} onClick={() => setShowColPicker(v => !v)}>
            ⊞ Columns
          </button>
          {showColPicker && (
            <div style={styles.colPicker}>
              {FIELDS.map(f => (
                <label key={f.key} style={styles.colPickerItem}>
                  <input
                    type="checkbox"
                    checked={visibleCols.has(f.key)}
                    onChange={() => toggleCol(f.key)}
                    style={{ marginRight: 6 }}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filters}>
        <input
          style={styles.searchInput}
          placeholder="🔍  Search all fields…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={styles.filterSelect} value={divFilter} onChange={e => setDivFilter(e.target.value)}>
          <option value="">All divisions</option>
          {divisions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select style={styles.filterSelect} value={activeFilter} onChange={e => setActiveFilter(e.target.value)}>
          <option value="">Active: all</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <select style={{ ...styles.filterSelect, borderColor: auditFilter ? "#4a90e2" : "#1e3048" }} value={auditFilter} onChange={e => setAuditFilter(e.target.value)}>
          <option value="">Audit status: all</option>
          <option value="confirmed">✓ Athletics confirmed</option>
          <option value="no_athletics">✗ No athletics found</option>
          <option value="wiki_not_found">? Wiki not found</option>
          <option value="pending">· Pending (not yet audited)</option>
        </select>
        <div style={styles.paginator}>
          <button style={{ ...styles.pageBtn, ...(page === 0 ? styles.pageBtnDisabled : {}) }} onClick={() => { if (page > 0) setPage(0); }}>«</button>
          <button style={{ ...styles.pageBtn, ...(page === 0 ? styles.pageBtnDisabled : {}) }} onClick={() => { if (page > 0) setPage(p => p - 1); }}>‹</button>
          <span style={{ color: "#7090b0", fontSize: 14, padding: "0 8px" }}>
            {page + 1} / {totalPages || 1}
          </span>
          <button style={{ ...styles.pageBtn, ...(page >= totalPages - 1 ? styles.pageBtnDisabled : {}) }} onClick={() => { if (page < totalPages - 1) setPage(p => p + 1); }}>›</button>
          <button style={{ ...styles.pageBtn, ...(page >= totalPages - 1 ? styles.pageBtnDisabled : {}) }} onClick={() => { if (page < totalPages - 1) setPage(totalPages - 1); }}>»</button>
        </div>
      </div>

      {/* Logo Fill Panel */}
      {showLogoFill && (
        <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 8, margin: "10px 24px", padding: "14px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ color: "#0B1F3B", fontWeight: 600, fontSize: 15 }}>Fill logos from Athletics Wiki URLs</span>
            <label style={{ color: "#6B7280", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={logoFillDry} onChange={e => setLogoFillDry(e.target.checked)} disabled={logoFillRunning} />
              Dry run
            </label>
            {!logoFillRunning ? (
              <button
                onClick={runLogoFill}
                style={{ ...styles.colBtn, background: "#ECFDF5", borderColor: "#A7F3D0", color: "#059669" }}
              >
                ▶ Run
              </button>
            ) : (
              <button
                onClick={() => { logoFillStop.current = true; }}
                style={{ ...styles.colBtn, background: "#FEF2F2", borderColor: "#FECACA", color: "#DC2626" }}
              >
                ■ Stop
              </button>
            )}
            {logoFillStats && (
              <span style={{ color: "#6B7280", fontSize: 13, marginLeft: 8 }}>
                Eligible: {logoFillStats.totalEligible} · Updated: {logoFillStats.totalUpdated} · No logo: {logoFillStats.totalNoLogo} · Errors: {logoFillStats.totalErrors}
              </span>
            )}
          </div>
          <div style={{ color: "#6B7280", fontSize: 12, marginBottom: 8 }}>
            Scans schools with an Athletics URL but no athletic logo. Supports both Wikipedia pages (infobox logo) and regular athletics sites (og:image, favicon, header logo).
          </div>
          {logoFillLog.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: "auto", background: "#F3F4F6", borderRadius: 6, padding: "8px 12px", fontSize: 13, fontFamily: "monospace", color: "#374151" }}>
              {logoFillLog.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={styles.loading}>Loading schools…</div>
      ) : error ? (
        <div style={styles.errMsg}>{error}</div>
      ) : (
        <div ref={tableWrapRef} style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: 50, minWidth: 50 }}></th>
                {visFields.map(f => (
                  <th
                    key={f.key}
                    style={{ ...styles.th, width: f.width, minWidth: f.width }}
                    onClick={() => handleSort(f.key)}
                  >
                    {f.label}
                    {sortField === f.key && <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, ri) => (
                <tr key={row.id} style={{ background: ri % 2 === 0 ? "#FFFFFF" : "#F9FAFB" }}>
                  <td style={{ ...styles.td, width: 50, minWidth: 50, textAlign: "center", padding: "4px 6px" }}>
                    {saving[`del:${row.id}`] ? (
                      <span style={{ color: "#DC2626", fontSize: 12 }}>…</span>
                    ) : confirmDelete === row.id ? (
                      <span style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button
                          onClick={() => handleDelete(row.id)}
                          style={{ background: "none", border: "none", color: "#059669", cursor: "pointer", fontSize: 16, padding: "2px 4px", lineHeight: 1 }}
                          title="Confirm delete"
                        >✓</button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 16, padding: "2px 4px", lineHeight: 1 }}
                          title="Cancel"
                        >✗</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(row.id)}
                        style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 15, padding: "2px 4px", lineHeight: 1 }}
                        title="Delete this school"
                      >⌫</button>
                    )}
                  </td>
                  {visFields.map(f => {
                    const isEditing = editing?.rowId === row.id && editing?.fieldKey === f.key;
                    const isSaving  = saving[`${row.id}:${f.key}`];
                    return (
                      <td
                        key={f.key}
                        style={{
                          ...styles.td,
                          width: f.width,
                          minWidth: f.width,
                          background: isEditing ? "#EEF2FF" : isSaving ? "#ECFDF5" : undefined,
                          cursor: f.key === "source_key" ? "default" : "pointer",
                        }}
                        onDoubleClick={() => startEdit(row.id, f.key)}
                        title="Double-click to edit"
                      >
                        {isEditing ? (
                          <CellEditor
                            field={f}
                            value={row[f.key]}
                            onSave={v => saveEdit(row.id, f.key, v)}
                            onCancel={cancelEdit}
                          />
                        ) : isSaving ? (
                          <span style={{ color: "#059669", fontSize: 13 }}>saving…</span>
                        ) : (
                          <CellValue field={f} value={row[f.key]} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={visFields.length + 1} style={{ ...styles.td, textAlign: "center", color: "#9CA3AF", padding: 40 }}>
                    No schools match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer pagination */}
      <div style={styles.footer}>
        <span style={{ color: "#9CA3AF", fontSize: 13 }}>Double-click any cell to edit • Enter to save • Esc to cancel</span>
        <div style={styles.paginator}>
          <button type="button" style={{ ...styles.pageBtn, ...(page === 0 ? styles.pageBtnDisabled : {}) }} onClick={() => { if (page > 0) { setPage(0); tableWrapRef.current?.scrollTo(0,0); } }}>«</button>
          <button type="button" style={{ ...styles.pageBtn, ...(page === 0 ? styles.pageBtnDisabled : {}) }} onClick={() => { if (page > 0) { setPage(p => p - 1); tableWrapRef.current?.scrollTo(0,0); } }}>‹</button>
          <span style={{ color: "#7090b0", fontSize: 14, padding: "0 8px" }}>
            Rows {filtered.length > 0 ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <button type="button" style={{ ...styles.pageBtn, ...(page >= totalPages - 1 ? styles.pageBtnDisabled : {}) }} onClick={() => { if (page < totalPages - 1) { setPage(p => p + 1); tableWrapRef.current?.scrollTo(0,0); } }}>›</button>
          <button type="button" style={{ ...styles.pageBtn, ...(page >= totalPages - 1 ? styles.pageBtnDisabled : {}) }} onClick={() => { if (page < totalPages - 1) { setPage(totalPages - 1); tableWrapRef.current?.scrollTo(0,0); } }}>»</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  root: {
    background: "#F3F4F6",
    height: "100vh",
    fontFamily: "Inter, system-ui, sans-serif",
    color: "#111827",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: "20px 24px 12px",
    borderBottom: "1px solid #E5E7EB",
    background: "#FFFFFF",
    position: "relative",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: "#0B1F3B",
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 3,
  },
  headerRight: {
    position: "relative",
  },
  colBtn: {
    background: "#FFFFFF",
    color: "#374151",
    border: "1px solid #E5E7EB",
    borderRadius: 6,
    padding: "6px 14px",
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  colPicker: {
    position: "absolute",
    right: 0,
    top: "100%",
    marginTop: 4,
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 8,
    padding: "10px 14px",
    zIndex: 100,
    minWidth: 220,
    maxHeight: 380,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
  },
  colPickerItem: {
    fontSize: 14,
    color: "#374151",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    whiteSpace: "nowrap",
  },
  filters: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 24px",
    borderBottom: "1px solid #E5E7EB",
    background: "#FFFFFF",
    flexWrap: "wrap",
  },
  searchInput: {
    background: "#F9FAFB",
    border: "1px solid #E5E7EB",
    borderRadius: 6,
    color: "#111827",
    padding: "7px 14px",
    fontSize: 15,
    fontFamily: "inherit",
    outline: "none",
    width: 280,
  },
  filterSelect: {
    background: "#F9FAFB",
    border: "1px solid #E5E7EB",
    borderRadius: 6,
    color: "#374151",
    padding: "7px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    cursor: "pointer",
  },
  paginator: {
    display: "flex",
    alignItems: "center",
    marginLeft: "auto",
  },
  pageBtn: {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 4,
    color: "#0B1F3B",
    padding: "4px 9px",
    fontSize: 15,
    cursor: "pointer",
    fontFamily: "inherit",
    margin: "0 2px",
    opacity: 1,
  },
  pageBtnDisabled: {
    opacity: 0.3,
    cursor: "not-allowed",
  },
  tableWrap: {
    flex: 1,
    overflowX: "auto",
    overflowY: "auto",
  },
  table: {
    borderCollapse: "collapse",
    tableLayout: "fixed",
    fontSize: 14,
    width: "max-content",
    minWidth: "100%",
  },
  th: {
    background: "#F9FAFB",
    color: "#6B7280",
    fontWeight: 600,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    padding: "11px 12px",
    textAlign: "left",
    borderBottom: "2px solid #E5E7EB",
    position: "sticky",
    top: 0,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    zIndex: 2,
  },
  td: {
    padding: "9px 12px",
    borderBottom: "1px solid #F3F4F6",
    verticalAlign: "middle",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  loading: {
    padding: 60,
    textAlign: "center",
    color: "#9CA3AF",
    fontSize: 16,
  },
  errMsg: {
    padding: 40,
    textAlign: "center",
    color: "#DC2626",
    fontSize: 15,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 24px",
    borderTop: "1px solid #E5E7EB",
    background: "#FFFFFF",
  },
};