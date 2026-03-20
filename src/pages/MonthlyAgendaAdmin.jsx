import React, { useEffect, useState } from "react";
import AdminRoute from "../components/auth/AdminRoute";
import { base44 } from "../api/base44Client";

function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1));
    const value = d.toISOString().slice(0, 7); // YYYY-MM
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    options.push({ value, label });
  }
  return options;
}

const MONTHS = getMonthOptions();

export default function MonthlyAgendaAdmin() {
  const [month, setMonth] = useState(MONTHS[0].value);
  const [myAccountId, setMyAccountId] = useState("");
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => { if (u?.id) setMyAccountId(u.id); }).catch(() => {});
  }, []);

  async function run(mode) {
    setWorking(true);
    setError("");
    setResult(null);
    try {
      const payload = { month, mode };
      if (mode === "preview" || mode === "send_one") payload.accountId = myAccountId;
      const res = await base44.functions.invoke("sendMonthlyAgenda", payload);
      const data = res.data;
      if (!data?.ok) { setError(data?.error || "Unknown error"); return; }
      if (mode === "preview") {
        const win = window.open("", "_blank");
        win.document.write(data.html);
        win.document.close();
        setResult({ mode: "preview", subject: data.subject, registered: data.registered, watchlist: data.watchlist, nearby: data.nearby });
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e?.message || "Request failed");
    } finally {
      setWorking(false);
      setConfirmSend(false);
    }
  }

  const S = {
    root: { background: "#0a0e1a", minHeight: "100vh", padding: "40px 24px", fontFamily: "'DM Sans', Arial, sans-serif", color: "#f9fafb" },
    card: { background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: "24px", marginBottom: 20, maxWidth: 680 },
    label: { fontSize: 12, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 6 },
    select: { background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "10px 14px", fontSize: 15, color: "#f9fafb", width: "100%" },
    input: { background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#f9fafb", width: "100%", fontFamily: "monospace" },
    btn: (color) => ({ background: color, color: "#0a0e1a", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: working ? 0.6 : 1 }),
    btnOutline: { background: "transparent", color: "#9ca3af", border: "1px solid #374151", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
    stat: { background: "#1f2937", borderRadius: 8, padding: "12px 16px", textAlign: "center", flex: 1 },
    statNum: { fontSize: 24, fontWeight: 700, color: "#f9fafb" },
    statLabel: { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  };

  return (
    <AdminRoute>
      <div style={S.root}>
        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: "#f9fafb", margin: "0 0 8px" }}>Monthly Camp Agenda</h1>
        <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 32 }}>
          Send each subscriber a personalized email with their registered camps, watchlist camps, and nearby camps for the month.
        </p>

        {/* Controls */}
        <div style={S.card}>
          <div style={{ marginBottom: 20 }}>
            <label style={S.label}>Month</label>
            <select value={month} onChange={e => setMonth(e.target.value)} style={S.select} disabled={working}>
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={S.label}>My Account ID (for preview)</label>
            <input
              value={myAccountId}
              onChange={e => setMyAccountId(e.target.value)}
              placeholder="auto-detected from auth"
              style={S.input}
              disabled={working}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={S.btn("#3b82f6")} onClick={() => run("preview")} disabled={working || !myAccountId}>
              👁 Preview My Email
            </button>
            <button style={S.btn("#e8a020")} onClick={() => run("send_one")} disabled={working || !myAccountId}>
              ✉ Send to Me
            </button>
            <button style={S.btn("#6b7280")} onClick={() => run("dry_run")} disabled={working}>
              🔍 Dry Run (all accounts)
            </button>
            {!confirmSend ? (
              <button style={{ ...S.btnOutline, color: "#ef4444", borderColor: "#ef4444" }} onClick={() => setConfirmSend(true)} disabled={working}>
                📤 Send All
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#fca5a5" }}>Send to ALL active subscribers?</span>
                <button style={S.btn("#ef4444")} onClick={() => run("send_all")} disabled={working}>Confirm Send</button>
                <button style={S.btnOutline} onClick={() => setConfirmSend(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>

        {working && (
          <div style={{ ...S.card, color: "#9ca3af", fontSize: 14 }}>
            <div className="w-5 h-5 border-2 border-[#e8a020] border-t-transparent rounded-full animate-spin" style={{ display: "inline-block", marginRight: 8 }} />
            Working... this may take a minute for large sends.
          </div>
        )}

        {error && (
          <div style={{ ...S.card, border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5", background: "rgba(239,68,68,0.1)" }}>
            {error}
          </div>
        )}

        {result && result.mode === "preview" && (
          <div style={S.card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e", marginBottom: 12 }}>✅ Preview opened in new tab</div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>Subject: <span style={{ color: "#f9fafb" }}>{result.subject}</span></div>
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              {[
                { label: "Registered", val: result.registered, color: "#22c55e" },
                { label: "Watchlist", val: result.watchlist, color: "#e8a020" },
                { label: "Nearby", val: result.nearby, color: "#3b82f6" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ ...S.stat }}>
                  <div style={{ ...S.statNum, color }}>{val}</div>
                  <div style={S.statLabel}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result && result.mode !== "preview" && result.summary && (
          <div style={S.card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f9fafb", marginBottom: 16 }}>
              {result.mode === "dry_run" ? "Dry Run Complete" : `Send Complete — ${result.monthLabel}`}
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              {[
                { label: result.mode === "dry_run" ? "Would Send" : "Sent", val: result.summary.sent || result.summary.dry_run, color: "#22c55e" },
                { label: "Skipped", val: result.summary.skipped, color: "#6b7280" },
                { label: "Errors", val: result.summary.errors, color: "#ef4444" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ ...S.stat }}>
                  <div style={{ ...S.statNum, color }}>{val ?? 0}</div>
                  <div style={S.statLabel}>{label}</div>
                </div>
              ))}
            </div>

            {result.results?.length > 0 && (
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "#6b7280", borderBottom: "1px solid #1f2937" }}>
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>Account</th>
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>Status</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Reg</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Watch</th>
                      <th style={{ padding: "6px 8px", textAlign: "right" }}>Nearby</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #1f2937" }}>
                        <td style={{ padding: "6px 8px", color: "#9ca3af", fontFamily: "monospace", fontSize: 11 }}>
                          {String(r.accountId || "").slice(0, 12)}…
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{
                            color: r.status === "sent" ? "#22c55e" : r.status === "error" ? "#ef4444" : r.status === "dry_run" ? "#e8a020" : "#6b7280",
                            fontWeight: 600,
                          }}>
                            {r.status === "dry_run" ? "would send" : r.status}
                          </span>
                          {r.reason && <span style={{ color: "#6b7280", marginLeft: 8 }}>{r.reason}</span>}
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "#9ca3af" }}>{r.registered as number ?? "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "#9ca3af" }}>{r.watchlist as number ?? "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "#9ca3af" }}>{r.nearby as number ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminRoute>
  );
}
