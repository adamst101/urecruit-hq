// src/pages/ProductRoadmap.jsx
import { useState, useEffect, useMemo } from "react";
import AdminRoute from "../components/auth/AdminRoute";
import { RoadmapItem } from "../api/entities";

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_ORDER = ["intake", "scoped", "in_progress", "blocked", "done", "cancelled"];
const BOARD_COLS   = ["intake", "scoped", "in_progress", "blocked", "done"];

const STATUS_LABEL = {
  intake: "Intake", scoped: "Scoped", in_progress: "In Progress",
  blocked: "Blocked", done: "Done", cancelled: "Cancelled",
};
const STATUS_COLOR = {
  intake: "#6b7280", scoped: "#1a5fa8", in_progress: "#2d7a3a",
  blocked: "#c8850a", done: "#059669", cancelled: "#9ca3af",
};
const STATUS_BG = {
  intake: "#f3f4f6", scoped: "#eff6ff", in_progress: "#f0fdf4",
  blocked: "#fffbeb", done: "#ecfdf5", cancelled: "#f9fafb",
};

const PRIORITY_ORDER = ["P0", "P1", "P2", "P3"];
const PRIORITY_COLOR = { P0: "#dc2626", P1: "#c8850a", P2: "#1a5fa8", P3: "#9ca3af" };
const PRIORITY_LABEL = { P0: "P0 — Now", P1: "P1 — Next", P2: "P2 — Later", P3: "P3 — Someday" };

const TYPE_ICON  = { bug: "🐛", feature: "✨", improvement: "⚡", infra: "⚙️", experiment: "🧪" };
const TYPE_LABEL = { bug: "Bug", feature: "Feature", improvement: "Improvement", infra: "Infra", experiment: "Experiment" };

const SOURCE_LABEL = {
  user_feedback: "User Feedback", internal: "Internal",
  bug_report: "Bug Report", strategic: "Strategic",
};

const EMPTY_FORM = {
  title: "", why: "", type: "feature", priority: "P1",
  status: "intake", owner: "", source: "internal",
  target_release: "", blocker: "", decision_log: "",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function prependLog(existing, entry) {
  const line = `${today()} — ${entry.trim()}`;
  return existing ? `${line}\n---\n${existing}` : line;
}

function parseLog(str) {
  if (!str?.trim()) return [];
  return str.split(/\n---\n/).map(e => e.trim()).filter(Boolean);
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PriorityBadge({ p }) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 10,
      fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
      background: PRIORITY_COLOR[p] + "18", color: PRIORITY_COLOR[p],
      border: `1px solid ${PRIORITY_COLOR[p]}44`,
    }}>{p}</span>
  );
}

function StatusBadge({ s }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 10,
      fontSize: 11, fontWeight: 600,
      background: STATUS_BG[s], color: STATUS_COLOR[s],
      border: `1px solid ${STATUS_COLOR[s]}44`,
    }}>{STATUS_LABEL[s]}</span>
  );
}

function TypeChip({ t }) {
  return (
    <span style={{ fontSize: 12, color: "#888" }}>
      {TYPE_ICON[t] || "📌"} {TYPE_LABEL[t] || t}
    </span>
  );
}

// ── Board Card ───────────────────────────────────────────────────────────────

function BoardCard({ item, onSelect }) {
  return (
    <button
      onClick={() => onSelect(item)}
      style={{
        width: "100%", textAlign: "left", background: "#fff",
        border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 14px",
        cursor: "pointer", marginBottom: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        transition: "box-shadow 0.12s, border-color 0.12s",
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 3px 10px rgba(0,0,0,0.1)"; e.currentTarget.style.borderColor = "#d1d5db"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)"; e.currentTarget.style.borderColor = "#e5e7eb"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <PriorityBadge p={item.priority} />
        <TypeChip t={item.type} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", lineHeight: 1.4, marginBottom: 4 }}>
        {item.title}
      </div>
      {item.why && (
        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4, marginBottom: 6,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {item.why}
        </div>
      )}
      {item.status === "blocked" && item.blocker && (
        <div style={{ fontSize: 11, color: "#c8850a", background: "#fffbeb",
          border: "1px solid #fde68a", borderRadius: 4, padding: "3px 7px", marginBottom: 6,
          overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          ⚠ {item.blocker}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        {item.owner
          ? <span style={{ fontSize: 11, color: "#9ca3af" }}>👤 {item.owner}</span>
          : <span style={{ fontSize: 11, color: "#d1d5db" }}>No owner</span>}
        {item.target_release && (
          <span style={{ fontSize: 11, color: "#6b7280", background: "#f3f4f6",
            borderRadius: 4, padding: "1px 6px" }}>{item.target_release}</span>
        )}
      </div>
    </button>
  );
}

// ── New / Edit Item Modal ────────────────────────────────────────────────────

function ItemModal({ initial, onSave, onClose }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.title.trim() || !form.why.trim()) return;
    setSaving(true);
    try {
      let saved;
      if (isEdit) {
        saved = await RoadmapItem.update(form.id, {
          title: form.title, why: form.why, type: form.type,
          status: form.status, priority: form.priority, owner: form.owner,
          source: form.source, target_release: form.target_release,
          blocker: form.blocker, decision_log: form.decision_log,
          shipped_date: form.shipped_date || "",
        });
      } else {
        saved = await RoadmapItem.create({
          ...form,
          created_date: today(),
          updated_date: today(),
        });
      }
      onSave(saved);
    } finally {
      setSaving(false);
    }
  }

  const inp = (label, key, type = "text", opts = {}) => (
    <div style={{ marginBottom: 16 }}>
      <label style={S.label}>{label}{opts.required && <span style={{ color: "#dc2626" }}> *</span>}</label>
      {type === "textarea"
        ? <textarea value={form[key] || ""} onChange={e => set(key, e.target.value)}
            rows={opts.rows || 3} style={{ ...S.input, resize: "vertical", fontFamily: "inherit" }} />
        : type === "select"
          ? <select value={form[key] || ""} onChange={e => set(key, e.target.value)} style={S.input}>
              {opts.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          : <input type={type} value={form[key] || ""} onChange={e => set(key, e.target.value)}
              placeholder={opts.placeholder || ""} style={S.input} />
      }
    </div>
  );

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.modal, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#0B1F3B" }}>
            {isEdit ? "Edit Item" : "New Roadmap Item"}
          </div>
          <button onClick={onClose} style={S.iconBtn}>✕</button>
        </div>

        {inp("Title", "title", "text", { required: true, placeholder: "What are we building?" })}
        {inp("Why this matters", "why", "textarea", { required: true, rows: 3, placeholder: "Business justification — not just a description" })}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            {inp("Type", "type", "select", { options: Object.entries(TYPE_LABEL) })}
          </div>
          <div>
            {inp("Priority", "priority", "select", { options: PRIORITY_ORDER.map(p => [p, PRIORITY_LABEL[p]]) })}
          </div>
          <div>
            {inp("Status", "status", "select", { options: STATUS_ORDER.map(s => [s, STATUS_LABEL[s]]) })}
          </div>
          <div>
            {inp("Source", "source", "select", { options: Object.entries(SOURCE_LABEL) })}
          </div>
        </div>

        {inp("Owner", "owner", "text", { placeholder: "Name or initials" })}
        {inp("Target release", "target_release", "text", { placeholder: "e.g. v1.5, Q2, post-launch" })}

        {(form.status === "blocked") && inp("Blocker", "blocker", "textarea", {
          rows: 2, placeholder: "What specifically is stuck and why?"
        })}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={S.btnSecondary}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim() || !form.why.trim()}
            style={{ ...S.btnPrimary, opacity: (saving || !form.title.trim() || !form.why.trim()) ? 0.5 : 1 }}
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add to Intake"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({ item, onClose, onUpdate, onDelete }) {
  const [form, setForm] = useState({ ...item });
  const [logEntry, setLogEntry] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function save(patch) {
    setSaving(true);
    try {
      const updated = await RoadmapItem.update(item.id, { ...patch, updated_date: today() });
      onUpdate(updated);
      setForm(f => ({ ...f, ...patch }));
    } finally {
      setSaving(false);
    }
  }

  async function handleField(k, v) {
    set(k, v);
    await save({ [k]: v });
  }

  async function appendLog() {
    if (!logEntry.trim()) return;
    const newLog = prependLog(form.decision_log, logEntry);
    set("decision_log", newLog);
    setLogEntry("");
    await save({ decision_log: newLog });
  }

  async function markShipped() {
    const patch = { status: "done", shipped_date: today() };
    set("status", "done");
    set("shipped_date", today());
    await save(patch);
  }

  async function handleDelete() {
    await RoadmapItem.delete(item.id);
    onDelete(item.id);
  }

  const logEntries = parseLog(form.decision_log);

  const sel = (label, key, options) => (
    <div style={{ marginBottom: 14 }}>
      <div style={S.label}>{label}</div>
      <select
        value={form[key] || ""}
        onChange={e => handleField(key, e.target.value)}
        style={{ ...S.input, fontSize: 13 }}
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  const field = (label, key, type = "text", opts = {}) => (
    <div style={{ marginBottom: 14 }}>
      <div style={S.label}>{label}</div>
      {type === "textarea"
        ? <textarea
            value={form[key] || ""}
            onChange={e => set(key, e.target.value)}
            onBlur={e => handleField(key, e.target.value)}
            rows={opts.rows || 3}
            style={{ ...S.input, resize: "vertical", fontFamily: "inherit" }}
          />
        : <input
            type={type}
            value={form[key] || ""}
            onChange={e => set(key, e.target.value)}
            onBlur={e => handleField(key, e.target.value)}
            placeholder={opts.placeholder || ""}
            style={{ ...S.input, fontSize: 13 }}
          />
      }
    </div>
  );

  return (
    <div style={S.drawerOverlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.drawer}>
        {/* Header */}
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid #e5e7eb", paddingBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <PriorityBadge p={form.priority} />
              <StatusBadge s={form.status} />
              <TypeChip t={form.type} />
            </div>
            <button onClick={onClose} style={S.iconBtn}>✕</button>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0B1F3B", marginTop: 12, lineHeight: 1.3 }}>
            {form.title}
          </div>
          {form.owner && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>👤 {form.owner}</div>}
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>

          {/* Why */}
          <div style={{ marginBottom: 24, padding: "14px 16px", background: "#f8fafc",
            borderLeft: "3px solid #1a5fa8", borderRadius: "0 6px 6px 0" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "#1a5fa8", marginBottom: 6 }}>Why This Matters</div>
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.65 }}>{form.why}</div>
          </div>

          {/* Metadata grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            {sel("Priority", "priority", PRIORITY_ORDER.map(p => [p, PRIORITY_LABEL[p]]))}
            {sel("Status", "status", STATUS_ORDER.map(s => [s, STATUS_LABEL[s]]))}
            {sel("Type", "type", Object.entries(TYPE_LABEL))}
            {sel("Source", "source", Object.entries(SOURCE_LABEL))}
          </div>

          {field("Owner", "owner", "text", { placeholder: "Name or initials" })}
          {field("Target release", "target_release", "text", { placeholder: "v1.5, Q2, post-launch…" })}

          {/* Blocker — shown when blocked */}
          {form.status === "blocked" && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...S.label, color: "#c8850a" }}>⚠ Blocker</div>
              <textarea
                value={form.blocker || ""}
                onChange={e => set("blocker", e.target.value)}
                onBlur={e => handleField("blocker", e.target.value)}
                rows={2}
                placeholder="What specifically is stuck and why?"
                style={{ ...S.input, resize: "vertical", fontFamily: "inherit",
                  borderColor: "#fde68a", background: "#fffbeb" }}
              />
            </div>
          )}

          {/* Shipped date */}
          {form.status === "done" && form.shipped_date && (
            <div style={{ marginBottom: 14, fontSize: 13, color: "#059669" }}>
              ✓ Shipped {form.shipped_date}
            </div>
          )}

          {/* Decision Log */}
          <div style={{ marginTop: 8 }}>
            <div style={{ borderBottom: "2px solid #e5e7eb", paddingBottom: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase", color: "#6b7280" }}>Decision Log</span>
            </div>

            {/* Add entry */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <textarea
                value={logEntry}
                onChange={e => setLogEntry(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) appendLog(); }}
                rows={2}
                placeholder="Add a note — decision, scope cut, context… (⌘↵ to save)"
                style={{ ...S.input, flex: 1, resize: "none", fontFamily: "inherit", fontSize: 13 }}
              />
              <button
                onClick={appendLog}
                disabled={!logEntry.trim() || saving}
                style={{ ...S.btnPrimary, alignSelf: "flex-end", whiteSpace: "nowrap",
                  opacity: !logEntry.trim() ? 0.4 : 1 }}
              >+ Add
              </button>
            </div>

            {/* Entries */}
            {logEntries.length === 0
              ? <div style={{ fontSize: 13, color: "#d1d5db", fontStyle: "italic" }}>No entries yet.</div>
              : logEntries.map((entry, i) => {
                  const dashIdx = entry.indexOf(" — ");
                  const date = dashIdx > -1 ? entry.slice(0, dashIdx) : "";
                  const text = dashIdx > -1 ? entry.slice(dashIdx + 3) : entry;
                  return (
                    <div key={i} style={{ paddingBottom: 12, marginBottom: 12,
                      borderBottom: i < logEntries.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                      {date && <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 3 }}>{date}</div>}
                      <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{text}</div>
                    </div>
                  );
                })
            }
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e5e7eb",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            {confirmDelete
              ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#dc2626" }}>Delete permanently?</span>
                  <button onClick={handleDelete} style={{ ...S.btnDanger, padding: "4px 10px", fontSize: 12 }}>Yes, delete</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ ...S.btnSecondary, padding: "4px 10px", fontSize: 12 }}>Cancel</button>
                </div>
              : <button onClick={() => setConfirmDelete(true)} style={{ ...S.btnSecondary, color: "#dc2626", borderColor: "#fca5a5" }}>
                  Delete
                </button>
            }
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {form.status !== "done" && (
              <button onClick={markShipped} disabled={saving}
                style={{ ...S.btnPrimary, background: "#059669", borderColor: "#059669" }}>
                ✓ Mark Shipped
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Views ────────────────────────────────────────────────────────────────────

function BoardView({ items, onSelect }) {
  const byStatus = useMemo(() => {
    const m = {};
    for (const col of BOARD_COLS) m[col] = [];
    for (const item of items) {
      if (item.status === "cancelled") continue;
      if (BOARD_COLS.includes(item.status)) m[item.status].push(item);
    }
    // Sort each column by priority then created_date
    for (const col of BOARD_COLS) {
      m[col].sort((a, b) => {
        const pd = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
        if (pd !== 0) return pd;
        return (a.created_date || "").localeCompare(b.created_date || "");
      });
    }
    return m;
  }, [items]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, alignItems: "start" }}>
      {BOARD_COLS.map(col => (
        <div key={col}>
          <div style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
              textTransform: "uppercase", color: STATUS_COLOR[col] }}>
              {STATUS_LABEL[col]}
            </span>
            <span style={{ fontSize: 11, color: "#9ca3af", background: "#f3f4f6",
              borderRadius: 10, padding: "1px 7px", fontWeight: 600 }}>
              {byStatus[col].length}
            </span>
          </div>
          <div style={{ minHeight: 40 }}>
            {byStatus[col].map(item => (
              <BoardCard key={item.id} item={item} onSelect={onSelect} />
            ))}
            {byStatus[col].length === 0 && (
              <div style={{ border: "1px dashed #e5e7eb", borderRadius: 8, padding: "16px 12px",
                textAlign: "center", fontSize: 12, color: "#d1d5db" }}>—</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListView({ items, onSelect }) {
  const [sortKey, setSortKey] = useState("priority");
  const [sortDir, setSortDir] = useState(1);

  function toggleSort(k) {
    if (sortKey === k) setSortDir(d => -d);
    else { setSortKey(k); setSortDir(1); }
  }

  const sorted = useMemo(() => {
    const copy = [...items].filter(i => i.status !== "cancelled");
    copy.sort((a, b) => {
      let va, vb;
      if (sortKey === "priority") {
        va = PRIORITY_ORDER.indexOf(a.priority);
        vb = PRIORITY_ORDER.indexOf(b.priority);
      } else if (sortKey === "status") {
        va = STATUS_ORDER.indexOf(a.status);
        vb = STATUS_ORDER.indexOf(b.status);
      } else if (sortKey === "updated") {
        va = a.updated_date || ""; vb = b.updated_date || "";
      } else {
        va = (a[sortKey] || "").toString().toLowerCase();
        vb = (b[sortKey] || "").toString().toLowerCase();
      }
      if (va < vb) return -sortDir;
      if (va > vb) return sortDir;
      return 0;
    });
    return copy;
  }, [items, sortKey, sortDir]);

  const Th = ({ label, k }) => (
    <th
      onClick={() => toggleSort(k)}
      style={{ ...S.th, cursor: "pointer", userSelect: "none",
        color: sortKey === k ? "#0B1F3B" : "#6b7280" }}
    >
      {label}{sortKey === k ? (sortDir > 0 ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#f9fafb" }}>
            <Th label="Priority" k="priority" />
            <Th label="Title" k="title" />
            <th style={S.th}>Why</th>
            <Th label="Type" k="type" />
            <Th label="Owner" k="owner" />
            <Th label="Status" k="status" />
            <th style={S.th}>Target</th>
            <Th label="Updated" k="updated" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, i) => (
            <tr
              key={item.id}
              onClick={() => onSelect(item)}
              style={{ background: i % 2 === 0 ? "#fff" : "#fafafa",
                cursor: "pointer", transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = "#f0f7ff"}
              onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafafa"}
            >
              <td style={S.td}><PriorityBadge p={item.priority} /></td>
              <td style={{ ...S.td, fontWeight: 600, color: "#111827", maxWidth: 220 }}>
                {item.title}
                {item.status === "blocked" && <span style={{ marginLeft: 6, color: "#c8850a" }}>⚠</span>}
              </td>
              <td style={{ ...S.td, color: "#6b7280", maxWidth: 200,
                overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                {item.why}
              </td>
              <td style={S.td}><TypeChip t={item.type} /></td>
              <td style={{ ...S.td, color: "#6b7280" }}>{item.owner || "—"}</td>
              <td style={S.td}><StatusBadge s={item.status} /></td>
              <td style={{ ...S.td, color: "#6b7280" }}>{item.target_release || "—"}</td>
              <td style={{ ...S.td, color: "#9ca3af" }}>{item.updated_date || item.created_date || "—"}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", padding: "32px 0", color: "#d1d5db", fontSize: 13 }}>
                No items match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ReleasesView({ items, onSelect }) {
  const groups = useMemo(() => {
    const m = new Map();
    const rel_items = items.filter(i => i.status !== "cancelled");
    for (const item of rel_items) {
      const key = item.target_release?.trim() || "__unscheduled__";
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(item);
    }
    // Sort groups: named releases first (alphabetically), then unscheduled
    const entries = [...m.entries()].sort(([a], [b]) => {
      if (a === "__unscheduled__") return 1;
      if (b === "__unscheduled__") return -1;
      return a.localeCompare(b);
    });
    return entries;
  }, [items]);

  return (
    <div>
      {groups.map(([key, groupItems]) => {
        const shipped = groupItems.filter(i => i.status === "done").length;
        const inFlight = groupItems.filter(i => ["in_progress", "blocked", "scoped"].includes(i.status)).length;
        const label = key === "__unscheduled__" ? "Unscheduled" : key;

        return (
          <div key={key} style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12,
              paddingBottom: 8, borderBottom: "2px solid #e5e7eb" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#0B1F3B" }}>{label}</span>
              <span style={{ fontSize: 11, color: "#059669", background: "#ecfdf5",
                border: "1px solid #6ee7b7", borderRadius: 10, padding: "1px 8px" }}>
                {shipped} shipped
              </span>
              {inFlight > 0 && (
                <span style={{ fontSize: 11, color: "#1a5fa8", background: "#eff6ff",
                  border: "1px solid #bfdbfe", borderRadius: 10, padding: "1px 8px" }}>
                  {inFlight} in flight
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {groupItems
                .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
                .map(item => (
                  <div
                    key={item.id}
                    onClick={() => onSelect(item)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                      cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                  >
                    <StatusBadge s={item.status} />
                    <PriorityBadge p={item.priority} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", flex: 1 }}>{item.title}</span>
                    <TypeChip t={item.type} />
                    {item.owner && <span style={{ fontSize: 12, color: "#9ca3af" }}>{item.owner}</span>}
                  </div>
                ))
              }
            </div>
          </div>
        );
      })}
      {groups.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#d1d5db", fontSize: 14 }}>
          No items yet.
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ProductRoadmap() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("board");
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [filters, setFilters] = useState({ type: "all", priority: "all", showCancelled: false });

  useEffect(() => {
    RoadmapItem.filter({})
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return items.filter(item => {
      if (!filters.showCancelled && item.status === "cancelled") return false;
      if (filters.type !== "all" && item.type !== filters.type) return false;
      if (filters.priority !== "all" && item.priority !== filters.priority) return false;
      return true;
    });
  }, [items, filters]);

  // Stats
  const active   = items.filter(i => !["done","cancelled"].includes(i.status)).length;
  const blocked  = items.filter(i => i.status === "blocked").length;
  const shipped  = items.filter(i => i.status === "done").length;
  const p0Count  = items.filter(i => i.priority === "P0" && !["done","cancelled"].includes(i.status)).length;
  const p1Count  = items.filter(i => i.priority === "P1" && !["done","cancelled"].includes(i.status)).length;

  function handleSaved(item) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === item.id);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [item, ...prev];
    });
    setShowNew(false);
    setSelected(item);
  }

  function handleUpdate(item) {
    setItems(prev => prev.map(i => i.id === item.id ? item : i));
    setSelected(item);
  }

  function handleDelete(id) {
    setItems(prev => prev.filter(i => i.id !== id));
    setSelected(null);
  }

  return (
    <AdminRoute>
      <div style={S.root}>
        {/* Header */}
        <div style={S.header}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={S.title}>Product Roadmap</div>
              <div style={S.subtitle}>
                <span style={{ color: "#374151" }}>{active} active</span>
                {blocked > 0 && <span style={{ color: "#c8850a", marginLeft: 10 }}>⚠ {blocked} blocked</span>}
                <span style={{ color: "#9ca3af", marginLeft: 10 }}>{shipped} shipped</span>
                {p0Count > 0 && (
                  <span style={{ color: "#dc2626", marginLeft: 10, fontWeight: 600 }}>
                    {p0Count} P0{p0Count > 1 ? "s" : ""}
                  </span>
                )}
                {p1Count > 3 && (
                  <span style={{ color: "#c8850a", marginLeft: 10, fontWeight: 600 }}>
                    ⚡ {p1Count} P1s — consider trimming
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => setShowNew(true)} style={S.btnPrimary}>
              + New Item
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={S.toolbar}>
          {/* View toggle */}
          <div style={{ display: "flex", gap: 4, background: "#f3f4f6", borderRadius: 8, padding: 3 }}>
            {[["board","Board"],["list","List"],["releases","Releases"]].map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} style={{
                ...S.viewBtn,
                background: view === v ? "#fff" : "transparent",
                color: view === v ? "#0B1F3B" : "#6b7280",
                boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}>{l}</button>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={filters.type}
              onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
              style={S.filterSelect}
            >
              <option value="all">All types</option>
              {Object.entries(TYPE_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select
              value={filters.priority}
              onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
              style={S.filterSelect}
            >
              <option value="all">All priorities</option>
              {PRIORITY_ORDER.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <label style={{ fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={filters.showCancelled}
                onChange={e => setFilters(f => ({ ...f, showCancelled: e.target.checked }))}
              />
              Show cancelled
            </label>
          </div>
        </div>

        {/* Content */}
        <div style={S.content}>
          {loading
            ? <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Loading…</div>
            : view === "board"
              ? <BoardView items={filtered} onSelect={setSelected} />
              : view === "list"
                ? <ListView items={filtered} onSelect={setSelected} />
                : <ReleasesView items={filtered} onSelect={setSelected} />
          }
        </div>
      </div>

      {/* New item modal */}
      {showNew && (
        <ItemModal onSave={handleSaved} onClose={() => setShowNew(false)} />
      )}

      {/* Detail drawer */}
      {selected && (
        <DetailDrawer
          key={selected.id}
          item={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </AdminRoute>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const S = {
  root: {
    background: "#F3F4F6", minHeight: "100vh",
    fontFamily: "Inter, system-ui, sans-serif", color: "#111827",
  },
  header: {
    padding: "28px 32px 16px",
    borderBottom: "1px solid #E5E7EB",
    background: "#fff",
  },
  title: {
    fontSize: 26, fontWeight: 700, color: "#0B1F3B", letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13, color: "#6B7280", marginTop: 4,
  },
  toolbar: {
    padding: "14px 32px",
    background: "#fff",
    borderBottom: "1px solid #E5E7EB",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  content: {
    padding: "24px 32px",
  },
  viewBtn: {
    padding: "5px 14px", borderRadius: 6, border: "none",
    cursor: "pointer", fontSize: 13, fontWeight: 500,
    transition: "background 0.1s",
  },
  filterSelect: {
    fontSize: 12, padding: "5px 10px", border: "1px solid #E5E7EB",
    borderRadius: 6, background: "#fff", color: "#374151", cursor: "pointer",
  },
  label: {
    fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
    textTransform: "uppercase", color: "#9ca3af", marginBottom: 5,
  },
  input: {
    width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB",
    borderRadius: 6, fontSize: 14, color: "#111827", background: "#fff",
    boxSizing: "border-box", outline: "none",
  },
  btnPrimary: {
    background: "#0B1F3B", color: "#fff", border: "1px solid #0B1F3B",
    borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 600,
    cursor: "pointer",
  },
  btnSecondary: {
    background: "#fff", color: "#374151", border: "1px solid #E5E7EB",
    borderRadius: 7, padding: "8px 14px", fontSize: 13, fontWeight: 500,
    cursor: "pointer",
  },
  btnDanger: {
    background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5",
    borderRadius: 6, padding: "6px 12px", fontSize: 13, fontWeight: 600,
    cursor: "pointer",
  },
  iconBtn: {
    background: "none", border: "none", cursor: "pointer",
    fontSize: 16, color: "#9ca3af", padding: 4, lineHeight: 1,
  },
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, padding: 24,
  },
  modal: {
    background: "#fff", borderRadius: 12, padding: "24px 28px",
    width: "100%", maxWidth: 540,
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  },
  drawerOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)",
    display: "flex", justifyContent: "flex-end",
    zIndex: 1000,
  },
  drawer: {
    width: 460, background: "#fff", height: "100%",
    display: "flex", flexDirection: "column",
    boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
    overflowY: "hidden",
  },
  th: {
    padding: "10px 14px", textAlign: "left", fontSize: 11,
    fontWeight: 700, color: "#6b7280", letterSpacing: "0.08em",
    textTransform: "uppercase", borderBottom: "1px solid #E5E7EB",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 14px", borderBottom: "1px solid #f3f4f6",
    fontSize: 13, whiteSpace: "nowrap",
  },
};
