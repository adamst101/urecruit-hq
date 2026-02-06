// src/pages/AdminImport.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "../api/base44Client";

/* =========================================================
   ErrorBoundary (so blank page becomes visible error)
========================================================= */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
          <h2 style={{ margin: "0 0 8px 0" }}>AdminImport crashed</h2>
          <div style={{ color: "#b91c1c", whiteSpace: "pre-wrap" }}>
            {String(this.state.error?.message || this.state.error || "Unknown error")}
          </div>
          <details style={{ marginTop: 12 }}>
            <summary>Stack / component info</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.error?.stack || "")}</pre>
            <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.info?.componentStack || "")}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

/* =========================================================
   Helpers
========================================================= */
function safeString(x) {
  if (x == null) return null;
  const s = String(x).trim();
  return s ? s : null;
}
function lc(x) {
  return String(x || "").toLowerCase().trim();
}
function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function safeNumber(x) {
  if (x == null) return null;
  if (typeof x === "string" && !x.trim()) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function toISODate(x) {
  if (!x) return null;
  const s = String(x).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = String(mdy[1]).padStart(2, "0");
    const dd = String(mdy[2]).padStart(2, "0");
    return `${mdy[3]}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Bad name rules (align with your ingest cleanup intent)
function isMoneyLikeName(name) {
  const t = safeString(name);
  if (!t) return false;
  return /^\s*\$\s*\d/.test(t) || /^\s*\d+\.\d{2}\s*$/.test(t);
}
function isBadName(name) {
  const t = lc(name);
  if (!t) return true;
  if (t === "register") return true;
  if (t === "details") return true;
  if (t === "view details") return true;
  if (t === "view detail") return true;
  if (t === "register now") return true;
  if (t === "camp") return true;
  if (isMoneyLikeName(name)) return true;
  return false;
}
function isMissingPriceRow(r) {
  const p = safeNumber(r?.price);
  const pmin = safeNumber(r?.price_min);
  const pmax = safeNumber(r?.price_max);

  const pZeroOrNull = p == null || p === 0;
  const minZeroOrNull = pmin == null || pmin === 0;
  const maxZeroOrNull = pmax == null || pmax === 0;

  return pZeroOrNull && minZeroOrNull && maxZeroOrNull;
}

// Base44 entity list helper (works across common SDK shapes)
async function entityList(Entity, whereObj) {
  const where = whereObj || {};
  if (!Entity) throw new Error("Entity is null/undefined.");

  if (typeof Entity.filter === "function") return asArray(await Entity.filter(where));
  if (typeof Entity.list === "function") {
    try {
      return asArray(await Entity.list({ where }));
    } catch {
      return asArray(await Entity.list(where));
    }
  }
  if (typeof Entity.findMany === "function") {
    try {
      return asArray(await Entity.findMany({ where }));
    } catch {
      return asArray(await Entity.findMany(where));
    }
  }
  if (typeof Entity.all === "function") return asArray(await Entity.all());

  throw new Error("Entity has no supported list method (filter/list/findMany/all).");
}

function normalizeSportRow(r) {
  return {
    id: r?.id ? String(r.id) : "",
    name: safeString(r?.sport_name || r?.name || r?.sportName) || "",
    active:
      typeof r?.active === "boolean"
        ? r.active
        : typeof r?.is_active === "boolean"
          ? r.is_active
          : true,
  };
}

function normalizeCampDemoRow(r) {
  return {
    id: r?.id ? String(r.id) : "",
    sport_id: safeString(r?.sport_id),
    camp_name: safeString(r?.camp_name),
    start_date: safeString(r?.start_date),
    end_date: safeString(r?.end_date),
    city: safeString(r?.city),
    state: safeString(r?.state),
    price: safeNumber(r?.price),
    price_min: safeNumber(r?.price_min),
    price_max: safeNumber(r?.price_max),
    link_url: safeString(r?.link_url),
    source_url: safeString(r?.source_url),
    notes: safeString(r?.notes),
  };
}

/* =========================================================
   Main Page
========================================================= */
function AdminImportInner() {
  const nav = useNavigate();

  // Entities
  const SportEntity = base44?.entities?.Sport || base44?.entities?.Sports || null;
  const CampDemoEntity = base44?.entities?.CampDemo || null;

  // Sport selector
  const [sportsLoading, setSportsLoading] = useState(false);
  const [sports, setSports] = useState([]);
  const [selectedSportId, setSelectedSportId] = useState("");
  const [selectedSportName, setSelectedSportName] = useState("");

  // Review controls
  const [reviewMode, setReviewMode] = useState("bad_name"); // bad_name | missing_price | all
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewPageSize, setReviewPageSize] = useState(25);
  const [reviewPage, setReviewPage] = useState(1);

  // Review data
  const [reviewWorking, setReviewWorking] = useState(false);
  const [reviewRows, setReviewRows] = useState([]);
  const [reviewEdit, setReviewEdit] = useState({});
  const [saveWorkingId, setSaveWorkingId] = useState("");
  const [log, setLog] = useState("");

  function appendLog(line) {
    setLog((prev) => (prev ? prev + "\n" + line : line));
  }

  async function loadSports() {
    setSportsLoading(true);
    setLog("");
    try {
      if (!SportEntity) throw new Error("base44.entities.Sport not found (Sport table/entity missing).");

      const rows = await entityList(SportEntity, {});
      const list = asArray(rows)
        .map(normalizeSportRow)
        .filter((s) => s.id && s.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      setSports(list);

      if (!selectedSportId && list.length) {
        setSelectedSportId(list[0].id);
        setSelectedSportName(list[0].name);
      } else if (selectedSportId) {
        const hit = list.find((x) => x.id === selectedSportId);
        if (hit) setSelectedSportName(hit.name);
      }

      appendLog(`[Sports] Loaded ${list.length}`);
    } catch (e) {
      appendLog(`[Sports] ERROR: ${String(e?.message || e)}`);
      setSports([]);
      setSelectedSportId("");
      setSelectedSportName("");
    } finally {
      setSportsLoading(false);
    }
  }

  useEffect(() => {
    loadSports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function matchesMode(r) {
    if (reviewMode === "all") return true;
    if (reviewMode === "bad_name") return isBadName(r?.camp_name);
    if (reviewMode === "missing_price") return isMissingPriceRow(r);
    return true;
  }

  function matchesSearch(r) {
    const q = lc(reviewSearch);
    if (!q) return true;
    const name = lc(r?.camp_name);
    const url = lc(r?.link_url || r?.source_url);
    return (name && name.includes(q)) || (url && url.includes(q));
  }

  async function loadReview() {
    const runIso = new Date().toISOString();
    setReviewWorking(true);
    setLog("");
    try {
      if (!selectedSportId) throw new Error("Select a sport first.");
      if (!CampDemoEntity) throw new Error("base44.entities.CampDemo not found (CampDemo entity missing).");

      appendLog(`[Review] Loading CampDemo for sport_id=${selectedSportId} @ ${runIso}`);

      const rows = await entityList(CampDemoEntity, { sport_id: selectedSportId });
      const normalized = asArray(rows).map(normalizeCampDemoRow).filter((x) => x.id);

      const filtered = normalized.filter((r) => matchesMode(r) && matchesSearch(r));

      filtered.sort((a, b) => {
        const aBad = isBadName(a.camp_name) ? 0 : 1;
        const bBad = isBadName(b.camp_name) ? 0 : 1;
        if (aBad !== bBad) return aBad - bBad;
        return String(a.start_date || "").localeCompare(String(b.start_date || ""));
      });

      setReviewRows(filtered);
      setReviewPage(1);

      const nextEdit = {};
      for (const r of filtered) {
        nextEdit[r.id] = {
          camp_name: r.camp_name ?? "",
          start_date: r.start_date ?? "",
          end_date: r.end_date ?? "",
          city: r.city ?? "",
          state: r.state ?? "",
          price: r.price ?? "",
          price_min: r.price_min ?? "",
          price_max: r.price_max ?? "",
          link_url: r.link_url ?? "",
          notes: r.notes ?? "",
        };
      }
      setReviewEdit(nextEdit);

      appendLog(`[Review] total=${normalized.length} filtered=${filtered.length} mode=${reviewMode} search="${reviewSearch || ""}"`);
    } catch (e) {
      appendLog(`[Review] ERROR: ${String(e?.message || e)}`);
      setReviewRows([]);
      setReviewEdit({});
    } finally {
      setReviewWorking(false);
    }
  }

  const total = reviewRows.length;
  const totalPages = Math.max(1, Math.ceil(total / Number(reviewPageSize || 25)));
  const page = Math.min(Math.max(1, reviewPage), totalPages);

  const pageRows = useMemo(() => {
    const size = Number(reviewPageSize || 25);
    const start = (page - 1) * size;
    return reviewRows.slice(start, start + size);
  }, [reviewRows, page, reviewPageSize]);

  async function saveRow(id) {
    const runIso = new Date().toISOString();
    if (!id) return;
    if (!CampDemoEntity?.update) {
      appendLog(`[Save] ERROR: CampDemo.update not available`);
      return;
    }

    const ed = reviewEdit[id];
    if (!ed) return;

    setSaveWorkingId(id);
    try {
      const payload = {
        camp_name: safeString(ed.camp_name) || null,
        start_date: toISODate(ed.start_date) || null,
        end_date: toISODate(ed.end_date) || null,
        city: safeString(ed.city) || null,
        state: safeString(ed.state) || null,
        price: safeNumber(ed.price),
        price_min: safeNumber(ed.price_min),
        price_max: safeNumber(ed.price_max),
        link_url: safeString(ed.link_url) || null,
        notes: safeString(ed.notes) || null,
        last_seen_at: runIso,
      };

      // auto-fill: if price set and min empty, set min=price
      if (payload.price != null && (payload.price_min == null || payload.price_min === 0)) {
        payload.price_min = payload.price;
      }
      // sanity: if max < min, clear max
      if (payload.price_max != null && payload.price_min != null && payload.price_max < payload.price_min) {
        payload.price_max = null;
      }

      await CampDemoEntity.update(String(id), payload);
      appendLog(`[Save] OK id=${id}`);

      // Reload so “remaining” decreases immediately
      await loadReview();
    } catch (e) {
      appendLog(`[Save] ERROR id=${id}: ${String(e?.message || e)}`);
    } finally {
      setSaveWorkingId("");
    }
  }

  const pageStyle = { padding: 16, fontFamily: "system-ui, sans-serif" };
  const box = { border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" };
  const label = { fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#374151" };
  const input = { width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8 };
  const btn = { padding: "8px 12px", borderRadius: 10, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" };
  const btnPrimary = { ...btn, background: "#111827", color: "#fff", border: "1px solid #111827" };

  return (
    <div style={pageStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Admin Import</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Safe-mode UI: Camps Review (edit CampDemo directly)</div>
        </div>
        <button style={btn} onClick={() => nav("/Workspace")}>Back</button>
      </div>

      {/* Sport selector */}
      <div style={{ ...box, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>1) Select sport</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 10, alignItems: "end" }}>
          <div>
            <div style={label}>Sport</div>
            <select
              style={{ ...input, background: "#fff" }}
              value={selectedSportId}
              onChange={(e) => {
                const id = e.target.value;
                const hit = sports.find((x) => x.id === id);
                setSelectedSportId(id);
                setSelectedSportName(hit?.name || "");
              }}
              disabled={sportsLoading || reviewWorking}
            >
              <option value="">Select…</option>
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              {selectedSportName ? `Selected: ${selectedSportName}` : "Choose a sport"}
            </div>
          </div>
          <button style={btn} onClick={loadSports} disabled={sportsLoading}>
            {sportsLoading ? "Refreshing…" : "Refresh sports"}
          </button>
        </div>
      </div>

      {/* Review */}
      <div style={box}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>2) Camps Review (edit CampDemo inline)</div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 160px 160px", gap: 10, marginBottom: 10 }}>
          <div>
            <div style={label}>Mode</div>
            <select style={{ ...input, background: "#fff" }} value={reviewMode} onChange={(e) => setReviewMode(e.target.value)} disabled={reviewWorking}>
              <option value="bad_name">Bad names</option>
              <option value="missing_price">Missing price</option>
              <option value="all">All</option>
            </select>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
              Bad name includes Register/Details/Camp and money-as-name like “$475.00”.
            </div>
          </div>

          <div>
            <div style={label}>Search (name or URL)</div>
            <input style={input} value={reviewSearch} onChange={(e) => setReviewSearch(e.target.value)} placeholder='e.g. "ryzer" or "prospect"' />
          </div>

          <div>
            <div style={label}>Page size</div>
            <select
              style={{ ...input, background: "#fff" }}
              value={reviewPageSize}
              onChange={(e) => setReviewPageSize(Number(e.target.value))}
              disabled={reviewWorking}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "end", justifyContent: "flex-end" }}>
            <button style={btnPrimary} onClick={loadReview} disabled={!selectedSportId || reviewWorking}>
              {reviewWorking ? "Loading…" : "Load / Refresh"}
            </button>
            <button style={btn} onClick={() => setLog("")} disabled={reviewWorking}>Clear log</button>
          </div>
        </div>

        {/* Pager */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "8px 0 10px 0", color: "#374151" }}>
          <div>
            Showing <b>{total ? (page - 1) * reviewPageSize + 1 : 0}</b>–<b>{Math.min(total, page * reviewPageSize)}</b> of <b>{total}</b>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={btn} onClick={() => setReviewPage(1)} disabled={reviewWorking || page <= 1}>First</button>
            <button style={btn} onClick={() => setReviewPage((p) => Math.max(1, p - 1))} disabled={reviewWorking || page <= 1}>Prev</button>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Page <b>{page}</b> / <b>{totalPages}</b>
            </div>
            <button style={btn} onClick={() => setReviewPage((p) => Math.min(totalPages, p + 1))} disabled={reviewWorking || page >= totalPages}>Next</button>
            <button style={btn} onClick={() => setReviewPage(totalPages)} disabled={reviewWorking || page >= totalPages}>Last</button>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ background: "#f9fafb" }}>
              <tr>
                {["Save", "Camp name", "Start", "End", "City", "State", "Price", "Min", "Max", "Link"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? (
                pageRows.map((r) => {
                  const ed = reviewEdit[r.id] || {};
                  const bad = isBadName(ed.camp_name || r.camp_name);
                  const missPrice = isMissingPriceRow({ price: ed.price, price_min: ed.price_min, price_max: ed.price_max });

                  const cell = { padding: 8, borderBottom: "1px solid #f3f4f6", verticalAlign: "top" };
                  const small = { fontSize: 11, color: "#6b7280", marginTop: 4, wordBreak: "break-all" };

                  return (
                    <tr key={r.id}>
                      <td style={cell}>
                        <button style={btnPrimary} onClick={() => saveRow(r.id)} disabled={saveWorkingId === r.id || reviewWorking}>
                          {saveWorkingId === r.id ? "Saving…" : "Save"}
                        </button>
                        <div style={small}>
                          {bad ? "Bad name" : "—"}{missPrice ? " • Missing price" : ""}
                        </div>
                      </td>

                      <td style={cell}>
                        <input
                          style={{ ...input, borderColor: bad ? "#f59e0b" : "#e5e7eb" }}
                          value={ed.camp_name ?? ""}
                          onChange={(e) => setReviewEdit((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), camp_name: e.target.value } }))}
                        />
                        <textarea
                          style={{ ...input, marginTop: 8, fontSize: 12 }}
                          rows={2}
                          value={ed.notes ?? ""}
                          onChange={(e) => setReviewEdit((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), notes: e.target.value } }))}
                          placeholder="Notes (optional)"
                        />
                        <div style={small}>id: {r.id}</div>
                      </td>

                      <td style={cell}>
                        <input style={input} value={ed.start_date ?? ""} onChange={(e) => setReviewEdit((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), start_date: e.target.value } }))} placeholder="YYYY-MM-DD" />
                      </td>

                      <td style={cell}>
                        <input style={input} value={ed.end_date ?? ""} onChange={(e) => setReviewEdit((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), end_date: e.target.value } }))} placeholder="YYYY-MM-DD" />
                      </td>

                      <td style={cell}>
                        <input style={input} value={ed.city ?? ""} onChange={(e) => setReviewEdit((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), city: e.target.value } }))} placeholder="City" />
                      </td>

                      <td style={cell}>
                        <input style={input} value={ed.state ?? ""} onChange={(e) => setReviewEdit((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), state: e.target.value } }))} placeholder="ST" />
                      </td>

                      <td style={cell}>
                        <input
                          style={{ ...input, borderColor: missPrice ? "#ef4444" : "#e5e7eb" }}
                          value={ed.price ?? ""}
                          onChange={(e) => setReviewEdit((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), price: e.target.value } }))}
                          placeholder="e.g. 199"
                        />
                      </td>

                      <td style={cell}>
                        <input style={input} value={ed.price_min ?? ""} onChange={(e) => setReviewEdit((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), price_min: e.target.value } }))} placeholder="min" />
                      </td>

                      <td style={cell}>
                        <input style={input} value={ed.price_max ?? ""} onChange={(e) => setReviewEdit((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), price_max: e.target.value } }))} placeholder="max" />
                      </td>

                      <td style={cell}>
                        <input style={input} value={ed.link_url ?? ""} onChange={(e) => setReviewEdit((p) => ({ ...p, [r.id]: { ...(p[r.id] || {}), link_url: e.target.value } }))} placeholder="https://..." />
                        <div style={small}>
                          {(ed.link_url || "").trim() ? (
                            <a href={ed.link_url} target="_blank" rel="noreferrer">Open</a>
                          ) : (
                            "—"
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} style={{ padding: 12, color: "#6b7280" }}>
                    {selectedSportId ? (reviewWorking ? "Loading…" : "No rows. Click Load / Refresh.") : "Select a sport first."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Log */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "#374151" }}>Log</div>
          <pre style={{ background: "#0b1220", color: "#e5e7eb", padding: 12, borderRadius: 10, overflow: "auto", maxHeight: 240 }}>
            {log || "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function AdminImport() {
  return (
    <ErrorBoundary>
      <AdminImportInner />
    </ErrorBoundary>
  );
}
