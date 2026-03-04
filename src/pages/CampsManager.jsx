import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";

const Camp   = base44.entities.Camp;
const School = base44.entities.School;
const CampBlockList = base44.entities.CampBlockList;
const HostOrgMapping = base44.entities.HostOrgMapping;

function normalizeHostOrgKey(raw) {
  if (!raw) return "";
  var s = (raw || "").toLowerCase().trim();
  s = s.replace(/\s*-\s*football\s*$/i, "");
  s = s.replace(/\s+football\s+camps?\s*$/i, "");
  s = s.replace(/\s+football\s*$/i, "");
  s = s.replace(/\s+camps?\s*$/i, "");
  return s.replace(/\s+/g, " ").trim();
}

// ─── Field definitions ────────────────────────────────────────────────────────

const FIELDS = [
  { key: "camp_name",               label: "Camp Name",              type: "string",  width: 280, required: true },
  { key: "school_id",               label: "School",                 type: "school",  width: 220 },
  { key: "start_date",              label: "Start",                  type: "string",  width: 110 },
  { key: "end_date",                label: "End",                    type: "string",  width: 110 },
  { key: "city",                    label: "City",                   type: "string",  width: 130 },
  { key: "state",                   label: "State",                  type: "string",  width: 65 },
  { key: "price",                   label: "Price",                  type: "price",   width: 80 },
  { key: "price_options",           label: "Price Options",          type: "priceoptions", width: 200 },
  { key: "grades",                  label: "Grades",                 type: "string",  width: 160 },
  { key: "venue_name",              label: "Venue",                  type: "string",  width: 200 },
  { key: "venue_address",           label: "Address",                type: "string",  width: 240 },
  { key: "host_org",                label: "Host Org",               type: "string",  width: 200 },
  { key: "notes",                   label: "Notes",                  type: "text",    width: 300 },
  { key: "link_url",                label: "Registration URL",       type: "url",     width: 200 },
  { key: "ryzer_camp_id",           label: "Ryzer ID",               type: "string",  width: 100 },
  { key: "source_platform",         label: "Source",                 type: "string",  width: 130 },
  { key: "source_key",              label: "Source Key",             type: "readonly", width: 220 },
  { key: "ingestion_status",        label: "Status",                 type: "ingeststatus", width: 130 },
  { key: "school_match_method",     label: "Match Method",           type: "string",  width: 140 },
  { key: "school_match_confidence", label: "Match Conf.",            type: "number",  width: 90 },
  { key: "school_manually_verified",label: "Manual ✓",               type: "boolean", width: 80 },
  { key: "season_year",             label: "Season",                 type: "string",  width: 80 },
  { key: "active",                  label: "Active",                 type: "boolean", width: 70 },
  { key: "last_ingested_at",        label: "Last Ingested",          type: "string",  width: 160 },
];

// ─── Status badge config ──────────────────────────────────────────────────────

const INGEST_STYLES = {
  "active":         { bg: "#ECFDF5", color: "#059669", border: "#A7F3D0", label: "✓ Active" },
  "needs_review":   { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", label: "⚠ Needs Review" },
  "removed_from_source": { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", label: "✗ Removed" },
  "inactive":       { bg: "#F0F4FF", color: "#6B7280", border: "#D1D5DB", label: "· Inactive" },
};

const SOURCE_COLORS = {
  "footballcampsusa": "#1a4e6b",
  "sportsusa":        "#4a3d8f",
  "ryzer":            "#1a6b3a",
  "manual":           "#6b3d1a",
};

// ─── Helper components ────────────────────────────────────────────────────────

function IngestStatusBadge({ value }) {
  if (!value) return <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>;
  const s = INGEST_STYLES[value] || { bg: "#F3F4F6", color: "#6B7280", border: "#D1D5DB", label: value };
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 4, padding: "4px 9px", fontSize: 13, fontWeight: 600,
      whiteSpace: "nowrap", fontFamily: "Inter, system-ui, sans-serif",
    }}>{s.label}</span>
  );
}

function SourceBadge({ value }) {
  if (!value) return <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>;
  const color = SOURCE_COLORS[value] || "#6B7280";
  return (
    <span style={{
      background: color + "22", color: color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "4px 9px", fontSize: 13, fontWeight: 600,
      whiteSpace: "nowrap", fontFamily: "Inter, system-ui, sans-serif",
    }}>{value}</span>
  );
}

function PriceBadge({ value }) {
  if (value == null || value === "") return <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>;
  return (
    <span style={{ color: "#059669", fontSize: 13, fontFamily: "monospace", fontWeight: 600 }}>
      ${Number(value).toFixed(0)}
    </span>
  );
}

function PriceOptions({ value }) {
  if (!value || !Array.isArray(value) || value.length === 0)
    return <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>;
  if (value.length === 1)
    return <PriceBadge value={value[0].price} />;
  return (
    <span style={{ color: "#374151", fontSize: 12, fontFamily: "monospace" }}>
      {value.map((o, i) => (
        <span key={i} style={{ marginRight: 6, whiteSpace: "nowrap" }}>
          <span style={{ color: "#059669" }}>${o.price}</span>
          {o.label ? <span style={{ color: "#6B7280", marginLeft: 3 }}>{o.label.substring(0, 18)}</span> : null}
          {i < value.length - 1 ? <span style={{ color: "#D1D5DB" }}> · </span> : null}
        </span>
      ))}
    </span>
  );
}

function SchoolCell({ schoolId, schoolIndex }) {
  if (!schoolId) return <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>;
  const school = schoolIndex[schoolId];
  if (!school) return <span style={{ color: "#6B7280", fontSize: 12, fontFamily: "monospace" }}>{schoolId.substring(0, 12)}…</span>;
  return (
    <span style={{ fontSize: 13, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: 200, whiteSpace: "nowrap" }}>
      {school.school_name}
    </span>
  );
}

function CellValue({ field, value, schoolIndex }) {
  if (value === null || value === undefined || value === "")
    return <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>;
  if (field.type === "ingeststatus") return <IngestStatusBadge value={value} />;
  if (field.key === "source_platform") return <SourceBadge value={value} />;
  if (field.type === "price") return <PriceBadge value={value} />;
  if (field.type === "priceoptions") return <PriceOptions value={value} />;
  if (field.type === "school") return <SchoolCell schoolId={value} schoolIndex={schoolIndex} />;
  if (field.type === "boolean") return (
    <span style={{ color: value ? "#059669" : "#DC2626", fontSize: 13, fontWeight: 600 }}>
      {value ? "✓" : "✗"}
    </span>
  );
  if (field.type === "url") return (
    <a href={value} target="_blank" rel="noreferrer"
      style={{ color: "#0B1F3B", fontSize: 13, textDecoration: "underline", textDecorationColor: "#D1D5DB", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: field.width - 16 }}
      onClick={e => e.stopPropagation()}>
      {value.replace(/^https?:\/\//, "").substring(0, 28)}{value.length > 34 ? "…" : ""}
    </a>
  );
  if (field.type === "number") return (
    <span style={{ color: "#0B1F3B", fontSize: 13, fontFamily: "monospace" }}>
      {typeof value === "number" ? value.toFixed(2) : value}
    </span>
  );
  if (field.type === "text") return (
    <span style={{ fontSize: 13, color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: field.width - 16, whiteSpace: "nowrap" }}>
      {String(value)}
    </span>
  );
  return (
    <span style={{ fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", display: "block", maxWidth: field.width - 16, whiteSpace: "nowrap" }}>
      {String(value)}
    </span>
  );
}

// ─── Cell editor ─────────────────────────────────────────────────────────────

const editorStyle = {
  background: "#FFFFFF", color: "#111827",
  border: "1.5px solid #0B1F3B", borderRadius: 4,
  padding: "5px 9px", fontSize: 14, fontFamily: "Inter, system-ui, sans-serif",
  outline: "none", width: "100%", boxSizing: "border-box",
};

function CellEditor({ field, value, onSave, onCancel, schoolList }) {
  const [val, setVal] = useState(value ?? "");
  const ref = useRef();
  useEffect(() => { ref.current?.focus(); ref.current?.select?.(); }, []);

  const commit = () => {
    if (field.type === "boolean") { onSave(val === "true" || val === true); return; }
    if (field.type === "number")  { onSave(val === "" ? null : Number(val)); return; }
    onSave(val);
  };
  const onKey = e => { if (e.key === "Enter") commit(); if (e.key === "Escape") onCancel(); };

  if (field.type === "boolean") return (
    <select ref={ref} value={String(val)} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={onKey} style={editorStyle}>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  );

  if (field.type === "school") return (
    <select ref={ref} value={val || ""} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={onKey} style={{ ...editorStyle, minWidth: 200 }}>
      <option value="">— unlinked —</option>
      {(schoolList || []).map(s => <option key={s.id} value={s.id}>{s.school_name}</option>)}
    </select>
  );

  if (field.type === "ingeststatus") return (
    <select ref={ref} value={val} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={onKey} style={editorStyle}>
      <option value="">—</option>
      <option value="active">active</option>
      <option value="needs_review">needs_review</option>
      <option value="removed_from_source">removed_from_source</option>
      <option value="inactive">inactive</option>
    </select>
  );

  if (field.type === "text") return (
    <textarea ref={ref} value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
      style={{ ...editorStyle, minWidth: Math.max(200, field.width - 16), minHeight: 80, resize: "vertical", whiteSpace: "pre-wrap" }} />
  );

  return (
    <input ref={ref} value={val} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={onKey}
      style={{ ...editorStyle, minWidth: Math.max(120, field.width - 16) }} />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CampsManager() {
  const [camps, setCamps]           = useState([]);
  const [filtered, setFiltered]     = useState([]);
  const [schoolIndex, setSchoolIndex] = useState({});
  const [schoolList, setSchoolList] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [search, setSearch]         = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [stateFilter, setStateFilter]   = useState("");
  const [editing, setEditing]       = useState(null);
  const [saving, setSaving]         = useState({});
  const [saveMsg, setSaveMsg]       = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // null | { id, mode: "choose" | "block_reason" }
  const BLOCK_REASONS = ["Wrong sport", "Not a college program", "Duplicate", "Spam / junk listing", "Other"];
  const [blockReason, setBlockReason] = useState(BLOCK_REASONS[0]);
  const [visibleCols, setVisibleCols] = useState(() => new Set([
    "camp_name", "school_id", "start_date", "end_date", "city", "state",
    "price", "grades", "venue_name", "host_org", "link_url",
    "source_platform", "ingestion_status", "school_match_method",
    "school_manually_verified", "active",
  ]));
  const [showColPicker, setShowColPicker] = useState(false);
  const [sortField, setSortField]   = useState("start_date");
  const [sortDir, setSortDir]       = useState("asc");
  const [page, setPage]             = useState(0);
  const PAGE_SIZE = 100;
  const tableWrapRef = useRef(null);
  const prevFiltersRef = useRef({});

  // Load camps + schools
  useEffect(() => {
    setLoading(true);
    Promise.all([
      Camp.filter({}, "start_date", 99999),
      School.filter({}, "school_name", 99999),
    ]).then(([campRows, schoolRows]) => {
      setCamps(campRows || []);
      const idx = {};
      (schoolRows || []).forEach(s => { idx[s.id] = s; });
      setSchoolIndex(idx);
      setSchoolList((schoolRows || []).sort((a, b) => a.school_name.localeCompare(b.school_name)));
    }).catch(e => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, []);

  // Filter + sort
  useEffect(() => {
    let rows = [...camps];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        FIELDS.some(f => {
          const v = r[f.key];
          if (f.type === "school") {
            const s = schoolIndex[v];
            return s && s.school_name.toLowerCase().includes(q);
          }
          return String(v ?? "").toLowerCase().includes(q);
        })
      );
    }
    if (sourceFilter) rows = rows.filter(r => r.source_platform === sourceFilter);
    if (statusFilter) rows = rows.filter(r => (r.ingestion_status ?? "") === statusFilter);
    if (activeFilter !== "") rows = rows.filter(r => String(r.active) === activeFilter);
    if (stateFilter) rows = rows.filter(r => (r.state ?? "").toUpperCase() === stateFilter.toUpperCase());

    rows.sort((a, b) => {
      const av = String(a[sortField] ?? "").toLowerCase();
      const bv = String(b[sortField] ?? "").toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    setFiltered(rows);
    const prev = prevFiltersRef.current;
    if (prev.search !== search || prev.sourceFilter !== sourceFilter ||
        prev.statusFilter !== statusFilter || prev.activeFilter !== activeFilter ||
        prev.stateFilter !== stateFilter || prev.sortField !== sortField || prev.sortDir !== sortDir) {
      setPage(0);
    }
    prevFiltersRef.current = { search, sourceFilter, statusFilter, activeFilter, stateFilter, sortField, sortDir };
  }, [camps, search, sourceFilter, statusFilter, activeFilter, stateFilter, sortField, sortDir, schoolIndex]);

  const handleSort = key => {
    if (sortField === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(key); setSortDir("asc"); }
  };

  const startEdit = (rowId, fieldKey) => {
    const field = FIELDS.find(f => f.key === fieldKey);
    if (!field || field.type === "readonly" || field.type === "priceoptions") return;
    setEditing({ rowId, fieldKey });
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async (rowId, fieldKey, newValue) => {
    setEditing(null);
    const key = `${rowId}:${fieldKey}`;
    setSaving(s => ({ ...s, [key]: true }));
    try {
      await Camp.update(rowId, { [fieldKey]: newValue });
      setCamps(prev => prev.map(c => c.id === rowId ? { ...c, [fieldKey]: newValue } : c));
      if (fieldKey === "school_id" && newValue) {
        await Camp.update(rowId, { school_manually_verified: true });
        setCamps(prev => prev.map(c => c.id === rowId ? { ...c, school_manually_verified: true } : c));
        // Auto-create HostOrgMapping entries for host_org and ryzer_program_name
        const campRow = camps.find(c => c.id === rowId);
        const schoolRow = schoolIndex[newValue];
        const schoolName = schoolRow?.school_name || null;
        const keysToMap = [
          { raw: campRow?.host_org, type: "host_org" },
          { raw: campRow?.ryzer_program_name, type: "ryzer_program_name" },
        ];
        for (const entry of keysToMap) {
          const nk = normalizeHostOrgKey(entry.raw);
          if (!nk) continue;
          try {
            const existing = await HostOrgMapping.filter({ lookup_key: nk, key_type: entry.type });
            if (!existing || existing.length === 0) {
              await HostOrgMapping.create({
                lookup_key: nk,
                raw_value: entry.raw,
                key_type: entry.type,
                school_id: newValue,
                school_name: schoolName,
                verified: true,
                confidence: 1.0,
                match_count: 1,
                source: "manual_link",
              });
            }
          } catch (e) { /* ignore mapping errors */ }
        }
      }
      setSaveMsg("Saved ✓");
      setTimeout(() => setSaveMsg(null), 1500);
    } catch (e) {
      setSaveMsg("Error: " + String(e?.message || e));
      setTimeout(() => setSaveMsg(null), 3000);
    } finally {
      setSaving(s => { const n = { ...s }; delete n[key]; return n; });
    }
  };

  const handleDelete = async (campId) => {
    setSaving(s => ({ ...s, [`del:${campId}`]: true }));
    try {
      await Camp.delete(campId);
      setCamps(prev => prev.filter(c => c.id !== campId));
      setSaveMsg("Deleted ✓");
      setTimeout(() => setSaveMsg(null), 1500);
    } catch (e) {
      setSaveMsg("Error: " + String(e?.message || e));
      setTimeout(() => setSaveMsg(null), 3000);
    } finally {
      setSaving(s => { const n = { ...s }; delete n[`del:${campId}`]; return n; });
      setConfirmDelete(null);
    }
  };

  const handleBlock = async (campId, reason) => {
    setSaving(s => ({ ...s, [`del:${campId}`]: true }));
    try {
      const camp = camps.find(c => c.id === campId);
      if (camp?.source_key) {
        await CampBlockList.create({
          source_key: camp.source_key,
          source_platform: camp.source_platform || "footballcampsusa",
          reason: reason,
          blocked_at: new Date().toISOString(),
          blocked_by: "manual_delete",
          camp_name: camp.camp_name || null,
          notes: null,
        });
      }
      await Camp.delete(campId);
      setCamps(prev => prev.filter(c => c.id !== campId));
      setSaveMsg("Blocked + Deleted ✓");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e) {
      setSaveMsg("Error: " + String(e?.message || e));
      setTimeout(() => setSaveMsg(null), 3000);
    } finally {
      setSaving(s => { const n = { ...s }; delete n[`del:${campId}`]; return n; });
      setConfirmDelete(null);
    }
  };

  const toggleCol = key => setVisibleCols(prev => {
    const n = new Set(prev);
    if (n.has(key)) { if (n.size > 1) n.delete(key); }
    else n.add(key);
    return n;
  });

  const visFields   = FIELDS.filter(f => visibleCols.has(f.key));
  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows    = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const sources     = [...new Set(camps.map(c => c.source_platform).filter(Boolean))].sort();
  const states      = [...new Set(camps.map(c => c.state).filter(Boolean))].sort();
  const needsReview = camps.filter(c => c.ingestion_status === "needs_review").length;

  return (
    <div style={styles.root}>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Camps</div>
          <div style={styles.subtitle}>
            {filtered.length.toLocaleString()} of {camps.length.toLocaleString()} records
            {needsReview > 0 && (
              <span style={{ marginLeft: 12, color: "#D97706", fontSize: 13, cursor: "pointer" }}
                onClick={() => setStatusFilter("needs_review")}>
                ⚠ {needsReview} needs review
              </span>
            )}
            {saveMsg && (
              <span style={{ marginLeft: 16, color: saveMsg.startsWith("Error") ? "#DC2626" : "#059669", fontSize: 14 }}>
                {saveMsg}
              </span>
            )}
          </div>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.colBtn} onClick={() => setShowColPicker(v => !v)}>
            ⊞ Columns
          </button>
          {showColPicker && (
            <div style={styles.colPicker}>
              {FIELDS.map(f => (
                <label key={f.key} style={styles.colPickerItem}>
                  <input type="checkbox" checked={visibleCols.has(f.key)}
                    onChange={() => toggleCol(f.key)} style={{ marginRight: 6 }} />
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
          placeholder="🔍  Search camp name, school, venue…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={styles.filterSelect} value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option value="">All sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ ...styles.filterSelect, borderColor: statusFilter ? "#4a90e2" : "#1e3048" }}
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">✓ Active</option>
          <option value="needs_review">⚠ Needs Review</option>
          <option value="removed_from_source">✗ Removed</option>
          <option value="inactive">· Inactive</option>
        </select>
        <select style={styles.filterSelect} value={activeFilter} onChange={e => setActiveFilter(e.target.value)}>
          <option value="">Active: all</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <select style={styles.filterSelect} value={stateFilter} onChange={e => setStateFilter(e.target.value)}>
          <option value="">All states</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={styles.paginator}>
          <button style={{ ...styles.pageBtn, ...(page === 0 ? styles.pageBtnDisabled : {}) }}
            onClick={() => { if (page > 0) setPage(0); }}>«</button>
          <button style={{ ...styles.pageBtn, ...(page === 0 ? styles.pageBtnDisabled : {}) }}
            onClick={() => { if (page > 0) setPage(p => p - 1); }}>‹</button>
          <span style={{ color: "#7090b0", fontSize: 14, padding: "0 8px" }}>
            {page + 1} / {totalPages || 1}
          </span>
          <button style={{ ...styles.pageBtn, ...(page >= totalPages - 1 ? styles.pageBtnDisabled : {}) }}
            onClick={() => { if (page < totalPages - 1) setPage(p => p + 1); }}>›</button>
          <button style={{ ...styles.pageBtn, ...(page >= totalPages - 1 ? styles.pageBtnDisabled : {}) }}
            onClick={() => { if (page < totalPages - 1) setPage(totalPages - 1); }}>»</button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={styles.loading}>Loading camps…</div>
      ) : error ? (
        <div style={styles.errMsg}>{error}</div>
      ) : (
        <div ref={tableWrapRef} style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: 50, minWidth: 50 }}></th>
                {visFields.map(f => (
                  <th key={f.key}
                    style={{ ...styles.th, width: f.width, minWidth: f.width }}
                    onClick={() => handleSort(f.key)}>
                    {f.label}
                    {sortField === f.key && <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, ri) => (
                <tr key={row.id} style={{ background: ri % 2 === 0 ? "#FFFFFF" : "#F9FAFB" }}>
                  <td style={{ ...styles.td, width: 120, minWidth: 120, textAlign: "center", padding: "4px 6px" }}>
                    {saving[`del:${row.id}`] ? (
                      <span style={{ color: "#DC2626", fontSize: 12 }}>…</span>
                    ) : confirmDelete?.id === row.id && confirmDelete?.mode === "block_reason" ? (
                      <span style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                        <select value={blockReason} onChange={e => setBlockReason(e.target.value)}
                          style={{ fontSize: 11, padding: "2px 4px", borderRadius: 3, border: "1px solid #E5E7EB", width: 110 }}>
                          {BLOCK_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <span style={{ display: "flex", gap: 3 }}>
                          <button onClick={() => handleBlock(row.id, blockReason)}
                            style={{ background: "#DC2626", border: "none", color: "#FFF", cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 3 }}
                            title="Confirm block">Block</button>
                          <button onClick={() => setConfirmDelete(null)}
                            style={{ background: "none", border: "1px solid #E5E7EB", color: "#6B7280", cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 3 }}
                            title="Cancel">✗</button>
                        </span>
                      </span>
                    ) : confirmDelete?.id === row.id && confirmDelete?.mode === "choose" ? (
                      <span style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap" }}>
                        <button onClick={() => { setBlockReason(BLOCK_REASONS[0]); setConfirmDelete({ id: row.id, mode: "block_reason" }); }}
                          style={{ background: "#DC2626", border: "none", color: "#FFF", cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 3 }}
                          title="Block (never re-ingest) + delete">🚫</button>
                        <button onClick={() => handleDelete(row.id)}
                          style={{ background: "#F59E0B", border: "none", color: "#FFF", cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 3 }}
                          title="Delete only (will re-ingest)">🗑</button>
                        <button onClick={() => setConfirmDelete(null)}
                          style={{ background: "none", border: "1px solid #E5E7EB", color: "#6B7280", cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 3 }}
                          title="Cancel">✗</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDelete({ id: row.id, mode: "choose" })}
                        style={{ background: "none", border: "none", color: "#9CA3AF", cursor: "pointer", fontSize: 15, padding: "2px 4px" }}
                        title="Delete this camp">⌫</button>
                    )}
                  </td>

                  {visFields.map(f => {
                    const isEditing = editing?.rowId === row.id && editing?.fieldKey === f.key;
                    const isSaving  = saving[`${row.id}:${f.key}`];
                    const readOnly  = f.type === "readonly" || f.type === "priceoptions";
                    return (
                      <td key={f.key}
                        style={{
                          ...styles.td,
                          width: f.width, minWidth: f.width,
                          background: isEditing ? "#EEF2FF" : isSaving ? "#ECFDF5" : undefined,
                          cursor: readOnly ? "default" : "pointer",
                        }}
                        onDoubleClick={() => !readOnly && startEdit(row.id, f.key)}
                        title={readOnly ? "" : "Double-click to edit"}>
                        {isEditing ? (
                          <CellEditor
                            field={f}
                            value={row[f.key]}
                            onSave={v => saveEdit(row.id, f.key, v)}
                            onCancel={cancelEdit}
                            schoolList={schoolList}
                          />
                        ) : isSaving ? (
                          <span style={{ color: "#059669", fontSize: 13 }}>saving…</span>
                        ) : (
                          <CellValue field={f} value={row[f.key]} schoolIndex={schoolIndex} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={visFields.length + 1} style={{ ...styles.td, textAlign: "center", color: "#9CA3AF", padding: 40 }}>
                    No camps match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div style={styles.footer}>
        <span style={{ color: "#9CA3AF", fontSize: 13 }}>
          Double-click any cell to edit • Enter to save • Esc to cancel • School field auto-sets manual verification
        </span>
        <div style={styles.paginator}>
          <button type="button" style={{ ...styles.pageBtn, ...(page === 0 ? styles.pageBtnDisabled : {}) }}
            onClick={() => { if (page > 0) { setPage(0); tableWrapRef.current?.scrollTo(0, 0); } }}>«</button>
          <button type="button" style={{ ...styles.pageBtn, ...(page === 0 ? styles.pageBtnDisabled : {}) }}
            onClick={() => { if (page > 0) { setPage(p => p - 1); tableWrapRef.current?.scrollTo(0, 0); } }}>‹</button>
          <span style={{ color: "#7090b0", fontSize: 14, padding: "0 8px" }}>
            Rows {filtered.length > 0 ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <button type="button" style={{ ...styles.pageBtn, ...(page >= totalPages - 1 ? styles.pageBtnDisabled : {}) }}
            onClick={() => { if (page < totalPages - 1) { setPage(p => p + 1); tableWrapRef.current?.scrollTo(0, 0); } }}>›</button>
          <button type="button" style={{ ...styles.pageBtn, ...(page >= totalPages - 1 ? styles.pageBtnDisabled : {}) }}
            onClick={() => { if (page < totalPages - 1) { setPage(totalPages - 1); tableWrapRef.current?.scrollTo(0, 0); } }}>»</button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  headerRight: { position: "relative" },
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
    minWidth: 240,
    maxHeight: 420,
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
    width: 300,
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
  paginator: { display: "flex", alignItems: "center", marginLeft: "auto" },
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
  },
  pageBtnDisabled: { opacity: 0.3, cursor: "not-allowed" },
  tableWrap: { flex: 1, overflowX: "auto", overflowY: "auto" },
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
  loading: { padding: 60, textAlign: "center", color: "#9CA3AF", fontSize: 16 },
  errMsg:  { padding: 40, textAlign: "center", color: "#DC2626", fontSize: 15 },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 24px",
    borderTop: "1px solid #E5E7EB",
    background: "#FFFFFF",
  },
};