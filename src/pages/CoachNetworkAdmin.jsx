// src/pages/CoachNetworkAdmin.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { base44 } from "../api/base44Client";
import AdminRoute from "../components/auth/AdminRoute";

export default function CoachNetworkAdmin() {
  const nav = useNavigate();
  const [coaches, setCoaches] = useState([]);
  const [rosterCounts, setRosterCounts] = useState({});
  const [messageCounts, setMessageCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actioning, setActioning] = useState(null); // coachId being actioned
  const [actionError, setActionError] = useState(null);
  const [actionResult, setActionResult] = useState(null); // last success detail
  const [confirmRemove, setConfirmRemove] = useState(null); // coach object pending removal

  useEffect(() => {
    (async () => {
      try {
        const [coachs, roster, msgs] = await Promise.all([
          base44.entities.Coach.filter({}).catch(() => []),
          base44.entities.CoachRoster.filter({}).catch(() => []),
          base44.entities.CoachMessage.filter({}).catch(() => []),
        ]);

        const rc = {};
        for (const r of (Array.isArray(roster) ? roster : [])) {
          if (r.coach_id) rc[r.coach_id] = (rc[r.coach_id] || 0) + 1;
        }
        const mc = {};
        for (const m of (Array.isArray(msgs) ? msgs : [])) {
          if (m.coach_id) mc[m.coach_id] = (mc[m.coach_id] || 0) + 1;
        }

        setCoaches(Array.isArray(coachs) ? coachs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : []);
        setRosterCounts(rc);
        setMessageCounts(mc);
      } catch (e) {
        console.error("CoachNetworkAdmin load error:", e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleRemove(coach) {
    setActioning(coach.id);
    setActionError(null);
    setConfirmRemove(null);
    try {
      const res = await base44.functions.invoke("removeCoach", { coachId: coach.id });
      const data = res?.data;
      if (data?.ok === false) {
        setActionError(`removeCoach error: ${data.error || "unknown"}`);
        return;
      }
      setCoaches(prev => prev.filter(c => c.id !== coach.id));
    } catch (e) {
      console.error("removeCoach failed:", e?.message);
      setActionError(`Failed to remove coach: ${e?.message || "function may not be deployed"}`);
    } finally {
      setActioning(null);
    }
  }

  async function handleAction(coachId, action) {
    setActioning(coachId);
    setActionError(null);
    setActionResult(null);
    try {
      const res = await base44.functions.invoke("approveCoach", { coachId, action });
      const data = res?.data;
      // Require explicit ok: true — catches null/undefined (function not deployed) as well as ok: false
      if (!data || data.ok !== true) {
        setActionError(`approveCoach failed: ${data?.error || (data ? JSON.stringify(data) : "no response — function may not be deployed")}`);
        return;
      }
      // Show step-by-step results from the function
      if (data.results) {
        const parts = Object.entries(data.results).map(([k, v]) => `${k}: ${v}`).join(" · ");
        setActionResult(`✓ ${action === "approve" ? "Approved" : "Rejected"} — ${parts}`);
      }
      setCoaches(prev => prev.map(c =>
        c.id === coachId
          ? { ...c, status: action === "approve" ? "approved" : "rejected", active: action !== "reject" }
          : c
      ));
    } catch (e) {
      console.error("approveCoach failed:", e?.message);
      setActionError(`Failed to ${action} coach: ${e?.message || "function may not be deployed"}`);
    } finally {
      setActioning(null);
    }
  }

  const filtered = coaches.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      (c.school_or_org || "").toLowerCase().includes(q) ||
      (c.invite_code || "").toLowerCase().includes(q) ||
      (c.sport || "").toLowerCase().includes(q)
    );
  });

  return (
    <AdminRoute>
      <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#f9fafb", fontFamily: "'DM Sans', system-ui, sans-serif", padding: "32px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>

          <button
            onClick={() => nav("/AdminOps")}
            style={{ display: "flex", alignItems: "center", gap: 6, color: "#e8a020", fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer", marginBottom: 24, padding: 0 }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} /> Admin Ops
          </button>

          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, margin: "0 0 4px", letterSpacing: 1 }}>Coach Network</h1>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>{coaches.length} coach{coaches.length !== 1 ? "es" : ""} total</p>
          </div>

          <input
            style={{ width: "100%", background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#f9fafb", outline: "none", boxSizing: "border-box", marginBottom: 12 }}
            placeholder="Search by name, school, invite code, or sport…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {/* Pending review callout */}
          {(() => {
            const pending = coaches.filter(c => !c.status || c.status === "pending");
            if (pending.length === 0) return null;
            return (
              <div style={{ background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.35)", borderRadius: 10, padding: "16px 20px", marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e8a020", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
                  ⏳ Pending Review — {pending.length} application{pending.length !== 1 ? "s" : ""} awaiting decision
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pending.map(c => {
                    const isActioning = actioning === c.id;
                    return (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, background: "#111827", border: "1px solid #1f2937", borderRadius: 8, padding: "12px 16px" }}>
                        <div>
                          <span style={{ fontWeight: 700, color: "#f9fafb", fontSize: 14 }}>{c.first_name} {c.last_name}</span>
                          <span style={{ color: "#6b7280", fontSize: 13, marginLeft: 10 }}>{c.school_or_org}</span>
                          <span style={{ color: "#6b7280", fontSize: 13, marginLeft: 8 }}>· {c.sport || "Football"}</span>
                          {c.email && <span style={{ color: "#6b7280", fontSize: 12, marginLeft: 10 }}>{c.email}</span>}
                          {c.created_at && <span style={{ color: "#4b5563", fontSize: 11, marginLeft: 10 }}>{new Date(c.created_at).toLocaleDateString()}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => handleAction(c.id, "approve")}
                            disabled={isActioning}
                            style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: isActioning ? "not-allowed" : "pointer", opacity: isActioning ? 0.6 : 1 }}
                          >
                            {isActioning ? "…" : "Approve"}
                          </button>
                          <button
                            onClick={() => handleAction(c.id, "reject")}
                            disabled={isActioning}
                            style={{ background: "#7f1d1d", color: "#fca5a5", border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: isActioning ? "not-allowed" : "pointer", opacity: isActioning ? 0.6 : 1 }}
                          >
                            {isActioning ? "…" : "Reject"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {actionError && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#fca5a5", marginBottom: 16 }}>
              ⚠️ {actionError}
            </div>
          )}
          {actionResult && (
            <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#86efac", marginBottom: 16 }}>
              {actionResult}
            </div>
          )}

          {loading ? (
            <p style={{ color: "#6b7280", fontSize: 14 }}>Loading…</p>
          ) : filtered.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 14 }}>No coaches found.</p>
          ) : (
            <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden" }}>
              {/* Header row */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr 1fr", gap: 8, padding: "12px 20px", borderBottom: "1px solid #1f2937", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                <span>Coach</span>
                <span>School / Org</span>
                <span>Sport</span>
                <span>Invite Code</span>
                <span>Roster</span>
                <span>Msgs</span>
                <span>Actions</span>
              </div>
              {filtered.map((c, i) => {
                const statusColor = c.status === "approved" ? "#22c55e" : c.status === "rejected" ? "#ef4444" : "#e8a020";
                const isActioning = actioning === c.id;
                return (
                  <div
                    key={c.id || i}
                    style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr 1fr", gap: 8, padding: "14px 20px", borderBottom: i < filtered.length - 1 ? "1px solid #1f2937" : "none", fontSize: 14, alignItems: "center" }}
                  >
                    <div>
                      <span style={{ color: "#f9fafb", fontWeight: 600 }}>{c.first_name} {c.last_name}</span>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{c.email || "—"}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, textTransform: "uppercase", letterSpacing: "0.08em" }}>{c.status || "pending"}</span>
                        <span style={{ fontSize: 10, color: "#4b5563" }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}</span>
                      </div>
                    </div>
                    <span style={{ color: "#9ca3af" }}>{c.school_or_org || "—"}</span>
                    <span style={{ color: "#9ca3af" }}>{c.sport || "—"}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 13, color: c.status === "approved" ? "#e8a020" : "#6b7280" }}>{c.invite_code || "—"}</span>
                    <span style={{ color: rosterCounts[c.id] > 0 ? "#22c55e" : "#6b7280", fontWeight: 600 }}>{rosterCounts[c.id] || 0}</span>
                    <span style={{ color: messageCounts[c.id] > 0 ? "#f9fafb" : "#6b7280" }}>{messageCounts[c.id] || 0}</span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {c.status !== "approved" && (
                        <button
                          onClick={() => handleAction(c.id, "approve")}
                          disabled={isActioning}
                          style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: isActioning ? "not-allowed" : "pointer", opacity: isActioning ? 0.6 : 1 }}
                        >
                          Approve
                        </button>
                      )}
                      {c.status !== "rejected" && (
                        <button
                          onClick={() => handleAction(c.id, "reject")}
                          disabled={isActioning}
                          style={{ background: "#7f1d1d", color: "#fca5a5", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: isActioning ? "not-allowed" : "pointer", opacity: isActioning ? 0.6 : 1 }}
                        >
                          Reject
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmRemove(c)}
                        disabled={isActioning}
                        style={{ background: "transparent", color: "#6b7280", border: "1px solid #374151", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: isActioning ? "not-allowed" : "pointer", opacity: isActioning ? 0.6 : 1 }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {/* Remove confirmation modal */}
      {confirmRemove && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: 16, padding: 32, maxWidth: 420, width: "100%" }}>
            <div style={{ fontSize: 28, marginBottom: 16, textAlign: "center" }}>🗑️</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f9fafb", margin: "0 0 8px", textAlign: "center" }}>Remove Coach?</h2>
            <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.6, textAlign: "center", margin: "0 0 8px" }}>
              This will permanently delete <strong style={{ color: "#f9fafb" }}>{confirmRemove.first_name} {confirmRemove.last_name}</strong>'s coach profile, all roster entries, and all messages sent to their roster.
            </p>
            <p style={{ fontSize: 13, color: "#fca5a5", textAlign: "center", margin: "0 0 24px" }}>
              Their account will remain but all coach access and data will be cleared. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmRemove(null)}
                style={{ flex: 1, background: "transparent", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(confirmRemove)}
                style={{ flex: 1, background: "#7f1d1d", color: "#fca5a5", border: "none", borderRadius: 8, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
              >
                Yes, Remove Coach
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminRoute>
  );
}
